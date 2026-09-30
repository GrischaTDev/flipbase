import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Json } from '../models/supabase.types';
import { MutationResult } from '../models/mutation-result.model';
import { TaxMode } from '../models/flipbase.models';
import {
  calculateCompanyReadiness,
  CompanyLegalForm,
  CompanyProfileInput,
  CompanySettingsState,
  isCompanyLegalForm,
  isCompanyTaxMode,
  WorkspaceCompanyProfile,
} from '../models/company-profile.models';
import { validateCompanyLogo } from '../utils/company-logo-validation';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const COMPANY_ASSET_BUCKET = 'company-assets';

type RpcCompanyState = {
  readonly profile?: unknown;
  readonly tax_mode?: unknown;
  readonly can_edit?: unknown;
};

@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly profile = signal<WorkspaceCompanyProfile | null>(null);
  readonly taxMode = signal<TaxMode | null>(null);
  readonly canEdit = signal(false);
  readonly loadedWorkspaceId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly loadError = signal<Error | null>(null);
  readonly logoUrl = signal<string | null>(null);
  readonly readiness = computed(() => calculateCompanyReadiness(this.profile(), this.taxMode()));

  private loadVersion = 0;
  private logoVersion = 0;

  constructor() {
    try {
      effect(() => {
        const workspaceId = this.workspaceService.currentWorkspace()?.id ?? '';
        void this.load(workspaceId);
      });
    } catch {
      // Fokussierte Service-Tests ohne Angular-Scheduler steuern load() direkt.
    }
  }

  async load(workspaceId: string): Promise<void> {
    const requestedWorkspaceId = workspaceId.trim();
    const version = ++this.loadVersion;
    this.resetVisibleState();
    if (!requestedWorkspaceId) return;
    if (!this.isCurrentWorkspace(requestedWorkspaceId)) return;

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client.rpc('get_workspace_company_settings', {
        p_workspace_id: requestedWorkspaceId,
      });
      if (!this.isCurrentLoad(requestedWorkspaceId, version)) return;
      if (error || !data) {
        throw error ?? new Error('Die Datenbank hat keine Unternehmensdaten zurückgegeben.');
      }

      const state = this.parseState(data);
      this.applyState(state, requestedWorkspaceId);
      await this.refreshLogoUrl(requestedWorkspaceId, state.profile.logoPath, version);
    } catch (cause: unknown) {
      if (!this.isCurrentLoad(requestedWorkspaceId, version)) return;
      const error = this.asError('Laden der Unternehmensdaten', cause);
      this.loadError.set(error);
    } finally {
      if (this.isCurrentLoad(requestedWorkspaceId, version)) this.isLoading.set(false);
    }
  }

  async save(
    input: CompanyProfileInput,
    taxMode: TaxMode,
  ): Promise<MutationResult<WorkspaceCompanyProfile>> {
    const workspaceId = this.currentEditableWorkspace();
    if (!workspaceId) {
      return this.localFailure('Kein aktiver Workspace mit geladenen Unternehmensdaten.');
    }
    if (!this.canEdit()) {
      return this.localFailure('Nur Inhaber und Administratoren dürfen Unternehmensdaten ändern.');
    }

    const requestVersion = this.loadVersion;
    try {
      const { data, error } = await this.supabase.client.rpc('update_workspace_company_settings', {
        p_workspace_id: workspaceId,
        p_profile: this.toRpcInput(input) as Json,
        p_tax_mode: taxMode,
      });
      if (error || !data) {
        return this.reportedFailure(
          'Speichern der Unternehmensdaten',
          error ?? new Error('Die Datenbank hat keine Unternehmensdaten zurückgegeben.'),
        );
      }
      if (!this.isCurrentLoad(workspaceId, requestVersion)) {
        return this.localFailure('Der Workspace wurde während des Speicherns gewechselt.');
      }

      const state = this.parseState(data);
      this.applyState(state, workspaceId);
      await this.refreshLogoUrl(workspaceId, state.profile.logoPath, requestVersion);
      return { data: state.profile, error: null, reportedBySyncStatus: false };
    } catch (cause: unknown) {
      return this.reportedFailure('Speichern der Unternehmensdaten', cause);
    }
  }

  async replaceLogo(file: File): Promise<MutationResult<WorkspaceCompanyProfile>> {
    const workspaceId = this.currentEditableWorkspace();
    if (!workspaceId) {
      return this.localFailure('Kein aktiver Workspace mit geladenen Unternehmensdaten.');
    }
    if (!this.canEdit()) {
      return this.localFailure('Nur Inhaber und Administratoren dürfen das Unternehmenslogo ändern.');
    }

    let extension: 'png' | 'jpg' | 'webp';
    try {
      ({ extension } = await validateCompanyLogo(file));
    } catch (cause: unknown) {
      return this.localFailure(cause instanceof Error ? cause.message : String(cause));
    }

    const path = `${workspaceId}/logos/${crypto.randomUUID()}.${extension}`;
    const storage = this.supabase.client.storage.from(COMPANY_ASSET_BUCKET);
    const { error: uploadError } = await storage.upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return this.reportedFailure('Hochladen des Unternehmenslogos', uploadError);

    try {
      const { data, error } = await this.supabase.client.rpc('set_workspace_company_logo', {
        p_workspace_id: workspaceId,
        p_logo_path: path,
      });
      if (error || !data) {
        await this.cleanupNewLogo(storage, path);
        return this.reportedFailure(
          'Aktivieren des Unternehmenslogos',
          error ?? new Error('Die Datenbank hat das Unternehmenslogo nicht bestätigt.'),
        );
      }

      if (!this.isCurrentWorkspace(workspaceId) || this.loadedWorkspaceId() !== workspaceId) {
        return this.localFailure('Der Workspace wurde während des Logo-Uploads gewechselt.');
      }

      const state = this.parseState(data);
      this.applyState(state, workspaceId);
      await this.refreshLogoUrl(workspaceId, state.profile.logoPath, this.loadVersion);
      return { data: state.profile, error: null, reportedBySyncStatus: false };
    } catch (cause: unknown) {
      await this.cleanupNewLogo(storage, path);
      return this.reportedFailure('Aktivieren des Unternehmenslogos', cause);
    }
  }

  async removeLogo(): Promise<MutationResult<WorkspaceCompanyProfile>> {
    const workspaceId = this.currentEditableWorkspace();
    if (!workspaceId) {
      return this.localFailure('Kein aktiver Workspace mit geladenen Unternehmensdaten.');
    }
    if (!this.canEdit()) {
      return this.localFailure('Nur Inhaber und Administratoren dürfen das Unternehmenslogo ändern.');
    }

    try {
      const { data, error } = await this.supabase.client.rpc('set_workspace_company_logo', {
        p_workspace_id: workspaceId,
        p_logo_path: null,
      });
      if (error || !data) {
        return this.reportedFailure(
          'Entfernen des Unternehmenslogos',
          error ?? new Error('Die Datenbank hat die Logoänderung nicht bestätigt.'),
        );
      }
      if (!this.isCurrentWorkspace(workspaceId) || this.loadedWorkspaceId() !== workspaceId) {
        return this.localFailure('Der Workspace wurde während der Logoänderung gewechselt.');
      }

      const state = this.parseState(data);
      this.applyState(state, workspaceId);
      this.logoUrl.set(null);
      return { data: state.profile, error: null, reportedBySyncStatus: false };
    } catch (cause: unknown) {
      return this.reportedFailure('Entfernen des Unternehmenslogos', cause);
    }
  }

  private resetVisibleState(): void {
    this.profile.set(null);
    this.taxMode.set(null);
    this.canEdit.set(false);
    this.loadedWorkspaceId.set(null);
    this.loadError.set(null);
    this.logoUrl.set(null);
    this.isLoading.set(false);
    this.logoVersion += 1;
  }

  private applyState(state: CompanySettingsState, workspaceId: string): void {
    this.profile.set(state.profile);
    this.taxMode.set(state.taxMode);
    this.canEdit.set(state.canEdit);
    this.loadedWorkspaceId.set(workspaceId);
    this.loadError.set(null);
  }

  private parseState(data: unknown): CompanySettingsState {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Die Unternehmensdaten sind unvollständig.');
    }
    const raw = data as RpcCompanyState;
    if (!raw.profile || typeof raw.profile !== 'object' || Array.isArray(raw.profile)) {
      throw new Error('Das Unternehmensprofil fehlt.');
    }
    if (!isCompanyTaxMode(raw.tax_mode) || typeof raw.can_edit !== 'boolean') {
      throw new Error('Die Unternehmenseinstellungen sind unvollständig.');
    }
    return {
      profile: this.mapProfile(raw.profile as Record<string, unknown>),
      taxMode: raw.tax_mode,
      canEdit: raw.can_edit,
    };
  }

  private mapProfile(row: Record<string, unknown>): WorkspaceCompanyProfile {
    const workspaceId = this.requiredString(row['workspace_id'], 'Workspace');
    const createdAt = this.requiredString(row['created_at'], 'Anlagezeitpunkt');
    const updatedAt = this.requiredString(row['updated_at'], 'Änderungszeitpunkt');
    const legalForm = row['legal_form'];
    if (legalForm !== null && legalForm !== undefined && !isCompanyLegalForm(legalForm)) {
      throw new Error('Die gespeicherte Rechtsform ist ungültig.');
    }
    return {
      workspaceId,
      companyName: this.nullableString(row['company_name']),
      legalName: this.nullableString(row['legal_name']),
      legalForm: (legalForm ?? null) as CompanyLegalForm | null,
      email: this.nullableString(row['email']),
      phone: this.nullableString(row['phone']),
      website: this.nullableString(row['website']),
      street: this.nullableString(row['street']),
      houseNumber: this.nullableString(row['house_number']),
      postalCode: this.nullableString(row['postal_code']),
      city: this.nullableString(row['city']),
      countryCode: this.nullableString(row['country_code']),
      mailingAddressEnabled: row['mailing_address_enabled'] === true,
      mailingStreet: this.nullableString(row['mailing_street']),
      mailingHouseNumber: this.nullableString(row['mailing_house_number']),
      mailingPostalCode: this.nullableString(row['mailing_postal_code']),
      mailingCity: this.nullableString(row['mailing_city']),
      mailingCountryCode: this.nullableString(row['mailing_country_code']),
      taxNumber: this.nullableString(row['tax_number']),
      vatId: this.nullableString(row['vat_id']),
      taxOffice: this.nullableString(row['tax_office']),
      federalState: this.nullableString(row['federal_state']),
      bankAccountHolder: this.nullableString(row['bank_account_holder']),
      bankName: this.nullableString(row['bank_name']),
      iban: this.nullableString(row['iban']),
      bic: this.nullableString(row['bic']),
      logoPath: this.nullableString(row['logo_path']),
      createdAt,
      updatedAt,
    };
  }

  private toRpcInput(input: CompanyProfileInput): Record<string, Json> {
    return {
      company_name: this.clean(input.companyName),
      legal_name: this.clean(input.legalName),
      legal_form: input.legalForm,
      email: this.clean(input.email),
      phone: this.clean(input.phone),
      website: this.clean(input.website),
      street: this.clean(input.street),
      house_number: this.clean(input.houseNumber),
      postal_code: this.clean(input.postalCode),
      city: this.clean(input.city),
      country_code: this.upper(input.countryCode),
      mailing_address_enabled: input.mailingAddressEnabled,
      mailing_street: this.clean(input.mailingStreet),
      mailing_house_number: this.clean(input.mailingHouseNumber),
      mailing_postal_code: this.clean(input.mailingPostalCode),
      mailing_city: this.clean(input.mailingCity),
      mailing_country_code: this.upper(input.mailingCountryCode),
      tax_number: this.clean(input.taxNumber),
      vat_id: this.clean(input.vatId),
      tax_office: this.clean(input.taxOffice),
      federal_state: this.clean(input.federalState),
      bank_account_holder: this.clean(input.bankAccountHolder),
      bank_name: this.clean(input.bankName),
      iban: this.compactUpper(input.iban),
      bic: this.compactUpper(input.bic),
    };
  }

  private clean(value: string): string | null {
    const normalized = value.trim();
    return normalized || null;
  }

  private upper(value: string): string | null {
    const normalized = value.trim().toUpperCase();
    return normalized || null;
  }

  private compactUpper(value: string): string | null {
    const normalized = value.replace(/\s+/gu, '').toUpperCase();
    return normalized || null;
  }

  private requiredString(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value) throw new Error(`${label} fehlt.`);
    return value;
  }

  private nullableString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private currentEditableWorkspace(): string | null {
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
    if (!workspaceId || this.loadedWorkspaceId() !== workspaceId || !this.profile()) return null;
    return workspaceId;
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return this.workspaceService.currentWorkspace()?.id === workspaceId;
  }

  private isCurrentLoad(workspaceId: string, version: number): boolean {
    return version === this.loadVersion && this.isCurrentWorkspace(workspaceId);
  }

  private async refreshLogoUrl(
    workspaceId: string,
    path: string | null,
    loadVersion: number,
  ): Promise<void> {
    const logoVersion = ++this.logoVersion;
    this.logoUrl.set(null);
    if (!path) return;

    try {
      const { data, error } = await this.supabase.client.storage
        .from(COMPANY_ASSET_BUCKET)
        .createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) {
        throw error ?? new Error('Das Unternehmenslogo konnte nicht signiert werden.');
      }
      if (
        logoVersion === this.logoVersion &&
        loadVersion === this.loadVersion &&
        this.isCurrentWorkspace(workspaceId) &&
        this.profile()?.logoPath === path
      ) {
        this.logoUrl.set(data.signedUrl);
      }
    } catch (cause: unknown) {
      if (logoVersion === this.logoVersion && this.isCurrentWorkspace(workspaceId)) {
        this.syncStatus.melde('Laden des Unternehmenslogos', cause);
      }
    }
  }

  private async cleanupNewLogo(
    storage: { remove(paths: string[]): PromiseLike<{ error: unknown | null }> },
    path: string,
  ): Promise<void> {
    try {
      const { error } = await storage.remove([path]);
      if (error) this.syncStatus.melde('Aufräumen des Unternehmenslogos', error);
    } catch (cause: unknown) {
      this.syncStatus.melde('Aufräumen des Unternehmenslogos', cause);
    }
  }

  private asError(action: string, cause: unknown): Error {
    return this.syncStatus.melde(action, cause);
  }

  private reportedFailure<T>(action: string, cause: unknown): MutationResult<T> {
    const error = this.asError(action, cause);
    return {
      data: null,
      error,
      reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error),
    };
  }

  private localFailure<T>(message: string): MutationResult<T> {
    return { data: null, error: new Error(message), reportedBySyncStatus: false };
  }
}

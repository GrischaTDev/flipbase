import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { parseKleinanzeigenProviderSchema } from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import type {
  KleinanzeigenFormResult,
  KleinanzeigenProviderSchema,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
export interface KleinanzeigenFormScope {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalAccountId: string;
  readonly generation: number;
}
@Injectable()
export class KleinanzeigenFormSchemaService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly bridge = inject(KleinanzeigenExtensionBridge);
  private readonly client = inject(SupabaseService).client;
  private generation = 0;
  readonly bindingIssue = signal<'missing' | 'different_account' | 'stale_grant' | null>(null);
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }
  cancel(): void {
    this.generation++;
    this.bindingIssue.set(null);
    this.bridge.cancel();
  }
  async browse(
    scope: KleinanzeigenFormScope,
    categoryPath: string,
    mode: 'saved' | 'provider' = 'provider',
  ): Promise<KleinanzeigenFormResult> {
    const userId = this.auth.currentUser()?.id;
    const generation = ++this.generation;
    const current = () => {
      const workspace = this.workspace.currentWorkspace();
      if (
        !userId ||
        this.auth.currentUser()?.id !== userId ||
        workspace?.id !== scope.workspaceId ||
        workspace.archived_at ||
        generation !== this.generation
      )
        throw new Error('Die Ansicht oder Anmeldung wurde gewechselt. Öffne das Formular erneut.');
    };
    current();
    if (mode === 'saved') {
      const { data, error } = await this.client
        .from('kleinanzeigen_form_schemas')
        .select('category_path,schema_revision,provider_schema,grant_generation,observed_at')
        .eq('workspace_id', scope.workspaceId)
        // Die textbasierte Filterform erhält große Kontokennungen ohne Number-Rundung.
        .filter('connection_id', 'eq', scope.connectionId)
        .eq('grant_generation', scope.generation)
        .limit(500);
      current();
      if (error) throw new Error('Gespeicherte Kategorien konnten nicht geladen werden.');
      const available = (data ?? []).flatMap((row) => {
        const schema = parseKleinanzeigenProviderSchema(row.provider_schema);
        return schema &&
          row.grant_generation === scope.generation &&
          schema.categoryPath === row.category_path &&
          /^[a-f0-9]{64}$/u.test(row.schema_revision)
          ? [{ schema, revision: row.schema_revision, observedAt: row.observed_at }]
          : [];
      });
      if (!available.length)
        throw new Error(
          'Für dieses Konto sind noch keine Kategorien gespeichert. Beim Klick auf Inserieren kannst Du die aktuellen Felder aus Kleinanzeigen laden und anschließend prüfen.',
        );
      const selected = available.find((value) => value.schema.categoryPath === categoryPath);
      if (categoryPath && !selected)
        throw new Error(
          'Diese Kategorie ist noch nicht gespeichert. Wähle eine gespeicherte Kategorie oder lade die aktuellen Felder beim Inserieren.',
        );
      return {
        ...scope,
        categoryPath: selected?.schema.categoryPath ?? '',
        categoryLabel: selected?.schema.categoryLabel ?? '',
        choices: available.map((value) => ({
          path: value.schema.categoryPath,
          label: value.schema.categoryLabel,
          isParent: false,
        })),
        schema: selected?.schema ?? null,
        schemaRevision: selected?.revision ?? null,
        observedAt: selected?.observedAt ?? available[0].observedAt,
      };
    }
    this.bindingIssue.set(null);
    if (!this.bridge.formSchemaAvailable())
      throw new Error(
        'Aktualisiere und prüfe die Flipbase-Erweiterung für das Kleinanzeigen-Formular.',
      );
    const binding = await this.bridge.status(scope.workspaceId);
    current();
    if (!binding) {
      this.bindingIssue.set('missing');
      throw new Error(
        'Die lokale Freigabe fehlt oder ist abgelaufen. Verbinde dieses Konto erneut.',
      );
    }
    if (
      (['workspaceId', 'connectionId', 'externalAccountId'] as const).some(
        (key) => binding[key] !== scope[key],
      )
    ) {
      this.bindingIssue.set('different_account');
      throw new Error(
        'In diesem Browserprofil ist ein anderes Kleinanzeigen-Konto verbunden. Wähle das passende Konto.',
      );
    }
    if (binding.generation !== scope.generation) {
      this.bindingIssue.set('stale_grant');
      throw new Error('Die Freigabe für dieses Konto hat sich geändert. Erneuere die Verbindung.');
    }
    const result = await this.bridge.loadFormSchema(scope, categoryPath);
    current();
    return result;
  }
  async load(
    scope: KleinanzeigenFormScope,
    categoryPath: string,
  ): Promise<KleinanzeigenProviderSchema> {
    const result = await this.browse(scope, categoryPath);
    if (!result.schema) throw new Error('Wähle eine vollständige Zielkategorie.');
    return result.schema;
  }
}

import {
  parseKleinanzeigenQuotaResult,
  type KleinanzeigenQuotaResult,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-job-contracts';
import {
  kleinanzeigenCategoryPath,
  parseKleinanzeigenFormResult,
  type KleinanzeigenFormResult,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-form-contracts';
import {
  parseKleinanzeigenSyncResult,
  type KleinanzeigenSyncRun,
  type KleinanzeigenSyncResult,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-contracts';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { KleinanzeigenListingPayload } from '../../listings/models/listing.models';
import {
  kleinanzeigenRelistingPaths,
  parseKleinanzeigenRelistingResult,
  type KleinanzeigenRelistingResult,
  type KleinanzeigenRelistingAttempt,
} from '../models/kleinanzeigen-relisting';
import {
  parseKleinanzeigenBinding,
  parseKleinanzeigenProposal,
  type KleinanzeigenAccountScope,
  type KleinanzeigenBinding,
  type KleinanzeigenProposal,
} from '../models/kleinanzeigen-response';
export interface KleinanzeigenCapabilities {
  readonly accounts: boolean;
  readonly sync: boolean;
  readonly publish: boolean;
}
interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}
const unavailable: KleinanzeigenCapabilities = Object.freeze({
  accounts: false,
  sync: false,
  publish: false,
});
/** Ausschließlich öffentliche Bindungsdaten; das Installationssecret bleibt im Hintergrunddienst. */
@Injectable()
export class KleinanzeigenExtensionBridge {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly capabilityState = signal(unavailable);
  private readonly checkingState = signal(false);
  private readonly quotaState = signal(false);
  readonly quotaAvailable = this.quotaState.asReadonly();
  private readonly formSchemaState = signal(false);
  readonly formSchemaAvailable = this.formSchemaState.asReadonly();
  readonly handoffAvailable = signal(false);
  readonly relistingAvailable = signal(false);
  private destroyed = false;
  private checkTimer: ReturnType<typeof setTimeout> | undefined;
  readonly capabilities = this.capabilityState.asReadonly();
  readonly checking = this.checkingState.asReadonly();
  constructor() {
    window.addEventListener('message', this.receive);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.checkTimer);
      window.removeEventListener('message', this.receive);
      this.cancel();
      this.handoffAvailable.set(false);
      this.relistingAvailable.set(false);
      this.capabilityState.set(unavailable);
      this.formSchemaState.set(false);
      this.quotaState.set(false);
    });
  }
  cancel(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Die Kleinanzeigen-Ansicht wurde geschlossen oder gewechselt.'));
    }
    this.pending.clear();
  }
  checkInstallation(): void {
    if (this.destroyed) return;
    clearTimeout(this.checkTimer);
    this.checkingState.set(true);
    this.checkTimer = setTimeout(() => {
      this.handoffAvailable.set(false);
      this.relistingAvailable.set(false);
      this.capabilityState.set(unavailable);
      this.formSchemaState.set(false);
      this.quotaState.set(false);
      this.checkingState.set(false);
    }, 3000);
    window.postMessage({ type: 'FLIPBASE_CHECK_EXTENSION' }, location.origin);
  }
  async prepare(
    workspaceId: string,
    canPublish: boolean,
    apiUrl: string,
  ): Promise<KleinanzeigenProposal> {
    const proposal = parseKleinanzeigenProposal(
      await this.request('PREPARE_ACCOUNT', { workspaceId, canPublish, apiUrl }, 180000),
    );
    if (!proposal)
      throw new Error('Die Erweiterung hat eine ungültige Antwort zur Kontoprüfung geliefert.');
    return proposal;
  }
  async connect(nonce: string, binding: KleinanzeigenBinding): Promise<KleinanzeigenBinding> {
    const result = parseKleinanzeigenBinding(
      await this.request('CONNECT', { nonce, binding }),
      binding.workspaceId,
      binding.connectionId,
    );
    if (
      !result ||
      Object.entries(binding).some(
        ([key, value]) => result[key as keyof KleinanzeigenBinding] !== value,
      )
    )
      throw new Error('Die Antwort passt nicht zur bestätigten Kontobindung.');
    return result;
  }
  async status(workspaceId: string): Promise<KleinanzeigenBinding | null> {
    const result = await this.request('STATUS', {});
    if (result === null) return null;
    const binding = parseKleinanzeigenBinding(result, workspaceId);
    if (!binding) throw new Error('Die lokale Kontobindung gehört nicht zu diesem Arbeitsbereich.');
    return binding;
  }
  async loadFormSchema(
    scope: {
      readonly workspaceId: string;
      readonly connectionId: string;
      readonly externalAccountId: string;
      readonly generation: number;
    },
    categoryPath: string,
  ): Promise<KleinanzeigenFormResult> {
    if (!this.formSchemaAvailable())
      throw new Error('Aktualisiere die Erweiterung für die Kleinanzeigen-Formularprüfung.');
    if (!kleinanzeigenCategoryPath(categoryPath)) throw new Error('Ungültiger Kategoriepfad.');
    const result = parseKleinanzeigenFormResult(
      await this.request(
        'FORM_SCHEMA',
        {
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          generation: scope.generation,
          categoryPath,
        },
        180000,
      ),
      { ...scope, categoryPath },
    );
    if (
      !result ||
      Date.parse(result.observedAt) < Date.now() - 60000 ||
      Date.parse(result.observedAt) > Date.now() + 5000
    )
      throw new Error(
        'Das Kleinanzeigen-Formular konnte nicht aktuell und kontogebunden bestätigt werden.',
      );
    return result;
  }
  async refreshQuota(scope: {
    readonly workspaceId: string;
    readonly connectionId: string;
    readonly externalAccountId: string;
    readonly generation: number;
    readonly accountType: 'private' | 'commercial' | 'unknown';
  }): Promise<KleinanzeigenQuotaResult> {
    if (!this.quotaAvailable())
      throw new Error('Aktualisiere die Erweiterung für die offizielle Kontingentprüfung.');
    const result = parseKleinanzeigenQuotaResult(
      await this.request(
        'QUOTA',
        {
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          generation: scope.generation,
        },
        60000,
      ),
      scope,
    );
    if (!result)
      throw new Error(
        'Das offizielle Kleinanzeigen-Kontingent konnte nicht aktuell und kontogebunden bestätigt werden.',
      );
    return result;
  }
  async runJob(
    scope: {
      readonly workspaceId: string;
      readonly connectionId: string;
      readonly generation: number;
    },
    jobId: string,
    mode: 'publish' | 'reconcile',
  ): Promise<void> {
    if (!this.capabilities().publish)
      throw new Error('Aktualisiere die Erweiterung für den Kleinanzeigen-Auftrag.');
    const result = await this.request(
      'PUBLISH_JOB',
      {
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        generation: scope.generation,
        jobId,
        mode,
      },
      180000,
    );
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('Der Kleinanzeigen-Auftrag wurde nicht eindeutig bearbeitet.');
    const response = result as Record<string, unknown>;
    if (
      Object.keys(response).sort().join(',') !==
        'connectionId,generation,handled,jobId,workspaceId' ||
      response['handled'] !== true ||
      response['jobId'] !== jobId ||
      response['workspaceId'] !== scope.workspaceId ||
      response['connectionId'] !== scope.connectionId ||
      response['generation'] !== scope.generation
    )
      throw new Error('Die Auftragsantwort passt nicht zur aktuellen Auswahl.');
  }
  async openListing(
    scope: {
      readonly workspaceId: string;
      readonly connectionId: string;
      readonly generation: number;
    },
    requestId: string,
    payload: KleinanzeigenListingPayload,
  ): Promise<void> {
    if (!this.handoffAvailable())
      throw new Error(
        'Aktualisiere die Flipbase-Erweiterung auf Version 1.11.0 und lade die Seite neu.',
      );
    const result = await this.request(
      'OPEN_LISTING',
      {
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        generation: scope.generation,
        handoffId: requestId,
        payload,
      },
      180000,
    );
    if (
      !result ||
      typeof result !== 'object' ||
      (result as Record<string, unknown>)['handoffId'] !== requestId ||
      (result as Record<string, unknown>)['opened'] !== true
    )
      throw new Error('Das Kleinanzeigen-Formular konnte nicht geöffnet werden.');
  }
  async relist(
    scope: {
      readonly workspaceId: string;
      readonly connectionId: string;
      readonly generation: number;
    },
    externalId: string,
  ): Promise<KleinanzeigenRelistingResult> {
    if (!this.relistingAvailable())
      throw new Error(
        'Aktualisiere die Flipbase-Erweiterung auf Version 1.11.0 und lade die Seite neu.',
      );
    const result = parseKleinanzeigenRelistingResult(
      await this.request(
        'RELIST_LISTING',
        {
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          generation: scope.generation,
          externalId,
          categoryPaths: kleinanzeigenRelistingPaths,
        },
        600000,
      ),
      externalId,
    );
    if (!result)
      throw new Error(
        'Das Ergebnis konnte nicht eindeutig bestätigt werden. Bitte den Status im ursprünglichen Browserprofil prüfen.',
      );
    return result;
  }
  async relistingAttempts(scope: {
    readonly workspaceId: string;
    readonly connectionId: string;
    readonly generation: number;
  }): Promise<readonly KleinanzeigenRelistingAttempt[]> {
    const result = await this.request('RELIST_ATTEMPTS', {
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
      generation: scope.generation,
    });
    if (
      !Array.isArray(result) ||
      result.length > 20000 ||
      result.some(
        (value) =>
          !value ||
          typeof value !== 'object' ||
          !/^[1-9][0-9]{0,31}$/u.test(value.externalId) ||
          typeof value.title !== 'string' ||
          value.title.length > 65 ||
          !['secured', 'deleting', 'deleted', 'submitting', 'outcome_unknown'].includes(
            value.phase,
          ),
      )
    )
      throw new Error('Die gesicherten Anzeigen konnten nicht gelesen werden.');
    return result as KleinanzeigenRelistingAttempt[];
  }
  async synchronize(run: KleinanzeigenSyncRun): Promise<KleinanzeigenSyncResult> {
    const result = parseKleinanzeigenSyncResult(
      await this.request(
        'SYNC',
        {
          workspaceId: run.workspaceId,
          connectionId: run.connectionId,
          runId: run.runId,
          generation: run.generation,
        },
        180000,
      ),
      run,
    );
    if (!result) throw new Error('Der Kleinanzeigen-Abgleich wurde nicht eindeutig bestätigt.');
    return result;
  }
  async disconnect(scope: KleinanzeigenAccountScope): Promise<void> {
    const result = await this.request('DISCONNECT', {
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
    });
    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result) ||
      Object.keys(result).join(',') !== 'ok' ||
      !('ok' in result) ||
      result.ok !== true
    )
      throw new Error('Die lokale Trennung wurde nicht bestätigt.');
  }
  private request(
    action:
      | 'PREPARE_ACCOUNT'
      | 'CONNECT'
      | 'STATUS'
      | 'DISCONNECT'
      | 'SYNC'
      | 'FORM_SCHEMA'
      | 'QUOTA'
      | 'PUBLISH_JOB'
      | 'OPEN_LISTING'
      | 'RELIST_LISTING'
      | 'RELIST_ATTEMPTS',
    fields: Readonly<Record<string, unknown>>,
    timeout = 60000,
  ): Promise<unknown> {
    if (this.destroyed)
      return Promise.reject(new Error('Die Kleinanzeigen-Ansicht wurde geschlossen.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            'Die Kleinanzeigen-Erweiterung hat nicht geantwortet. Prüfe die Erweiterung und Dein Browserprofil.',
          ),
        );
      }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        window.postMessage(
          { type: 'FLIPBASE_KLEINANZEIGEN_' + action, requestId, ...fields },
          location.origin,
        );
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error('Die Kleinanzeigen-Erweiterung ist nicht erreichbar.'));
      }
    });
  }
  private readonly receive = (event: MessageEvent<unknown>): void => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !event.data ||
      typeof event.data !== 'object' ||
      Array.isArray(event.data)
    )
      return;
    const response = event.data as Record<string, unknown>;
    if (response['type'] === 'FLIPBASE_EXTENSION_STATUS') {
      const candidate = response['kleinanzeigenCapabilities'];
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return;
      const caps = candidate as Record<string, unknown>;
      if (
        Object.keys(caps).sort().join(',') !== 'accounts,publish,sync' ||
        typeof caps['accounts'] !== 'boolean' ||
        typeof caps['sync'] !== 'boolean' ||
        typeof caps['publish'] !== 'boolean' ||
        (caps['sync'] && !caps['accounts']) ||
        (caps['publish'] && !caps['sync'])
      )
        return;
      clearTimeout(this.checkTimer);
      this.handoffAvailable.set(
        response['installed'] === true &&
          caps['accounts'] === true &&
          response['kleinanzeigenAssistedListings'] === true,
      );
      this.relistingAvailable.set(
        response['installed'] === true &&
          caps['accounts'] === true &&
          response['kleinanzeigenRelisting'] === true,
      );
      this.checkingState.set(false);
      this.quotaState.set(
        response['installed'] === true &&
          caps['accounts'] === true &&
          response['kleinanzeigenQuota'] === true,
      );
      this.formSchemaState.set(
        response['installed'] === true &&
          caps['accounts'] === true &&
          response['kleinanzeigenFormSchema'] === true,
      );
      this.capabilityState.set(
        response['installed'] === true
          ? Object.freeze({
              accounts: caps['accounts'],
              sync: caps['sync'],
              publish: caps['publish'],
            })
          : unavailable,
      );
      return;
    }
    if (
      response['type'] !== 'FLIPBASE_KLEINANZEIGEN_RESULT' ||
      typeof response['requestId'] !== 'string' ||
      typeof response['success'] !== 'boolean'
    )
      return;
    const pending = this.pending.get(response['requestId']);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response['requestId']);
    if (response['success']) pending.resolve(response['result']);
    else
      pending.reject(
        new Error(
          typeof response['error'] === 'string' && response['error'].length <= 500
            ? response['error']
            : 'Die Kleinanzeigen-Erweiterung konnte die Anfrage nicht bestätigen.',
        ),
      );
  };
}

import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import {
  parseKleinanzeigenJob,
  kleinanzeigenJobPollingDelay,
  kleinanzeigenJobIssue,
  type KleinanzeigenListingJob,
} from '../models/kleinanzeigen-listing-job';
import {
  parseKleinanzeigenUserJobRequest,
  type KleinanzeigenUserJobRequest,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-job-contracts';
export interface KleinanzeigenListingJobScope {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalAccountId: string;
  readonly generation: number;
  readonly accountType: 'private' | 'commercial' | 'unknown';
}
/** Die Ansicht liest dauerhafte Serverstände; eine Extensionantwort bestätigt keine Veröffentlichung. */
@Injectable()
export class KleinanzeigenListingJobService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly client = inject(SupabaseService).client;
  private readonly bridge = inject(KleinanzeigenExtensionBridge);
  private readonly state = signal<KleinanzeigenListingJob | null>(null);
  readonly job = this.state.asReadonly();
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private owner: string | null = null;
  private scope: KleinanzeigenListingJobScope | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pollingStarted = 0;
  constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      const user = this.auth.currentUser()?.id;
      const ws = this.workspace.currentWorkspace();
      untracked(() => {
        if (
          this.owner &&
          (this.owner !== user || ws?.id !== this.scope?.workspaceId || ws?.archived_at)
        )
          this.cancel();
      });
    });
    document.addEventListener('visibilitychange', this.visibility);
    destroy.onDestroy(() => {
      document.removeEventListener('visibilitychange', this.visibility);
      this.cancel();
    });
  }
  cancel(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.owner = null;
    this.scope = null;
    this.state.set(null);
    this.error.set(null);
    this.busy.set(false);
  }
  private enter(scope: KleinanzeigenListingJobScope): () => void {
    const user = this.auth.currentUser()?.id;
    const ws = this.workspace.currentWorkspace();
    if (!user || ws?.id !== scope.workspaceId || ws.archived_at)
      throw new Error('Die Ansicht oder Anmeldung wurde gewechselt.');
    if (this.scope && (this.owner !== user || JSON.stringify(this.scope) !== JSON.stringify(scope)))
      this.cancel();
    this.owner = user;
    this.scope = scope;
    const generation = this.generation;
    return () => {
      const current = this.workspace.currentWorkspace();
      if (
        generation !== this.generation ||
        this.auth.currentUser()?.id !== user ||
        current?.id !== scope.workspaceId ||
        current.archived_at
      )
        throw new Error('Die Ansicht oder Anmeldung wurde gewechselt.');
    };
  }
  private async request(
    scope: KleinanzeigenListingJobScope,
    body: KleinanzeigenUserJobRequest,
    current: () => void,
  ): Promise<KleinanzeigenListingJob | null> {
    current();
    if (!parseKleinanzeigenUserJobRequest(body))
      throw new Error('Die Auftragsangaben sind ungültig.');
    const { data, error } = await this.client.functions.invoke('kleinanzeigen-account', { body });
    current();
    if (error)
      throw new Error(
        'Der Auftrag konnte noch nicht bestätigt werden. Prüfe seinen Status, bevor Du erneut inserierst.',
      );
    if (body.action === 'listing_latest' && data === null) {
      if (this.state()?.draftId !== body.draftId) this.state.set(null);
      return null;
    }
    const job = parseKleinanzeigenJob(data, scope);
    if (
      !job ||
      job.immutableSnapshot.externalAccountId !== scope.externalAccountId ||
      ('jobId' in body && job.id !== body.jobId) ||
      ('draftId' in body && job.draftId !== body.draftId)
    )
      throw new Error('Die Auftragsantwort passt nicht zu dieser Auswahl.');
    const previous = this.state();
    if (previous?.id === job.id && previous.version > job.version) return previous;
    if (previous?.id !== job.id) this.pollingStarted = Date.now();
    this.state.set(job);
    this.error.set(null);
    this.schedule();
    return job;
  }
  async latest(
    scope: KleinanzeigenListingJobScope,
    draftId: string,
  ): Promise<KleinanzeigenListingJob | null> {
    const current = this.enter(scope);
    return this.request(
      scope,
      {
        action: 'listing_latest',
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        draftId,
      },
      current,
    );
  }
  async load(scope: KleinanzeigenListingJobScope, jobId: string): Promise<KleinanzeigenListingJob> {
    const current = this.enter(scope);
    const job = await this.request(
      scope,
      {
        action: 'listing_status',
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        jobId,
      },
      current,
    );
    if (!job) throw new Error('Der Auftrag fehlt.');
    return job;
  }
  private async binding(scope: KleinanzeigenListingJobScope, current: () => void): Promise<void> {
    if (!this.bridge.capabilities().publish)
      throw new Error('Aktualisiere die Erweiterung für die automatische Veröffentlichung.');
    const binding = await this.bridge.status(scope.workspaceId);
    current();
    if (
      !binding ||
      binding.workspaceId !== scope.workspaceId ||
      binding.connectionId !== scope.connectionId ||
      binding.externalAccountId !== scope.externalAccountId ||
      binding.generation !== scope.generation ||
      !binding.canPublish ||
      Date.parse(binding.expiresAt) <= Date.now() ||
      scope.accountType !== 'private'
    )
      throw new Error(
        'Prüfe das gebundene Browserprofil und die Veröffentlichungsfreigabe für dieses Privatkonto.',
      );
  }
  async enqueue(
    scope: KleinanzeigenListingJobScope,
    draftId: string,
    revision: number,
    requestId: string,
  ): Promise<KleinanzeigenListingJob | null> {
    if (this.busy()) throw new Error('Die Auftragsprüfung läuft bereits.');
    const current = this.enter(scope);
    this.busy.set(true);
    this.error.set(null);
    try {
      let job = await this.request(
        scope,
        {
          action: 'listing_latest',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          draftId,
        },
        current,
      );
      if (job?.state === 'confirmed') return job;
      if (job?.state === 'writing' || job?.state === 'outcome_unknown')
        return await this.execute(scope, job, 'reconcile', current);
      await this.binding(scope, current);
      if (!job || !['queued', 'claimed', 'writing', 'outcome_unknown'].includes(job.state)) {
        const quota = await this.bridge.refreshQuota(scope);
        current();
        if (!quota.quota.allowed)
          throw new Error(
            kleinanzeigenJobIssue(quota.quota.reason) ??
              'Das kostenlose Kontingent konnte nicht bestätigt werden.',
          );
        job = await this.request(
          scope,
          {
            action: 'listing_enqueue',
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            draftId,
            expectedRevision: revision,
            requestId,
          },
          current,
        );
      }
      if (!job) return null;
      return await this.execute(
        scope,
        job,
        job.state === 'writing' || job.state === 'outcome_unknown' ? 'reconcile' : 'publish',
        current,
      );
    } catch (error) {
      current();
      this.error.set(
        error instanceof Error ? error.message : 'Der Auftrag konnte nicht bestätigt werden.',
      );
      throw error;
    } finally {
      if (this.scope === scope) this.busy.set(false);
    }
  }
  private async execute(
    scope: KleinanzeigenListingJobScope,
    job: KleinanzeigenListingJob,
    mode: 'publish' | 'reconcile',
    current: () => void,
  ): Promise<KleinanzeigenListingJob> {
    if (mode === 'publish' && job.grantGeneration !== scope.generation)
      throw new Error('Die Freigabe hat sich geändert. Prüfe den vorhandenen Auftrag.');
    let bridgeError: unknown;
    try {
      await this.bridge.runJob(
        mode === 'reconcile' ? { ...scope, generation: job.grantGeneration } : scope,
        job.id,
        mode,
      );
    } catch (error) {
      bridgeError = error;
    }
    current();
    const result = await this.load(scope, job.id);
    current();
    if (bridgeError && ['queued', 'claimed', 'writing', 'outcome_unknown'].includes(result.state))
      this.error.set('Der Auftrag ist gespeichert. Prüfe den Status im zugehörigen Browserprofil.');
    return result;
  }
  async reconcile(
    scope: KleinanzeigenListingJobScope,
    jobId: string,
  ): Promise<KleinanzeigenListingJob> {
    if (this.busy()) throw new Error('Die Statusprüfung läuft bereits.');
    const current = this.enter(scope);
    this.busy.set(true);
    try {
      const job = await this.request(
        scope,
        {
          action: 'listing_reconcile',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          jobId,
        },
        current,
      );
      if (!job) throw new Error('Der Auftrag fehlt.');
      if (!['writing', 'outcome_unknown'].includes(job.state)) return job;
      return await this.execute(scope, job, 'reconcile', current);
    } finally {
      if (this.scope === scope) this.busy.set(false);
    }
  }
  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const job = this.state();
    if (!job || document.visibilityState === 'hidden') return;
    const ms = kleinanzeigenJobPollingDelay(job, this.pollingStarted, Date.now());
    if (ms === null) return;
    const scope = this.scope;
    if (!scope) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.load(scope, job.id).catch(() => {
        if (this.scope === scope)
          this.error.set('Der Status konnte nicht aktualisiert werden. Prüfe ihn erneut.');
      });
    }, ms);
  }
  private readonly visibility = (): void => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(this.timer);
      this.timer = undefined;
    } else if (this.scope && this.state())
      void this.load(this.scope, this.state()!.id).catch(() => {
        this.error.set('Der Status konnte nicht aktualisiert werden.');
      });
  };
}

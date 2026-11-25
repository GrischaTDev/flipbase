import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedListingJobService } from './vinted-listing-job.service';
import { VintedListingImageService } from './vinted-listing-image.service';
import {
  canDiscardFailedRelisting,
  vintedRelistingJobLabel,
  type VintedListingJob,
} from '../models/vinted-listing-job';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import { VintedListingOperationStore } from './vinted-listing-operation.store';
import { VintedAccountViewService } from './vinted-account-view.service';
import { MarketplaceApiService } from './marketplace-api.service';

export interface VintedRelistingPlan {
  readonly job: VintedListingJob;
  readonly draft: VintedListingDraft;
  readonly imageUrl: string | null;
  readonly label: string;
}
@Injectable()
export class VintedRelistingPlanStore {
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly jobs = inject(VintedListingJobService);
  private readonly images = inject(VintedListingImageService);
  private readonly operations = inject(VintedListingOperationStore);
  private readonly accountView = inject(VintedAccountViewService);
  private readonly api = inject(MarketplaceApiService);
  private readonly visibleAccounts = computed(() => {
    if (!this.accounts.canManage()) return [];
    const selected = this.accounts.selectedConnection();
    const accounts = this.accountView.showAllAccounts()
      ? this.accounts.connections()
      : selected
        ? [selected]
        : [];
    return accounts.filter(
      (account) => account.status === 'connected' && account.executionMode === 'cloud',
    );
  });
  readonly combinedPublicationRevision = signal(0);
  readonly plans = signal<readonly VintedRelistingPlan[]>([]);
  readonly error = signal<string | null>(null);
  private readonly binding = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const accounts = this.visibleAccounts();
    return userId && accounts.length
      ? JSON.stringify([
          userId,
          this.accountView.showAllAccounts(),
          accounts.map((account) => [
            account.workspaceId,
            account.connectionId,
            account.externalAccountId,
          ]),
        ])
      : null;
  });
  private readonly subscriptionKey = computed(() => {
    const binding = this.binding();
    return binding
      ? JSON.stringify([binding, [...new Set(this.plans().map(({ job }) => job.draftId))].sort()])
      : null;
  });
  private generation = 0;
  private destroyed = false;
  private refreshing = false;
  private thumbnailsLoadedAt = 0;
  private readonly cache = new Map<string, VintedRelistingPlan>();
  private readonly releasedJobIds = new Set<string>();
  constructor() {
    effect((onCleanup) => {
      const binding = this.binding();
      untracked(() => {
        this.generation++;
        this.plans.set([]);
        this.cache.clear();
        this.releasedJobIds.clear();
        void this.refresh();
      });
      const { accounts, userId } = untracked(() => ({
        accounts: this.visibleAccounts(),
        userId: this.auth.currentUser()?.id,
      }));
      if (binding && userId)
        for (const account of accounts)
          onCleanup(
            this.operations.registerRelistingView(
              { userId, workspaceId: account.workspaceId, connectionId: account.connectionId },
              (job) => this.synchronizeConfirmedRelisting(job, binding),
              (job) => this.releaseCancelledPlan(job, binding),
            ),
          );
    });
    effect((onCleanup) => {
      const key = this.subscriptionKey();
      if (!key) return;
      const { account, binding, draftIds } = untracked(() => ({
        account: this.visibleAccounts()[0],
        binding: this.binding(),
        draftIds: [...new Set(this.plans().map(({ job }) => job.draftId))].sort(),
      }));
      if (!account || !binding) return;
      const refresh = () => {
        if (binding === this.binding()) void this.refresh();
      };
      const cleanups = draftIds.map((draftId) =>
        this.jobs.listen(account.workspaceId, draftId, refresh, refresh),
      );
      onCleanup(() => cleanups.forEach((cleanup) => cleanup()));
    });
    effect(() => {
      const pending = this.pendingPlans();
      if (!pending.length) return;
      untracked(() => {
        this.plans.update((plans) => [
          ...plans,
          ...pending
            .filter((item) => !plans.some((plan) => plan.job.id === item.record.job.id))
            .map((item) => ({
              ...item.record,
              imageUrl: item.imageUrl,
              label: this.label(item.record.job),
            })),
        ]);
        void this.refresh();
      });
    });
    const timer = setInterval(() => {
      // Derselbe Takt aktualisiert den Countdown auch bei einem noch offenen Abruf.
      this.plans.update((plans) => plans.map((plan) => ({ ...plan, label: this.label(plan.job) })));
      void this.refresh();
    }, 5000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
      clearInterval(timer);
    });
  }
  private async synchronizeConfirmedRelisting(
    job: VintedListingJob,
    binding: string,
  ): Promise<boolean> {
    if (this.destroyed || this.binding() !== binding) return true;
    const account = this.visibleAccounts().find((item) => item.connectionId === job.connectionId);
    if (!account || account.externalAccountId !== job.externalAccountId) return false;
    if (this.accountView.showAllAccounts()) {
      if (!job.relistEntryId || !job.externalId) return false;
      const entry = await this.api.readPublication(account, job.relistEntryId).catch(() => null);
      if (this.destroyed || this.binding() !== binding) return true;
      if (
        entry?.externalId !== job.externalId ||
        (job.providerState === 'active' && !(Date.parse(entry.publishedAt ?? '') <= Date.now()))
      )
        return false;
      this.combinedPublicationRevision.update((value) => value + 1);
    }
    const hasConfirmedEntry = () =>
      this.accounts
        .snapshot()
        ?.publications.items.some(
          (entry) =>
            entry.workspaceId === job.workspaceId &&
            entry.connectionId === job.connectionId &&
            entry.externalId === job.externalId &&
            (!job.relistEntryId || entry.id === job.relistEntryId) &&
            (job.providerState !== 'active' ||
              (entry.publishedAt !== null &&
                Number.isFinite(Date.parse(entry.publishedAt ?? '')) &&
                Date.parse(entry.publishedAt ?? '') <= Date.now())),
        );
    if (!this.accountView.showAllAccounts() && !hasConfirmedEntry()) {
      if (!job.connectionId) return false;
      const loaded = await this.accounts.reloadImportedSnapshot({
        workspaceId: job.workspaceId,
        connectionId: job.connectionId,
      });
      if (this.destroyed || this.binding() !== binding) return true;
      if (!loaded || !hasConfirmedEntry()) return false;
    }
    const update = (plan: VintedRelistingPlan): VintedRelistingPlan => {
      if (plan.job.id !== job.id || plan.job.version > job.version) return plan;
      const confirmed = { ...plan, job, label: this.label(job) };
      this.cache.set(job.id, confirmed);
      return confirmed;
    };
    this.plans.update((plans) => plans.map(update));
    this.operations.releaseRelisting(job);
    return true;
  }

  /** Entfernt nur einen sicher vor der Quellenlöschung gescheiterten Auftrag. */
  async discardFailed(job: VintedListingJob): Promise<void> {
    const binding = this.binding();
    const account = this.visibleAccounts().find((item) => item.connectionId === job.connectionId);
    const current = this.plans().find(
      (plan) =>
        plan.job.id === job.id &&
        plan.job.version === job.version &&
        plan.job.workspaceId === account?.workspaceId &&
        plan.job.connectionId === account?.connectionId,
    );
    if (!binding || !current || !canDiscardFailedRelisting(current.job))
      throw new Error('Der Relisting-Auftrag hat sich geändert. Aktualisiere die Anzeige.');

    const cancelled = await this.jobs.cancel(current.job);
    if (this.destroyed || binding !== this.binding()) return;
    this.operations.releaseRelisting(cancelled);
    await this.refresh();
  }

  private releaseCancelledPlan(job: VintedListingJob, binding: string): void {
    const current = this.plans().find((plan) => plan.job.id === job.id);
    if (
      this.destroyed ||
      binding !== this.binding() ||
      !this.visibleAccounts().some(
        (account) =>
          account.connectionId === job.connectionId &&
          account.externalAccountId === job.externalAccountId,
      ) ||
      (current?.job.version ?? 0) > job.version ||
      (this.cache.get(job.id)?.job.version ?? 0) > job.version ||
      this.releasedJobIds.has(job.id)
    )
      return;
    // Auch Antworten hinter weiteren asynchronen Schritten gehören noch zum alten Abruf.
    this.generation++;
    this.releasedJobIds.add(job.id);
    this.plans.update((plans) => plans.filter((plan) => plan.job.id !== job.id));
    this.cache.delete(job.id);
    if (this.accountView.showAllAccounts())
      this.combinedPublicationRevision.update((value) => value + 1);
  }

  canEdit(job: VintedListingJob): boolean {
    return (
      job.state === 'failed' ||
      (!!job.relistDeletedAt && ['queued', 'paused', 'cancelled'].includes(job.state))
    );
  }
  private label(job: VintedListingJob): string {
    return vintedRelistingJobLabel(job, Date.now());
  }
  private pendingPlans() {
    const accounts = this.visibleAccounts();
    return this.binding()
      ? this.operations
          .acceptedRelistings()
          .filter((item) =>
            accounts.some(
              (account) =>
                item.record.job.workspaceId === account.workspaceId &&
                item.record.job.connectionId === account.connectionId,
            ),
          )
      : [];
  }
  async refresh(): Promise<void> {
    if (this.destroyed || this.refreshing || !this.binding()) return;
    const accounts = this.visibleAccounts();
    const account = accounts[0];
    if (!account) return;
    const allAccounts = this.accountView.showAllAccounts();
    const generation = this.generation;
    this.refreshing = true;
    try {
      const reloadThumbnails = Date.now() - this.thumbnailsLoadedAt > 45 * 60_000;
      if (reloadThumbnails) {
        this.thumbnailsLoadedAt = Date.now();
      }
      const received = allAccounts
        ? (await this.jobs.listWorkspaceRelistingPlans(account.workspaceId)).filter(({ job }) =>
            accounts.some(
              (candidate) =>
                candidate.connectionId === job.connectionId &&
                candidate.externalAccountId === job.externalAccountId,
            ),
          )
        : await this.jobs.listPlans(account.workspaceId, account.connectionId);
      if (generation !== this.generation || this.destroyed) return;
      // Ein alter, bereits laufender Abruf darf eine soeben verworfene Karte nicht wieder sperren.
      const records = received.filter(({ job }) => !this.releasedJobIds.has(job.id));
      for (const jobId of this.releasedJobIds) {
        if (!received.some(({ job }) => job.id === jobId)) this.releasedJobIds.delete(jobId);
      }
      const missing = [...this.cache.values()].filter(
        (previous) => !records.some((record) => record.job.id === previous.job.id),
      );
      const needsSnapshot =
        missing.length > 0 || records.some((record) => record.job.state === 'confirmed');
      if (
        allAccounts &&
        needsSnapshot &&
        (missing.length || records.some(({ job }) => !this.cache.has(job.id)))
      )
        this.combinedPublicationRevision.update((value) => value + 1);
      const snapshotLoaded =
        allAccounts || !needsSnapshot || (await this.accounts.reloadImportedSnapshot(account));
      if (generation !== this.generation || this.destroyed) return;
      const plans: VintedRelistingPlan[] = [];
      for (const { job, draft } of records) {
        const previous = this.cache.get(job.id);
        const imageUrl =
          !reloadThumbnails && previous?.draft.revision === draft.revision
            ? previous.imageUrl
            : ((await this.images.thumbnailUrls([draft])).get(draft.id) ?? null);
        if (generation !== this.generation || this.destroyed) return;
        const latest = this.cache.get(job.id)?.job;
        const currentJob = latest && latest.version > job.version ? latest : job;
        const label = this.label(currentJob);
        const plan = { job: currentJob, draft, imageUrl, label };
        plans.push(plan);
      }
      // Erst die Lesekopie übernehmen, dann die bisher sichtbare Karte entfernen.
      if (!snapshotLoaded) plans.push(...missing);
      plans.push(
        ...this.pendingPlans()
          .filter((item) => !plans.some((plan) => plan.job.id === item.record.job.id))
          .map((item) => ({
            ...item.record,
            imageUrl: item.imageUrl,
            label: this.label(item.record.job),
          })),
      );
      if (generation !== this.generation) return;
      this.plans.set(plans);
      records.forEach(({ job }) => this.operations.releaseRelisting(job));
      this.error.set(null);
      this.cache.clear();
      plans.forEach((plan) => this.cache.set(plan.job.id, plan));
    } catch (error) {
      if (generation === this.generation)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die geplanten Inserate konnten nicht geladen werden.',
        );
    } finally {
      this.refreshing = false;
      if (!this.destroyed && generation !== this.generation) void this.refresh();
    }
  }
}

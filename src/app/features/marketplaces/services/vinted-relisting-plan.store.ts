import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedListingJobService } from './vinted-listing-job.service';
import { VintedListingDraftService } from './vinted-listing-draft.service';
import { VintedListingImageService } from './vinted-listing-image.service';
import { vintedListingJobLabel, type VintedListingJob } from '../models/vinted-listing-job';
import type { VintedListingDraft } from '../models/vinted-listing-draft';

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
  private readonly drafts = inject(VintedListingDraftService);
  private readonly images = inject(VintedListingImageService);
  readonly plans = signal<readonly VintedRelistingPlan[]>([]);
  readonly error = signal<string | null>(null);
  private readonly binding = computed(() => {
    const account = this.accounts.selectedConnection();
    return this.auth.currentUser() &&
      this.accounts.canManage() &&
      account?.status === 'connected' &&
      account.executionMode === 'cloud'
      ? JSON.stringify([this.auth.currentUser()!.id, account.workspaceId, account.connectionId])
      : null;
  });
  private generation = 0;
  private destroyed = false;
  private refreshing = false;
  private thumbnailsLoadedAt = 0;
  private readonly cache = new Map<string, VintedRelistingPlan>();
  constructor() {
    effect(() => {
      this.binding();
      untracked(() => {
        this.generation++;
        this.plans.set([]);
        this.cache.clear();
        void this.refresh();
      });
    });
    const timer = setInterval(() => void this.refresh(), 5000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
      clearInterval(timer);
    });
  }
  canEdit(job: VintedListingJob): boolean {
    return ['queued', 'paused', 'failed'].includes(job.state);
  }
  async refresh(): Promise<void> {
    if (this.destroyed || this.refreshing || !this.binding()) return;
    const account = this.accounts.selectedConnection()!,
      generation = this.generation;
    this.refreshing = true;
    try {
      if (Date.now() - this.thumbnailsLoadedAt > 45 * 60_000) {
        this.cache.clear();
        this.thumbnailsLoadedAt = Date.now();
      }
      const jobs = await this.jobs.listPlans(account.workspaceId, account.connectionId);
      if (generation !== this.generation || this.destroyed) return;
      const plans: VintedRelistingPlan[] = [];
      for (const job of jobs) {
        const previous = this.cache.get(job.draftId);
        const draft =
          previous?.draft.revision === job.draftRevision
            ? previous.draft
            : await this.drafts.load(account.workspaceId, job.draftId);
        const imageUrl =
          previous?.draft.revision === draft.revision
            ? previous.imageUrl
            : ((await this.images.thumbnailUrls([draft])).get(draft.id) ?? null);
        if (generation !== this.generation || this.destroyed) return;
        const scheduled = job.scheduledAt && job.state === 'queued';
        const label =
          job.errorCode === 'editing'
            ? 'Wird bearbeitet'
            : scheduled
              ? 'Veröffentlichung geplant für ' +
                new Intl.DateTimeFormat('de-DE', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: job.timeZone ?? undefined,
                }).format(new Date(job.scheduledAt!))
              : vintedListingJobLabel(job);
        const plan = { job, draft, imageUrl, label };
        plans.push(plan);
      }
      if (generation !== this.generation) return;
      this.plans.set(plans);
      this.error.set(null);
      this.cache.clear();
      plans.forEach((plan) => this.cache.set(plan.draft.id, plan));
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

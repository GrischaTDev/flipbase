import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AppDisplayPreferencesService } from '../../../core/services/app-display-preferences.service';
import type { AccountScope } from '../models/marketplace.models';
import type { VintedAction } from '../models/vinted-action-overview';
import type { VintedListingJob } from '../models/vinted-listing-job';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';
import { VintedActionOverviewApiService } from './vinted-action-overview-api.service';
import { VintedListingJobService } from './vinted-listing-job.service';

export interface VintedListingActionEntry {
  readonly job: VintedListingJob;
  readonly accountName: string;
}

export interface VintedRunningActionGroup {
  readonly scope: AccountScope;
  readonly accountName: string;
  readonly actions: readonly VintedAction[];
}

/** Appweite Leseansicht; die kontogebundenen Chatbelege bleiben unabhängig davon erhalten. */
@Injectable({ providedIn: 'root' })
export class VintedActionOverviewHeaderStore {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly preferences = inject(AppDisplayPreferencesService);
  private readonly accounts = inject(MarketplaceApiService);
  private readonly api = inject(VintedActionOverviewApiService);
  private readonly listingApi = inject(VintedListingJobService);
  readonly enabled = this.preferences.actionOverviewEnabled;
  readonly context = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    return this.enabled() && userId && workspace && !workspace.archived_at
      ? JSON.stringify([userId, workspace.id])
      : null;
  });
  private readonly snapshot = signal<{
    context: string;
    groups: readonly VintedRunningActionGroup[];
    listings: readonly VintedListingActionEntry[];
    error: string | null;
  } | null>(null);
  private readonly reading = signal<string | null>(null);
  private activeRead: { context: string; repeat: boolean } | null = null;
  private destroyed = false;
  private readonly completionTimes = new Map<string, number>();
  private readonly listingSubscriptions = computed(() => {
    const context = this.context();
    return context
      ? JSON.stringify([
          context,
          [...new Set(this.listings().map(({ job }) => job.draftId))].sort(),
        ])
      : null;
  });
  readonly groups = computed(() =>
    this.context() && this.snapshot()?.context === this.context()
      ? (this.snapshot()?.groups ?? [])
      : [],
  );
  readonly listings = computed(() =>
    this.context() && this.snapshot()?.context === this.context()
      ? (this.snapshot()?.listings ?? [])
      : [],
  );
  readonly count = computed(
    () =>
      this.groups().reduce(
        (count, group) =>
          count + group.actions.filter((action) => action.state === 'running').length,
        0,
      ) +
      this.listings().filter(({ job }) =>
        ['queued', 'paused', 'claimed', 'writing'].includes(job.state),
      ).length,
  );
  readonly hasRunning = computed(
    () =>
      this.groups().some((group) => group.actions.some((action) => action.state === 'running')) ||
      this.listings().some(
        ({ job }) =>
          job.state === 'claimed' ||
          job.state === 'writing' ||
          (job.state === 'queued' && !job.scheduledAt),
      ),
  );
  readonly loading = computed(() => this.context() !== null && this.reading() === this.context());
  readonly error = computed(() =>
    this.context() && this.snapshot()?.context === this.context()
      ? (this.snapshot()?.error ?? null)
      : null,
  );

  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.activeRead = null;
        this.reading.set(null);
        this.snapshot.set(null);
        this.completionTimes.clear();
        void this.refresh();
      });
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (this.context() && token) untracked(() => this.listingApi.authenticate(token));
    });
    effect((onCleanup) => {
      const subscriptions = this.listingSubscriptions();
      if (!subscriptions) return;
      const context = this.context();
      const refresh = () => {
        if (context === this.context()) void this.refresh();
      };
      const workspaceId = this.workspace.currentWorkspace()?.id;
      if (!workspaceId) return;
      const draftIds = untracked(() => [...new Set(this.listings().map(({ job }) => job.draftId))]);
      const cleanups = draftIds.map((draftId) =>
        this.listingApi.listen(workspaceId, draftId, refresh, refresh),
      );
      onCleanup(() => cleanups.forEach((cleanup) => cleanup()));
    });
    const refreshVisible = () => {
      if (document.visibilityState !== 'hidden') void this.refresh();
    };
    const timer = setInterval(refreshVisible, 5_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    });
  }

  async refresh(): Promise<void> {
    const context = this.context();
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!context || !workspaceId || this.destroyed) return;
    if (this.activeRead?.context === context) {
      this.activeRead.repeat = true;
      return;
    }
    const read = { context, repeat: false };
    this.activeRead = read;
    this.reading.set(context);
    const isCurrent = () =>
      !this.destroyed && this.context() === context && this.activeRead === read;
    try {
      const connections = await this.accounts.listConnections(workspaceId);
      if (!isCurrent()) return;
      const accounts = connections.canManage
        ? connections.connections.filter((account) => account.marketplace === 'vinted')
        : [];
      const [results, listingResult] = await Promise.all([
        Promise.allSettled(
          accounts.map((account) =>
            this.api.read({ workspaceId, connectionId: account.connectionId }),
          ),
        ),
        connections.canManage
          ? this.listingApi.list(workspaceId).then(
              (jobs) => ({ jobs, failed: false }),
              () => ({ jobs: [] as readonly VintedListingJob[], failed: true }),
            )
          : Promise.resolve({ jobs: [] as readonly VintedListingJob[], failed: false }),
      ]);
      if (!isCurrent()) return;
      let hasError = false;
      const previous = this.groups();
      const groups = accounts.flatMap((account, index): VintedRunningActionGroup[] => {
        const result = results[index];
        if (result.status === 'rejected') {
          if (result.reason instanceof MarketplaceApiError && result.reason.code === 'forbidden')
            return [];
          hasError = true;
          return previous.filter((group) => group.scope.connectionId === account.connectionId);
        }
        const previousActions =
          previous.find((group) => group.scope.connectionId === account.connectionId)?.actions ??
          [];
        const actions = result.value.actions.filter((action) => {
          const completionKey = `${account.connectionId}:${action.id}`;
          if (action.state === 'running') {
            this.completionTimes.delete(completionKey);
            return true;
          }
          if (
            action.state !== 'succeeded' ||
            !previousActions.some((previousAction) => previousAction.id === action.id)
          )
            return false;
          const completedAt = this.completionTimes.get(completionKey) ?? Date.now();
          this.completionTimes.set(completionKey, completedAt);
          return Date.now() - completedAt < 60_000;
        });
        return actions.length
          ? [
              {
                scope: { workspaceId, connectionId: account.connectionId },
                accountName: account.displayName,
                actions,
              },
            ]
          : [];
      });
      if (listingResult.failed) hasError = true;
      const availableAccounts = new Map(
        accounts.map((account) => [account.connectionId, account.displayName]),
      );
      const listings = (
        listingResult.failed ? this.listings().map((entry) => entry.job) : listingResult.jobs
      )
        .filter((job) => job.connectionId !== null && availableAccounts.has(job.connectionId))
        .filter((job) => job.state !== 'cancelled')
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .slice(0, 20)
        .flatMap((job) => {
          const accountName = job.connectionId
            ? availableAccounts.get(job.connectionId)
            : undefined;
          return accountName ? [{ job, accountName }] : [];
        });
      this.snapshot.set({ context, groups, listings, error: hasError ? this.readError : null });
    } catch (error) {
      if (isCurrent())
        this.snapshot.set({
          context,
          groups:
            error instanceof MarketplaceApiError && error.code === 'forbidden' ? [] : this.groups(),
          listings:
            error instanceof MarketplaceApiError && error.code === 'forbidden'
              ? []
              : this.listings(),
          error: this.readError,
        });
    } finally {
      if (this.activeRead === read) {
        this.activeRead = null;
        this.reading.set(null);
        if (read.repeat && !this.destroyed && this.context() === context) void this.refresh();
      }
    }
  }

  private readonly readError =
    'Die laufenden Aktionen konnten nicht aktualisiert werden. Ein vorhandener Stand bleibt sichtbar.';
}

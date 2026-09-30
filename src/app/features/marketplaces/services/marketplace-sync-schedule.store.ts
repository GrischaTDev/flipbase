import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { MarketplaceConnection } from '../models/marketplace.models';
import type {
  MarketplaceSyncSchedule,
  ScheduledSyncAvailability,
} from '../models/marketplace-sync-schedule';
import { MarketplaceResponseError } from '../models/marketplace-response';
import {
  MarketplaceSyncScheduleApiService,
  MarketplaceSyncScheduleError,
} from './marketplace-sync-schedule-api.service';

function errorText(error: unknown): string {
  return error instanceof MarketplaceSyncScheduleError || error instanceof MarketplaceResponseError
    ? error.message
    : 'Die automatische Aktualisierung konnte nicht geladen werden. Bitte lade den Stand erneut.';
}

/** Eigener Zustand für das sichtbare Konto; sämtliche Zeitsteuerung läuft auf dem Server. */
@Injectable()
export class MarketplaceSyncScheduleStore {
  private readonly api = inject(MarketplaceSyncScheduleApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  readonly account = signal<MarketplaceConnection | null>(null);
  readonly manageAllowed = signal(false);
  private readonly contextKey = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace();
    const account = this.account();
    return userId &&
      workspace &&
      !workspace.archived_at &&
      account?.workspaceId === workspace.id &&
      this.manageAllowed()
      ? JSON.stringify([userId, workspace.id, account.connectionId, account.status])
      : null;
  });
  private readonly loadedContext = signal<string | null>(null);
  private readonly current = computed(
    () => this.contextKey() !== null && this.contextKey() === this.loadedContext(),
  );
  private readonly savedSchedule = signal<MarketplaceSyncSchedule | null>(null);
  private readonly capability = signal<ScheduledSyncAvailability>({
    enabled: false,
    allowedIntervals: [],
  });
  private readonly fetching = signal(false);
  private readonly writing = signal(false);
  private readonly loadError = signal<string | null>(null);
  private readonly needsReload = signal(false);
  private readonly denied = signal(false);
  private revision = 0;
  private destroyed = false;

  readonly accessDenied = this.denied.asReadonly();
  readonly schedule = computed(() =>
    this.current() && !this.denied() ? this.savedSchedule() : null,
  );
  readonly availability = computed(() =>
    this.current() && !this.denied() ? this.capability() : { enabled: false, allowedIntervals: [] },
  );
  readonly loading = computed(
    () => this.contextKey() !== null && (!this.current() || this.fetching()),
  );
  readonly busy = computed(() => this.current() && this.writing());
  readonly error = computed(() => (this.current() ? this.loadError() : null));
  readonly canEnable = computed(
    () =>
      this.current() &&
      !this.loading() &&
      !this.busy() &&
      !this.needsReload() &&
      this.account()?.status === 'connected' &&
      !!this.account()?.externalAccountId &&
      this.availability().enabled &&
      this.schedule() !== null &&
      !this.schedule()?.enabled,
  );
  readonly canDisable = computed(
    () =>
      this.current() &&
      !this.loading() &&
      !this.busy() &&
      !this.needsReload() &&
      this.schedule()?.enabled === true,
  );

  constructor() {
    effect(() => {
      const key = this.contextKey();
      untracked(() => {
        this.revision++;
        this.loadedContext.set(key);
        this.savedSchedule.set(null);
        this.capability.set({ enabled: false, allowedIntervals: [] });
        this.fetching.set(false);
        this.writing.set(false);
        this.loadError.set(null);
        this.needsReload.set(false);
        this.denied.set(false);
        if (key) void this.reload();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
    });
  }

  private isCurrent(key: string, revision: number): boolean {
    return (
      !this.destroyed && this.current() && this.contextKey() === key && this.revision === revision
    );
  }

  private handleError(error: unknown): void {
    this.loadError.set(errorText(error));
    if (error instanceof MarketplaceSyncScheduleError && error.code === 'forbidden') {
      this.savedSchedule.set(null);
      this.capability.set({ enabled: false, allowedIntervals: [] });
      this.denied.set(true);
    }
  }

  private async refreshAvailability(key: string, revision: number): Promise<void> {
    try {
      const capability = await this.api.availability();
      if (this.isCurrent(key, revision) && !this.denied()) this.capability.set(capability);
    } catch {
      if (this.isCurrent(key, revision))
        this.capability.set({ enabled: false, allowedIntervals: [] });
    }
  }

  async reload(): Promise<void> {
    const key = this.contextKey();
    const account = this.account();
    if (!key || !account || !this.current() || this.busy()) return;
    const revision = ++this.revision;
    this.fetching.set(true);
    this.loadError.set(null);
    this.savedSchedule.set(null);
    this.capability.set({ enabled: false, allowedIntervals: [] });
    this.needsReload.set(false);
    this.denied.set(false);
    void this.refreshAvailability(key, revision);
    try {
      const schedule = await this.api.read({
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
      });
      if (!this.isCurrent(key, revision)) return;
      this.savedSchedule.set(schedule);
    } catch (error) {
      if (this.isCurrent(key, revision)) this.handleError(error);
    } finally {
      if (this.isCurrent(key, revision)) this.fetching.set(false);
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const key = this.contextKey();
    const schedule = this.schedule();
    if (!key || !schedule || !(enabled ? this.canEnable() : this.canDisable())) return;
    const revision = ++this.revision;
    this.writing.set(true);
    this.loadError.set(null);
    try {
      if (enabled) {
        const capability = await this.api.availability();
        if (!this.isCurrent(key, revision)) return;
        this.capability.set(capability);
        if (!capability.enabled) {
          this.loadError.set(
            'Der Browserdienst unterstützt die automatische Aktualisierung derzeit nicht. Lade den Stand später erneut.',
          );
          return;
        }
      }
      const result = await this.api.set(
        { workspaceId: schedule.workspaceId, connectionId: schedule.connectionId },
        enabled,
        schedule.intervalMinutes,
        schedule.authorizationVersion,
      );
      if (this.isCurrent(key, revision)) this.savedSchedule.set(result);
    } catch (error) {
      if (this.isCurrent(key, revision)) {
        this.handleError(error);
        this.needsReload.set(true);
      }
    } finally {
      if (this.isCurrent(key, revision)) this.writing.set(false);
    }
  }
}

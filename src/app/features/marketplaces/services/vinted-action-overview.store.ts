import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { ActionOverviewPreferencesService } from '../../../core/services/action-overview-preferences.service';
import type { VintedAction } from '../models/vinted-action-overview';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedActionOverviewApiService } from './vinted-action-overview-api.service';

@Injectable()
export class VintedActionOverviewStore {
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(ActionOverviewPreferencesService);
  private readonly api = inject(VintedActionOverviewApiService);
  private readonly context = computed(() => {
    const account = this.accounts.selectedConnection();
    const userId = this.auth.currentUser()?.id;
    return account && userId && this.accounts.canManage()
      ? JSON.stringify([
          userId,
          account.workspaceId,
          account.connectionId,
          account.externalAccountId,
          account.executionMode,
        ])
      : null;
  });
  private readonly snapshot = signal<{ context: string; actions: readonly VintedAction[] } | null>(
    null,
  );
  private readonly failure = signal<{ context: string; message: string } | null>(null);
  private readonly reading = signal<string | null>(null);
  private activeRead: { context: string; repeat: boolean } | null = null;
  private lastReadAt = 0;
  private destroyed = false;
  readonly enabled = this.preferences.enabled;
  readonly hasLoaded = computed(
    () => this.context() !== null && this.snapshot()?.context === this.context(),
  );
  readonly actions = computed(() =>
    this.snapshot()?.context === this.context() ? (this.snapshot()?.actions ?? []) : [],
  );
  readonly loading = computed(() => this.context() !== null && this.reading() === this.context());
  readonly error = computed(() =>
    this.failure()?.context === this.context() ? (this.failure()?.message ?? null) : null,
  );
  readonly pendingCount = computed(
    () =>
      this.actions().filter((action) => action.state === 'queued' || action.state === 'running')
        .length,
  );
  readonly hasRunning = computed(() => this.actions().some((action) => action.state === 'running'));

  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.lastReadAt = 0;
        void this.refresh();
      });
    });
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const interval = this.pendingCount() ? 10_000 : 60_000;
      if (
        (this.preferences.enabled() || this.pendingCount()) &&
        Date.now() - this.lastReadAt >= interval
      )
        void this.refresh();
    }, 5_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(timer);
    });
  }

  async refresh(): Promise<void> {
    const context = this.context();
    const account = this.accounts.selectedConnection();
    if (!context || !account || this.destroyed) return;
    if (this.activeRead?.context === context) {
      this.activeRead.repeat = true;
      return;
    }
    const read = { context, repeat: false };
    this.activeRead = read;
    this.reading.set(context);
    this.lastReadAt = Date.now();
    try {
      const overview = await this.api.read({
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
      });
      if (this.destroyed || this.context() !== context || this.activeRead !== read) return;
      this.snapshot.set({ context, actions: overview.actions });
      this.failure.set(null);
    } catch {
      if (!this.destroyed && this.context() === context && this.activeRead === read)
        this.failure.set({
          context,
          message:
            'Der Aktionsstatus konnte nicht geladen werden. Ein vorhandener Stand bleibt sichtbar.',
        });
    } finally {
      if (this.activeRead === read) {
        this.activeRead = null;
        this.reading.set(null);
        if (read.repeat && !this.destroyed && context === this.context()) void this.refresh();
      }
    }
  }
}

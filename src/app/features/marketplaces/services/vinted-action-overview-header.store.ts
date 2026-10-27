import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ActionOverviewPreferencesService } from '../../../core/services/action-overview-preferences.service';
import type { AccountScope } from '../models/marketplace.models';
import type { VintedAction } from '../models/vinted-action-overview';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';
import { VintedActionOverviewApiService } from './vinted-action-overview-api.service';

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
  private readonly preferences = inject(ActionOverviewPreferencesService);
  private readonly accounts = inject(MarketplaceApiService);
  private readonly api = inject(VintedActionOverviewApiService);
  readonly enabled = this.preferences.enabled;
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
    error: string | null;
  } | null>(null);
  private readonly reading = signal<string | null>(null);
  private activeRead: { context: string; repeat: boolean } | null = null;
  private destroyed = false;
  readonly groups = computed(() =>
    this.context() && this.snapshot()?.context === this.context()
      ? (this.snapshot()?.groups ?? [])
      : [],
  );
  readonly count = computed(() =>
    this.groups().reduce((count, group) => count + group.actions.length, 0),
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
        void this.refresh();
      });
    });
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void this.refresh();
    }, 10_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      clearInterval(timer);
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
      const results = await Promise.allSettled(
        accounts.map((account) =>
          this.api.read({ workspaceId, connectionId: account.connectionId }),
        ),
      );
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
        const actions = result.value.actions.filter((action) => action.state === 'running');
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
      this.snapshot.set({ context, groups, error: hasError ? this.readError : null });
    } catch (error) {
      if (isCurrent())
        this.snapshot.set({
          context,
          groups:
            error instanceof MarketplaceApiError && error.code === 'forbidden' ? [] : this.groups(),
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

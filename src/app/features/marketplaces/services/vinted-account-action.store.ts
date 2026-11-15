import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import {
  vintedAccountActionTitle,
  type VintedAccountAction,
} from '../models/vinted-account-action';
import { MarketplaceApiService } from './marketplace-api.service';
import { VintedAccountActionApiService } from './vinted-account-action-api.service';
import { VintedActionOverviewHeaderStore } from './vinted-action-overview-header.store';
import {
  claimVintedAccountActionNotification,
  releaseVintedAccountActionRequest,
} from './vinted-account-action-transport';

export interface VintedAccountActionEntry {
  readonly action: VintedAccountAction;
  readonly accountName: string;
}
@Injectable({ providedIn: 'root' })
export class VintedAccountActionStore {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly accounts = inject(MarketplaceApiService);
  private readonly api = inject(VintedAccountActionApiService);
  private readonly toast = inject(ToastService);
  private readonly overview = inject(VintedActionOverviewHeaderStore);
  private readonly context = computed(() => {
    const user = this.auth.currentUser(),
      workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at
      ? JSON.stringify([user.id, workspace.id])
      : null;
  });
  private readonly snapshot = signal<{
    context: string;
    entries: readonly VintedAccountActionEntry[];
  } | null>(null);
  private readonly failure = signal<{ context: string; message: string } | null>(null);
  private reading: { context: string; repeat: boolean } | null = null;
  private readonly subscriptions = new Map<string, () => void>();
  private destroyed = false;
  readonly entries = computed(() =>
    this.snapshot()?.context === this.context()
      ? (this.snapshot()?.entries ?? []).filter(
          ({ action }) =>
            ['queued', 'running', 'outcome_unknown'].includes(action.state) ||
            !this.overview.isDismissed(`direct:${action.id}`),
        )
      : [],
  );
  readonly error = computed(() =>
    this.failure()?.context === this.context() ? (this.failure()?.message ?? null) : null,
  );
  readonly count = computed(
    () =>
      this.entries().filter(({ action }) => ['queued', 'running'].includes(action.state)).length,
  );
  readonly hasRunning = computed(() =>
    this.entries().some(({ action }) => action.state === 'running'),
  );
  readonly hasFailure = computed(
    () =>
      !!this.error() ||
      this.entries().some(({ action }) => ['failed', 'outcome_unknown'].includes(action.state)),
  );
  readonly busy = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.context();
      untracked(() => {
        this.reading = null;
        this.busy.set(null);
        this.disconnect();
        void this.refresh();
      });
    });
    effect(() => {
      const token = this.auth.session()?.access_token;
      if (token && this.context()) this.api.authenticate(token);
    });
    const visible = () => {
      if (document.visibilityState !== 'hidden') void this.refresh();
    };
    const timer = setInterval(visible, 5000);
    window.addEventListener('focus', visible);
    window.addEventListener('flipbase-account-actions-changed', visible);
    document.addEventListener('visibilitychange', visible);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.disconnect();
      clearInterval(timer);
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('flipbase-account-actions-changed', visible);
    });
  }
  async refresh(): Promise<void> {
    const context = this.context(),
      workspaceId = this.workspace.currentWorkspace()?.id;
    if (!context || !workspaceId || this.destroyed) return;
    if (this.reading?.context === context) {
      this.reading.repeat = true;
      return;
    }
    const reading = { context, repeat: false };
    this.reading = reading;
    const current = () => !this.destroyed && this.context() === context && this.reading === reading;
    try {
      const connections = await this.accounts.listConnections(workspaceId);
      if (!current()) return;
      const accounts = connections.canManage
        ? connections.connections.filter((account) => account.marketplace === 'vinted')
        : [];
      const allowed = new Set(accounts.map((account) => account.connectionId));
      for (const [id, unsubscribe] of this.subscriptions)
        if (!allowed.has(id)) {
          unsubscribe();
          this.subscriptions.delete(id);
        }
      for (const account of accounts)
        if (!this.subscriptions.has(account.connectionId)) {
          this.subscriptions.set(
            account.connectionId,
            this.api.listen({ workspaceId, connectionId: account.connectionId }, () => {
              if (this.context() === context) void this.refresh();
            }),
          );
        }
      const results = await Promise.allSettled(
        accounts.map((account) =>
          this.api.list({ workspaceId, connectionId: account.connectionId }),
        ),
      );
      if (!current()) return;
      const before = new Map(this.entries().map(({ action }) => [action.id, action]));
      const entries = accounts
        .flatMap((account, index) => {
          const result = results[index];
          if (result.status === 'rejected') {
            const reason: unknown = result.reason;
            if (reason && typeof reason === 'object' && 'code' in reason && reason.code === '42501')
              return [];
            return this.entries().filter(
              (entry) => entry.action.connectionId === account.connectionId,
            );
          }
          return result.value.map((incoming) => {
            const previous = before.get(incoming.id);
            const action = previous && previous.version > incoming.version ? previous : incoming;
            const userId = this.auth.currentUser()?.id;
            if (userId) releaseVintedAccountActionRequest(action, userId);
            if (
              action.state === 'succeeded' &&
              previous &&
              ['queued', 'running'].includes(previous.state) &&
              claimVintedAccountActionNotification(action.id)
            )
              this.toast.success(
                vintedAccountActionTitle(action.kind) + ' erledigt',
                account.displayName,
              );
            return { action, accountName: account.displayName };
          });
        })
        .sort(
          (left, right) => Date.parse(right.action.createdAt) - Date.parse(left.action.createdAt),
        );
      this.snapshot.set({ context, entries });
      this.failure.set(
        results.some((result) => result.status === 'rejected')
          ? {
              context,
              message: 'Die laufenden Aktionen konnten nicht vollständig aktualisiert werden.',
            }
          : null,
      );
    } catch {
      if (current())
        this.failure.set({
          context,
          message: 'Die laufenden Aktionen konnten nicht geladen werden.',
        });
    } finally {
      if (this.reading === reading) {
        const repeat = reading.repeat && current();
        this.reading = null;
        if (repeat) void this.refresh();
      }
    }
  }
  async cancel(action: VintedAccountAction): Promise<void> {
    if (action.state !== 'queued') return;
    await this.change(action, () => this.api.cancel(action));
  }
  dismiss(action: VintedAccountAction): void {
    if (['succeeded', 'failed', 'cancelled'].includes(action.state))
      this.overview.dismiss(`direct:${action.id}`);
  }
  async reconcile(action: VintedAccountAction): Promise<void> {
    if (action.state !== 'outcome_unknown') return;
    const key = `flipbase_reconcile:${this.auth.currentUser()?.id}:${action.workspaceId}:${action.connectionId}:${action.id}`;
    try {
      const requestId = localStorage.getItem(key) ?? crypto.randomUUID();
      localStorage.setItem(key, requestId);
      if (await this.change(action, () => this.api.reconcile(action, requestId)))
        localStorage.removeItem(key);
    } catch {
      const context = this.context();
      if (context)
        this.failure.set({
          context,
          message: 'Die Nachprüfung konnte nicht beauftragt werden. Versuche es erneut.',
        });
    }
  }
  private async change(
    action: VintedAccountAction,
    change: () => Promise<VintedAccountAction>,
  ): Promise<boolean> {
    const context = this.context();
    if (
      !context ||
      this.busy() ||
      !this.entries().some(
        (entry) => entry.action.id === action.id && entry.action.version === action.version,
      )
    )
      return false;
    this.busy.set(action.id);
    try {
      await change();
      if (context === this.context()) await this.refresh();
      return true;
    } catch (error) {
      if (context === this.context())
        this.failure.set({
          context,
          message:
            error &&
            typeof error === 'object' &&
            'details' in error &&
            error.details === 'account_action_queue_full'
              ? 'Für dieses Konto warten bereits 50 Aktionen. Warte, bis ein Platz frei wird, oder brich einen wartenden Auftrag ab. Diese Aktion wurde nicht angenommen.'
              : 'Der Auftrag konnte nicht geändert werden. Aktualisiere den Status und versuche es erneut.',
        });
      return false;
    } finally {
      if (context === this.context()) this.busy.set(null);
    }
  }
  private disconnect(): void {
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }
}

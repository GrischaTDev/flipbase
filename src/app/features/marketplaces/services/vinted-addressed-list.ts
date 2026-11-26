import { computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { vintedAccountLabels } from '../models/vinted-account-labels';
import {
  vintedAccountEntryKey,
  type VintedAccountListPage,
  type VintedAccountListRequest,
} from '../models/vinted-account-list';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';
import { VintedAccountViewService } from './vinted-account-view.service';

type ListOptions = Omit<
  VintedAccountListRequest,
  'workspaceId' | 'connectionId' | 'cursor' | 'entryId'
>;

export function createVintedAccountList(options: () => ListOptions | null) {
  const accountView = inject(VintedAccountViewService);
  const accounts = inject(MarketplaceAccountStore);
  const api = inject(MarketplaceApiService);
  const workspace = inject(WorkspaceService);
  const auth = inject(AuthService);
  const labels = computed(() => vintedAccountLabels(accounts.connections()));
  const request = computed(
    () => {
      if (!accountView.showAllAccounts() || !accounts.canManage()) return null;
      const userId = auth.currentUser()?.id;
      const workspaceId = workspace.currentWorkspace()?.id;
      const connections = accounts.connections();
      if (!userId || !workspaceId || !connections.length) return null;
      const filters = options();
      if (!filters) return null;
      const input = { ...filters, workspaceId };
      const key = JSON.stringify([
        userId,
        workspaceId,
        input.kind,
        input.query ?? '',
        input.filter ?? 'all',
        input.oldestFirst ?? false,
        connections.map((account) => [account.connectionId, account.externalAccountId]),
      ]);
      const freshness = JSON.stringify(connections.map((account) => account.lastSyncedAt));
      return { key, freshness, input };
    },
    { equal: (left, right) => left?.key === right?.key && left?.freshness === right?.freshness },
  );
  const state = signal<{
    readonly key: string;
    readonly page: VintedAccountListPage | null;
    readonly loading: boolean;
    readonly error: string | null;
  } | null>(null);
  const current = computed(() => {
    const result = state();
    return result?.key === request()?.key ? result : null;
  });
  let revision = 0;
  inject(DestroyRef).onDestroy(() => revision++);
  const observeImports = computed(() => request() !== null);
  effect((onCleanup) => {
    if (observeImports()) onCleanup(untracked(() => accounts.observeCombinedImports()));
  });

  async function load(append = false): Promise<void> {
    const target = request();
    if (!target) return;
    const previous = current();
    if (append && (!previous?.page?.nextCursor || previous.loading)) return;
    const activeRevision = ++revision;
    const isCurrent = () =>
      request()?.key === target.key &&
      request()?.freshness === target.freshness &&
      revision === activeRevision;
    const firstPages =
      target.input.kind === 'publication' || target.input.kind === 'conversation'
        ? accounts.vintedListFirstPages
        : null;
    const previousPage = previous?.page ?? firstPages?.get(target) ?? null;
    state.set({ key: target.key, page: previousPage, loading: true, error: null });
    try {
      const cursor = append ? (previousPage?.nextCursor ?? undefined) : undefined;
      const firstPage = await api.readVintedList(
        { ...target.input, cursor },
        !previousPage && target.input.kind === 'publication'
          ? (storedPage) => {
              if (isCurrent())
                state.set({ key: target.key, page: storedPage, loading: true, error: null });
            }
          : undefined,
      );
      let page = firstPage;
      const entries = new Map(
        (append ? (previousPage?.items ?? []) : []).map((entry) => [
          vintedAccountEntryKey(entry),
          entry,
        ]),
      );
      const seen = new Set<string>();
      for (;;) {
        if (!isCurrent()) return;
        page.items.forEach((entry) => entries.set(vintedAccountEntryKey(entry), entry));
        if (append || entries.size >= (previousPage?.items.length ?? 0) || !page.nextCursor) break;
        if (seen.has(page.nextCursor)) break;
        seen.add(page.nextCursor);
        page = await api.readVintedList({ ...target.input, cursor: page.nextCursor });
      }
      if (!append) firstPages?.remember(target, firstPage);
      state.set({
        key: target.key,
        page: { ...page, items: [...entries.values()] },
        loading: false,
        error: null,
      });
    } catch (error) {
      if (!isCurrent()) return;
      const forbidden = error instanceof MarketplaceApiError && error.code === 'forbidden';
      if (forbidden) accounts.vintedListFirstPages.clear();
      state.set({
        key: target.key,
        page: forbidden ? null : previousPage,
        loading: false,
        error: 'Die Vinted-Daten konnten nicht geladen werden.',
      });
    }
  }

  effect(() => {
    request();
    untracked(() => void load());
  });
  return {
    showAllAccounts: accountView.showAllAccounts,
    labels,
    page: computed(() => current()?.page ?? null),
    loading: computed(() => !!request() && (current()?.loading ?? true)),
    error: computed(() => current()?.error ?? null),
    loadMore: () => load(true),
    refresh: () => {
      const target = request();
      if (target) accounts.vintedListFirstPages.forget(target.key);
      return load();
    },
  };
}

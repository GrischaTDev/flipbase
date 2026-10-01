import { DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { VintedListingMetricChanges } from '../../models/vinted-listing-metric-change';
import type { MarketplaceAccountStore } from '../../services/marketplace-account.store';

export function createVintedListingMetricDisplay(
  store: MarketplaceAccountStore,
  entries: () => readonly MarketplaceEntry[],
) {
  const visible = signal<VintedListingMetricChanges>({});
  const highlighted = signal<ReadonlySet<string>>(new Set());
  const announcement = signal('');
  let connectionId: string | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const changes = computed<VintedListingMetricChanges>(() =>
    store.selectedConnection()?.connectionId === connectionId ? visible() : {},
  );
  effect(() => {
    const account = store.selectedConnection();
    const loading = store.loading();
    const loadingSnapshot = store.loadingSnapshot();
    const observed = store.listingMetricChanges();
    const ids = entries().map((entry) => entry.id);
    untracked(() => {
      if (!account && loading) return;
      if (loadingSnapshot && !ids.length) return;
      if (connectionId !== account?.connectionId) {
        connectionId = account?.connectionId ?? null;
        visible.set({});
        highlighted.set(new Set());
        announcement.set('');
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
      }
      const retained = Object.fromEntries(
        Object.entries(visible()).filter(
          ([id, change]) =>
            change && ids.includes(id) && observed[id]?.observedAt === change.observedAt,
        ),
      );
      const fresh = store.consumeListingMetricChanges(ids);
      visible.set({ ...retained, ...fresh });
      const newIds = Object.keys(fresh);
      highlighted.update(
        (current) => new Set([...current].filter((id) => id in retained || id in fresh)),
      );
      if (!newIds.length) return;
      highlighted.update((current) => new Set([...current, ...newIds]));
      const views = Object.values(fresh).reduce((sum, change) => sum + (change?.views ?? 0), 0);
      const favorites = Object.values(fresh).reduce(
        (sum, change) => sum + (change?.favorites ?? 0),
        0,
      );
      announcement.set(
        `${newIds.length} Inserat${newIds.length === 1 ? '' : 'e'}: ${views} zusätzliche Aufrufe seit dem vorherigen Abruf. Favoritenzahl um ${favorites} gestiegen.`,
      );
      const versions = new Map(newIds.map((id) => [id, fresh[id]!.observedAt]));
      const timer = setTimeout(() => {
        timers.delete(timer);
        highlighted.update(
          (current) =>
            new Set(
              [...current].filter(
                (id) => !versions.has(id) || visible()[id]?.observedAt !== versions.get(id),
              ),
            ),
        );
      }, 2000);
      timers.add(timer);
    });
  });
  inject(DestroyRef).onDestroy(() => {
    for (const timer of timers) clearTimeout(timer);
  });
  return {
    changes,
    highlighted: highlighted.asReadonly(),
    announcement: announcement.asReadonly(),
  };
}

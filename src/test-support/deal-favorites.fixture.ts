import { computed, signal } from '@angular/core';
import type { FeedItem } from '../app/features/deal-monitor/models/deal-monitor.model';

/** Oberflächentests bleiben ohne Netzwerk; Serververhalten wird im Dienst separat geprüft. */
export function createDealFavoritesFixture() {
  const favorites = signal<FeedItem[]>([]);
  const add = async (item: FeedItem) => {
    favorites.update((rows) => [item, ...rows.filter((row) => row.id !== item.id)]);
    return true;
  };
  const remove = async (item: string | FeedItem) => {
    const id = typeof item === 'string' ? item : item.id;
    favorites.update((rows) => rows.filter((row) => row.id !== id));
    return true;
  };
  const isFavorite = (item: string | FeedItem) =>
    favorites().some((row) => row.id === (typeof item === 'string' ? item : item.id));
  return {
    favorites,
    count: computed(() => favorites().length),
    ready: signal(true),
    loading: signal(false),
    busy: signal(false),
    error: signal<string | null>(null),
    legacyCount: signal(0),
    add,
    remove,
    isFavorite,
    toggle: async (item: FeedItem) => (isFavorite(item) ? remove(item) : add(item)),
    clear: async () => {
      favorites.set([]);
      return true;
    },
    refresh: async () => undefined,
    importLegacy: async () => true,
  };
}

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { MarketplaceListingStatisticsStore } from './marketplace-listing-statistics.store';
import { parseMarketplaceSnapshot } from '../models/marketplace-response';
import type { VintedListingStatistics } from '../models/vinted-listing-statistics';
const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const empty = { items: [], total: 0, nextCursor: null };
function snapshot(time = '2026-10-02T12:30:00Z') {
  return parseMarketplaceSnapshot(
    {
      ...scope,
      profile: null,
      publications: {
        ...empty,
        items: [
          {
            ...scope,
            id: 'listing-a',
            title: 'Artikel',
            metrics: { views: 22, favorites: 5, observedAt: time },
          },
        ],
        total: 1,
      },
      conversations: empty,
      sales: empty,
      activity: empty,
    },
    scope,
  );
}
const account = {
  canManage: signal(true),
  selectedConnection: signal(scope),
  snapshot: signal(snapshot()),
  selectionVersion: signal(0),
};
let read: ReturnType<typeof vi.fn>;
let store: MarketplaceListingStatisticsStore;
const data = (periodMinutes = 5, views: number | null = 2): VintedListingStatistics => ({
  ...scope,
  periodMinutes: periodMinutes as VintedListingStatistics['periodMinutes'],
  items: [
    {
      entryId: 'listing-a',
      observedAt: '2026-10-02T12:30:00Z',
      baselineAt: views === null ? null : '2026-10-02T12:25:00Z',
      views,
      favorites: views === null ? null : 1,
    },
  ],
});
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
beforeEach(() => {
  account.canManage.set(true);
  account.selectedConnection.set(scope);
  account.snapshot.set(snapshot());
  read = vi.fn().mockResolvedValue(data());
  TestBed.configureTestingModule({
    providers: [
      MarketplaceListingStatisticsStore,
      { provide: MarketplaceAccountStore, useValue: account },
      { provide: MarketplaceApiService, useValue: { readListingStatistics: read } },
    ],
  });
  store = TestBed.inject(MarketplaceListingStatisticsStore);
});
afterEach(() => TestBed.resetTestingModule());
it('zeigt gespeicherte Änderungen auch beim ersten Öffnen und entfernt sie bei einem Abruf ohne Zuwachs', async () => {
  await settle();
  expect(store.change(account.snapshot().publications.items[0])?.views).toBe(2);
  const next = {
    ...data(),
    items: [{ ...data().items[0], observedAt: '2026-10-02T12:35:00Z', views: 0, favorites: 0 }],
  };
  read.mockResolvedValue(next);
  account.snapshot.set(snapshot('2026-10-02T12:35:00Z'));
  expect(store.change(account.snapshot().publications.items[0])).toBeNull();
  await settle();
  expect(store.change(account.snapshot().publications.items[0])).toBeNull();
});
it('verwirft die verspätete Antwort eines früher gewählten Zeitraums', async () => {
  let resolve!: (data: VintedListingStatistics) => void;
  read.mockReturnValueOnce(
    new Promise<VintedListingStatistics>((done) => {
      resolve = done;
    }),
  );
  await settle();
  store.selectPeriod(60);
  read.mockResolvedValue(data(60, 9));
  await settle();
  resolve(data(5, 2));
  await settle();
  expect(store.change(account.snapshot().publications.items[0])?.views).toBe(9);
});
it('verbirgt private Vergleiche sofort bei einem Kontowechsel oder Rechteentzug', async () => {
  await settle();
  account.selectedConnection.set({ ...scope, connectionId: 'account-b' });
  expect(store.change(account.snapshot().publications.items[0])).toBeNull();
  account.selectedConnection.set(scope);
  account.canManage.set(false);
  expect(store.change(account.snapshot().publications.items[0])).toBeNull();
});
it('meldet fehlende Historie statt einen Zuwachs zu erfinden', async () => {
  read.mockResolvedValue(data(5, null));
  await settle();
  expect(store.missingHistory()).toBe(true);
  expect(store.change(account.snapshot().publications.items[0])).toBeNull();
});
it('zeigt beim letzten Abruf keine alte Pluszahl eines inzwischen ausgelassenen Inserats', async () => {
  read.mockResolvedValue({
    ...data(),
    items: [
      ...data().items,
      {
        ...data().items[0],
        entryId: 'listing-b',
        observedAt: '2026-10-02T12:35:00Z',
        views: 0,
        favorites: 0,
      },
    ],
  });
  await settle();
  expect(store.change(account.snapshot().publications.items[0])).toBeNull();
  store.selectPeriod(60);
  read.mockResolvedValue(data(60, 9));
  await settle();
  expect(store.change(account.snapshot().publications.items[0])?.views).toBe(9);
});

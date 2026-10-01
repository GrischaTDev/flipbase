import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { createVintedListingMetricDisplay } from './vinted-listing-metric-display';
import type { VintedListingMetricChange } from '../../models/vinted-listing-metric-change';
import { parseMarketplacePage } from '../../models/marketplace-response';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});

it('hält den Zusatz, beendet die Hervorhebung nach zwei Sekunden und startet bei Wiederholung keinen Effekt', () => {
  vi.useFakeTimers();
  const account = createMarketplaceFixtures().connections[0];
  const item = parseMarketplacePage(
    { items: [{ ...account, id: 'a' }], total: 1, nextCursor: null },
    account,
  ).items[0];
  const changes = signal<Readonly<Record<string, VintedListingMetricChange>>>({});
  const entries = signal([item]);
  const loadingSnapshot = signal(false);
  const consumed = new Map<string, string>();
  const store = {
    selectedConnection: signal(account),
    loading: signal(false),
    loadingSnapshot,
    listingMetricChanges: changes,
    consumeListingMetricChanges(ids: readonly string[]) {
      const result: Record<string, VintedListingMetricChange> = {};
      for (const id of ids) {
        const change = changes()[id];
        if (change && consumed.get(id) !== change.observedAt) {
          result[id] = change;
          consumed.set(id, change.observedAt);
        }
      }
      return result;
    },
  } as unknown as MarketplaceAccountStore;
  const display = TestBed.runInInjectionContext(() =>
    createVintedListingMetricDisplay(store, entries),
  );
  TestBed.tick();
  changes.set({ a: { views: 2, favorites: 1, observedAt: '2026-10-01T12:00:00Z' } });
  TestBed.tick();
  expect(display.changes()['a']).toEqual({
    views: 2,
    favorites: 1,
    observedAt: '2026-10-01T12:00:00Z',
  });
  expect(display.highlighted().has('a')).toBe(true);
  expect(display.announcement()).toContain('2 zusätzliche Aufrufe');
  loadingSnapshot.set(true);
  entries.set([]);
  TestBed.tick();
  expect(display.changes()['a']?.views).toBe(2);
  entries.set([item]);
  loadingSnapshot.set(false);
  TestBed.tick();
  vi.advanceTimersByTime(2000);
  expect(display.highlighted().has('a')).toBe(false);
  expect(display.changes()['a']?.favorites).toBe(1);
  changes.set({ ...changes() });
  TestBed.tick();
  expect(display.highlighted().has('a')).toBe(false);
  const reopened = TestBed.runInInjectionContext(() =>
    createVintedListingMetricDisplay(store, () => [item]),
  );
  TestBed.tick();
  expect(reopened.changes()).toEqual({});
  expect(reopened.highlighted().size).toBe(0);
  changes.set({});
  TestBed.tick();
  expect(display.changes()).toEqual({});
});

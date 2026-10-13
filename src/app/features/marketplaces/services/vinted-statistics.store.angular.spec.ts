import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  VintedStatisticsOverview,
  VintedStatisticsRange,
  VintedStatisticsRequestScope,
} from '../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { VintedStatisticsStore } from './vinted-statistics.store';

const accountA = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  lastSyncedAt: '2026-10-02T12:00:00Z' as string | null,
};
const accountB = { ...accountA, connectionId: 'account-b' };
const scopeA = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const account = {
  canManage: signal(true),
  connections: signal([accountA, accountB]),
  selectedConnection: signal<typeof accountA | null>(accountA),
  snapshot: signal<unknown>(null),
  loadingSnapshot: signal(false),
  selectionVersion: signal(0),
};
const overview = (
  scope: VintedStatisticsRequestScope,
  range: VintedStatisticsRange,
  views = 1,
): VintedStatisticsOverview => ({
  ...scope,
  range,
  historyStartsAt: null,
  activeCount: 0,
  totals: { views, favorites: 0 },
  previousTotals: null,
  buckets: [],
  topItems: [],
});
let read: ReturnType<typeof vi.fn>;
let store: VintedStatisticsStore;
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
beforeEach(() => {
  account.canManage.set(true);
  account.connections.set([accountA, accountB]);
  account.selectedConnection.set(accountA);
  account.selectionVersion.set(0);
  account.snapshot.set(null);
  account.loadingSnapshot.set(false);
  read = vi.fn((scope: VintedStatisticsRequestScope, range: VintedStatisticsRange) =>
    Promise.resolve(overview(scope, range)),
  );
  TestBed.configureTestingModule({
    providers: [
      VintedStatisticsStore,
      { provide: MarketplaceAccountStore, useValue: account },
      { provide: MarketplaceApiService, useValue: { readStatisticsOverview: read } },
    ],
  });
  store = TestBed.inject(VintedStatisticsStore);
});
afterEach(() => TestBed.resetTestingModule());

it('lädt beim Öffnen sieben Tage für das gewählte Konto', async () => {
  await settle();
  expect(read).toHaveBeenCalledWith(scopeA, '7d');
  expect(store.overview()?.connectionId).toBe('account-a');
  expect(store.loading()).toBe(false);
});

it('lädt alle Konten ohne Kontokennung und wechselt den Zeitraum', async () => {
  await settle();
  store.selectAccountScope('all');
  await settle();
  expect(read).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', connectionId: null }, '7d');
  expect(store.overview()?.connectionId).toBeNull();
  store.selectRange('30d');
  await settle();
  expect(read).toHaveBeenLastCalledWith({ workspaceId: 'workspace-a', connectionId: null }, '30d');
  expect(store.overview()?.range).toBe('30d');
});

it('verwirft eine verspätete Antwort nach einem Kontowechsel', async () => {
  await settle();
  let finishA!: (value: VintedStatisticsOverview) => void;
  read.mockImplementationOnce(
    () => new Promise<VintedStatisticsOverview>((resolve) => (finishA = resolve)),
  );
  store.selectRange('24h');
  await settle();
  account.selectedConnection.set(accountB);
  account.selectionVersion.set(1);
  await settle();
  finishA(overview(scopeA, '24h', 999));
  await settle();
  expect(store.overview()?.connectionId).toBe('account-b');
  expect(store.overview()?.totals.views).toBe(1);
});

it('zeigt die alte Antwort nicht mehr, sobald das Konto wechselt', async () => {
  await settle();
  read.mockImplementationOnce(() => new Promise<VintedStatisticsOverview>(() => undefined));
  account.selectedConnection.set(accountB);
  account.selectionVersion.set(1);
  await settle();
  expect(store.overview()).toBeNull();
  expect(store.loading()).toBe(true);
});

it('meldet einen Fehler und lädt auf Wunsch erneut', async () => {
  read.mockRejectedValueOnce(new Error('kaputt'));
  await settle();
  expect(store.overview()).toBeNull();
  expect(store.error()).toBe('Die Statistik konnte nicht geladen werden.');
  store.reload();
  await settle();
  expect(store.error()).toBeNull();
  expect(store.overview()?.connectionId).toBe('account-a');
});

it('fällt bei nur einem Konto auf dieses Konto zurück', async () => {
  store.selectAccountScope('all');
  await settle();
  account.connections.set([accountA]);
  await settle();
  expect(store.canCombineAccounts()).toBe(false);
  expect(store.accountScope()).toBe('account');
  expect(read).toHaveBeenLastCalledWith(scopeA, '7d');
});

it('lädt nichts ohne Verwaltungsrecht', async () => {
  account.canManage.set(false);
  await settle();
  read.mockClear();
  store.reload();
  await settle();
  expect(read).not.toHaveBeenCalled();
  expect(store.overview()).toBeNull();
});

it('lädt nicht erneut, wenn sich im Konto etwas ohne neue Messzeitpunkte ändert', async () => {
  const publications = (observedAt: string) => ({
    publications: { items: [{ metrics: { observedAt } }] },
  });
  account.snapshot.set(publications('2026-10-02T12:00:00Z'));
  await settle();
  read.mockClear();
  // Etwa eine als gelesen markierte Unterhaltung: neues Objekt, gleiche Messzeitpunkte.
  account.snapshot.set(publications('2026-10-02T12:00:00Z'));
  account.connections.set([accountA, accountB]);
  await settle();
  expect(read).not.toHaveBeenCalled();
  account.snapshot.set(publications('2026-10-02T12:15:00Z'));
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  account.snapshot.set(null);
});

it('wartet beim Öffnen auf den Kontostand statt doppelt zu laden', async () => {
  TestBed.resetTestingModule();
  account.loadingSnapshot.set(true);
  TestBed.configureTestingModule({
    providers: [
      VintedStatisticsStore,
      { provide: MarketplaceAccountStore, useValue: account },
      { provide: MarketplaceApiService, useValue: { readStatisticsOverview: read } },
    ],
  });
  store = TestBed.inject(VintedStatisticsStore);
  await settle();
  expect(read).not.toHaveBeenCalled();
  expect(store.loading()).toBe(true);
  account.snapshot.set({
    publications: { items: [{ metrics: { observedAt: '2026-10-02T12:00:00Z' } }] },
  });
  account.loadingSnapshot.set(false);
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
});

it('lädt alle Konten neu, sobald irgendein Konto frisch abgerufen wurde', async () => {
  store.selectAccountScope('all');
  await settle();
  read.mockClear();
  account.connections.set([accountA, { ...accountB, lastSyncedAt: '2026-10-02T12:15:00Z' }]);
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  store.selectAccountScope('account');
  await settle();
  read.mockClear();
  account.connections.set([accountA, { ...accountB, lastSyncedAt: '2026-10-02T12:30:00Z' }]);
  await settle();
  expect(read).not.toHaveBeenCalled();
});

it('behält die sichtbaren Zahlen, wenn eine Aktualisierung im Hintergrund scheitert', async () => {
  await settle();
  read.mockRejectedValueOnce(new Error('kaputt'));
  account.snapshot.set({
    publications: { items: [{ metrics: { observedAt: '2026-10-02T12:45:00Z' } }] },
  });
  await settle();
  expect(store.overview()?.totals.views).toBe(1);
  expect(store.error()).toBe('Die Statistik konnte nicht geladen werden.');
});

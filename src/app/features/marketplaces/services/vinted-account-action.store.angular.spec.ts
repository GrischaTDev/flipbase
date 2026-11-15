import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { VintedListingOperationStore } from './vinted-listing-operation.store';
import { MarketplaceApiService } from './marketplace-api.service';
import { VintedAccountActionApiService } from './vinted-account-action-api.service';
import { VintedAccountActionStore } from './vinted-account-action.store';
import { VintedActionOverviewHeaderStore } from './vinted-action-overview-header.store';
import type { VintedAccountAction } from '../models/vinted-account-action';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';

const account = createMarketplaceFixtures().connections[0];
const action: VintedAccountAction = {
  id: '44444444-4444-4444-8444-444444444444',
  requestId: '55555555-5555-4555-8555-555555555555',
  workspaceId: account.workspaceId,
  connectionId: account.connectionId,
  entryId: '33333333-3333-4333-8333-333333333333',
  title: 'Hose',
  kind: 'price_save',
  state: 'queued',
  version: 2,
  waitReason: 'pool_busy',
  errorCode: null,
  result: null,
  blockedByActionId: null,
  historyPurged: false,
  resultExpired: false,
  createdAt: '2026-11-14T12:00:00Z',
  updatedAt: '2026-11-14T12:00:00Z',
  startedAt: null,
  finishedAt: null,
};
let workspace = signal({ id: account.workspaceId, archived_at: null });
let list = vi.fn(),
  cancel = vi.fn(),
  reconcile = vi.fn(),
  listen = vi.fn();
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 25; i++) await Promise.resolve();
  TestBed.tick();
}
beforeEach(() => {
  workspace = signal({ id: account.workspaceId, archived_at: null });
  list = vi.fn().mockResolvedValue([action]);
  cancel = vi.fn().mockResolvedValue({ ...action, state: 'cancelled', version: 3 });
  reconcile = vi.fn().mockResolvedValue(action);
  listen = vi.fn(() => () => undefined);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { currentUser: signal({ id: 'user-a' }), session: signal(null) },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceApiService,
        useValue: {
          listConnections: vi.fn().mockResolvedValue({ canManage: true, connections: [account] }),
        },
      },
      {
        provide: VintedAccountActionApiService,
        useValue: { list, cancel, reconcile, listen, authenticate: vi.fn() },
      },
      {
        provide: VintedActionOverviewHeaderStore,
        useValue: { isDismissed: () => false, dismiss: vi.fn() },
      },
    ],
  });
});
afterEach(() => {
  TestBed.resetTestingModule();
  localStorage.clear();
});
it('lädt gespeicherte wartende Aktionen ohne die optionale Aktionsübersicht', async () => {
  const store = TestBed.inject(VintedAccountActionStore);
  await settle();
  expect(store.entries()[0].action).toEqual(action);
  expect(store.count()).toBe(1);
  expect(store.hasRunning()).toBe(false);
  expect(listen).toHaveBeenCalledOnce();
});

it('hält den Artikelstatus für gespeicherte Serveraktionen ohne zweite Menükachel und beendet ihn nach Abschluss', async () => {
  const store = TestBed.inject(VintedAccountActionStore);
  const operations = TestBed.inject(VintedListingOperationStore);
  const item = {
    workspaceId: account.workspaceId,
    connectionId: account.connectionId,
    id: action.entryId!,
    title: 'Hose',
  } as import('../models/marketplace-read.models').MarketplaceEntry;
  await settle();
  expect(operations.isRunning(item)).toBe(true);
  expect(operations.runningLabel(item)).toBe('Preisänderung wartet');
  expect(operations.entries()).toEqual([]);
  list.mockResolvedValue([{ ...action, state: 'running', version: 3 }]);
  await store.refresh();
  expect(operations.runningLabel(item)).toBe('Preis wird geändert');
  list.mockResolvedValue([{ ...action, state: 'succeeded', version: 4 }]);
  await store.refresh();
  expect(operations.isRunning(item)).toBe(false);
  workspace.set({ id: 'other', archived_at: null });
  expect(operations.isRunning(item)).toBe(false);
});

it.each(['queued', 'running', 'succeeded', 'failed', 'outcome_unknown', 'cancelled'] as const)(
  'behält die Hauptaktion ohne zusätzliche Lese-/Nachprüfkacheln im Zustand %s',
  async (state) => {
    list.mockResolvedValue([
      action,
      { ...action, id: 'read', kind: 'listing_content_read', state },
      { ...action, id: 'conversation', kind: 'conversations_read', state },
      { ...action, id: 'check', kind: 'outcome_reconcile', state },
    ]);
    const store = TestBed.inject(VintedAccountActionStore);
    await settle();
    expect(store.entries().map(({ action }) => action.id)).toEqual([action.id]);
    expect(store.count()).toBe(1);
    expect(store.hasRunning()).toBe(false);
    expect(store.hasFailure()).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  },
);

it('meldet erfolgreiche Hintergrundschritte nicht als eigene Erfolge und erhält unklare Hauptaktionen', async () => {
  const success = vi.spyOn(TestBed.inject(ToastService), 'success');
  list.mockResolvedValue([{ ...action, kind: 'listing_content_read', state: 'running' }]);
  const store = TestBed.inject(VintedAccountActionStore);
  await settle();
  list.mockResolvedValue([
    { ...action, kind: 'listing_content_read', state: 'succeeded', version: 3 },
  ]);
  await store.refresh();
  expect(success).not.toHaveBeenCalled();
  expect(store.entries()).toEqual([]);
  list.mockResolvedValue([{ ...action, state: 'outcome_unknown', version: 4 }]);
  await store.refresh();
  expect(store.entries()[0].action.state).toBe('outcome_unknown');
  expect(store.hasFailure()).toBe(true);
});
it('übernimmt keine ältere Version und entfernt fremde Daten sofort beim Workspacewechsel', async () => {
  const store = TestBed.inject(VintedAccountActionStore);
  await settle();
  list.mockResolvedValue([{ ...action, version: 1, state: 'running' }]);
  await store.refresh();
  expect(store.entries()[0].action.state).toBe('queued');
  workspace.set({ id: 'other', archived_at: null });
  expect(store.entries()).toEqual([]);
});
it('bricht nur wartende Aufträge ab und führt unklare Schreibvorgänge nicht erneut aus', async () => {
  const store = TestBed.inject(VintedAccountActionStore);
  await settle();
  list.mockResolvedValue([{ ...action, state: 'cancelled', version: 3 }]);
  await store.cancel(action);
  expect(cancel).toHaveBeenCalledWith(action);
  await store.cancel({ ...action, state: 'running' });
  expect(cancel).toHaveBeenCalledOnce();
  list.mockResolvedValue([{ ...action, state: 'outcome_unknown', version: 4 }]);
  await store.refresh();
  await store.reconcile(store.entries()[0].action);
  expect(reconcile).toHaveBeenCalledWith(
    expect.objectContaining({ state: 'outcome_unknown' }),
    expect.any(String),
  );
});

it('ordnet die beauftragte Nachprüfung der Hauptaktion zu und erhält deren Fehler ohne zweite Kachel', async () => {
  const parent = { ...action, state: 'outcome_unknown' as const };
  const check = {
    ...action,
    id: 'check-a',
    kind: 'outcome_reconcile' as const,
    state: 'queued' as const,
  };
  list.mockResolvedValue([parent]);
  reconcile.mockResolvedValue(check);
  const store = TestBed.inject(VintedAccountActionStore);
  await settle();
  list.mockResolvedValue([parent, check]);
  await store.reconcile(parent);
  expect(store.entries()).toHaveLength(1);
  expect(store.entries()[0].reconciliation).toEqual(check);
  expect(store.count()).toBe(1);
  await store.reconcile(parent);
  expect(reconcile).toHaveBeenCalledTimes(1);
  const failed = { ...check, state: 'failed', errorCode: 'browser_unavailable', version: 3 };
  list.mockResolvedValue([parent, failed]);
  await store.refresh();
  expect(store.entries()).toHaveLength(1);
  expect(store.entries()[0].action.state).toBe('outcome_unknown');
  expect(store.entries()[0].reconciliation).toEqual(failed);
  expect(store.hasFailure()).toBe(true);
});

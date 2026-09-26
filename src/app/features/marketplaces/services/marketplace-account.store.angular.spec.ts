import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AuthService } from '../../../core/services/auth.service';
import { MarketplaceApiError, MarketplaceApiService } from './marketplace-api.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import type { AccountScope } from '../models/marketplace.models';
import type { MarketplaceSnapshot } from '../models/marketplace-read.models';
import { parseMarketplaceSnapshot } from '../models/marketplace-response';

const fixtures = createMarketplaceFixtures();
const [accountA, accountB] = fixtures.connections;
const emptyPage = () => ({ items: [], total: 0, nextCursor: null });
function snapshot(scope: AccountScope, title = scope.connectionId): MarketplaceSnapshot {
  return parseMarketplaceSnapshot(
    {
      ...scope,
      profile: { ...scope, displayName: title },
      publications: emptyPage(),
      conversations: {
        items: [{ ...scope, id: 'conversation-a', title: 'Gespräch' }],
        total: 1,
        nextCursor: null,
      },
      sales: emptyPage(),
      activity: emptyPage(),
    },
    scope,
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  TestBed.tick();
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
let currentWorkspace: ReturnType<typeof signal<{ id: string; archived_at?: string } | null>>;
let currentUser: ReturnType<typeof signal<{ id: string } | null>>;
let api: {
  listConnections: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readPage: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  renameConnection: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
};
let store: MarketplaceAccountStore;
beforeEach(() => {
  currentWorkspace = signal<{ id: string; archived_at?: string } | null>({
    id: accountA.workspaceId,
  });
  currentUser = signal<{ id: string } | null>({ id: 'user-a' });
  api = {
    listConnections: vi
      .fn()
      .mockResolvedValue({ canManage: true, connections: fixtures.connections }),
    readSnapshot: vi.fn().mockImplementation(async (scope: AccountScope) => snapshot(scope)),
    readPage: vi.fn().mockResolvedValue(emptyPage()),
    createConnection: vi.fn(),
    renameConnection: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MarketplaceAccountStore,
      { provide: MarketplaceApiService, useValue: api },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: AuthService, useValue: { currentUser } },
    ],
  });
  store = TestBed.inject(MarketplaceAccountStore);
});
describe('Kontogebundene Marktplatzansicht', () => {
  it('lädt gespeicherte Konten und die Daten des ausgewählten Kontos', async () => {
    await settle();
    expect(store.connections()).toEqual(fixtures.connections);
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    expect(store.snapshot()?.profile?.displayName).toBe(accountA.connectionId);
  });
  it('zeigt bei keinem Workspace keine Konten und startet keine Abfrage', async () => {
    currentWorkspace.set(null);
    await settle();
    expect(api.listConnections).not.toHaveBeenCalled();
    expect(store.connections()).toEqual([]);
  });
  it('verwirft die verspätete Antwort von A nach einem Wechsel zu B', async () => {
    await settle();
    const pending = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockImplementationOnce(() => pending.promise);
    const old = store.selectConnection(accountA.connectionId);
    await store.selectConnection(accountB.connectionId);
    pending.resolve(snapshot(accountA, 'Veraltet'));
    await old;
    expect(store.snapshot()?.connectionId).toBe(accountB.connectionId);
  });
  it('verwirft alte Antworten auch beim Wechsel A → B → A', async () => {
    await settle();
    const pending = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockImplementationOnce(() => pending.promise);
    const old = store.selectConnection(accountA.connectionId);
    await store.selectConnection(accountB.connectionId);
    await store.selectConnection(accountA.connectionId);
    pending.resolve(snapshot(accountA, 'Veraltet'));
    await old;
    expect(store.snapshot()?.profile?.displayName).toBe(accountA.connectionId);
  });
  it('verbirgt private Daten beim Workspacewechsel sofort, noch vor dem nächsten Effekt', async () => {
    await settle();
    currentWorkspace.set({ id: 'foreign-workspace' });
    expect(store.connections()).toEqual([]);
    expect(store.snapshot()).toBeNull();
    expect(store.selectedConnection()).toBeNull();
  });
  it('löscht sichtbare Kontodaten bei Abmeldung sofort', async () => {
    await settle();
    currentUser.set(null);
    expect(store.snapshot()).toBeNull();
    expect(store.canManage()).toBe(false);
  });
  it('weist eine unbekannte Konto-ID ohne Datenabfrage zurück', async () => {
    await settle();
    const count = api.readSnapshot.mock.calls.length;
    await store.selectConnection('foreign-account');
    expect(api.readSnapshot.mock.calls.length).toBe(count);
  });
  it('hängt eine laufende Umbenennung nicht auf einen anderen Workspace um', async () => {
    await settle();
    const pending = deferred<void>();
    api.renameConnection.mockReturnValue(pending.promise);
    const rename = store.renameConnection(accountA.connectionId, 'Neuer Name');
    currentWorkspace.set(null);
    await settle();
    pending.resolve();
    await rename;
    expect(api.renameConnection).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      'Neuer Name',
    );
    expect(store.connections()).toEqual([]);
  });
  it('weist ungültige Namen vor dem Speichern zurück', async () => {
    await settle();
    expect(await store.createConnection('   ')).toBe(false);
    expect(api.createConnection).not.toHaveBeenCalled();
    expect(store.mutationError()).toBeTruthy();
  });
  it('holt nach erfolgreichem Pausieren den bestätigten Zustand vom Server', async () => {
    await settle();
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accountA, status: 'paused' }, accountB],
    });
    expect(await store.setPaused(accountA.connectionId, true)).toBe(true);
    expect(store.selectedConnection()?.status).toBe('paused');
  });
  it('beendet eine private Ansicht nach serverseitigem Rechteentzug', async () => {
    await settle();
    api.readSnapshot.mockRejectedValue(new MarketplaceApiError('forbidden'));
    await store.selectConnection(accountA.connectionId);
    expect(store.connections()).toEqual([]);
    expect(store.snapshot()).toBeNull();
    expect(store.canManage()).toBe(false);
  });
  it('verwirft einen alten Gesprächsverlauf nach dem Kontowechsel', async () => {
    await settle();
    const pending = deferred<ReturnType<typeof emptyPage>>();
    api.readPage.mockReturnValueOnce(pending.promise);
    const old = store.openConversation('conversation-a');
    await store.selectConnection(accountB.connectionId);
    pending.resolve(emptyPage());
    await old;
    expect(store.selectedConversationId()).toBeNull();
    expect(store.messages()).toBeNull();
  });
  it('gibt beim Gesprächswechsel die alte Seitensperre frei und ignoriert deren Abschluss', async () => {
    const first = snapshot(accountA);
    api.readSnapshot.mockResolvedValue({
      ...first,
      conversations: {
        items: [
          ...first.conversations.items,
          { ...first.conversations.items[0], id: 'conversation-b' },
        ],
        total: 2,
        nextCursor: null,
      },
    });
    await settle();
    api.readPage.mockResolvedValue({ items: [], total: 60, nextCursor: 'older-a' });
    await store.openConversation('conversation-a');
    const oldPage = deferred<ReturnType<typeof emptyPage>>();
    api.readPage.mockReturnValueOnce(oldPage.promise);
    const oldLoad = store.loadMore('message');
    expect(store.loadingPage()).toBe('message');
    store.clearConversation();
    expect(store.loadingPage()).toBeNull();
    api.readPage.mockResolvedValueOnce({ items: [], total: 60, nextCursor: 'older-b' });
    await store.openConversation('conversation-b');
    const newPage = deferred<ReturnType<typeof emptyPage>>();
    api.readPage.mockReturnValueOnce(newPage.promise);
    const newLoad = store.loadMore('message');
    oldPage.resolve(emptyPage());
    await oldLoad;
    expect(store.loadingPage()).toBe('message');
    expect(store.selectedConversationId()).toBe('conversation-b');
    newPage.resolve(emptyPage());
    await newLoad;
    expect(store.loadingPage()).toBeNull();
  });
  it('behält bei 61 Aktivitäten die vollständige Anzahl und lädt die zweite Seite', async () => {
    const scope = { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId };
    const first = snapshot(accountA);
    const all = Array.from({ length: 61 }, (_, i) => ({
      ...scope,
      id: `event-${i}`,
      title: `Ereignis ${i}`,
    }));
    const parsed = parseMarketplaceSnapshot(
      { ...first, activity: { items: all.slice(0, 50), total: 61, nextCursor: 'event-49' } },
      scope,
    );
    api.readSnapshot.mockResolvedValue(parsed);
    await settle();
    api.readPage.mockResolvedValue({ items: all.slice(50), total: 61, nextCursor: null });
    await store.loadMore('activity');
    expect(store.snapshot()?.activity.total).toBe(61);
    expect(store.snapshot()?.activity.items).toHaveLength(61);
    expect(api.readPage).toHaveBeenCalledWith(scope, 'activity', 'event-49');
  });
});

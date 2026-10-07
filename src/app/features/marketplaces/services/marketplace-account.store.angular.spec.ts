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
import {
  MarketplaceBrowserTestApiService,
  MarketplaceConnectionRemovalError,
} from './marketplace-browser-test-api.service';

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
  for (let pass = 0; pass < 3; pass++) {
    TestBed.tick();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
}
let currentWorkspace: ReturnType<typeof signal<{ id: string; archived_at?: string } | null>>;
let currentUser: ReturnType<typeof signal<{ id: string } | null>>;
let accessSession: ReturnType<typeof signal<{ access_token: string } | null>>;
let browserApi: {
  readConversation: ReturnType<typeof vi.fn>;
  syncConnection: ReturnType<typeof vi.fn>;
  deleteConnection: ReturnType<typeof vi.fn>;
  readListingData: ReturnType<typeof vi.fn>;
  readListingEdit: ReturnType<typeof vi.fn>;
  saveListingEdit: ReturnType<typeof vi.fn>;
};
let api: {
  listenAccountImports: ReturnType<typeof vi.fn>;
  authenticateImports: ReturnType<typeof vi.fn>;
  listConnections: ReturnType<typeof vi.fn>;
  readSnapshot: ReturnType<typeof vi.fn>;
  readPage: ReturnType<typeof vi.fn>;
  createConnection: ReturnType<typeof vi.fn>;
  renameConnection: ReturnType<typeof vi.fn>;
  reorderConnections: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
  readPublication: ReturnType<typeof vi.fn>;
};
let store: MarketplaceAccountStore;
beforeEach(() => {
  localStorage.clear();
  currentWorkspace = signal<{ id: string; archived_at?: string } | null>({
    id: accountA.workspaceId,
  });
  currentUser = signal<{ id: string } | null>({ id: 'user-a' });
  accessSession = signal<{ access_token: string } | null>({ access_token: 'token-a' });
  browserApi = {
    readConversation: vi.fn().mockResolvedValue('2026-10-07T21:00:00Z'),
    syncConnection: vi.fn().mockResolvedValue(undefined),
    deleteConnection: vi.fn().mockResolvedValue(undefined),
    readListingData: vi.fn(),
    readListingEdit: vi.fn(),
    saveListingEdit: vi.fn().mockResolvedValue(undefined),
  };
  api = {
    listenAccountImports: vi.fn().mockImplementation(() => vi.fn()),
    authenticateImports: vi.fn(),
    listConnections: vi
      .fn()
      .mockResolvedValue({ canManage: true, connections: fixtures.connections }),
    readSnapshot: vi.fn().mockImplementation(async (scope: AccountScope) => snapshot(scope)),
    readPage: vi.fn().mockResolvedValue(emptyPage()),
    createConnection: vi.fn(),
    renameConnection: vi.fn().mockResolvedValue(undefined),
    reorderConnections: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn().mockResolvedValue(undefined),
    readPublication: vi.fn().mockResolvedValue(null),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      MarketplaceAccountStore,
      { provide: MarketplaceApiService, useValue: api },
      { provide: MarketplaceBrowserTestApiService, useValue: browserApi },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: AuthService, useValue: { currentUser, session: accessSession } },
    ],
  });
  store = TestBed.inject(MarketplaceAccountStore);
});

describe('Cloud-Gesprächsabruf', () => {
  it('übernimmt bestätigte Details ohne Konto oder Gesprächsauswahl zu verlieren', async () => {
    await settle();
    await store.openConversation('conversation-a');
    const result = await store.refreshCloudConversation('conversation-a', () => true);
    expect(result).toEqual({ status: 'success', observedAt: '2026-10-07T21:00:00Z' });
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    expect(store.selectedConversationId()).toBe('conversation-a');
    expect(browserApi.readConversation).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      'conversation-a',
      'token-a',
    );
  });
  it('übernimmt nach einem Kontowechsel keine verspätete Abrufbestätigung', async () => {
    await settle();
    await store.openConversation('conversation-a');
    const response = deferred<string>();
    browserApi.readConversation.mockReturnValue(response.promise);
    const read = store.refreshCloudConversation('conversation-a', () => true);
    await store.selectConnection(accountB.connectionId);
    response.resolve('2026-10-07T21:00:00Z');
    expect(await read).toEqual({ status: 'cancelled' });
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
    expect(store.selectedConversationId()).toBeNull();
  });
  it('startet keinen Anbieterabruf für eine bereits veraltete Gesprächsauswahl', async () => {
    await settle();
    await store.openConversation('conversation-a');
    expect(await store.refreshCloudConversation('conversation-a', () => false)).toEqual({
      status: 'cancelled',
    });
    expect(browserApi.readConversation).not.toHaveBeenCalled();
  });
  it('behält gespeicherte Nachrichten bei einem abgelehnten Cloud-Abruf', async () => {
    await settle();
    await store.openConversation('conversation-a');
    const saved = store.messages();
    browserApi.readConversation.mockRejectedValue(new Error('Gespräch nicht erreichbar'));
    expect(await store.refreshCloudConversation('conversation-a', () => true)).toEqual({
      status: 'failed',
      error: 'Gespräch nicht erreichbar',
    });
    expect(store.messages()).toBe(saved);
  });
});

describe('Gespeicherte Vinted-Kontoauswahl', () => {
  it('speichert die Reihenfolge bestätigt und erhält Auswahl, Gespräch und Snapshot ohne Abruf', async () => {
    await settle();
    await store.selectConnection(accountB.connectionId);
    await store.openConversation('conversation-a');
    const selectedSnapshot = store.snapshot();
    const selectionVersion = store.selectionVersion();
    api.readSnapshot.mockClear();
    api.readPage.mockClear();
    browserApi.syncConnection.mockClear();
    const pending = deferred<void>();
    api.reorderConnections.mockReturnValueOnce(pending.promise);
    api.listConnections.mockResolvedValue({ canManage: true, connections: [accountB, accountA] });
    const saving = store.reorderConnections([accountB.connectionId, accountA.connectionId]);
    expect(store.connections()[0].connectionId).toBe(accountA.connectionId);
    expect(store.busy()).toBe(true);
    pending.resolve(undefined);
    expect(await saving).toBe(true);
    expect(api.reorderConnections).toHaveBeenCalledExactlyOnceWith(accountA.workspaceId, [
      accountB.connectionId,
      accountA.connectionId,
    ]);
    expect(store.connections()[0].connectionId).toBe(accountB.connectionId);
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
    expect(store.snapshot()).toBe(selectedSnapshot);
    expect(store.selectedConversationId()).toBe('conversation-a');
    expect(store.selectionVersion()).toBe(selectionVersion);
    expect(api.readSnapshot).not.toHaveBeenCalled();
    expect(api.readPage).not.toHaveBeenCalled();
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
  });
  it('lässt die bestätigte Reihenfolge bei Fehler unverändert und lehnt unvollständige IDs ab', async () => {
    await settle();
    expect(await store.reorderConnections([accountB.connectionId])).toBe(false);
    expect(await store.reorderConnections([accountB.connectionId, accountB.connectionId])).toBe(
      false,
    );
    expect(api.reorderConnections).not.toHaveBeenCalled();
    api.reorderConnections.mockRejectedValueOnce(new MarketplaceApiError('request_failed'));
    expect(await store.reorderConnections([accountB.connectionId, accountA.connectionId])).toBe(
      false,
    );
    expect(store.connections()[0].connectionId).toBe(accountA.connectionId);
    expect(store.mutationError()).toBeTruthy();
  });
  it('verwirft die Antwort einer Sortierung nach Workspacewechsel', async () => {
    await settle();
    const pending = deferred<void>();
    api.reorderConnections.mockReturnValueOnce(pending.promise);
    const saving = store.reorderConnections([accountB.connectionId, accountA.connectionId]);
    currentWorkspace.set(null);
    await settle();
    pending.resolve(undefined);
    expect(await saving).toBe(false);
    expect(store.connections()).toEqual([]);
    expect(store.busy()).toBe(false);
  });
  it('verdrängt nach parallelem Neuladen keine Kontoliste mit einer alten Sortierantwort', async () => {
    await settle();
    const pending = deferred<void>();
    api.reorderConnections.mockReturnValueOnce(pending.promise);
    const saving = store.reorderConnections([accountB.connectionId, accountA.connectionId]);
    api.listConnections.mockResolvedValueOnce({
      canManage: true,
      connections: [accountB, accountA],
    });
    await store.reloadConnections();
    const listReads = api.listConnections.mock.calls.length;
    pending.resolve(undefined);
    expect(await saving).toBe(false);
    expect(api.listConnections).toHaveBeenCalledTimes(listReads);
    expect(store.canManage()).toBe(true);
    expect(store.connections()[0].connectionId).toBe(accountB.connectionId);
  });
  it('räumt private Kontodaten auf, wenn die Rechte beim Bestätigen der Sortierung entzogen sind', async () => {
    await settle();
    api.listConnections.mockRejectedValueOnce(new MarketplaceApiError('forbidden'));
    expect(await store.reorderConnections([accountB.connectionId, accountA.connectionId])).toBe(
      false,
    );
    expect(store.canManage()).toBe(false);
    expect(store.connections()).toEqual([]);
    expect(store.snapshot()).toBeNull();
  });
  it('zählt auch vorbereitete lokale und Cloudkonten gegen zehn Plätze und blockiert eine weitere Anlage', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: Array.from({ length: 10 }, (_, index) => ({
        ...accountA,
        connectionId: `account-${index}`,
        executionMode: index % 2 ? 'local' : 'cloud',
        status: 'needs_login',
      })),
    });
    await settle();
    expect(store.accountLimit).toBe(10);
    expect(store.remainingSlots()).toBe(0);
    expect(await store.createConnection('Elftes Konto')).toBeNull();
    expect(api.createConnection).not.toHaveBeenCalled();
    expect(store.mutationError()).toContain('zehn');
  });
  it('erhält beim lokalen Postfachabgleich das Gespräch und wartet auf dessen laufenden Abruf', async () => {
    await settle();
    const selection = store.selectionVersion();
    const pendingMessages = deferred<ReturnType<typeof emptyPage>>();
    api.readPage.mockReturnValueOnce(pendingMessages.promise);
    const opening = store.openConversation('conversation-a');
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accountA, lastSyncedAt: '2026-10-04T18:00:00Z' }, accountB],
    });
    api.readSnapshot.mockClear();
    await store.refreshLocalConnection(accountA, true);
    expect(api.readSnapshot).not.toHaveBeenCalled();
    expect(store.selectedConversationId()).toBe('conversation-a');
    expect(store.selectionVersion()).toBe(selection);
    pendingMessages.resolve(emptyPage());
    await opening;
    await settle();
    expect(api.readSnapshot).toHaveBeenCalledOnce();
    expect(api.readPage).toHaveBeenCalledTimes(2);
    expect(store.selectedConversationId()).toBe('conversation-a');
    expect(store.selectionVersion()).toBe(selection);
  });
  it('unterscheidet fehlende lokale Quellen von bestätigten und vorhandenen Cloudquellen', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [
        {
          ...accountA,
          executionMode: 'local',
          capabilities: {
            'profile.read': 'verified',
            'listings.read': 'verified',
          },
        },
        accountB,
      ],
    });
    await settle();
    await store.reloadConnections(accountA.connectionId);
    expect(store.localInboxUnavailable()).toBe(true);
    expect(store.localSalesUnavailable()).toBe(true);
    await store.selectConnection(accountB.connectionId);
    expect(store.localInboxUnavailable()).toBe(false);
    expect(store.localSalesUnavailable()).toBe(false);
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [
        {
          ...accountA,
          executionMode: 'local',
          capabilities: {
            'conversations.read': 'verified',
            'sales.read': 'verified',
          },
        },
        accountB,
      ],
    });
    await store.reloadConnections(accountA.connectionId);
    expect(store.localInboxUnavailable()).toBe(false);
    expect(store.localSalesUnavailable()).toBe(false);
    currentUser.set(null);
    expect(store.localInboxUnavailable()).toBe(false);
    expect(store.localSalesUnavailable()).toBe(false);
  });
  const savedKey = `flipbase:vinted:last-account:${JSON.stringify(['user-a', accountA.workspaceId])}`;
  it('nimmt ohne bewusste Kontowahl den Vorschlag des Browserprofils an', async () => {
    await settle();
    expect(store.hasExplicitConnectionSelection()).toBe(false);
    await store.suggestConnection(accountB.connectionId);
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
    expect(store.hasExplicitConnectionSelection()).toBe(false);
  });
  it('ersetzt eine bewusste Kontowahl nicht durch das Browserprofil', async () => {
    await settle();
    await store.selectConnection(accountA.connectionId);
    await store.suggestConnection(accountB.connectionId);
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
  });
  it('holt neue und geänderte andere Konten für die Kacheln ohne Konto-Neuauswahl nach', async () => {
    await settle();
    const added = { ...accountB, connectionId: 'account-c', displayName: 'Konto C' };
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [accountA, { ...accountB, lastSyncedAt: '2026-10-02T12:00:00Z' }, added],
    });
    api.listenAccountImports.mock.calls[0][2]();
    await settle();
    expect(store.connections()).toHaveLength(3);
    expect(store.connections()[1].lastSyncedAt).toBe('2026-10-02T12:00:00Z');
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    expect(api.readSnapshot).toHaveBeenCalledOnce();
  });
  it('stellt ein gespeichertes zweites Konto nach einem neuen Seitenstart wieder her', async () => {
    localStorage.setItem(savedKey, accountB.connectionId);
    await settle();
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
    expect(api.readSnapshot).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ connectionId: accountB.connectionId }),
    );
  });
  it('speichert nur die bestätigte Konto-ID und verwirft gelöschte Konten', async () => {
    localStorage.setItem(savedKey, 'deleted-account');
    await settle();
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    await store.selectConnection(accountB.connectionId);
    expect(localStorage.getItem(savedKey)).toBe(accountB.connectionId);
    await store.selectConnection('foreign-account');
    expect(localStorage.getItem(savedKey)).toBe(accountB.connectionId);
  });
  it('trennt die Auswahl nach Benutzer und Workspace', async () => {
    localStorage.setItem(savedKey, accountB.connectionId);
    currentUser.set({ id: 'user-b' });
    await settle();
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    expect(localStorage.getItem(savedKey)).toBe(accountB.connectionId);
    currentUser.set({ id: 'user-a' });
    await settle();
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
    const foreign = { ...accountA, workspaceId: 'workspace-b' };
    api.listConnections.mockResolvedValue({ canManage: true, connections: [foreign] });
    currentWorkspace.set({ id: foreign.workspaceId });
    await settle();
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    expect(localStorage.getItem(savedKey)).toBe(accountB.connectionId);
  });
  it('bleibt bei gesperrtem Browserspeicher bedienbar', async () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      await settle();
      await store.selectConnection(accountB.connectionId);
      expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
      expect(store.error()).toBeNull();
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});

describe('Inseratbeschreibungen und Kennzahlen', () => {
  it('snapshotReadStartedBeforeConfirmedSaveKeepsSessionDescription', async () => {
    api.readSnapshot.mockResolvedValue(publication('Alter Text', 'loaded'));
    await settle();
    const pending = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockReturnValueOnce(pending.promise);
    const refreshing = store.refreshImportedSnapshot(accountA, '2026-10-01T13:00:00Z');
    await store.saveListingEdit(accountA.connectionId, 'listing-a', {
      title: 'Neuer Titel',
      description: 'Bestätigter neuer Text',
      price: '12',
    });
    // Listenimporte behalten zuvor geladenen Text, auch wenn nur Kennzahlen neu gelesen wurden.
    pending.resolve(publication('Alter Text', 'loaded', 8, 3, '2099-10-01T13:00:00Z'));
    await refreshing;
    const entry = store.snapshot()!.publications.items[0];
    expect(store.cachedListingDescription(accountA.connectionId, entry)).toEqual({
      description: 'Bestätigter neuer Text',
      cacheState: 'unconfirmed',
    });
    expect(browserApi.readListingData).not.toHaveBeenCalled();
  });

  it('pendingBrowserDescriptionSurvivesUnprovenDatabaseFallback', async () => {
    await settle();
    browserApi.readListingData.mockResolvedValue({
      fields: { title: 'Jacke', description: 'Gelesener Sitzungstext', price: '12' },
      cacheState: 'pending',
    });
    await store.readListingDescription(accountA.connectionId, 'listing-a');
    const entry = publication('Alter Datenbanktext', 'loaded', 8, 3, '2099-10-01T13:00:00Z')
      .publications.items[0];
    api.readPublication.mockResolvedValue(entry);
    await store.readPublication(accountA.connectionId, entry.id);
    expect(store.cachedListingDescription(accountA.connectionId, entry)).toEqual({
      description: 'Gelesener Sitzungstext',
      cacheState: 'pending',
    });
    expect(browserApi.readListingData).toHaveBeenCalledTimes(1);
  });

  it('descriptionReadStartedBeforeConfirmedSaveReturnsConfirmedSessionText', async () => {
    await settle();
    const pending = deferred<{
      fields: { title: string; description: string; price: string };
      cacheState: 'pending';
    }>();
    browserApi.readListingData.mockReturnValueOnce(pending.promise);
    const reading = store.readListingDescription(accountA.connectionId, 'listing-a');
    await store.saveListingEdit(accountA.connectionId, 'listing-a', {
      title: 'Bestätigter Titel',
      description: 'Bestätigter neuer Text',
      price: '12',
    });
    pending.resolve({
      fields: { title: 'Alter Titel', description: 'Vor der Bearbeitung gelesen', price: '12' },
      cacheState: 'pending',
    });
    expect(await reading).toEqual({
      description: 'Bestätigter neuer Text',
      cacheState: 'unconfirmed',
    });
    expect(await store.readListingDescription(accountA.connectionId, 'listing-a')).toEqual({
      description: 'Bestätigter neuer Text',
      cacheState: 'unconfirmed',
    });
    expect(browserApi.readListingData).toHaveBeenCalledTimes(1);
    expect(browserApi.saveListingEdit).toHaveBeenCalledTimes(1);
  });

  it.each([null, '2026-10-01T10:00:00Z', '2026-10-01T12:00:00Z', '2099-10-01T13:00:00Z'])(
    'confirmedDescriptionSurvivesDatabaseReadRegardlessOfListingMetricsTime: %s',
    async (observedAt) => {
      await settle();
      const entry = publication('Alter Text', 'loaded').publications.items[0];
      api.readPublication.mockResolvedValue(entry);
      await store.readPublication(accountA.connectionId, entry.id);
      await store.saveListingEdit(accountA.connectionId, entry.id, {
        title: 'Bestätigter Titel',
        description: 'Bestätigter neuer Text',
        price: '12',
      });
      api.readPublication.mockResolvedValue({
        ...entry,
        metrics: { ...entry.metrics, observedAt },
      });
      await store.readPublication(accountA.connectionId, entry.id);
      expect(await store.readListingDescription(accountA.connectionId, entry.id)).toEqual({
        description: 'Bestätigter neuer Text',
        cacheState: 'unconfirmed',
      });
      api.readPublication.mockResolvedValue({
        ...entry,
        text: 'Datenbanktext mit späterer Kennzahlenzeit',
        metrics: { ...entry.metrics, observedAt: '2099-10-01T14:00:00Z' },
      });
      await store.readPublication(accountA.connectionId, entry.id);
      expect(await store.readListingDescription(accountA.connectionId, entry.id)).toEqual({
        description: 'Bestätigter neuer Text',
        cacheState: 'unconfirmed',
      });
      expect(browserApi.readListingData).not.toHaveBeenCalled();
    },
  );

  function publication(
    text: string | null = null,
    textState: 'loaded' | 'not_loaded' = 'not_loaded',
    views: number | null = 0,
    favorites: number | null = 0,
    observedAt = '2026-10-01T10:00:00Z',
  ) {
    return parseMarketplaceSnapshot(
      {
        ...snapshot(accountA),
        publications: {
          items: [
            {
              ...accountA,
              id: 'listing-a',
              title: 'Jacke',
              text,
              textState,
              metrics: { views, favorites, observedAt },
            },
          ],
          total: 1,
          nextCursor: null,
        },
      },
      accountA,
    );
  }
  it.each(['Bekannter Text', ''])(
    'knownDescriptionStartsNoBrowser / emptyLoadedDescriptionStartsNoBrowser: %j',
    async (text) => {
      api.readSnapshot.mockResolvedValue(publication(text, 'loaded'));
      await settle();
      expect(await store.readListingDescription(accountA.connectionId, 'listing-a')).toEqual({
        description: text,
        cacheState: 'stored',
      });
      expect(browserApi.readListingData).not.toHaveBeenCalled();
    },
  );
  it('descriptionReadIsDeduplicated / pendingCacheSurvivesReopenWithinContext', async () => {
    api.readSnapshot.mockResolvedValue(publication());
    await settle();
    const pending = deferred<{
      fields: { title: string; description: string; price: string };
      cacheState: 'pending';
    }>();
    browserApi.readListingData.mockReturnValue(pending.promise);
    const first = store.readListingDescription(accountA.connectionId, 'listing-a');
    const second = store.readListingDescription(accountA.connectionId, 'listing-a');
    pending.resolve({
      fields: { title: 'Jacke', description: 'Gelesener Text', price: '12' },
      cacheState: 'pending',
    });
    expect(await first).toEqual({ description: 'Gelesener Text', cacheState: 'pending' });
    expect(await second).toEqual({ description: 'Gelesener Text', cacheState: 'pending' });
    browserApi.readListingData.mockRejectedValue(new Error('Browser darf nicht erneut starten'));
    expect(await store.readListingDescription(accountA.connectionId, 'listing-a')).toEqual({
      description: 'Gelesener Text',
      cacheState: 'pending',
    });
    expect(browserApi.readListingData).toHaveBeenCalledOnce();
  });
  it('lateDescriptionCannotCrossContext', async () => {
    await settle();
    const pending = deferred<{
      fields: { title: string; description: string; price: string };
      cacheState: 'pending';
    }>();
    browserApi.readListingData.mockReturnValueOnce(pending.promise);
    const first = store.readListingDescription(accountA.connectionId, 'listing-a');
    const result = expect(first).rejects.toThrow();
    await store.selectConnection(accountB.connectionId);
    await store.selectConnection(accountA.connectionId);
    pending.resolve({
      fields: { title: 'Alt', description: 'Fremder Rücklauf', price: '12' },
      cacheState: 'pending',
    });
    await result;
    browserApi.readListingData.mockResolvedValueOnce({
      fields: { title: 'Neu', description: 'Aktueller Text', price: '12' },
      cacheState: 'unconfirmed',
    });
    expect(await store.readListingDescription(accountA.connectionId, 'listing-a')).toEqual({
      description: 'Aktueller Text',
      cacheState: 'unconfirmed',
    });
  });
  it('editReadsFreshFields / unconfirmedSaveKeepsPreviousSnapshot', async () => {
    api.readSnapshot.mockResolvedValue(publication('Alter Text', 'loaded'));
    await settle();
    browserApi.readListingEdit.mockResolvedValue({
      title: 'Frisch',
      description: 'Frischer Text',
      price: '24',
    });
    expect((await store.readListingEdit(accountA.connectionId, 'listing-a')).description).toBe(
      'Frischer Text',
    );
    browserApi.saveListingEdit.mockRejectedValueOnce(new Error('unconfirmed'));
    const fields = { title: 'Geändert', description: 'Neuer Text', price: '24' };
    await expect(
      store.saveListingEdit(accountA.connectionId, 'listing-a', fields),
    ).rejects.toThrow();
    expect(store.snapshot()?.publications.items[0].text).toBe('Alter Text');
    await store.saveListingEdit(accountA.connectionId, 'listing-a', fields);
    expect(store.snapshot()?.publications.items[0].text).toBe('Neuer Text');
    expect(store.snapshot()?.publications.items[0].title).toBe('Geändert');
  });
  it('firstObservationSetsBaseline / zeroToOneShowsIncrease / metricChangesCannotCrossAccount', async () => {
    api.readSnapshot.mockResolvedValue(publication());
    await settle();
    expect(store.listingMetricChanges()).toEqual({});
    api.readSnapshot.mockResolvedValueOnce(
      publication(null, 'not_loaded', 1, 1, '2026-10-01T11:00:00Z'),
    );
    await store.refreshImportedSnapshot(accountA, '2026-10-01T11:00:00Z');
    expect(store.listingMetricChanges()['listing-a']).toEqual({
      views: 1,
      favorites: 1,
      observedAt: '2026-10-01T11:00:00Z',
    });
    expect(store.consumeListingMetricChanges(['listing-a'])['listing-a']?.views).toBe(1);
    expect(store.consumeListingMetricChanges(['listing-a'])).toEqual({});
    await store.selectConnection(accountB.connectionId);
    expect(store.listingMetricChanges()).toEqual({});
  });

  it('verwirft verspätete frische Bearbeitungsfelder auch nach A → B → A', async () => {
    await settle();
    const read = deferred<{ title: string; description: string; price: string }>();
    browserApi.readListingEdit.mockReturnValueOnce(read.promise);
    const old = store.readListingEdit(accountA.connectionId, 'listing-a');
    const rejected = expect(old).rejects.toThrow();
    await store.selectConnection(accountB.connectionId);
    await store.selectConnection(accountA.connectionId);
    read.resolve({ title: 'Alt', description: 'Alter Rücklauf', price: '1' });
    await rejected;
  });

  it('behält die Kennzahlenbasis beim Neuladen desselben Kontos', async () => {
    api.readSnapshot.mockResolvedValue(publication());
    await settle();
    api.readSnapshot.mockResolvedValueOnce(
      publication(null, 'not_loaded', 3, 2, '2026-10-01T11:00:00Z'),
    );
    await store.reloadConnections(accountA.connectionId);
    expect(store.listingMetricChanges()['listing-a']).toEqual({
      views: 3,
      favorites: 2,
      observedAt: '2026-10-01T11:00:00Z',
    });
    api.readSnapshot.mockResolvedValueOnce(
      publication(null, 'not_loaded', 3, 2, '2026-10-01T11:00:00Z'),
    );
    await store.reloadConnections(accountA.connectionId);
    expect(store.listingMetricChanges()['listing-a']?.favorites).toBe(2);
  });

  it('verwirft die Kennzahlenbasis bei Rechteverlust auch ohne verweigerte Einzelabfrage', async () => {
    api.readSnapshot.mockResolvedValue(publication());
    await settle();
    api.listConnections.mockResolvedValueOnce({ canManage: false, connections: [] });
    await store.reloadConnections();
    expect(store.canManage()).toBe(false);
    api.readSnapshot.mockResolvedValueOnce(
      publication(null, 'not_loaded', 7, 3, '2026-10-01T11:00:00Z'),
    );
    await store.reloadConnections(accountA.connectionId);
    expect(store.listingMetricChanges()).toEqual({});
  });

  it('behält höchstens 50 Beschreibungen und entfernt das am längsten unbenutzte Ergebnis', async () => {
    await settle();
    browserApi.readListingData.mockImplementation(async (_scope: AccountScope, id: string) => ({
      fields: { title: id, description: `Text ${id}`, price: '1' },
      cacheState: 'pending',
    }));
    for (let i = 0; i < 50; i++)
      await store.readListingDescription(accountA.connectionId, `listing-${i}`);
    await store.readListingDescription(accountA.connectionId, 'listing-0');
    await store.readListingDescription(accountA.connectionId, 'listing-50');
    browserApi.readListingData.mockImplementation(async (_scope: AccountScope, id: string) => ({
      fields: { title: id, description: `Neuer Text ${id}`, price: '1' },
      cacheState: 'unconfirmed',
    }));
    expect(
      (await store.readListingDescription(accountA.connectionId, 'listing-0')).description,
    ).toBe('Text listing-0');
    expect(
      (await store.readListingDescription(accountA.connectionId, 'listing-1')).description,
    ).toBe('Neuer Text listing-1');
  });

  it('readPublication schützt fehlende Snapshotdetails vor verspäteten Antworten', async () => {
    await settle();
    const read = deferred<MarketplaceSnapshot['publications']['items'][number] | null>();
    api.readPublication.mockReturnValueOnce(read.promise);
    const old = store.readPublication(accountA.connectionId, 'listing-a');
    await store.selectConnection(accountB.connectionId);
    read.resolve(publication('Alt', 'loaded').publications.items[0]);
    expect(await old).toBeNull();
  });

  it('Rechteentzug beim Lesen eines fehlenden Details entfernt den gesamten privaten Zustand', async () => {
    await settle();
    api.readPublication.mockRejectedValueOnce(new MarketplaceApiError('forbidden'));
    await expect(store.readPublication(accountA.connectionId, 'listing-a')).rejects.toThrow();
    expect(store.snapshot()).toBeNull();
    expect(store.canManage()).toBe(false);
    expect(store.connections()).toEqual([]);
  });
});
describe('Wiederholen eines bereits gewählten gespeicherten Gesprächs', () => {
  it('behält bereits nachgeladene ältere Nachrichten beim erneuten Abgleich', async () => {
    await settle();
    const entry = snapshot(accountA).conversations.items[0];
    const recent = { ...entry, id: 'message-new', conversationId: 'conversation-a' };
    const older = { ...entry, id: 'message-old', conversationId: 'conversation-a' };
    api.readPage.mockResolvedValueOnce({ items: [recent], total: 2, nextCursor: 'older' });
    await store.openConversation('conversation-a');
    api.readPage.mockResolvedValueOnce({ items: [older], total: 2, nextCursor: null });
    await store.loadMore('message');
    api.readPage.mockResolvedValueOnce({ items: [recent], total: 2, nextCursor: 'older' });
    api.readPage.mockResolvedValueOnce({ items: [older], total: 2, nextCursor: null });
    await store.openConversation('conversation-a');
    expect(store.messages()?.items.map((message) => message.id)).toEqual([
      'message-new',
      'message-old',
    ]);
    expect(store.messages()?.nextCursor).toBeNull();
    expect(api.readPage).toHaveBeenLastCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      'message',
      'older',
      'conversation-a',
    );
  });
  it('zeigt einen zuvor geöffneten Verlauf sofort und prüft die Datenbank erneut', async () => {
    await settle();
    const initial = snapshot(accountA);
    api.readSnapshot.mockResolvedValueOnce({
      ...initial,
      conversations: {
        items: [
          ...initial.conversations.items,
          { ...initial.conversations.items[0], id: 'conversation-b' },
        ],
        total: 2,
        nextCursor: null,
      },
    });
    await store.selectConnection(accountA.connectionId);
    api.readPage.mockResolvedValueOnce({ items: [], total: 7, nextCursor: 'older' });
    await store.openConversation('conversation-a');
    await store.openConversation('conversation-b');
    const pending = deferred<ReturnType<typeof emptyPage>>();
    api.readPage.mockReturnValueOnce(pending.promise);
    const opening = store.openConversation('conversation-a');
    expect(store.messages()?.total).toBe(7);
    expect(store.loadingMessages()).toBe(true);
    pending.resolve({ items: [], total: 8, nextCursor: null });
    await opening;
    expect(store.messages()?.total).toBe(8);
  });

  it('verwendet den Verlauf nicht für ein anderes Konto mit derselben Gesprächs-ID', async () => {
    await settle();
    api.readPage.mockResolvedValueOnce({ items: [], total: 7, nextCursor: null });
    await store.openConversation('conversation-a');
    await store.selectConnection(accountB.connectionId);
    const pending = deferred<ReturnType<typeof emptyPage>>();
    api.readPage.mockReturnValueOnce(pending.promise);
    const opening = store.openConversation('conversation-a');
    expect(store.messages()).toBeNull();
    pending.resolve(emptyPage());
    await opening;
    expect(store.messages()?.total).toBe(0);
  });
  it('erlaubt nur die zuvor validierte Auswahl außerhalb der ersten Snapshotseite', async () => {
    await settle();
    await store.openConversation('conversation-a');
    api.readSnapshot.mockResolvedValueOnce({
      ...snapshot(accountA),
      conversations: { items: [], total: 80, nextCursor: 'next' },
    });
    await store.refreshImportedSnapshot(accountA, '2026-10-02T12:00:00Z');
    api.readPage.mockResolvedValueOnce({ items: [], total: 3, nextCursor: null });
    await store.openConversation('conversation-a');
    expect(store.messages()?.total).toBe(3);
    api.readPage.mockResolvedValueOnce({ items: [], total: 99, nextCursor: null });
    await store.openConversation('foreign-conversation');
    expect(store.messages()?.total).toBe(3);
    expect(store.selectedConversationId()).toBe('conversation-a');
  });
  it('hält den vorhandenen Nachrichtenstand während einer erneuten gespeicherten Abfrage', async () => {
    await settle();
    api.readPage.mockResolvedValueOnce({ items: [], total: 7, nextCursor: 'older' });
    await store.openConversation('conversation-a');
    const pending = deferred<{ items: never[]; total: number; nextCursor: null }>();
    api.readPage.mockReturnValueOnce(pending.promise);
    const retry = store.openConversation('conversation-a');
    expect(store.loadingMessages()).toBe(true);
    expect(store.messages()?.total).toBe(7);
    pending.resolve({ items: [], total: 8, nextCursor: null });
    await retry;
    expect(store.messages()?.total).toBe(8);
    expect(store.loadingMessages()).toBe(false);
  });
});

describe('Kontogebundene Marktplatzansicht', () => {
  it('startet für lokale Verbindungen weder Cloudsync noch Browserbearbeitung', async () => {
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accountA, executionMode: 'local' }],
    });
    await settle();
    expect(await store.syncSelectedConnection()).toBe(false);
    await expect(store.readListingEdit(accountA.connectionId, 'publication-a')).rejects.toThrow();
    await expect(
      store.saveListingEdit(accountA.connectionId, 'publication-a', {
        title: 'Titel',
        description: 'Text',
        price: '10',
      }),
    ).rejects.toThrow();
    await expect(store.readProfileAbout(accountA.connectionId)).rejects.toThrow();
    await expect(store.saveProfileAbout(accountA.connectionId, 'Text')).rejects.toThrow();
    expect(browserApi.syncConnection).not.toHaveBeenCalled();
    expect(browserApi.readListingEdit).not.toHaveBeenCalled();
    expect(browserApi.saveListingEdit).not.toHaveBeenCalled();
  });
  it('übernimmt auch einen manuellen Teilabruf ohne neuen Erfolgszeitpunkt still und ohne Gesprächsverlust', async () => {
    await settle();
    await store.openConversation('conversation-a');
    const original = store.snapshot();
    const selection = store.selectionVersion();
    const read = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockReturnValueOnce(read.promise);
    const syncing = store.syncSelectedConnection();
    await settle();
    expect(store.snapshot()).toBe(original);
    expect(store.loadingSnapshot()).toBe(false);
    read.resolve(snapshot(accountA, 'Manueller Teilabruf'));
    expect(await syncing).toBe(true);
    expect(store.snapshot()?.profile?.displayName).toBe('Manueller Teilabruf');
    expect(store.selectionVersion()).toBe(selection);
    expect(store.selectedConversationId()).toBe('conversation-a');
    expect(store.selectedConnection()?.lastSyncedAt).toBeNull();
  });
  it('behält die sichtbaren Daten ohne Ladeblock und ohne neuen Livekanal während eines Imports', async () => {
    await settle();
    const visible = store.snapshot();
    const read = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockReturnValueOnce(read.promise);
    const channels = api.listenAccountImports.mock.calls.length;
    const refreshing = store.refreshImportedSnapshot(accountA, '2026-10-02T12:30:00Z');
    expect(store.snapshot()).toBe(visible);
    expect(store.loadingSnapshot()).toBe(false);
    expect(store.loading()).toBe(false);
    read.resolve(snapshot(accountA, 'Neuer Stand'));
    await refreshing;
    await settle();
    expect(api.listenAccountImports).toHaveBeenCalledTimes(channels);
  });
  it('übernimmt nach einem laufenden Abruf noch die neueste wartende Meldung', async () => {
    await settle();
    const read = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockReturnValueOnce(read.promise);
    const refreshing = store.refreshImportedSnapshot(accountA, '2026-10-02T12:30:00Z');
    await store.refreshImportedSnapshot(accountA, '2026-10-02T12:40:00Z');
    await store.refreshImportedSnapshot(accountA, '2026-10-02T12:35:00Z');
    read.resolve(snapshot(accountA));
    await refreshing;
    await settle();
    expect(store.selectedConnection()?.lastSyncedAt).toBe('2026-10-02T12:40:00Z');
    expect(api.readSnapshot).toHaveBeenCalledTimes(3);
  });
  it('verliert einen während des Nachladens eingetroffenen Import nicht', async () => {
    const first = parseMarketplaceSnapshot(
      {
        ...snapshot(accountA),
        publications: {
          items: [{ ...accountA, id: 'listing-a', title: 'Artikel' }],
          total: 1,
          nextCursor: null,
        },
      },
      accountA,
    );
    api.readSnapshot.mockResolvedValue({
      ...first,
      publications: { ...first.publications, total: 2, nextCursor: 'more' },
    });
    await settle();
    const page = deferred<MarketplaceSnapshot['publications']>();
    api.readPage.mockReturnValueOnce(page.promise);
    const loading = store.loadMore('publication');
    await store.refreshImportedSnapshot(accountA, '2026-10-02T12:40:00Z');
    expect(store.selectedConnection()?.lastSyncedAt).toBeNull();
    page.resolve({
      ...first.publications,
      items: [{ ...first.publications.items[0], id: 'listing-b' }],
      nextCursor: null,
    });
    await loading;
    api.readPage.mockResolvedValue({
      ...first.publications,
      items: [{ ...first.publications.items[0], id: 'listing-b' }],
      nextCursor: null,
    });
    await settle();
    expect(store.snapshot()?.publications.items.map((entry) => entry.id)).toEqual([
      'listing-a',
      'listing-b',
    ]);
    expect(store.selectedConnection()?.lastSyncedAt).toBe('2026-10-02T12:40:00Z');
  });
  it('authentifiziert und räumt den Livekanal bei Kontowechsel und Abmeldung auf', async () => {
    await settle();
    const close = api.listenAccountImports.mock.results.at(-1)!.value;
    expect(api.authenticateImports).toHaveBeenCalledWith('token-a');
    const onImport = api.listenAccountImports.mock.calls.at(-1)![1] as (time: string) => void;
    onImport('2026-10-02T12:30:00Z');
    await settle();
    expect(store.selectedConnection()?.lastSyncedAt).toBe('2026-10-02T12:30:00Z');
    await store.selectConnection(accountB.connectionId);
    await settle();
    expect(close).toHaveBeenCalledOnce();
    const closeB = api.listenAccountImports.mock.results.at(-1)!.value;
    currentUser.set(null);
    await settle();
    expect(closeB).toHaveBeenCalledOnce();
  });
  it('holt nach Wiederverbindung einen ohne Meldung gespeicherten Import nach', async () => {
    await settle();
    api.listConnections.mockResolvedValue({
      canManage: true,
      connections: [{ ...accountA, lastSyncedAt: '2026-10-02T12:30:00Z' }, accountB],
    });
    const reconnect = api.listenAccountImports.mock.calls.at(-1)![2] as () => void;
    reconnect();
    await settle();
    expect(store.selectedConnection()?.lastSyncedAt).toBe('2026-10-02T12:30:00Z');
    expect(store.loadingSnapshot()).toBe(false);
  });
  it('übernimmt Hintergrundimporte ohne Konto oder Gesprächsauswahl zu verlieren', async () => {
    await settle();
    await store.openConversation('conversation-a');
    const selectionVersion = store.selectionVersion();
    api.readSnapshot.mockResolvedValueOnce(snapshot(accountA, 'Neuer Hintergrundstand'));
    api.readPage.mockResolvedValueOnce({ items: [], total: 2, nextCursor: null });
    const importedAt = '2026-10-01T12:15:00Z';
    await store.refreshImportedSnapshot(accountA, importedAt);
    expect(store.snapshot()?.profile?.displayName).toBe('Neuer Hintergrundstand');
    expect(store.selectedConnection()?.lastSyncedAt).toBe(importedAt);
    expect(store.selectedConnection()?.connectionId).toBe(accountA.connectionId);
    expect(store.selectedConversationId()).toBe('conversation-a');
    expect(store.messages()?.total).toBe(2);
    expect(store.selectionVersion()).toBe(selectionVersion);
    expect(api.readPage).toHaveBeenLastCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      'message',
      null,
      'conversation-a',
    );
  });
  it('verwirft eine verspätete Hintergrundantwort nach Kontowechsel', async () => {
    await settle();
    const read = deferred<MarketplaceSnapshot>();
    api.readSnapshot.mockReturnValueOnce(read.promise);
    const refresh = store.refreshImportedSnapshot(accountA, '2026-10-01T12:15:00Z');
    await store.selectConnection(accountB.connectionId);
    read.resolve(snapshot(accountA, 'Verspäteter Hintergrundstand'));
    await refresh;
    expect(store.snapshot()?.connectionId).toBe(accountB.connectionId);
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
    expect(store.loadingSnapshot()).toBe(false);
  });
  it('liest bei einem fremden oder nicht bestätigten Hintergrundereignis keine Daten', async () => {
    await settle();
    const previousReads = api.readSnapshot.mock.calls.length;
    await store.refreshImportedSnapshot(accountB, '2026-10-01T12:15:00Z');
    await store.refreshImportedSnapshot(accountA, null);
    expect(api.readSnapshot).toHaveBeenCalledTimes(previousReads);
  });
  it('entzieht den sichtbaren Kontostand auch bei verweigerter Hintergrundabfrage', async () => {
    await settle();
    api.readSnapshot.mockRejectedValueOnce(new MarketplaceApiError('forbidden'));
    await store.refreshImportedSnapshot(accountA, '2026-10-01T12:15:00Z');
    expect(store.snapshot()).toBeNull();
    expect(store.connections()).toEqual([]);
    expect(store.canManage()).toBe(false);
  });
  it('löscht nur die gewählte Verbindung im aktuellen Workspace', async () => {
    await settle();
    browserApi.deleteConnection.mockImplementation(async () => {
      api.listConnections.mockResolvedValue({ canManage: true, connections: [accountB] });
    });
    expect(await store.deleteConnection(accountA.connectionId)).toBe(true);
    expect(browserApi.deleteConnection).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      'token-a',
    );
    expect(store.connections()).toEqual([accountB]);
    expect(store.selectedConnection()?.connectionId).toBe(accountB.connectionId);
  });
  it('lädt nach unklarer Löschung den pausierten Kontostand erneut', async () => {
    await settle();
    browserApi.deleteConnection.mockImplementation(async () => {
      api.listConnections.mockResolvedValue({
        canManage: true,
        connections: [{ ...accountA, status: 'paused' }, accountB],
      });
      throw new MarketplaceConnectionRemovalError();
    });
    expect(await store.deleteConnection(accountA.connectionId)).toBe(false);
    expect(store.connections()[0]?.status).toBe('paused');
    expect(store.mutationError()).toContain('noch nicht vollständig gelöscht');
    expect(store.connections()[1]?.connectionId).toBe(accountB.connectionId);
  });
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
  it('zählt jeden Kontowechsel auch bei A → B → A für nachgelagerte Sitzungen', async () => {
    await settle();
    const before = store.selectionVersion();
    await store.selectConnection(accountB.connectionId);
    await store.selectConnection(accountA.connectionId);
    expect(store.selectionVersion()).toBe(before + 2);
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
    expect(await store.createConnection('   ')).toBeNull();
    expect(api.createConnection).not.toHaveBeenCalled();
    expect(store.mutationError()).toBeTruthy();
  });
  it('gibt beim Anlegen die neue Konto-ID statt der vorherigen Auswahl zurück', async () => {
    await settle();
    api.createConnection.mockResolvedValue(accountB);
    expect(await store.createConnection('Mein Konto')).toBe(accountB.connectionId);
  });
  it('gibt nach einem Workspacewechsel keine angelegte Konto-ID frei', async () => {
    await settle();
    const pending = deferred<typeof accountB>();
    api.createConnection.mockReturnValue(pending.promise);
    const creating = store.createConnection('Mein Konto');
    currentWorkspace.set(null);
    await settle();
    pending.resolve(accountB);
    expect(await creating).toBeNull();
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

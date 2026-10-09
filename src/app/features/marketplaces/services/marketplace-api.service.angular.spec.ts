import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { MarketplaceApiService } from './marketplace-api.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';

const connection = createMarketplaceFixtures().connections[0];
const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
const page = { items: [], total: 0, nextCursor: null };
const snapshot = {
  ...scope,
  profile: null,
  publications: page,
  conversations: page,
  sales: page,
  activity: page,
};
let rpc: ReturnType<typeof vi.fn>;
let api: MarketplaceApiService;
beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [MarketplaceApiService, { provide: SupabaseService, useValue: { client: { rpc } } }],
  });
  api = TestBed.inject(MarketplaceApiService);
});
describe('Marktplatz-API', () => {
  it('bestätigt nur die geladene Gesprächsversion als gelesen', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, marked: true }, error: null });
    expect(
      await api.markConversationRead(
        scope,
        'conversation-a',
        'a'.repeat(32),
        '2026-10-09T07:00:00Z',
      ),
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith('marketplace_mark_conversation_read', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_conversation_id: 'conversation-a',
      p_read_version: 'a'.repeat(32),
      p_observed_at: '2026-10-09T07:00:00Z',
    });
    rpc.mockResolvedValueOnce({ data: { ok: true, marked: false }, error: null });
    expect(
      await api.markConversationRead(
        scope,
        'conversation-a',
        'a'.repeat(32),
        '2026-10-09T07:00:00Z',
      ),
    ).toBe(false);
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await expect(
      api.markConversationRead(scope, 'conversation-a', 'a'.repeat(32), '2026-10-09T07:00:00Z'),
    ).rejects.toThrow();
  });
  it('sendet ausschließlich die Workspace-Reihenfolge und verlangt eine Schreibbestätigung', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await api.reorderConnections(scope.workspaceId, ['account-b', 'account-a']);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('marketplace_reorder_connections', {
      p_workspace_id: scope.workspaceId,
      p_connection_ids: ['account-b', 'account-a'],
    });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(api.reorderConnections(scope.workspaceId, [])).rejects.toThrow();
  });
  it('übersetzt die atomare Kontogrenze in einen verständlichen Fehler', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '54000' } });
    await expect(api.createConnection(scope.workspaceId, 'Elftes Konto')).rejects.toThrow('zehn');
  });
  it('liest für Kontokacheln nur ein scoped Profil und zwei Anzahlen, keine vollständigen Listen', async () => {
    const queries: {
      filters: Record<string, string>;
      head: boolean;
      query: Record<string, unknown>;
    }[] = [];
    const from = vi.fn().mockImplementation(() => {
      const entry = {
        filters: {} as Record<string, string>,
        head: false,
        query: {} as Record<string, unknown>,
      };
      const query = {
        select: vi.fn().mockImplementation((_columns, options) => {
          entry.head = options?.head ?? false;
          return query;
        }),
        eq: vi.fn().mockImplementation((field, value) => {
          entry.filters[field] = value;
          return query;
        }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            body: {
              username: 'testkonto',
              feedbackCount: 2,
              feedbackReputation: 0.96,
              itemCount: 12,
            },
          },
          error: null,
        }),
        then: (resolve: (value: unknown) => void) =>
          Promise.resolve({
            count: entry.filters['kind'] === 'publication' ? 15 : 4,
            error: null,
          }).then(resolve),
      };
      entry.query = query;
      queries.push(entry);
      return query;
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        MarketplaceApiService,
        { provide: SupabaseService, useValue: { client: { from } } },
      ],
    });
    const result = await TestBed.inject(MarketplaceApiService).readAccountPreview(scope);
    expect(result).toMatchObject({
      ...scope,
      profile: { username: 'testkonto', itemCount: 12 },
      publicationCount: 15,
      saleCount: 4,
    });
    expect(queries.map(({ filters, head }) => ({ ...filters, head }))).toEqual([
      {
        workspace_id: scope.workspaceId,
        connection_id: scope.connectionId,
        kind: 'profile',
        head: false,
      },
      {
        workspace_id: scope.workspaceId,
        connection_id: scope.connectionId,
        kind: 'publication',
        head: true,
      },
      {
        workspace_id: scope.workspaceId,
        connection_id: scope.connectionId,
        kind: 'sale',
        head: true,
      },
    ]);
    expect(from).toHaveBeenCalledTimes(3);
  });
  it('abonniert nur den privaten Kontokanal und ignoriert fremde Live-Meldungen', () => {
    let receive!: (message: { payload: unknown }) => void;
    let subscribe!: (status: string) => void;
    const channel = {
      on: vi.fn().mockImplementation((_event, _filter, callback) => {
        receive = callback;
        return channel;
      }),
      subscribe: vi.fn().mockImplementation((callback) => {
        subscribe = callback;
        return channel;
      }),
    };
    const client = {
      channel: vi.fn().mockReturnValue(channel),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [MarketplaceApiService, { provide: SupabaseService, useValue: { client } }],
    });
    const api = TestBed.inject(MarketplaceApiService);
    const imported = vi.fn();
    const reconnected = vi.fn();
    const close = api.listenAccountImports(scope, imported, reconnected);
    expect(client.channel).toHaveBeenCalledWith(
      `workspace:${scope.workspaceId}:marketplace_account:${scope.connectionId}`,
      { config: { private: true } },
    );
    const payload = { ...scope, lastSyncedAt: '2026-10-02T12:30:00Z' };
    receive({ payload: { ...payload, connectionId: 'other' } });
    receive({ payload: { ...payload, workspaceId: 'other' } });
    receive({ payload: { ...payload, lastSyncedAt: 'invalid' } });
    expect(imported).not.toHaveBeenCalled();
    receive({ payload });
    subscribe('SUBSCRIBED');
    expect(imported).toHaveBeenCalledExactlyOnceWith(payload.lastSyncedAt);
    expect(reconnected).toHaveBeenCalledOnce();
    close();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
  it('bindet Statistikantworten an Konto und gewählten Zeitraum', async () => {
    rpc.mockResolvedValue({ data: { ...scope, periodMinutes: 60, items: [] }, error: null });
    expect(await api.readListingStatistics(scope, 60)).toMatchObject({
      ...scope,
      periodMinutes: 60,
    });
    rpc.mockResolvedValue({
      data: { ...scope, connectionId: 'other', periodMinutes: 60, items: [] },
      error: null,
    });
    await expect(api.readListingStatistics(scope, 60)).rejects.toThrow();
  });
  it('fragt Verwaltungsrechte am Server ab, statt sie aus einer UI-Rolle abzuleiten', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await api.canManage(scope.workspaceId)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('marketplace_can_manage', {
      p_workspace_id: scope.workspaceId,
    });
  });
  it('lädt Konten über den bestehenden RPC', async () => {
    rpc.mockResolvedValue({ data: { canManage: true, connections: [connection] }, error: null });
    expect((await api.listConnections(scope.workspaceId)).connections).toEqual([connection]);
    expect(rpc).toHaveBeenCalledWith('marketplace_list_connections', {
      p_workspace_id: scope.workspaceId,
    });
  });
  it('legt nur Metadaten an und übermittelt keine Sitzungsschlüssel', async () => {
    rpc.mockResolvedValue({ data: { ...connection, status: 'needs_login' }, error: null });
    expect((await api.createConnection(scope.workspaceId, 'Konto A')).status).toBe('needs_login');
    expect(rpc).toHaveBeenCalledWith('marketplace_create_connection', {
      p_workspace_id: scope.workspaceId,
      p_display_name: 'Konto A',
    });
  });
  it('bindet Umbenennen und Pausieren ausdrücklich an Konto und Workspace', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await api.renameConnection(scope, 'Neu');
    await api.setPaused(scope, true);
    expect(rpc).toHaveBeenCalledWith('marketplace_rename_connection', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_display_name: 'Neu',
    });
    expect(rpc).toHaveBeenCalledWith('marketplace_set_paused', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_paused: true,
    });
  });
  it('verweigert einen nur scheinbar erfolgreichen Schreibaufruf', async () => {
    rpc.mockResolvedValue({ data: { ok: false }, error: null });
    await expect(api.setPaused(scope, false)).rejects.toThrow();
  });
  it('liest Snapshot und Folgeseiten einschließlich der Gesprächszuordnung', async () => {
    rpc
      .mockResolvedValueOnce({ data: snapshot, error: null })
      .mockResolvedValueOnce({ data: page, error: null });
    expect(await api.readSnapshot(scope)).toEqual(snapshot);
    await api.readPage(scope, 'message', 'cursor-a', 'conversation-a');
    expect(rpc).toHaveBeenLastCalledWith('marketplace_read_page', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_kind: 'message',
      p_cursor: 'cursor-a',
      p_parent_id: 'conversation-a',
    });
  });
  it('zeigt bei fehlender Migration einen verständlichen Fehler statt einer leeren Kontoliste', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'internal details' } });
    await expect(api.listConnections(scope.workspaceId)).rejects.toThrow('noch nicht verfügbar');
  });
  it('gibt eine abgelehnte Berechtigung weiter, aber keine internen Fehlermeldungen', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'secret details' } });
    await expect(api.listConnections(scope.workspaceId)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

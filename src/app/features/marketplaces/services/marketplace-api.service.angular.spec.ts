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

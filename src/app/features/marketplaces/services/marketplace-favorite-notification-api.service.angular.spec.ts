import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { MarketplaceFavoriteNotificationApiService } from './marketplace-favorite-notification-api.service';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
let api: MarketplaceFavoriteNotificationApiService;
let rpc: ReturnType<typeof vi.fn>;
let client: {
  rpc: typeof rpc;
  channel: ReturnType<typeof vi.fn>;
  removeChannel: ReturnType<typeof vi.fn>;
  realtime: { setAuth: ReturnType<typeof vi.fn> };
};
beforeEach(() => {
  rpc = vi.fn();
  client = {
    rpc,
    channel: vi.fn(),
    removeChannel: vi.fn().mockResolvedValue('ok'),
    realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
  };
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client } }],
  });
  api = TestBed.inject(MarketplaceFavoriteNotificationApiService);
});
afterEach(() => TestBed.resetTestingModule());
describe('Favoritenmeldungen an der Servergrenze', () => {
  it('liest nur den angeforderten Workspace und weist fremde Antworten zurück', async () => {
    rpc.mockResolvedValueOnce({ data: { ...scope, items: [], unreadCount: 0 }, error: null });
    expect((await api.read(scope.workspaceId)).items).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('marketplace_read_favorite_notifications', {
      p_workspace_id: scope.workspaceId,
    });
    rpc.mockResolvedValueOnce({
      data: { workspaceId: 'foreign', items: [], unreadCount: 0 },
      error: null,
    });
    await expect(api.read(scope.workspaceId)).rejects.toThrow();
  });
  it('speichert kontogebunden mit der bestätigten Einstellungsfassung', async () => {
    const settings = { ...scope, enabled: true, version: 4 };
    rpc.mockResolvedValueOnce({ data: settings, error: null });
    expect(await api.readSettings(scope)).toEqual(settings);
    rpc.mockResolvedValueOnce({ data: { ...settings, enabled: false, version: 5 }, error: null });
    expect((await api.setSettings(settings, false)).enabled).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith('marketplace_set_favorite_notification_settings', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_enabled: false,
      p_expected_version: 4,
    });
  });
  it('gibt verständliche Konflikt-, Rechte- und Rolloutfehler ohne Serverdetails zurück', async () => {
    for (const [code, text] of [
      ['40001', 'geändert'],
      ['42501', 'keinen Zugriff'],
      ['PGRST202', 'noch nicht verfügbar'],
    ]) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'secret' } });
      await expect(api.read(scope.workspaceId)).rejects.toThrow(text);
    }
  });
  it('bestätigt Markieren nur bei bestätigtem Serverergebnis', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await api.mark(scope.workspaceId, null, true);
    expect(rpc).toHaveBeenCalledWith('marketplace_mark_favorite_notifications', {
      p_workspace_id: scope.workspaceId,
      p_clear: true,
    });
    rpc.mockResolvedValueOnce({ data: { ok: false }, error: null });
    await expect(api.mark(scope.workspaceId, '7', false)).rejects.toThrow();
  });
  it('abonniert ausschließlich private Invalidierungen und entfernt den Kanal', () => {
    const on = vi.fn().mockReturnThis();
    const subscribe = vi.fn().mockReturnThis();
    const channel = { on, subscribe };
    client.channel.mockReturnValue(channel);
    const changed = vi.fn();
    const reconnect = vi.fn();
    const cleanup = api.listen(scope.workspaceId, changed, reconnect);
    expect(client.channel).toHaveBeenCalledWith('workspace:workspace-a:marketplace_notifications', {
      config: { private: true },
    });
    expect(on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'favorite_notifications_changed' },
      changed,
    );
    subscribe.mock.calls[0][0]('SUBSCRIBED');
    expect(reconnect).toHaveBeenCalledOnce();
    api.authenticate('new-token');
    expect(client.realtime.setAuth).toHaveBeenCalledWith('new-token');
    cleanup();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});

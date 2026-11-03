import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { MarketplaceMessageNotificationApiService } from './marketplace-message-notification-api.service';
import { messageNotificationCategorySettings } from '../models/marketplace-message-notifications';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
let api: MarketplaceMessageNotificationApiService;
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
  api = TestBed.inject(MarketplaceMessageNotificationApiService);
});
afterEach(() => TestBed.resetTestingModule());
describe('Nachrichtenmeldungen an der Servergrenze', () => {
  it('liest nur den angeforderten Workspace und weist fremde Antworten zurück', async () => {
    rpc.mockResolvedValueOnce({ data: { ...scope, items: [], unreadCount: 0 }, error: null });
    expect((await api.read(scope.workspaceId)).items).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('marketplace_read_message_notifications', {
      p_workspace_id: scope.workspaceId,
    });
    rpc.mockResolvedValueOnce({
      data: { workspaceId: 'foreign', items: [], unreadCount: 0 },
      error: null,
    });
    await expect(api.read(scope.workspaceId)).rejects.toThrow();
  });
  it('gibt verständliche Abruf-, Rechte- und Rolloutfehler ohne Serverdetails zurück', async () => {
    for (const [code, text] of [
      ['40001', 'inzwischen geändert'],
      ['42501', 'keinen Zugriff'],
      ['PGRST202', 'noch nicht verfügbar'],
    ]) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'secret' } });
      await expect(api.read(scope.workspaceId)).rejects.toThrow(text);
    }
  });
  it('liest und ändert die kontogebundene Meldungseinstellung mit ihrer Fassung', async () => {
    const settings = { ...scope, enabled: true, version: 0 };
    rpc.mockResolvedValueOnce({ data: settings, error: null });
    expect(await api.readSettings(scope)).toEqual({
      ...settings,
      categories: messageNotificationCategorySettings(settings),
    });
    expect(rpc).toHaveBeenLastCalledWith('marketplace_read_message_notification_settings', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
    });
    rpc.mockResolvedValueOnce({ data: { ...settings, enabled: false, version: 1 }, error: null });
    expect(await api.setSettings(settings, false)).toMatchObject({ enabled: false, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith('marketplace_set_message_notification_settings', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_enabled: false,
      p_expected_version: 0,
    });
    rpc.mockResolvedValueOnce({ data: { ...settings, connectionId: 'foreign' }, error: null });
    await expect(api.readSettings(scope)).rejects.toThrow();
  });
  it('ändert nur die gewählte Kategorie mit bestätigter Kontobindung und Version', async () => {
    const settings = { ...scope, enabled: true, version: 3 };
    const saved = {
      ...settings,
      version: 4,
      categories: { ...messageNotificationCategorySettings(settings), payments: false },
    };
    rpc.mockResolvedValueOnce({ data: saved, error: null });
    expect(await api.setCategorySettings(settings, 'payments', false)).toEqual(saved);
    expect(rpc).toHaveBeenLastCalledWith('marketplace_set_notification_category_settings', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_category: 'payments',
      p_enabled: false,
      p_expected_version: 3,
    });
    rpc.mockResolvedValueOnce({ data: { ...saved, connectionId: 'foreign' }, error: null });
    await expect(api.setCategorySettings(settings, 'payments', false)).rejects.toThrow();
  });
  it('bestätigt Markieren nur bei bestätigtem Serverergebnis', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await api.mark(scope.workspaceId, null, true);
    expect(rpc).toHaveBeenCalledWith('marketplace_mark_message_notifications', {
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
    expect(client.channel).toHaveBeenCalledWith(
      'workspace:workspace-a:marketplace_message_notifications',
      {
        config: { private: true },
      },
    );
    expect(on).toHaveBeenCalledWith(
      'broadcast',
      { event: 'message_notifications_changed' },
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

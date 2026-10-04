import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedLocalExtensionApiService } from './vinted-local-extension-api.service';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';
import { VintedLocalExtensionStore } from './vinted-local-extension.store';

const cloud = createMarketplaceFixtures().connections[0];
const localConnection = { ...cloud, executionMode: 'local' as const, externalAccountId: '123' };
const scope = { workspaceId: cloud.workspaceId, connectionId: cloud.connectionId };
const approval = { ...scope, externalAccountId: '123', expiresAt: '2030-01-01T00:00:00Z' };
const binding = {
  externalAccountId: '123',
  expiresAt: approval.expiresAt,
  revoked: false,
  lastSeenAt: null,
};
const prepared = { tokenHash: 'a'.repeat(64), identity: { id: '123', username: 'test-account' } };
const imported = {
  ...approval,
  counts: { profile: 1, publication: 2 },
  observedAt: '2026-10-04T00:00:00Z',
  publicationsComplete: true,
};
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  TestBed.tick();
}
describe('Lokale Vinted-Freigabe', () => {
  let store: VintedLocalExtensionStore;
  let workspace: ReturnType<typeof signal<{ id: string } | null>>;
  let user: ReturnType<typeof signal<{ id: string } | null>>;
  let canManage: ReturnType<typeof signal<boolean>>;
  let api: {
    approve: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let bridge: { request: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  let refresh: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    TestBed.resetTestingModule();
    workspace = signal<{ id: string } | null>({ id: cloud.workspaceId });
    user = signal<{ id: string } | null>({ id: 'user' });
    canManage = signal(true);
    api = {
      approve: vi.fn().mockResolvedValue(approval),
      read: vi.fn().mockResolvedValue(null),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    bridge = { request: vi.fn().mockResolvedValue(prepared), cancel: vi.fn() };
    refresh = vi.fn().mockResolvedValue({
      ...localConnection,
      status: 'connected',
      lastSyncedAt: imported.observedAt,
    });
    TestBed.configureTestingModule({
      providers: [
        VintedLocalExtensionStore,
        { provide: AuthService, useValue: { currentUser: user } },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
        {
          provide: MarketplaceAccountStore,
          useValue: { canManage, refreshLocalConnection: refresh },
        },
        { provide: VintedLocalExtensionApiService, useValue: api },
        { provide: VintedLocalExtensionBridge, useValue: bridge },
      ],
    });
    store = TestBed.inject(VintedLocalExtensionStore);
    store.connection.set(localConnection);
    await settle();
  });
  it('erteilt vor ausdrücklicher Bestätigung keine Freigabe', async () => {
    await store.prepare();
    expect(store.prepared()?.identity).toEqual(prepared.identity);
    expect(api.approve).not.toHaveBeenCalled();
    api.read.mockResolvedValue(binding);
    bridge.request.mockResolvedValue(approval);
    await store.approve();
    expect(api.approve).toHaveBeenCalledWith(scope, prepared.tokenHash, '123');
    expect(bridge.request).toHaveBeenLastCalledWith(
      'FLIPBASE_VINTED_LOCAL_BIND',
      expect.objectContaining({ ...approval, tokenHash: prepared.tokenHash }),
    );
    expect(store.binding()).toEqual(binding);
    expect(store.imported()).toBeNull();
  });
  it('verweigert ein anderes Konto im selben Browserprofil', async () => {
    bridge.request.mockResolvedValue({ ...prepared, identity: { id: '999', username: 'other' } });
    await store.prepare();
    expect(store.error()).toContain('anderes Vinted-Konto');
    expect(store.prepared()).toBeNull();
    expect(api.approve).not.toHaveBeenCalled();
  });
  it('hält die bereits erteilte Freigabe nach einem fehlgeschlagenen Browser-Bind widerrufbar', async () => {
    await store.prepare();
    api.read.mockResolvedValue(binding);
    bridge.request.mockRejectedValue(new Error('Vinted-Anmeldung hat sich geändert'));
    await store.approve();
    expect(store.binding()).toEqual(binding);
    expect(store.error()).toContain('geändert');
    await store.revoke();
    expect(api.revoke).toHaveBeenCalledWith(scope);
    expect(store.binding()).toBeNull();
  });
  it('behält den Widerruf auch nach einer fehlgeschlagenen Statusabfrage nach der Freigabe', async () => {
    await store.prepare();
    api.read.mockRejectedValue(new Error('Statusabfrage nicht erreichbar'));
    await store.approve();
    expect(store.binding()).toBeNull();
    expect(store.canRevoke()).toBe(true);
    await store.revoke();
    expect(api.revoke).toHaveBeenCalledWith(scope);
    expect(store.canRevoke()).toBe(false);
  });
  it.each(['workspace', 'logout', 'permission'] as const)(
    'bindet nach einem Kontextverlust nicht weiter: %s',
    async (change) => {
      await store.prepare();
      let finish: ((value: typeof approval) => void) | undefined;
      api.approve.mockReturnValue(
        new Promise<typeof approval>((resolve) => {
          finish = resolve;
        }),
      );
      const pending = store.approve();
      if (change === 'workspace') workspace.set({ id: 'other-workspace' });
      if (change === 'logout') user.set(null);
      if (change === 'permission') canManage.set(false);
      finish?.(approval);
      await pending;
      expect(bridge.request).toHaveBeenCalledOnce();
      expect(store.binding()).toBeNull();
      expect(store.prepared()).toBeNull();
    },
  );
  it('bestätigt einen Import erst nach serverseitigem Konto- und Zeitabgleich', async () => {
    api.read.mockResolvedValue(binding);
    store.connection.set(null);
    await settle();
    store.connection.set(localConnection);
    await settle();
    bridge.request.mockResolvedValue(imported);
    refresh.mockResolvedValue({
      ...localConnection,
      status: 'connected',
      lastSyncedAt: '2026-10-03T00:00:00Z',
    });
    await store.sync();
    expect(store.imported()).toBeNull();
    expect(store.error()).toContain('serverseitig');
    refresh.mockResolvedValue({
      ...localConnection,
      status: 'connected',
      lastSyncedAt: '2026-10-04T00:00:00+00:00',
    });
    await store.sync();
    expect(store.imported()).toEqual(imported);
  });
  it('widerruft serverseitig auch ohne erreichbare Erweiterung', async () => {
    bridge.request.mockRejectedValue(new Error('missing extension'));
    await store.revoke();
    expect(api.revoke).toHaveBeenCalledWith(scope);
    expect(bridge.request).toHaveBeenCalledWith('FLIPBASE_VINTED_LOCAL_DISCONNECT', scope);
    expect(store.binding()).toBeNull();
    expect(store.notice()).toContain('widerrufen');
    expect(store.error()).toBeNull();
  });
  it('wartet vor der direkten Synchronisierung auf die Konto-Freigabe und lädt sie nicht doppelt', async () => {
    let finish: ((resolvedBinding: typeof binding) => void) | undefined;
    api.read.mockReturnValue(
      new Promise<typeof binding>((resolve) => {
        finish = resolve;
      }),
    );
    const next = { ...localConnection, connectionId: 'next-account' };
    const first = store.loadConnection(next);
    const second = store.loadConnection(next);
    expect(store.busy()).toBe(true);
    TestBed.tick();
    expect(api.read).toHaveBeenCalledTimes(2);
    finish?.(binding);
    await Promise.all([first, second]);
    expect(store.hasValidBinding()).toBe(true);
    expect(api.read).toHaveBeenCalledTimes(2);
  });
  it('verwirft eine verspätete Freigabe nach Konto- und Workspacewechsel', async () => {
    let finish: ((resolvedBinding: typeof binding) => void) | undefined;
    api.read.mockReturnValue(
      new Promise<typeof binding>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = store.loadConnection({ ...localConnection, connectionId: 'next-account' });
    workspace.set({ id: 'other-workspace' });
    finish?.(binding);
    await pending;
    expect(store.binding()).toBeNull();
    expect(store.hasValidBinding()).toBe(false);
    expect(bridge.request).not.toHaveBeenCalled();
  });
  it.each([
    { ...binding, revoked: true },
    { ...binding, expiresAt: '2000-01-01T00:00:00Z' },
  ])('synchronisiert keine widerrufene oder abgelaufene Freigabe', async (invalidBinding) => {
    api.read.mockResolvedValue(invalidBinding);
    await store.loadConnection({ ...localConnection, connectionId: 'next-account' });
    await store.sync();
    expect(bridge.request).not.toHaveBeenCalled();
    expect(store.notice()).toContain('gültige lokale Freigabe');
  });
  it('startet nach dem Schließen des Bereichs keine Synchronisierung oder neue Freigabeabfrage', async () => {
    api.read.mockResolvedValue(binding);
    await store.loadConnection({ ...localConnection, connectionId: 'next-account' });
    expect(store.isCurrentConnection(store.connection() ?? localConnection)).toBe(true);
    TestBed.resetTestingModule();
    await store.sync();
    await store.loadConnection(localConnection);
    expect(store.isCurrentConnection(localConnection)).toBe(false);
    expect(bridge.request).not.toHaveBeenCalled();
    expect(api.read).toHaveBeenCalledTimes(2);
  });
});

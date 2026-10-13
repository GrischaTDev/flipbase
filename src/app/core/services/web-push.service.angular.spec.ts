import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { WorkspaceService } from './workspace.service';
import { PwaService } from './pwa.service';
import { WebhookService } from './webhook.service';
import { WebPushApiService } from './web-push-api.service';
import { WebPushRevocationStoreService } from './web-push-revocation-store.service';
import { WebPushService } from './web-push.service';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const token = `header.${btoa(JSON.stringify({ session_id: sessionId }))}.signature`;
let subscription: {
  toJSON: () => { endpoint: string; keys: { auth: string; p256dh: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
} | null;
const settings = {
  enabled: true,
  publicKey: btoa(String.fromCharCode(...new Uint8Array(65).fill(4))),
  keyId: 'key1',
  binding: null,
  preferences: [],
  allowedCategories: ['order', 'connection'],
};
function setup() {
  const auth = {
    currentUser: signal({ id: userId }),
    session: signal({ user: { id: userId }, access_token: token }),
  };
  const workspace = { currentWorkspace: signal({ id: workspaceId }) };
  const api = {
    loadSettings: vi.fn(async () => settings),
    register: vi.fn(async (registration: { generationId: string }) => ({
      deviceId: registration.generationId,
      active: true,
    })),
    revokeBinding: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    savePreferences: vi.fn(async (): Promise<void> => undefined),
    sendTest: vi.fn(async () => undefined),
  };
  const subscriptionResult = {
    toJSON: () => ({
      endpoint: 'https://web.push.apple.com/test',
      keys: { auth: 'secret', p256dh: 'key' },
    }),
    unsubscribe: vi.fn(async () => true),
  };
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => {
      subscription = subscriptionResult;
      return subscriptionResult;
    }),
  };
  const registration = { active: {}, pushManager };
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_name: string, operation: () => Promise<unknown>) => operation() },
  });
  const sw = Object.assign(new EventTarget(), { getRegistration: vi.fn(async () => registration) });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
  const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
  Object.defineProperty(window, 'Notification', { configurable: true, value: Notification });
  TestBed.configureTestingModule({
    providers: [
      WebPushService,
      WebPushRevocationStoreService,
      { provide: WebPushApiService, useValue: api },
      { provide: AuthService, useValue: auth },
      { provide: WorkspaceService, useValue: workspace },
      { provide: PwaService, useValue: { swRegistered: signal(true), isStandalone: signal(true) } },
      { provide: WebhookService, useValue: { addNotification: vi.fn() } },
    ],
  });
  const service = TestBed.inject(WebPushService);
  TestBed.tick();
  return {
    service,
    api,
    auth,
    requestPermission,
    pushManager,
    workspace,
    registration,
    store: TestBed.inject(WebPushRevocationStoreService),
  };
}
beforeEach(() => {
  localStorage.clear();
  subscription = null;
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(navigator, 'locks');
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(window, 'isSecureContext');
});

describe('Server-confirmed push devices', () => {
  it('requests permission immediately and never registers a denied subscription', async () => {
    const { service, api, requestPermission, pushManager } = setup();
    await service.refreshDevice();
    requestPermission.mockResolvedValueOnce('denied');
    const activating = service.activateDevice();
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(api.register).not.toHaveBeenCalled();
    expect(await activating).toBe(false);
    expect(service.deviceStatus()).toBe('denied');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
  it('never sends registration when the capability cannot be persisted', async () => {
    const { service, api, store } = setup();
    await service.refreshDevice();
    vi.spyOn(store, 'prepare').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    expect(await service.activateDevice()).toBe(false);
    expect(api.register).not.toHaveBeenCalled();
    expect(subscription?.unsubscribe).toHaveBeenCalled();
    expect(service.isActive()).toBe(false);
  });
  it('retries a lost response with exactly the same persisted registration', async () => {
    const { service, api, store } = setup();
    await service.refreshDevice();
    api.register.mockRejectedValueOnce(new Error('response lost'));
    expect(await service.activateDevice()).toBe(false);
    expect(service.deviceStatus()).toBe('pending');
    expect(service.canDeactivate()).toBe(true);
    expect(store.listBindings()[0]?.state).toBe('prepared');
    expect(await service.activateDevice()).toBe(true);
    expect(api.register.mock.calls[0]).toEqual(api.register.mock.calls[1]);
    expect(service.isActive()).toBe(true);
    expect(service.categories()).toEqual([]);
    expect(await service.sendTestNotification()).toBe(true);
    expect(api.sendTest).toHaveBeenCalledWith(store.listBindings()[0]?.generationId, workspaceId);
  });
  it('does not claim activation after the local confirmation fails', async () => {
    const { service, store } = setup();
    await service.refreshDevice();
    vi.spyOn(store, 'confirm').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(await service.activateDevice()).toBe(false);
    expect(service.isActive()).toBe(false);
    expect(service.deviceStatus()).toBe('pending');
  });
  it('reports unsupported when a worker exists without a PushManager', async () => {
    const { service, registration } = setup();
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(registration, 'pushManager');
    await service.refreshDevice();
    expect(service.deviceStatus()).toBe('unsupported');
  });
  it('loads the authenticated binding and recovers a corrupt local capability only after revocation', async () => {
    const { service, api, store } = setup();
    const generationId = '44444444-4444-4444-8444-444444444444';
    localStorage.setItem(`flipbase_push_binding:${generationId}`, '{broken');
    await service.refreshDevice();
    expect(api.loadSettings).toHaveBeenCalled();
    expect(service.canDeactivate()).toBe(true);
    api.revoke.mockRejectedValueOnce(new Error('offline'));
    await expect(service.deactivateDevice()).rejects.toThrow('offline');
    expect(store.corruptedGenerationIds()).toEqual([generationId]);
    expect(await service.deactivateDevice()).toBe(true);
    expect(store.corruptedGenerationIds()).toEqual([]);
  });
  it('refreshes the new workspace after an in-flight preference confirmation', async () => {
    const { service, api, workspace } = setup();
    await service.refreshDevice();
    expect(await service.activateDevice()).toBe(true);
    let resolveSave: (() => void) | undefined;
    api.savePreferences.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const saving = service.saveCategories(['order']);
    workspace.currentWorkspace.set({ id: '55555555-5555-4555-8555-555555555555' });
    TestBed.tick();
    expect(service.isActive()).toBe(false);
    resolveSave?.();
    expect(await saving).toBe(false);
    await service.refreshDevice();
    expect(api.loadSettings).toHaveBeenLastCalledWith(
      expect.any(String),
      workspace.currentWorkspace().id,
    );
    expect(service.serverSettings()).not.toBeNull();
  });
  it('rechecks the server under the shared lock and reuses a generation activated by another tab', async () => {
    const { service, api, store } = setup();
    await service.refreshDevice();
    const other = TestBed.runInInjectionContext(() => new WebPushService());
    TestBed.tick();
    await other.refreshDevice();
    let queue = Promise.resolve();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, operation: () => Promise<unknown>) => {
          const result = queue.then(operation);
          queue = result.then(
            () => undefined,
            () => undefined,
          );
          return result;
        },
      },
    });
    let serverBinding: { deviceId: string; active: boolean; keyId: string } | null = null;
    api.loadSettings.mockImplementation(
      async () => ({ ...settings, binding: serverBinding }) as typeof settings,
    );
    api.register.mockImplementation(async (registration) => {
      serverBinding = { deviceId: registration.generationId, active: true, keyId: 'key1' };
      return serverBinding;
    });
    expect(await Promise.all([service.activateDevice(), other.activateDevice()])).toEqual([
      true,
      true,
    ]);
    expect(api.register).toHaveBeenCalledOnce();
    expect(store.listBindings()).toHaveLength(1);
    window.dispatchEvent(new StorageEvent('storage', { key: 'flipbase_push_binding:changed' }));
    await service.refreshDevice();
    expect(service.isActive()).toBe(true);
  });
});

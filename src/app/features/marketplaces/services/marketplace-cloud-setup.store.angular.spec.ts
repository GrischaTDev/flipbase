import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceCloudSetupApiService } from './marketplace-cloud-setup-api.service';
import { MarketplaceCloudSetupStore } from './marketplace-cloud-setup.store';
const setup = {
  workspaceId: '25500000-0000-4000-8000-000000000011',
  connectionId: '25500000-0000-4000-8000-000000000021',
  setupId: '25500000-0000-4000-8000-000000000031',
  state: 'reserved',
  sessionId: null,
};
let workspace: ReturnType<typeof signal<{ id: string }>>;
let store: MarketplaceCloudSetupStore;
const api = { available: vi.fn(), begin: vi.fn(), action: vi.fn() };
const reloadConnections = vi.fn();
const canManage = signal(true);
const loading = signal(false);
beforeEach(async () => {
  canManage.set(true);
  loading.set(false);
  TestBed.resetTestingModule();
  vi.clearAllMocks();
  api.available.mockResolvedValue(true);
  api.begin.mockResolvedValue({ status: 'ready', setup });
  api.action.mockResolvedValue({ ...setup, state: 'cancelled' });
  reloadConnections.mockResolvedValue(undefined);
  workspace = signal({ id: setup.workspaceId });
  TestBed.configureTestingModule({
    providers: [
      MarketplaceCloudSetupStore,
      { provide: MarketplaceCloudSetupApiService, useValue: api },
      {
        provide: AuthService,
        useValue: {
          currentUser: signal({ id: 'operator' }),
          session: signal({ access_token: 'test-token' }),
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      {
        provide: MarketplaceAccountStore,
        useValue: { canManage, loading, reloadConnections },
      },
    ],
  });
  store = TestBed.inject(MarketplaceCloudSetupStore);
  TestBed.tick();
  await Promise.resolve();
});
it('behält die Reservierung während des vorübergehend fehlenden Verwaltungsrechts beim Nachladen', async () => {
  reloadConnections.mockImplementation(async () => {
    loading.set(true);
    canManage.set(false);
    TestBed.tick();
    await Promise.resolve();
    canManage.set(true);
    loading.set(false);
    TestBed.tick();
  });
  await store.begin({ connectionId: setup.connectionId });
  expect(store.setup()).toEqual(setup);
  expect(api.action).not.toHaveBeenCalled();
});
it('legt bei fehlender Kapazität kein Konto an und lädt keine Kontoliste', async () => {
  api.begin.mockResolvedValue({ status: 'no_capacity' });
  expect(await store.begin({ displayName: 'Cloudtest' })).toBeNull();
  expect(store.error()).toBe('Aktuell sind keine freien Cloud-IPs vorhanden.');
  expect(reloadConnections).not.toHaveBeenCalled();
  expect(store.setup()).toBeNull();
});
it('behält beim Upgrade dieselbe Konto-ID', async () => {
  expect(await store.begin({ connectionId: setup.connectionId })).toEqual(setup);
  expect(api.begin).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: setup.workspaceId, connectionId: setup.connectionId }),
    'test-token',
  );
  expect(reloadConnections).toHaveBeenCalledWith(setup.connectionId);
});
it('behandelt eine fertige IP-Zuordnung nicht als abbrechbare Reservierung', async () => {
  const completed = { ...setup, state: 'completed' };
  api.begin.mockResolvedValue({ status: 'ready', setup: completed });
  expect(await store.begin({ connectionId: setup.connectionId })).toEqual(completed);
  expect(store.setup()).toBeNull();
  await store.cancel();
  TestBed.resetTestingModule();
  await Promise.resolve();
  expect(api.action).not.toHaveBeenCalled();
});
it('kündigt eine verspätet bestätigte fertige Zuordnung nach Workspace-Wechsel nicht', async () => {
  let resolve: (result: unknown) => void = () => undefined;
  api.begin.mockReturnValue(
    new Promise((callback) => {
      resolve = callback;
    }),
  );
  const pending = store.begin({ connectionId: setup.connectionId });
  workspace.set({ id: setup.connectionId });
  TestBed.tick();
  resolve({ status: 'ready', setup: { ...setup, state: 'completed' } });
  expect(await pending).toBeNull();
  expect(store.setup()).toBeNull();
  expect(reloadConnections).not.toHaveBeenCalled();
  expect(api.action).not.toHaveBeenCalled();
});
it('verwendet nach verlorener Antwort dieselbe Request-ID', async () => {
  api.begin.mockRejectedValueOnce(new Error('internal secret'));
  await store.begin({ displayName: 'Cloudtest' });
  await store.begin({ displayName: 'Cloudtest' });
  expect(api.begin.mock.calls[0][0]).toEqual(api.begin.mock.calls[1][0]);
});
it('behält während einer Nachbuchung dieselbe Anfrage und zeigt einen verständlichen Hinweis', async () => {
  api.begin.mockResolvedValue({ status: 'purchase_pending' });
  await store.begin({ displayName: 'Cloudtest' });
  expect(store.error()).toContain('Cloud-IP wird noch bereitgestellt');
  await store.begin({ displayName: 'Cloudtest' });
  expect(api.begin.mock.calls[0][0]).toEqual(api.begin.mock.calls[1][0]);
  expect(reloadConnections).not.toHaveBeenCalled();
});
it('zeigt Paketgrenze und fehlgeschlagene Nachbuchung getrennt vom freien Bestand', async () => {
  api.begin.mockResolvedValueOnce({ status: 'limit_reached' });
  await store.begin({ displayName: 'Cloudtest' });
  expect(store.error()).toContain('ausgeschöpft');
  api.begin.mockResolvedValueOnce({ status: 'purchase_failed' });
  await store.begin({ displayName: 'Cloudtest' });
  expect(store.error()).toContain('nicht nachgebucht');
});
it('beginnt bei Doppelklick nur eine Einrichtung', async () => {
  let resolve: (result: unknown) => void = () => undefined;
  api.begin.mockReturnValue(
    new Promise((callback) => {
      resolve = callback;
    }),
  );
  const pending = store.begin({ displayName: 'Cloudtest' });
  expect(await store.begin({ displayName: 'Cloudtest' })).toBeNull();
  expect(api.begin).toHaveBeenCalledOnce();
  resolve({ status: 'no_capacity' });
  await pending;
});
it('lädt nach abgebrochenem Upgrade den bestehenden lokalen Zustand', async () => {
  await store.begin({ connectionId: setup.connectionId });
  reloadConnections.mockClear();
  await store.cancel();
  expect(api.action).toHaveBeenCalledWith(setup, 'cancel', 'test-token');
  expect(reloadConnections).toHaveBeenCalledWith(setup.connectionId);
  expect(store.setup()).toBeNull();
});
it('verwirft verspätete Antworten nach Workspace-Wechsel und beendet die Reservierung', async () => {
  let resolve: (result: unknown) => void = () => undefined;
  api.begin.mockReturnValue(
    new Promise((callback) => {
      resolve = callback;
    }),
  );
  const pending = store.begin({ displayName: 'Cloudtest' });
  workspace.set({ id: setup.connectionId });
  TestBed.tick();
  resolve({ status: 'ready', setup });
  await pending;
  expect(store.setup()).toBeNull();
  expect(reloadConnections).not.toHaveBeenCalled();
  expect(api.action).toHaveBeenCalledWith(setup, 'cancel', 'test-token');
});

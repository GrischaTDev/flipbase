import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import type { MarketplaceConnection } from '../models/marketplace.models';
import type { MarketplaceSyncSchedule } from '../models/marketplace-sync-schedule';
import {
  MarketplaceSyncScheduleApiService,
  MarketplaceSyncScheduleError,
} from './marketplace-sync-schedule-api.service';
import { MarketplaceSyncScheduleStore } from './marketplace-sync-schedule.store';

const [accountA, accountB] = createMarketplaceFixtures().connections;
const initial: MarketplaceSyncSchedule = {
  workspaceId: accountA.workspaceId,
  connectionId: accountA.connectionId,
  enabled: false,
  intervalMinutes: 15,
  nextDueAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  pausedReason: null,
  retryAfter: null,
  authorizationVersion: 1,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
let workspace: ReturnType<typeof signal<{ id: string; archived_at?: string } | null>>;
let user: ReturnType<typeof signal<{ id: string } | null>>;
let store: MarketplaceSyncScheduleStore;
let api: {
  read: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  availability: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  workspace = signal<{ id: string; archived_at?: string } | null>({ id: accountA.workspaceId });
  user = signal<{ id: string } | null>({ id: 'user-a' });
  api = {
    read: vi.fn().mockResolvedValue(initial),
    set: vi.fn().mockResolvedValue({
      ...initial,
      enabled: true,
      nextDueAt: '2026-10-01T12:15:00Z',
      authorizationVersion: 1,
    }),
    availability: vi.fn().mockResolvedValue({ enabled: true, allowedIntervals: [15] }),
  };
  TestBed.configureTestingModule({
    providers: [
      MarketplaceSyncScheduleStore,
      { provide: MarketplaceSyncScheduleApiService, useValue: api },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: AuthService, useValue: { currentUser: user } },
    ],
  });
  store = TestBed.inject(MarketplaceSyncScheduleStore);
  store.account.set(accountA);
  store.manageAllowed.set(true);
});
afterEach(() => TestBed.resetTestingModule());
describe('Kontogebundene automatische Aktualisierung', () => {
  it('aktiviert einen fehlenden Zeitplan standardmäßig mit 15 Minuten', async () => {
    api.read.mockResolvedValue({ ...initial, authorizationVersion: 0 });
    await settle();
    expect(api.set).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      true,
      15,
      0,
    );
    expect(store.schedule()?.enabled).toBe(true);
  });
  it('lässt eine ausdrücklich pausierte Automatik auch nach Neuladen pausiert', async () => {
    await settle();
    await store.reload();
    expect(api.set).not.toHaveBeenCalled();
    expect(store.schedule()?.enabled).toBe(false);
  });
  it('liest nach erneuter Kontobestätigung den bereinigten Anmeldestatus sofort neu', async () => {
    api.read.mockResolvedValue({ ...initial, pausedReason: 'needs_login' });
    await settle();
    expect(store.schedule()?.pausedReason).toBe('needs_login');

    api.read.mockResolvedValue({ ...initial, authorizationVersion: 2 });
    store.account.set({ ...accountA });
    await settle();

    expect(store.schedule()?.pausedReason).toBeNull();
    expect(store.schedule()?.authorizationVersion).toBe(2);
    expect(store.schedule()?.enabled).toBe(false);
    expect(api.set).not.toHaveBeenCalled();
  });
  it('speichert einen bestätigten kürzeren Abstand und erhält die Kontobindung', async () => {
    api.read.mockResolvedValue({ ...initial, enabled: true });
    api.availability.mockResolvedValue({ enabled: true, allowedIntervals: [3, 5, 10, 15, 30, 60] });
    api.set.mockResolvedValue({
      ...initial,
      enabled: true,
      intervalMinutes: 3,
      authorizationVersion: 2,
    });
    await settle();
    await store.setIntervalMinutes(3);
    expect(api.set).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      true,
      3,
      1,
    );
    expect(store.schedule()?.intervalMinutes).toBe(3);
  });
  it('aktiviert einen kurzen gespeicherten Abstand bei einem alten Worker nicht', async () => {
    api.read.mockResolvedValue({ ...initial, intervalMinutes: 3 });
    await settle();
    expect(store.canEnable()).toBe(false);
    await store.setEnabled(true);
    expect(api.set).not.toHaveBeenCalled();
  });
  it('bestätigt den kurzen Abstand vor dem Speichern erneut beim Worker', async () => {
    api.read.mockResolvedValue({ ...initial, enabled: true });
    api.availability.mockResolvedValue({ enabled: true, allowedIntervals: [3, 15] });
    await settle();
    api.availability.mockResolvedValueOnce({ enabled: true, allowedIntervals: [15] });
    await store.setIntervalMinutes(3);
    expect(api.set).not.toHaveBeenCalled();
    expect(store.schedule()?.intervalMinutes).toBe(15);
    expect(store.error()).toContain('Browserdienst');
  });
  it('liest und widerruft eine Freigabe unabhängig von einem hängenden Healthcheck', async () => {
    api.read.mockResolvedValue({ ...initial, enabled: true, authorizationVersion: 3 });
    api.availability.mockReturnValue(new Promise(() => undefined));
    api.set.mockResolvedValue({ ...initial, authorizationVersion: 4 });
    await settle();
    expect(store.schedule()?.enabled).toBe(true);
    expect(store.loading()).toBe(false);
    expect(store.canDisable()).toBe(true);
    expect(store.canEnable()).toBe(false);
    await store.setEnabled(false);
    expect(api.set).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      false,
      15,
      3,
    );
    expect(store.schedule()?.enabled).toBe(false);
  });
  it('verwirft bei bestätigtem Rechteentzug den gespeicherten Stand sofort', async () => {
    api.read.mockResolvedValue({ ...initial, enabled: true, authorizationVersion: 3 });
    await settle();
    api.set.mockRejectedValueOnce(new MarketplaceSyncScheduleError('forbidden'));
    await store.setEnabled(false);
    expect(store.schedule()).toBeNull();
    expect(store.accessDenied()).toBe(true);
    expect(store.canDisable()).toBe(false);
    expect(store.canEnable()).toBe(false);
    expect(store.error()).toContain('keinen Verwaltungszugriff');
  });
  it('öffnet ohne Aktivierung und übernimmt ausschließlich den bestätigten Schreibstand', async () => {
    await settle();
    expect(api.set).not.toHaveBeenCalled();
    expect(store.schedule()?.enabled).toBe(false);
    await store.setEnabled(true);
    expect(api.set).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      true,
      15,
      1,
    );
    expect(store.schedule()?.nextDueAt).toBe('2026-10-01T12:15:00Z');
  });
  it('aktiviert bei einem alten oder inzwischen ausgefallenen Worker nicht', async () => {
    api.availability.mockResolvedValue({ enabled: false, allowedIntervals: [] });
    await settle();
    expect(store.canEnable()).toBe(false);
    await store.setEnabled(true);
    expect(api.set).not.toHaveBeenCalled();
  });
  it('prüft vor Aktivierung die aktuelle Fähigkeit erneut und behält bei Fehler den alten Stand', async () => {
    await settle();
    api.availability.mockResolvedValueOnce({ enabled: false, allowedIntervals: [] });
    await store.setEnabled(true);
    expect(api.set).not.toHaveBeenCalled();
    expect(store.schedule()?.enabled).toBe(false);
    expect(store.error()).toContain('Browserdienst');
  });
  it('widerruft bestehende Automatik auch bei altem Worker ohne Health oder Browserstart', async () => {
    api.read.mockResolvedValue({ ...initial, enabled: true, authorizationVersion: 4 });
    api.availability.mockResolvedValue({ enabled: false, allowedIntervals: [] });
    api.set.mockResolvedValue({ ...initial, authorizationVersion: 5 });
    await settle();
    expect(store.canDisable()).toBe(true);
    const healthCalls = api.availability.mock.calls.length;
    await store.setEnabled(false);
    expect(api.availability).toHaveBeenCalledTimes(healthCalls);
    expect(api.set).toHaveBeenCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      false,
      15,
      4,
    );
    expect(store.schedule()?.enabled).toBe(false);
  });
  it('startet bei Doppel-Klick nur eine Änderung', async () => {
    await settle();
    const write = deferred<MarketplaceSyncSchedule>();
    api.set.mockReturnValueOnce(write.promise);
    const first = store.setEnabled(true);
    const second = store.setEnabled(true);
    await settle();
    expect(api.set).toHaveBeenCalledTimes(1);
    write.resolve({ ...initial, enabled: true, authorizationVersion: 1 });
    await Promise.all([first, second]);
  });
  it('verbirgt alte Daten sofort und verwirft verspätete Writes nach Workspacewechsel', async () => {
    await settle();
    const write = deferred<MarketplaceSyncSchedule>();
    api.set.mockReturnValueOnce(write.promise);
    const pending = store.setEnabled(true);
    await settle();
    workspace.set({ id: 'foreign-workspace' });
    expect(store.schedule()).toBeNull();
    expect(store.canEnable()).toBe(false);
    await settle();
    write.resolve({ ...initial, enabled: true, authorizationVersion: 1 });
    await pending;
    expect(store.schedule()).toBeNull();
  });
  it('verwirft verspätete Reads nach Konto- oder Nutzerwechsel', async () => {
    const read = deferred<MarketplaceSyncSchedule>();
    api.read.mockReturnValueOnce(read.promise);
    await settle();
    api.read.mockResolvedValue({ ...initial, connectionId: accountB.connectionId });
    store.account.set(accountB);
    await settle();
    read.resolve(initial);
    await settle();
    expect(store.schedule()?.connectionId).toBe(accountB.connectionId);
    user.set(null);
    expect(store.schedule()).toBeNull();
  });
  it('aktiviert pausierte oder nicht angemeldete Verbindungen nicht', async () => {
    for (const status of ['paused', 'blocked', 'needs_login'] as const) {
      store.account.set({ ...accountA, status } as MarketplaceConnection);
      await settle();
      expect(store.canEnable()).toBe(false);
      await store.setEnabled(true);
    }
    expect(api.set).not.toHaveBeenCalled();
  });
  it('wiederholt eine unbestätigte Änderung erst nach bestätigtem Neuladen', async () => {
    await settle();
    api.set.mockRejectedValueOnce(new MarketplaceSyncScheduleError('conflict'));
    await store.setEnabled(true);
    expect(store.error()).toContain('geändert');
    expect(store.accessDenied()).toBe(false);
    expect(store.schedule()).toEqual(initial);
    expect(store.canEnable()).toBe(false);
    await store.setEnabled(true);
    expect(api.set).toHaveBeenCalledTimes(1);
    api.read.mockResolvedValueOnce({ ...initial, authorizationVersion: 4 });
    await store.reload();
    await store.setEnabled(true);
    expect(api.set).toHaveBeenLastCalledWith(
      { workspaceId: accountA.workspaceId, connectionId: accountA.connectionId },
      true,
      15,
      4,
    );
  });
  it('verwirft die Healthantwort einer Aktivierung nach Kontowechsel vor jedem Schreibaufruf', async () => {
    await settle();
    const health = deferred<{ enabled: boolean; allowedIntervals: readonly number[] }>();
    api.availability.mockReturnValueOnce(health.promise);
    const activation = store.setEnabled(true);
    api.read.mockResolvedValueOnce({ ...initial, connectionId: accountB.connectionId });
    store.account.set(accountB);
    await settle();
    health.resolve({ enabled: true, allowedIntervals: [15] });
    await activation;
    expect(api.set).not.toHaveBeenCalled();
    expect(store.schedule()?.connectionId).toBe(accountB.connectionId);
  });
  it('verbirgt den Stand beim Rechteentzug oder Archivieren des Workspaces sofort', async () => {
    await settle();
    store.manageAllowed.set(false);
    expect(store.schedule()).toBeNull();
    expect(store.canDisable()).toBe(false);
    await settle();
    store.manageAllowed.set(true);
    await settle();
    workspace.set({ id: accountA.workspaceId, archived_at: '2026-10-01T12:00:00Z' });
    expect(store.schedule()).toBeNull();
    expect(store.canEnable()).toBe(false);
  });
});

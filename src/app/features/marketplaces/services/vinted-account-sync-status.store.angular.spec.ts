import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketplaceFixtures } from '../testing/marketplace-fixtures';
import { MarketplaceSyncScheduleApiService } from './marketplace-sync-schedule-api.service';
import { VintedAccountSyncStatusStore } from './vinted-account-sync-status.store';

const account = {
  ...createMarketplaceFixtures().connections[0],
  executionMode: 'cloud' as const,
  status: 'connected' as const,
};
const schedule = {
  workspaceId: account.workspaceId,
  connectionId: account.connectionId,
  enabled: false,
  intervalMinutes: 15 as const,
  nextDueAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  pausedReason: 'needs_login' as const,
  retryAfter: null,
  authorizationVersion: 1,
};
const api = { read: vi.fn() };

describe('Abrufzustand der Cloud-Konten', () => {
  beforeEach(() => {
    api.read.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: MarketplaceSyncScheduleApiService, useValue: api }],
    });
  });

  it('liest nur verbundene Cloud-Konten und merkt sich deren Abrufzustand', async () => {
    api.read.mockResolvedValue(schedule);
    const store = TestBed.inject(VintedAccountSyncStatusStore);
    await store.refresh([
      account,
      { ...account, connectionId: 'local', executionMode: 'local' },
      { ...account, connectionId: 'paused', status: 'paused' },
    ]);
    expect(api.read).toHaveBeenCalledTimes(1);
    expect(store.schedule(account.connectionId)?.pausedReason).toBe('needs_login');
    expect(store.schedule('local')).toBeNull();
  });

  it('zeigt nach einem Lesefehler keinen Abrufzustand statt eines falschen', async () => {
    api.read.mockRejectedValue(new Error('kein Zugriff'));
    const store = TestBed.inject(VintedAccountSyncStatusStore);
    await store.refresh([account]);
    expect(store.schedule(account.connectionId)).toBeNull();
  });

  it('lässt einen älteren Abruf den neueren Stand nicht überschreiben', async () => {
    let finishFirst: (value: typeof schedule) => void = () => undefined;
    api.read.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)));
    api.read.mockResolvedValueOnce({ ...schedule, pausedReason: null, enabled: true });
    const store = TestBed.inject(VintedAccountSyncStatusStore);
    const first = store.refresh([account]);
    await store.refresh([account]);
    finishFirst(schedule);
    await first;
    expect(store.schedule(account.connectionId)?.pausedReason).toBeNull();
  });
});

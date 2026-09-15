import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SniperAdminState } from './sniper-admin-state';
import { SniperAdminService } from './sniper-admin.service';

describe('SniperAdminState', () => {
  const api = { list: vi.fn(), runtime: vi.fn(), counts: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T16:00:00Z'));
    api.list.mockReset().mockResolvedValue([]);
    api.runtime.mockReset().mockResolvedValue({
      id: 1,
      reported_at: new Date().toISOString(),
      requests_last_minute: 3,
      rejected_last_minute: 1,
      request_budget: 30,
      last_cycle_error: null,
      vinted_connected_since: '2026-09-12T15:00:00.000Z',
      vinted_last_success_at: '2026-09-12T15:59:00.000Z',
    });
    api.counts.mockReset().mockResolvedValue({});
    TestBed.configureTestingModule({
      providers: [SniperAdminState, { provide: SniperAdminService, useValue: api }],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('shows an old heartbeat as unconfirmed and recovers from temporary read errors', async () => {
    const state = TestBed.inject(SniperAdminState);
    await state.refresh();
    expect(state.stale()).toBe(false);
    api.list.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.error()).toBe('offline');
    expect(state.loaded()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.error()).toBeNull();
    await vi.advanceTimersByTimeAsync(110_000);
    expect(state.stale()).toBe(true);
    expect(state.vintedUptimeSeconds()).toBeNull();
  });

  it('counts the server-reported Vinted connection uptime independently of page navigation', async () => {
    const state = TestBed.inject(SniperAdminState);
    await state.refresh();

    expect(state.vintedUptimeSeconds()).toBe(3600);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.vintedUptimeSeconds()).toBe(3605);
  });

  it('does not show a runtime when the bot has no current Vinted connection', async () => {
    api.runtime.mockResolvedValue({
      id: 1,
      reported_at: new Date().toISOString(),
      requests_last_minute: 0,
      rejected_last_minute: 0,
      request_budget: 30,
      last_cycle_error: null,
      vinted_connected_since: null,
      vinted_last_success_at: null,
    });
    const state = TestBed.inject(SniperAdminState);

    await state.refresh();

    expect(state.vintedUptimeSeconds()).toBeNull();
  });

  it('does not overlap slow reads and fetches again after a mutation', async () => {
    let finish!: (rows: []) => void;
    api.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const state = TestBed.inject(SniperAdminState);
    const refresh = state.refresh();
    const afterMutation = state.refreshAfterMutation();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.list).toHaveBeenCalledTimes(1);
    finish([]);
    await refresh;
    await afterMutation;
    expect(api.list).toHaveBeenCalledTimes(2);
    TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('does not update a destroyed page from a late response', async () => {
    let finish!: (rows: []) => void;
    api.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const state = TestBed.inject(SniperAdminState);
    const pending = state.refresh();
    TestBed.resetTestingModule();
    finish([]);
    await pending;
    expect(state.loaded()).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { MarketplaceSyncScheduleApiService } from './marketplace-sync-schedule-api.service';

const scope = {
  workspaceId: '25000000-0000-4000-8000-000000000011',
  connectionId: '25000000-0000-4000-8000-000000000021',
};
const schedule = {
  ...scope,
  enabled: false,
  intervalMinutes: 15,
  nextDueAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  pausedReason: null,
  retryAfter: null,
  authorizationVersion: 0,
};
let api: MarketplaceSyncScheduleApiService;
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  rpc = vi.fn().mockResolvedValue({ data: schedule, error: null });
  TestBed.configureTestingModule({
    providers: [
      MarketplaceSyncScheduleApiService,
      { provide: SupabaseService, useValue: { client: { rpc } } },
    ],
  });
  api = TestBed.inject(MarketplaceSyncScheduleApiService);
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('Zeitplan-API', () => {
  it('begrenzt einen hängenden Healthcheck und bricht die Anfrage ab', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal('fetch', fetchMock);
    const pending = api.availability();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(settled).toBe(true);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(await pending).toEqual({ enabled: false, allowedIntervals: [] });
  });
  it('liest und widerruft einen kontogebundenen Stand ohne Browserstart oder gespeichertes Zugangstoken', async () => {
    expect(await api.read(scope)).toEqual(schedule);
    expect(rpc).toHaveBeenLastCalledWith('marketplace_read_sync_schedule', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
    });
    await api.set(scope, false, 15, 0);
    expect(rpc).toHaveBeenLastCalledWith('marketplace_set_sync_schedule', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_enabled: false,
      p_interval_minutes: 15,
      p_authorization_version: 0,
    });
  });
  it('zeigt CAS-Konflikte und fehlende Migration verständlich ohne interne Details', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'secret' } });
    await expect(api.set(scope, true, 15, 0)).rejects.toThrow('geändert');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'secret' } });
    await expect(api.read(scope)).rejects.toThrow('noch nicht verfügbar');
  });
  it('erkennt nur echten JSON-Health und bleibt bei HTML, Offline oder altem Worker ausgeschaltet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, readOnly: false, apiVersion: 2 }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await api.availability()).enabled).toBe(false);
    fetchMock.mockResolvedValueOnce(
      new Response('<html>offline</html>', { headers: { 'content-type': 'text/html' } }),
    );
    expect((await api.availability()).enabled).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect((await api.availability()).enabled).toBe(false);
  });
});

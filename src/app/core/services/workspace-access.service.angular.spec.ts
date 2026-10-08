import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceAccess, WorkspaceAccessService } from './workspace-access.service';

const activeAccess: WorkspaceAccess = {
  workspace_id: 'workspace-1',
  access_status: 'active',
  ends_at: null,
  server_time: '2026-10-08T08:00:00.000Z',
};

function setupService() {
  const rpc = vi.fn().mockResolvedValue({ data: [activeAccess], error: null });
  const navigate = vi.fn().mockResolvedValue(true);
  const currentUser = signal<{ id: string } | null>({ id: 'admin-1' });
  const channel = {
    topic: 'realtime:workspace:workspace-1:access',
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser } },
      { provide: Router, useValue: { navigate } },
      {
        provide: SupabaseService,
        useValue: {
          client: { rpc, channel: () => channel, removeChannel: vi.fn() },
        },
      },
    ],
  });
  const service = TestBed.inject(WorkspaceAccessService);
  TestBed.tick();
  return { service, rpc, navigate, currentUser };
}

describe('WorkspaceAccessService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(activeAccess.server_time));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('behält beim Tabwechsel nach einem Prüfungsfehler den bestätigten Zugang ohne Beta-Umleitung', async () => {
    const { service, rpc, navigate } = setupService();
    await service.refresh();
    service.select(activeAccess.workspace_id);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(navigate).not.toHaveBeenCalled();
    expect(service.access()).toEqual([activeAccess]);
    expect(service.error()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(5000);
    expect(service.error()).toBeNull();
    expect(service.access()).toEqual([activeAccess]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('meldet auch eine geworfene Ausnahme und wiederholt die Prüfung ohne Beta-Umleitung', async () => {
    const { service, rpc, navigate } = setupService();
    await service.refresh();
    service.select(activeAccess.workspace_id);
    rpc.mockRejectedValueOnce(new Error('offline'));

    await expect(service.refresh()).rejects.toThrow();

    expect(service.error()).not.toBeNull();
    expect(service.access()).toEqual([activeAccess]);
    expect(navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(service.error()).toBeNull();
  });

  it('leitet nach einem Prüfungsfehler bei anschließend bestätigtem Beta-Ende weiterhin um', async () => {
    const { service, rpc, navigate } = setupService();
    await service.refresh();
    service.select(activeAccess.workspace_id);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(service.refresh()).rejects.toThrow();
    rpc.mockResolvedValueOnce({
      data: [{ ...activeAccess, access_status: 'ended' }],
      error: null,
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/beta-ended']);
    expect(service.access()[0]?.access_status).toBe('ended');
  });

  it('leitet bei erfolgreich bestätigtem Verlust aller Zugänge um', async () => {
    const { service, rpc, navigate } = setupService();
    await service.refresh();
    service.select(activeAccess.workspace_id);
    rpc.mockResolvedValueOnce({ data: [], error: null });

    await service.refresh();

    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/beta-ended']);
  });

  it('wechselt bei bestätigtem Ablauf zum weiteren aktiven Workspace', async () => {
    const { service, rpc, navigate } = setupService();
    await service.refresh();
    service.select(activeAccess.workspace_id);
    rpc.mockResolvedValueOnce({
      data: [
        { ...activeAccess, access_status: 'expired' },
        { ...activeAccess, workspace_id: 'workspace-2' },
      ],
      error: null,
    });

    await service.refresh();

    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/dashboard']);
  });

  it('verwirft einen verspäteten Prüfungsfehler nach dem Abmelden', async () => {
    const { service, rpc, navigate, currentUser } = setupService();
    await service.refresh();
    service.select(activeAccess.workspace_id);
    let rejectRequest: (reason: Error) => void = () => undefined;
    rpc.mockImplementationOnce(() => new Promise((_resolve, reject) => (rejectRequest = reject)));
    const pending = service.refresh();
    currentUser.set(null);
    TestBed.tick();
    rejectRequest(new Error('offline'));

    await expect(pending).resolves.toEqual([]);
    expect(service.error()).toBeNull();
    expect(service.access()).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { KleinanzeigenListingJobService } from './kleinanzeigen-listing-job.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { kleinanzeigenJobFixture } from '../../../../../supabase/test-support/kleinanzeigen-job-fixture';
const job = kleinanzeigenJobFixture();
const scope = {
  workspaceId: job.workspaceId,
  connectionId: job.connectionId,
  externalAccountId: '88',
  generation: 2,
  accountType: 'private' as const,
};
function fixture() {
  const auth = { currentUser: signal<{ id: string } | null>({ id: job.requestedBy }) };
  const workspace = {
    currentWorkspace: signal({ id: job.workspaceId, archived_at: null as string | null }),
  };
  const invoke = vi.fn();
  const bridge = {
    capabilities: signal({ accounts: true, sync: true, publish: true }),
    quotaAvailable: signal(true),
    status: vi.fn().mockResolvedValue({
      ...scope,
      canPublish: true,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      status: 'needs_login',
    }),
    refreshQuota: vi.fn().mockResolvedValue({
      ...scope,
      quota: { used: 99, reserved: 0, allowed: true, reason: null },
    }),
    runJob: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      KleinanzeigenListingJobService,
      { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      { provide: AuthService, useValue: auth },
      { provide: WorkspaceService, useValue: workspace },
      { provide: KleinanzeigenExtensionBridge, useValue: bridge },
    ],
  });
  return {
    service: TestBed.inject(KleinanzeigenListingJobService),
    auth,
    workspace,
    invoke,
    bridge,
  };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});
describe('Dauerhafter Kleinanzeigen-Auftrag', () => {
  it('zeigt auch einen erlaubten Auftrag eines Teammitglieds ohne dessen Freigabe zu übernehmen', async () => {
    const f = fixture();
    f.invoke.mockResolvedValue({
      data: { ...job, requestedBy: '51000000-0000-4000-8000-000000000002' },
      error: null,
    });
    expect((await f.service.latest(scope, job.draftId))?.id).toBe(job.id);
    expect(f.bridge.runJob).not.toHaveBeenCalled();
  });
  it('prüft einen begonnenen Versuch nach Freigabewechsel mit seiner ursprünglichen Generation nur lesend', async () => {
    const f = fixture();
    f.bridge.status.mockResolvedValue(null);
    f.invoke.mockResolvedValue({
      data: { ...job, state: 'outcome_unknown', version: 4 },
      error: null,
    });
    const newer = { ...scope, generation: 3 };
    await f.service.reconcile(newer, job.id);
    expect(f.bridge.runJob).toHaveBeenCalledWith(
      expect.objectContaining({ generation: 2 }),
      job.id,
      'reconcile',
    );
    expect(f.bridge.refreshQuota).not.toHaveBeenCalled();
  });

  it('nimmt nach Verbindungsabbruch denselben offenen Auftrag wieder auf, ohne sein Kontingent doppelt zu reservieren', async () => {
    const f = fixture();
    f.invoke.mockResolvedValue({ data: job, error: null });
    const result = await f.service.enqueue(scope, job.draftId, 4, crypto.randomUUID());
    expect(result?.id).toBe(job.id);
    expect(f.bridge.refreshQuota).not.toHaveBeenCalled();
    expect(f.invoke.mock.calls.map((call) => call[1].body.action)).toEqual([
      'listing_latest',
      'listing_status',
    ]);
    expect(f.bridge.runJob).toHaveBeenCalledWith(scope, job.id, 'publish');
  });
  it('legt erst nach frischer Kontingentprüfung einen Auftrag an und liest den tatsächlichen Serverstatus', async () => {
    const f = fixture();
    f.invoke
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: job, error: null })
      .mockResolvedValueOnce({
        data: { ...job, state: 'needs_user_action', version: 2, errorCode: 'fees_due' },
        error: null,
      });
    const result = await f.service.enqueue(scope, job.draftId, 4, crypto.randomUUID());
    expect(f.bridge.refreshQuota).toHaveBeenCalledOnce();
    expect(result?.state).toBe('needs_user_action');
    expect(f.service.job()?.state).toBe('needs_user_action');
    expect(f.invoke.mock.calls[1][1].body).toMatchObject({
      action: 'listing_enqueue',
      draftId: job.draftId,
      expectedRevision: 4,
    });
  });
  it('stoppt vor der Annahme bei ausgeschöpftem oder unbekanntem Kontingent', async () => {
    const f = fixture();
    f.invoke.mockResolvedValue({ data: null, error: null });
    f.bridge.refreshQuota.mockResolvedValue({
      quota: { used: 100, reserved: 0, allowed: false, reason: 'quota_exhausted' },
    });
    await expect(f.service.enqueue(scope, job.draftId, 4, crypto.randomUUID())).rejects.toThrow(
      'Kontingent',
    );
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.bridge.runJob).not.toHaveBeenCalled();
  });
  it('startet bei unklarem Ausgang ausschließlich die Ergebnisprüfung', async () => {
    const f = fixture();
    const unknown = {
      ...job,
      state: 'outcome_unknown',
      version: 3,
      errorCode: 'publication_unconfirmed',
    };
    f.invoke.mockResolvedValue({ data: unknown, error: null });
    await f.service.enqueue(scope, job.draftId, 4, crypto.randomUUID());
    expect(f.bridge.runJob).toHaveBeenCalledWith(scope, job.id, 'reconcile');
    expect(f.bridge.refreshQuota).not.toHaveBeenCalled();
  });
  it('verwirft späte Antworten nach Abmeldung und leert die Ansicht', async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.invoke.mockImplementation(() => new Promise((done) => (resolve = done)));
    const pending = f.service.latest(scope, job.draftId);
    await Promise.resolve();
    f.auth.currentUser.set(null);
    TestBed.flushEffects();
    resolve({ data: job, error: null });
    await expect(pending).rejects.toThrow('Anmeldung');
    expect(f.service.job()).toBeNull();
  });
  it('verwirft fremde oder rückwärts laufende Auftragsstände', async () => {
    const f = fixture();
    f.invoke
      .mockResolvedValueOnce({ data: { ...job, version: 3, state: 'writing' }, error: null })
      .mockResolvedValueOnce({ data: { ...job, version: 2, state: 'claimed' }, error: null });
    await f.service.load(scope, job.id);
    await f.service.load(scope, job.id);
    expect(f.service.job()?.version).toBe(3);
    f.invoke.mockResolvedValue({ data: { ...job, connectionId: '10' }, error: null });
    await expect(f.service.load(scope, job.id)).rejects.toThrow('Auftrag');
  });
  it('pollt nur sichtbare aktuelle Aufträge und beendet Timer beim Schließen', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.invoke.mockResolvedValue({ data: job, error: null });
    await f.service.latest(scope, job.draftId);
    const calls = f.invoke.mock.calls.length;
    f.service.cancel();
    await vi.advanceTimersByTimeAsync(20000);
    expect(f.invoke).toHaveBeenCalledTimes(calls);
    expect(f.service.job()).toBeNull();
  });
});

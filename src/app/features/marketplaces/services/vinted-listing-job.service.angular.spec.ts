import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedListingJobService } from './vinted-listing-job.service';
import { emptyVintedListingContent } from '../models/vinted-listing-content';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import { parseVintedListingJob } from '../models/vinted-listing-job';

const draft: VintedListingDraft = {
  id: '9007199254740998',
  workspaceId: 'workspace-a',
  connectionId: '46300000-0000-4000-8000-000000000021',
  revision: 3,
  content: emptyVintedListingContent(),
  images: [],
  inventoryItemId: null,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
};
const body = {
  id: '9007199254740999',
  workspaceId: draft.workspaceId,
  connectionId: draft.connectionId,
  draftId: draft.id,
  draftRevision: 3,
  executionMode: 'local',
  externalAccountId: '46301',
  action: 'publish',
  state: 'queued',
  version: 1,
  scheduledAt: '2026-10-10T12:00:00Z',
  timeZone: 'Europe/Berlin',
  latePolicy: 'pause_after_30_minutes',
  errorCode: null,
  externalId: null,
  providerState: null,
  verifiedAt: null,
  replacesJobId: null,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
};
const intent = {
  requestId: '46300000-0000-4000-8000-000000000037',
  action: 'publish' as const,
  aiPhoto: false,
  schedule: {
    scheduledAt: body.scheduledAt,
    timeZone: body.timeZone,
    latePolicy: 'pause_after_30_minutes' as const,
  },
};
afterEach(() => TestBed.resetTestingModule());
function api(rpc: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
  });
  return TestBed.inject(VintedListingJobService);
}
describe('Vinted-Inseratauftragservice', () => {
  it('ändert den Termin ohne Foto- oder Aktionseinstellungen im Client neu zu setzen', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...body, id: '9007199254741000', replacesJobId: body.id },
      error: null,
    });
    const service = api(rpc),
      job = parseVintedListingJob(body, draft.workspaceId);
    await service.reschedule(job, draft, intent.requestId, intent.schedule);
    expect(rpc.mock.calls[0]).toEqual([
      'marketplace_reschedule_listing',
      {
        p_job_id: job.id,
        p_expected_version: job.version,
        p_expected_revision: draft.revision,
        p_request_id: intent.requestId,
        p_scheduled_at: body.scheduledAt,
        p_time_zone: body.timeZone,
        p_late_policy: body.latePolicy,
      },
    ]);
    rpc.mockClear();
    for (const change of [
      { state: 'writing' as const },
      { connectionId: null },
      { scheduledAt: null },
    ])
      await expect(
        service.reschedule({ ...job, ...change }, draft, intent.requestId, intent.schedule),
      ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('sendet die unveränderte Anfragenkennung und Textkennungen auch beim Wiederholen', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: body, error: null });
    const service = api(rpc);
    expect((await service.enqueue(draft, intent)).state).toBe('queued');
    await service.enqueue(draft, intent);
    expect(rpc.mock.calls[0]).toEqual([
      'marketplace_enqueue_listing',
      {
        p_draft_id: draft.id,
        p_expected_revision: 3,
        p_action: 'publish',
        p_request_id: intent.requestId,
        p_ai_photo: false,
        p_scheduled_at: body.scheduledAt,
        p_time_zone: body.timeZone,
        p_late_policy: 'pause_after_30_minutes',
      },
    ]);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
  it('verwendet für Planungsersatz eine einzige revisions- und versionsgebundene Funktion', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...body, id: '9007199254741000', replacesJobId: body.id },
      error: null,
    });
    await api(rpc).replace(parseVintedListingJob(body, draft.workspaceId), draft, intent);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('marketplace_replace_planned_listing');
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_job_id: body.id,
      p_expected_version: 1,
      p_expected_revision: 3,
      p_request_id: intent.requestId,
    });
  });
  it('verwirft falsche Kontexte, Aktionen und Revisionen einer Auftragsantwort', async () => {
    for (const change of [
      { workspaceId: 'workspace-b' },
      { draftId: '42' },
      { draftRevision: 2 },
      { action: 'vinted_draft' },
      { scheduledAt: '2026-10-11T12:00:00Z' },
      { timeZone: 'UTC' },
    ]) {
      const rpc = vi.fn().mockResolvedValue({ data: { ...body, ...change }, error: null });
      await expect(api(rpc).enqueue(draft, intent)).rejects.toThrow();
      TestBed.resetTestingModule();
    }
  });
  it('erhält Versionskonflikte beim Abbrechen und akzeptiert keinen anderen Auftrag', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } })
      .mockResolvedValueOnce({ data: { ...body, id: '42', state: 'cancelled' }, error: null });
    const service = api(rpc),
      job = parseVintedListingJob(body, draft.workspaceId);
    await expect(service.cancel(job)).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.cancel(job)).rejects.toThrow();
    expect(rpc.mock.calls[0][1]).toEqual({ p_job_id: body.id, p_expected_version: 1 });
  });
  it('verwirft doppelte Verlaufseinträge und sendet keine Aktion ohne Zielkonto', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { items: [body, body] }, error: null });
    const service = api(rpc);
    await expect(service.list(draft.workspaceId, draft.id)).rejects.toThrow();
    rpc.mockClear();
    await expect(service.enqueue({ ...draft, connectionId: null }, intent)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('fragt Inseratrechte gesondert mit der erwarteten Anbieteridentität an', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: true, executionMode: 'local', authorizationVersion: 1 },
      error: null,
    });
    expect((await api(rpc).approve(draft.workspaceId, draft.connectionId!, '46301')).allowed).toBe(
      true,
    );
    expect(rpc.mock.calls[0]).toEqual([
      'marketplace_approve_listings',
      {
        p_workspace_id: draft.workspaceId,
        p_connection_id: draft.connectionId,
        p_expected_external_account_id: '46301',
      },
    ]);
  });
});

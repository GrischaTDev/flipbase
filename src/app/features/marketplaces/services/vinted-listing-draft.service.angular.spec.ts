import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedListingDraftService } from './vinted-listing-draft.service';
import { emptyVintedListingContent } from '../models/vinted-listing-content';
const body = {
  id: '9007199254740999',
  workspaceId: 'workspace-a',
  connectionId: null,
  revision: 1,
  content: {},
  images: [],
  inventoryItemId: null,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
};
afterEach(() => TestBed.resetTestingModule());
describe('Vinted-Entwurfservice', () => {
  it('uses the creation date for stable pagination and keeps the server order', async () => {
    const nextCursor = { id: body.id, createdAt: body.createdAt };
    const newerDraft = {
      ...body,
      id: '9007199254741000',
      createdAt: '2026-10-10T12:00:00Z',
      updatedAt: '2026-10-10T12:00:00Z',
    };
    const rpc = vi.fn().mockResolvedValue({
      data: {
        items: [newerDraft, { ...body, updatedAt: '2026-10-20T12:00:00Z' }],
        nextCursor: { ...nextCursor, updatedAt: '2026-10-20T12:00:00Z' },
      },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const page = await api.list('workspace-a', 'Jacke');
    expect(page.items.map((draft) => draft.id)).toEqual([newerDraft.id, body.id]);
    expect(page.nextCursor).toEqual(nextCursor);
    await api.list('workspace-a', 'Jacke', page.nextCursor!);
    expect(rpc).toHaveBeenLastCalledWith('marketplace_list_listing_drafts', {
      p_workspace_id: 'workspace-a',
      p_query: 'Jacke',
      p_cursor: nextCursor,
    });
  });
  it('übernimmt den jüngsten Veröffentlichungsauftrag nur für den eigenen Entwurf', async () => {
    const job = {
      id: '30',
      workspaceId: 'workspace-a',
      connectionId: '25000000-0000-4000-8000-000000000021',
      draftId: body.id,
      draftRevision: 1,
      externalAccountId: '123',
      executionMode: 'cloud',
      action: 'publish',
      state: 'failed',
      version: 2,
      scheduledAt: null,
      timeZone: null,
      latePolicy: 'pause_after_30_minutes',
      errorCode: 'provider_unavailable',
      externalId: null,
      providerState: null,
      verifiedAt: null,
      replacesJobId: null,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [
            { ...body, publication: job },
            { ...body, id: '7', publication: null },
          ],
          nextCursor: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { items: [{ ...body, id: '7', publication: job }], nextCursor: null },
        error: null,
      });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const page = await api.list('workspace-a');
    expect(page.items[0].publication).toMatchObject({ id: '30', state: 'failed' });
    expect(page.items[1].publication).toBeNull();
    await expect(api.list('workspace-a')).rejects.toThrow();
  });
  it.each([
    { id: body.id, updatedAt: body.updatedAt },
    { id: body.id, createdAt: 'not-a-date' },
    { id: Number(body.id), createdAt: body.createdAt },
  ])('rejects an invalid creation cursor: %j', async (nextCursor) => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              rpc: vi.fn().mockResolvedValue({ data: { items: [], nextCursor }, error: null }),
            },
          },
        },
      ],
    });
    await expect(TestBed.inject(VintedListingDraftService).list('workspace-a')).rejects.toThrow();
  });
  it('sends a large draft ID as text and preserves revision conflicts', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: body, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '40001' } });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const draft = await api.load('workspace-a', body.id);
    await expect(api.save(draft, emptyVintedListingContent(), null)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_id: '9007199254740999',
      p_expected_revision: 1,
    });
  });
  it('behält den Einzelrabatt bei normalen Änderungen und sendet ein ausdrückliches Zurücksetzen', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...body, content: { favoriteDiscountPercent: 12.5 } },
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const content = emptyVintedListingContent();
    const draft = await api.create('workspace-a', content, null, 'request-a', undefined, 12.5);
    expect(rpc.mock.lastCall?.[1].p_content.favoriteDiscountPercent).toBe(12.5);
    await api.save(draft, content, null);
    expect(rpc.mock.lastCall?.[1].p_content.favoriteDiscountPercent).toBe(12.5);
    await api.save(draft, content, null, null);
    expect(rpc.mock.lastCall?.[1].p_content.favoriteDiscountPercent).toBeNull();
  });
  it('rejects an old workspace response', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { rpc: vi.fn().mockResolvedValue({ data: body, error: null }) } },
        },
      ],
    });
    await expect(
      TestBed.inject(VintedListingDraftService).load('workspace-b', body.id),
    ).rejects.toThrow();
  });
  it('deletes the exact draft with its workspace and current revision', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: body, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const draft = await api.load('workspace-a', body.id);
    await expect(api.remove(draft)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenLastCalledWith('marketplace_delete_listing_draft', {
      p_workspace_id: 'workspace-a',
      p_id: body.id,
      p_expected_revision: 1,
    });
  });
  it.each([
    ['40001', 'conflict'],
    ['42501', 'forbidden'],
    ['PGRST202', 'unavailable'],
  ])('preserves deletion errors: %s', async (serverCode, clientCode) => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: body, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: serverCode } });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const draft = await api.load('workspace-a', body.id);
    await expect(api.remove(draft)).rejects.toMatchObject({ code: clientCode });
  });
  it('explains that an unresolved publication prevents deleting the draft', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: body, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '55000' } });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    const api = TestBed.inject(VintedListingDraftService);
    const draft = await api.load('workspace-a', body.id);
    await expect(api.remove(draft)).rejects.toThrow(
      'Dieser Entwurf hat noch eine geplante, laufende oder ungeklärte Veröffentlichung. Kläre den Auftrag, bevor du den Entwurf löschst.',
    );
  });
});

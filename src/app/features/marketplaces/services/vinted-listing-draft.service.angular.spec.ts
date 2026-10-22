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

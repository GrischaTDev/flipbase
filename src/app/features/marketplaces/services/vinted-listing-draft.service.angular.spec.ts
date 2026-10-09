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
});

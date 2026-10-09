import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedListingImageService } from './vinted-listing-image.service';
import { emptyVintedListingContent } from '../models/vinted-listing-content';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
const draft: VintedListingDraft = {
  id: '5',
  workspaceId: 'workspace-a',
  connectionId: null,
  revision: 1,
  content: emptyVintedListingContent(),
  images: [],
  inventoryItemId: null,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
};
beforeEach(() =>
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 20, height: 20, close: vi.fn() }),
  ),
);
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
describe('Private Vinted-Fotos', () => {
  it('rejects an unreadable image before reserving or uploading it', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Invalid image')));
    const rpc = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });
    await expect(
      TestBed.inject(VintedListingImageService).upload(
        draft,
        new File(['broken'], 'a.jpg', { type: 'image/jpeg' }),
      ),
    ).rejects.toThrow('Das Foto kann nicht gelesen werden.');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps a confirmed upload after losing the commit response', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: '7', storagePath: 'workspace-a/5/a.jpg' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'network' } })
      .mockResolvedValueOnce({ data: null, error: { code: '22023' } });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { rpc, storage: { from: () => ({ upload, remove }) } } },
        },
      ],
    });
    const api = TestBed.inject(VintedListingImageService);
    await expect(
      api.upload(draft, new File(['image'], 'a.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow();
    expect(rpc.mock.calls[2][0]).toBe('marketplace_discard_listing_image');
    expect(remove).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('cleans a rejected upload only after server approval', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: '7', storagePath: 'workspace-a/5/a.jpg' }, error: null })
      .mockResolvedValueOnce({ data: 'workspace-a/5/a.jpg', error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              rpc,
              storage: {
                from: () => ({
                  upload: vi.fn().mockResolvedValue({ error: { message: 'failed' } }),
                  remove,
                }),
              },
            },
          },
        },
      ],
    });
    await expect(
      TestBed.inject(VintedListingImageService).upload(
        draft,
        new File(['image'], 'a.jpg', { type: 'image/jpeg' }),
      ),
    ).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith(['workspace-a/5/a.jpg']);
  });
});

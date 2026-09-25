import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaService } from '../../../core/services/media.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { ListingEditorItem, ListingImageDraft } from '../models/listing.models';
import { ListingImagesService } from './listing-images.service';

function query<T>(data: T) {
  const result = { data, error: null };
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

const item: ListingEditorItem = {
  id: 'item-1',
  workspaceId: 'workspace-1',
  title: 'Artikel',
  brand: null,
  category: null,
  condition: 'used',
  conditionNotes: null,
  description: null,
  status: 'ready',
  archivedAt: null,
  expectedValue: null,
  allocatedPurchaseCost: null,
  media: [
    {
      id: 'media-1',
      inventory_item_id: 'item-1',
      storage_path: 'item-1/first.jpg',
      is_primary: true,
      file_name: 'first.jpg',
      file_size: 4,
      mime_type: 'image/jpeg',
      sort_order: 0,
      created_at: '2026-09-24T00:00:00Z',
    },
  ],
};

describe('ListingImagesService', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const insert = vi.fn((_values: object) => query(null));
    const updateImage = vi.fn((_values: object) => query(null));
    const updateListing = vi.fn((_values: object) => query(null));
    const upload = vi.fn(async () => ({ error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const table = {
      select: vi.fn(() => query([])),
      insert,
      update: updateImage,
      delete: vi.fn(() => query(null)),
    };
    const from = vi.fn((name: string) =>
      name === 'listing_images' ? table : { update: updateListing },
    );
    TestBed.configureTestingModule({
      providers: [
        ListingImagesService,
        {
          provide: SupabaseService,
          useValue: { client: { from, storage: { from: () => ({ upload, remove }) } } },
        },
        { provide: MediaService, useValue: { resolveMediaUrls: vi.fn(async () => ({})) } },
      ],
    });
    return { service: TestBed.inject(ListingImagesService), insert, updateListing, upload };
  }

  it('saves the selected order and keeps it independent from the article gallery', async () => {
    const { service, insert, updateListing, upload } = setup();
    const drafts: ListingImageDraft[] = [
      {
        key: 'new',
        storagePath: null,
        file: new File(['photo'], 'extra.jpg', { type: 'image/jpeg' }),
        fileName: 'extra.jpg',
        previewUrl: '',
      },
      {
        key: 'source',
        storagePath: 'item-1/first.jpg',
        file: null,
        fileName: 'first.jpg',
        previewUrl: '',
      },
    ];

    const saved = await service.save('listing-1', 'workspace-1', drafts);

    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ sort_order: 0, file_name: 'extra.jpg' });
    expect(insert.mock.calls[1]?.[0]).toMatchObject({
      sort_order: 1,
      storage_path: 'item-1/first.jpg',
    });
    expect(saved[0]?.file).toBeNull();
    expect(updateListing).toHaveBeenCalledWith({ image_selection_saved: true });
  });

  it('preserves an intentionally empty gallery', async () => {
    const { service, updateListing } = setup();

    await service.save('listing-1', 'workspace-1', []);
    const paths = await service.pathsForListing('listing-1', item, true);

    expect(updateListing).toHaveBeenCalledWith({ image_selection_saved: true });
    expect(paths).toEqual([]);
  });
});

import { parseMarketplacePage } from '../models/marketplace-response';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';
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
  it('loads only each draft main image in one request and keeps partial failures as placeholders', async () => {
    const firstImage = {
      id: '7',
      storagePath: 'workspace-a/5/7.jpg',
      fileName: 'main.jpg',
      mimeType: 'image/jpeg' as const,
      byteSize: 8,
    };
    const first = {
      ...draft,
      images: [firstImage, { ...firstImage, id: '8', storagePath: 'workspace-a/5/8.jpg' }],
    };
    const second = {
      ...draft,
      id: '6',
      images: [{ ...firstImage, id: '9', storagePath: 'workspace-a/6/9.jpg' }],
    };
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        { path: firstImage.storagePath, signedUrl: 'https://example.test/main', error: null },
        { path: second.images[0].storagePath, signedUrl: '', error: 'Image unavailable' },
      ],
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { storage: { from: () => ({ createSignedUrls }) } } },
        },
      ],
    });
    const urls = await TestBed.inject(VintedListingImageService).thumbnailUrls([
      first,
      second,
      { ...draft, id: '10' },
    ]);
    expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith(
      ['workspace-a/5/7.jpg', 'workspace-a/6/9.jpg'],
      3600,
    );
    expect([...urls]).toEqual([['5', 'https://example.test/main']]);
  });
  it('does not request storage access for drafts without photos', async () => {
    const from = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { storage: { from } } } }],
    });
    expect(await TestBed.inject(VintedListingImageService).thumbnailUrls([draft])).toEqual(
      new Map(),
    );
    expect(from).not.toHaveBeenCalled();
  });
  it('liest beim Umbenennen nur das eigene gespeicherte Foto und erhält seine Bytes', async () => {
    const download = vi
      .fn()
      .mockResolvedValue({ data: new Blob(['original'], { type: 'image/jpeg' }), error: null });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { storage: { from: () => ({ download }) } } },
        },
      ],
    });
    const current: VintedListingDraft = {
      ...draft,
      images: [
        {
          id: '7',
          storagePath: 'workspace-a/5/7.jpg',
          fileName: 'alt.jpg',
          mimeType: 'image/jpeg',
          byteSize: 8,
        },
      ],
    };
    const file = await TestBed.inject(VintedListingImageService).renamedFile(
      current,
      '7',
      'neu.jpg',
    );
    expect(file.name).toBe('neu.jpg');
    expect(file.size).toBe(8);
    expect(download).toHaveBeenCalledWith('workspace-a/5/7.jpg');
    await expect(
      TestBed.inject(VintedListingImageService).renamedFile(current, '8', 'fremd.jpg'),
    ).rejects.toThrow();
    expect(download).toHaveBeenCalledTimes(1);
  });
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

describe('Gesicherte Inseratoriginale', () => {
  function originalService(connectionId = 'account-a') {
    const image = {
      id: '7',
      storagePath: 'workspace-a/5/original.jpg',
      fileName: 'Original.jpg',
      mimeType: 'image/jpeg',
      byteSize: 123,
    };
    const saved = { ...draft, connectionId, images: [image] };
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { items: [{ externalId: '98765', draft: saved }] }, error: null });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [
        {
          path: image.storagePath,
          signedUrl: 'https://private.example.test/original',
          error: null,
        },
      ],
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { rpc, storage: { from: () => ({ createSignedUrls }) } } },
        },
      ],
    });
    return { service: TestBed.inject(VintedListingOriginalPhotoService), rpc, image };
  }
  it('verwendet für einen späteren Relist die gesicherte Datei statt des Anbieterbildes', async () => {
    const f = originalService();
    const photos = await f.service.read(
      { workspaceId: 'workspace-a', connectionId: 'account-a' },
      '98765',
    );
    expect(photos?.[0].storagePath).toBe(f.image.storagePath);
    expect(photos?.[0].previewUrl).toBe('https://private.example.test/original');
    expect(f.rpc).toHaveBeenCalledWith(
      'marketplace_read_listing_photo_sources',
      expect.objectContaining({ p_external_ids: ['98765'] }),
    );
  });
  it('lehnt Originale einer anderen Kontozuordnung ab', async () => {
    const f = originalService('account-b');
    await expect(
      f.service.read({ workspaceId: 'workspace-a', connectionId: 'account-a' }, '98765'),
    ).rejects.toThrow('gewählten Konto');
  });
  it('liefert ohne bisherige Sicherung ausdrücklich keine erfundenen Originale', async () => {
    const f = originalService();
    f.rpc.mockResolvedValueOnce({ data: { items: [] }, error: null });
    expect(
      await f.service.read({ workspaceId: 'workspace-a', connectionId: 'account-a' }, '98765'),
    ).toBeNull();
  });
  it('zeigt nach einem Anbieterabgleich weiter die private Originalgalerie', async () => {
    const f = originalService();
    const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
    const page = parseMarketplacePage(
      {
        items: [
          {
            ...scope,
            id: 'listing-1',
            externalId: '98765',
            title: 'Jacke',
            imageUrl: 'https://vinted.example/bordered.jpg',
            imageUrls: ['https://vinted.example/bordered.jpg'],
          },
        ],
        total: 1,
        nextCursor: null,
      },
      scope,
    );
    const entries = await f.service.entries(scope, page.items);
    expect(entries[0].imageUrl).toBe('https://private.example.test/original');
    expect(entries[0].imageUrls).toEqual(['https://private.example.test/original']);
    expect(page.items[0].imageUrl).toBe('https://vinted.example/bordered.jpg');
  });
});

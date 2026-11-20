import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { ListingImageDraft } from '../../../shared/components/listing-image-editor/listing-image-draft';
import { VintedListingPhotoSourceService } from './vinted-listing-photo-source.service';
import { VintedPhotoBackgroundMaskService } from './vinted-photo-background-mask.service';

describe('VintedPhotoBackgroundMaskService', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const maskId = '22222222-2222-4222-8222-222222222222';
  const draftPhoto: ListingImageDraft = {
    key: 'entry-1::0',
    storagePath: null,
    file: null,
    fileName: 'jacke.jpg',
    previewUrl: 'https://images.example.test/jacke.jpg',
  };

  let invoke: ReturnType<typeof vi.fn>;
  let download: ReturnType<typeof vi.fn>;
  let readSource: ReturnType<typeof vi.fn>;
  let service: VintedPhotoBackgroundMaskService;

  beforeEach(() => {
    invoke = vi.fn().mockResolvedValue({
      data: { maskId, maskBase64: btoa('png-mask'), maskMimeType: 'image/png' },
      error: null,
    });
    download = vi.fn().mockResolvedValue({
      data: new Blob(['stored-png'], { type: 'image/png' }),
      error: null,
    });
    readSource = vi.fn().mockResolvedValue(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            client: {
              functions: { invoke },
              storage: { from: () => ({ download }) },
            },
          },
        },
        {
          provide: VintedListingPhotoSourceService,
          useValue: { read: readSource },
        },
      ],
    });
    service = TestBed.inject(VintedPhotoBackgroundMaskService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('ruft die Edge Function auf und cacht erhaltene Masken je Fotoquelle und Masken-ID', async () => {
    const first = await service.createMask(workspaceId, draftPhoto);
    expect(first.maskId).toBe(maskId);
    expect(first.mask.base64).toBe(btoa('png-mask'));
    expect(invoke).toHaveBeenCalledWith('vinted-photo-background-mask', {
      body: {
        workspaceId,
        imageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      },
      timeout: 55_000,
    });

    const second = await service.createMask(workspaceId, draftPhoto);
    expect(second).toEqual(first);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(service.cachedMask(maskId)).toEqual(first.mask);
  });

  it('übersetzt Serverfehler verständlich ins Deutsche und lädt gespeicherte Masken aus Storage nach', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'mask_limit' }), { status: 429 }),
      },
    });
    await expect(service.createMask(workspaceId, draftPhoto)).rejects.toThrow(/Limit/);

    const stored = await service.loadStoredMask(
      workspaceId,
      '33333333-3333-4333-8333-333333333333',
    );
    expect(stored).toEqual({ base64: btoa('stored-png'), mimeType: 'image/png' });
    expect(download).toHaveBeenCalledWith(
      `${workspaceId}/33333333-3333-4333-8333-333333333333.png`,
    );
  });
});

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingImagesService } from '../../listings/services/listing-images.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import { KleinanzeigenListingHandoffService } from './kleinanzeigen-listing-handoff.service';

describe('Gesicherte Kleinanzeigen-Formularübergabe', () => {
  const images = { load: vi.fn() };
  const extension = { openListing: vi.fn().mockResolvedValue(undefined) };
  const scope = {
    workspaceId: 'workspace',
    connectionId: '9',
    externalAccountId: '88',
    generation: 2,
    accountType: 'private' as const,
  };
  const draft = {
    id: 'draft',
    workspaceId: 'workspace',
    targetConnectionId: '9',
    imagesComplete: true,
    status: 'prepared' as const,
    content: {
      title: 'Jacke',
      description: 'Original',
      priceCents: 1200,
      currency: 'EUR' as const,
      priceType: 'NEGOTIABLE' as const,
      shippingType: 'both' as const,
      shippingPriceCents: null,
      postalCode: null,
      categoryId: null,
      categoryFields: {},
      schemaRevision: null,
    },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    images.load.mockResolvedValue([
      {
        storagePath: 'listings/stable-original.jpg',
        key: 'listings/stable-original.jpg',
        fileName: 'Original.jpg',
        previewUrl: 'https://storage.example/original.jpg',
      },
    ]);
    TestBed.configureTestingModule({
      providers: [
        KleinanzeigenListingHandoffService,
        { provide: ListingImagesService, useValue: images },
        { provide: KleinanzeigenExtensionBridge, useValue: extension },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('übergibt gesicherte Originalbilder und optionale Kategorie an das ausgewählte Konto', async () => {
    await TestBed.inject(KleinanzeigenListingHandoffService).open(
      scope,
      draft,
      'request',
      () => true,
      1,
    );
    expect(images.load).toHaveBeenCalledWith('draft', null, true);
    expect(extension.openListing).toHaveBeenCalledWith(
      scope,
      'request',
      expect.objectContaining({
        price: 12,
        priceType: 'NEGOTIABLE',
        shippingType: 'both',
        categoryPath: null,
        images: [
          {
            key: 'listings/stable-original.jpg',
            name: 'Original.jpg',
            url: 'https://storage.example/original.jpg',
          },
        ],
      }),
    );
  });
  it('öffnet bei unvollständiger Bildzahl kein stillschweigend verkürztes Inserat', async () => {
    images.load.mockResolvedValue([]);
    await expect(
      TestBed.inject(KleinanzeigenListingHandoffService).open(
        scope,
        draft,
        'request',
        () => true,
        1,
      ),
    ).rejects.toThrow('Bilder');
    expect(extension.openListing).not.toHaveBeenCalled();
  });
  it('verwirft verspätete Bilder nach Ansichtswechsel', async () => {
    let current = true;
    images.load.mockImplementation(async () => {
      current = false;
      return [];
    });
    await TestBed.inject(KleinanzeigenListingHandoffService).open(
      scope,
      draft,
      'request',
      () => current,
      1,
    );
    expect(extension.openListing).not.toHaveBeenCalled();
  });
  it('öffnet keine fremde oder bereits veröffentlichte Fassung', async () => {
    const service = TestBed.inject(KleinanzeigenListingHandoffService);
    await expect(
      service.open({ ...scope, connectionId: '10' }, draft, 'request', () => true),
    ).rejects.toThrow('Konto');
    await expect(
      service.open(scope, { ...draft, status: 'online' }, 'request', () => true),
    ).rejects.toThrow('Konto');
    expect(images.load).not.toHaveBeenCalled();
  });
});

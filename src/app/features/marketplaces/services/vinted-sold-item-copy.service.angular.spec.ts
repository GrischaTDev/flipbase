import { MarketplaceBrowserTestApiService } from './marketplace-browser-test-api.service';
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { emptyVintedListingContent } from '../models/vinted-listing-content';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import { VintedListingImageService } from './vinted-listing-image.service';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';
import { VintedListingPhotoSourceService } from './vinted-listing-photo-source.service';
import { VintedSoldItemCopyService } from './vinted-sold-item-copy.service';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const original: VintedListingDraft = {
  id: '17',
  ...scope,
  revision: 3,
  content: {
    ...emptyVintedListingContent(),
    title: 'Jacke',
    description: 'Originalbeschreibung',
    priceCents: 2300,
    attributes: { pattern: 'plain' },
  },
  images: [
    {
      id: '31',
      storagePath: 'workspace-a/17/31.jpg',
      fileName: 'original.jpg',
      mimeType: 'image/jpeg',
      byteSize: 8,
    },
  ],
  inventoryItemId: 'old-stock',
  relistExternalId: 'old-listing',
  photoOptions: { resize: 1200, crops: {} },
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
};
function setup(
  options: {
    items?: string[];
    saleError?: boolean;
    missingOriginals?: boolean;
    missingPublication?: boolean;
    downloadError?: boolean;
    publicationBody?: Record<string, unknown>;
    saleBody?: Record<string, unknown>;
    photoError?: boolean;
  } = {},
) {
  const sale = {
    id: 'sale-a',
    body: {
      title: 'Verkauft',
      externalId: '999',
      saleState: 'completed',
      itemIds: options.items ?? ['123'],
      price: 12,
      itemCount: options.items?.length ?? 1,
      imageUrl: 'https://images1.vinted.net/sale.jpg',
      ...options.saleBody,
    },
  };
  const publication = {
    id: 'publication-a',
    body: options.publicationBody ?? {
      listingContent: {
        ...original.content,
        description: 'Letzter gespeicherter Stand',
        sizeId: 208,
        colorIds: [1, 2],
      },
    },
  };
  const query = () => {
    const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    return builder;
  };
  const saleQuery = query(),
    publicationQuery = query();
  saleQuery.maybeSingle.mockResolvedValue({ data: sale, error: options.saleError ? {} : null });
  publicationQuery.maybeSingle.mockResolvedValue({
    data: options.missingPublication ? null : publication,
    error: null,
  });
  const from = vi.fn().mockReturnValueOnce(saleQuery).mockReturnValueOnce(publicationQuery);
  const readSource = vi.fn().mockResolvedValue(options.missingOriginals ? null : original);
  const file = new File(['original'], 'original.jpg', { type: 'image/jpeg' });
  const renamedFile = options.downloadError
    ? vi.fn().mockRejectedValue(new Error('Originalfoto fehlt'))
    : vi.fn().mockResolvedValue(file);
  const photoRead = options.photoError
    ? vi.fn().mockRejectedValue(new Error('Vinted-Foto nicht erreichbar'))
    : vi.fn().mockResolvedValue(file);
  TestBed.configureTestingModule({
    providers: [
      { provide: MarketplaceBrowserTestApiService, useValue: { readSoldListingSource: vi.fn() } },
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: VintedListingOriginalPhotoService, useValue: { readSource } },
      { provide: VintedListingImageService, useValue: { renamedFile } },
      { provide: VintedListingPhotoSourceService, useValue: { read: photoRead } },
    ],
  });
  return {
    service: TestBed.inject(VintedSoldItemCopyService),
    from,
    saleQuery,
    publicationQuery,
    readSource,
    renamedFile,
    file,
    sale,
    photoRead,
  };
}
afterEach(() => TestBed.resetTestingModule());

it('kopiert Angaben und Originalbytes ohne Verkaufs-, Bestands-, Relist- oder Bildpfadverknüpfung', async () => {
  const f = setup();
  const before = structuredClone(f.sale);
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content).toEqual({
    ...original.content,
    description: 'Letzter gespeicherter Stand',
    sizeId: 208,
    colorIds: [1, 2],
  });
  expect(copy.files).toEqual([f.file]);
  expect(await copy.files[0].text()).toBe('original');
  expect(copy.hasOriginals).toBe(true);
  expect(copy.needsCurrent).toBe(true);
  expect(f.sale).toEqual(before);
  expect(f.saleQuery.eq.mock.calls).toEqual([
    ['workspace_id', scope.workspaceId],
    ['connection_id', scope.connectionId],
    ['kind', 'sale'],
    ['id', 'sale-a'],
  ]);
  expect(f.publicationQuery.eq).toHaveBeenCalledWith('external_id', '123');
  expect(f.readSource).toHaveBeenCalledWith(scope, '123');
  expect(f.renamedFile).toHaveBeenCalledWith(original, '31', 'original.jpg');
});
it('kopiert einen einzelnen Paketartikel und nutzt gesicherte Angaben auch nach Entfernen der alten Anzeige', async () => {
  const f = setup({ items: ['456', '123'], missingPublication: true });
  expect((await f.service.read(scope, 'sale-a', '456')).content).toEqual(original.content);
  expect(f.readSource).toHaveBeenCalledWith(scope, '456');
});
it('verwendet weder eine Verkaufskennung noch einen fremden Artikel als Bildquelle', async () => {
  const f = setup();
  await expect(f.service.read(scope, 'sale-a', '999')).rejects.toThrow('gehört nicht');
  expect(f.from).toHaveBeenCalledTimes(1);
  expect(f.readSource).not.toHaveBeenCalled();
});
it('liest bei fehlender Verkaufsberechtigung keine Artikel oder Originale', async () => {
  const f = setup({ saleError: true });
  await expect(f.service.read(scope, 'sale-a', '123')).rejects.toThrow('Verkauf');
  expect(f.from).toHaveBeenCalledTimes(1);
  expect(f.readSource).not.toHaveBeenCalled();
});
it('deutet einen fremden Währungsbetrag nicht als EUR um', async () => {
  const sale = setup({
    missingOriginals: true,
    missingPublication: true,
    saleBody: { currency: 'USD' },
  });
  await expect(sale.service.read(scope, 'sale-a', '123')).rejects.toThrow('Währung');
  expect(sale.photoRead).not.toHaveBeenCalled();
  TestBed.resetTestingModule();
  const publication = setup({
    missingOriginals: true,
    publicationBody: { title: 'Jacke', price: 12, currency: 'GBP' },
  });
  await expect(publication.service.read(scope, 'sale-a', '123')).rejects.toThrow('Währung');
  expect(publication.photoRead).not.toHaveBeenCalled();
});
it('übernimmt ohne Originalarchiv die gespeicherten Angaben und verfügbaren Vinted-Fotos', async () => {
  const f = setup({
    missingOriginals: true,
    publicationBody: {
      listingContent: original.content,
      imageUrls: ['https://images1.vinted.net/one.jpg', 'https://images2.vinted.net/two.jpg'],
    },
  });
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content).toEqual(original.content);
  expect(copy.files).toHaveLength(2);
  expect(await copy.files[0].text()).toBe('original');
  expect(f.photoRead).toHaveBeenCalledWith('https://images1.vinted.net/one.jpg', {
    ...scope,
    entryId: 'publication-a',
  });
  expect(f.renamedFile).not.toHaveBeenCalled();
});
it('lädt bei alten Einzelverkäufen ohne Inseratarchiv Titel, Preis und zugeordnetes Verkaufsfoto', async () => {
  const f = setup({ missingOriginals: true, missingPublication: true });
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content.title).toBe('Verkauft');
  expect(copy.content.priceCents).toBe(1200);
  expect(copy.content.conditionLabel).toBe('');
  expect(copy.files).toHaveLength(1);
  expect(f.photoRead).toHaveBeenCalledWith('https://images1.vinted.net/sale.jpg', {
    ...scope,
    entryId: 'sale-a',
    saleItemId: '123',
  });
});
it('bevorzugt bestätigte vollständige Bildadressen und erhält deren gespeicherte Beschreibung', async () => {
  const f = setup({
    missingOriginals: true,
    saleBody: { sellerId: '789' },
    publicationBody: {
      title: 'Jacke',
      price: 12,
      imageUrls: ['https://images1.vinted.net/thumbnail.jpg'],
      transferSource: {
        externalAccountId: '789',
        externalId: '123',
        title: 'Jacke',
        description: 'Gesicherter vollständiger Text',
        priceCents: 1200,
        currency: 'EUR',
        photoReferences: ['https://images1.vinted.net/full.jpg'],
        attributeHints: {},
      },
    },
  });
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content.description).toBe('Gesicherter vollständiger Text');
  expect(f.photoRead).toHaveBeenCalledWith('https://images1.vinted.net/full.jpg', {
    ...scope,
    entryId: 'publication-a',
  });
});
it('weist einem Paketartikel weder Paketpreis noch Sammelbild zu', async () => {
  const f = setup({ missingOriginals: true, missingPublication: true, items: ['123', '456'] });
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content.title).toBe('');
  expect(copy.content.priceCents).toBeNull();
  expect(copy.files).toEqual([]);
  expect(copy.photoError).toContain('Fotos');
  expect(f.photoRead).not.toHaveBeenCalled();
});
it('lässt vorhandene Angaben auch bei nicht mehr erreichbaren Vinted-Fotos bearbeitbar', async () => {
  const f = setup({ missingOriginals: true, missingPublication: true, photoError: true });
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content.title).toBe('Verkauft');
  expect(copy.files).toEqual([]);
  expect(copy.photoError).toContain('Fotos');
});
it('ersetzt unlesbare gesicherte Originale nicht durch Anbieterbilder und behält die Angaben', async () => {
  const f = setup({ downloadError: true });
  const copy = await f.service.read(scope, 'sale-a', '123');
  expect(copy.content.description).toBe('Letzter gespeicherter Stand');
  expect(copy.files).toEqual([]);
  expect(copy.photoError).toContain('Originalfoto fehlt');
  expect(f.photoRead).not.toHaveBeenCalled();
});

it('übernimmt nach dem vollständigen Abruf alle neun Fotos, Beschreibung und Kategorie ohne Verkaufsänderung', async () => {
  const f = setup({ missingOriginals: true, missingPublication: true });
  const saved = await f.service.read(scope, 'sale-a', '123');
  const before = structuredClone(f.sale);
  const source = {
    externalAccountId: '789',
    externalId: '123',
    title: 'Laufschuhe',
    description: 'Vollständige Beschreibung',
    priceCents: 9890,
    currency: 'EUR',
    photoReferences: Array.from(
      { length: 9 },
      (_, index) => `https://images1.vinted.net/${index}.jpg`,
    ),
    attributeHints: {
      category_id: '1453',
      category: 'Laufschuhe',
      size: '45',
      status: 'Neu, ohne Etikett',
      color: 'Weiß, Grau',
    },
  };
  const browser = TestBed.inject(MarketplaceBrowserTestApiService);
  vi.mocked(browser.readSoldListingSource).mockResolvedValue({ source, actionId: 'receipt-a' });
  const result = await f.service.refresh(scope, 'sale-a', '123', '789', 'token', saved);
  expect(result.content.description).toBe(source.description);
  expect(result.content.categoryId).toBe(1453);
  expect(result.content.sizeId).toBeNull();
  expect(result.content.conditionId).toBeNull();
  expect(result.content.colorLabels).toEqual(['Weiß', 'Grau']);
  expect(result.files).toHaveLength(9);
  expect(f.photoRead).toHaveBeenLastCalledWith(source.photoReferences[8], {
    ...scope,
    entryId: 'sale-a',
    saleItemId: '123',
    sourceActionId: 'receipt-a',
  });
  expect(f.sale).toEqual(before);
  f.photoRead.mockClear();
  const originalCopy = await f.service.refresh(scope, 'sale-a', '123', '789', 'token', {
    ...saved,
    hasOriginals: true,
  });
  expect(originalCopy.files).toEqual(saved.files);
  expect(f.photoRead).not.toHaveBeenCalled();
});

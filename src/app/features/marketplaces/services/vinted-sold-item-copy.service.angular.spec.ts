import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { emptyVintedListingContent } from '../models/vinted-listing-content';
import type { VintedListingDraft } from '../models/vinted-listing-draft';
import { VintedListingImageService } from './vinted-listing-image.service';
import { VintedListingOriginalPhotoService } from './vinted-listing-original-photo.service';
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
    },
  };
  const publication = {
    body: {
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
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: VintedListingOriginalPhotoService, useValue: { readSource } },
      { provide: VintedListingImageService, useValue: { renamedFile } },
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
  expect(Object.keys(copy).sort()).toEqual(['content', 'files']);
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
it('ersetzt fehlende Originale nicht durch Anbieterbilder', async () => {
  const f = setup({ missingOriginals: true });
  await expect(f.service.read(scope, 'sale-a', '123')).rejects.toThrow('keine Originalbilder');
  expect(f.renamedFile).not.toHaveBeenCalled();
});
it('übernimmt bei einem unlesbaren Original keinen unvollständigen Bildsatz', async () => {
  const f = setup({ downloadError: true });
  await expect(f.service.read(scope, 'sale-a', '123')).rejects.toThrow('Originalfoto fehlt');
});

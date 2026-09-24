import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BarcodeLookupService } from './barcode-lookup.service';
import { CatalogService } from './catalog.service';
import { InventoryService } from './inventory.service';
import { WorkspaceService } from './workspace.service';

function createService(): BarcodeLookupService {
  const injector = Injector.create({
    providers: [
      { provide: CatalogService, useValue: {} },
      { provide: WorkspaceService, useValue: {} },
    ],
  });
  return runInInjectionContext(injector, () => new BarcodeLookupService());
}

afterEach(() => vi.unstubAllGlobals());

describe('BarcodeLookupService online', () => {
  it('findet einen Inventar-Artikel auch mit führender Null in der gespeicherten GTIN', async () => {
    const inventory = {
      istGeladen: () => true,
      loadError: () => null,
      items: () => [{ id: 'item-1', workspace_id: 'ws', ean: '04006381333931', title: 'Kamera' }],
    };
    const injector = Injector.create({
      providers: [
        { provide: CatalogService, useValue: {} },
        { provide: WorkspaceService, useValue: { currentWorkspace: () => ({ id: 'ws' }) } },
        { provide: InventoryService, useValue: inventory },
      ],
    });
    const service = runInInjectionContext(injector, () => new BarcodeLookupService());

    await expect(service.lookupInventoryByEan('4006381333931')).resolves.toMatchObject({
      title: 'Kamera',
      sourceName: 'Inventar',
      sourceUrl: '/inventory/item-1',
    });
  });
  it('liefert einen prüfbaren Produktvorschlag zur gescannten EAN', async () => {
    const fetchMock = vi.fn(
      async (_url: URL) =>
        new Response(
          JSON.stringify({
            product: {
              code: '4006381333931',
              product_name: 'Testprodukt',
              brands: 'Beispielmarke',
              categories: 'Haushalt',
              product_type: 'product',
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createService().lookupExternalByEan('4006381333931')).resolves.toMatchObject({
      ean: '4006381333931',
      title: 'Testprodukt',
      brand: 'Beispielmarke',
      sourceUrl: 'https://world.openproductsfacts.org/product/4006381333931',
      sourceName: 'Open Products Facts',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('product_type=all');
  });

  it('übernimmt weder fremde Nummern noch leere Produktdaten', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ product: { code: '3017620422003', product_name: 'Falsch' } }),
          ),
      ),
    );
    await expect(createService().lookupExternalByEan('4006381333931')).resolves.toBeNull();
  });

  it('behandelt nicht vorhandene Produkte als normalen Suchausgang', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(createService().lookupExternalByEan('4006381333931')).resolves.toBeNull();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbayArticleMappingComponent } from './ebay-article-mapping.component';
import { EbayArticleMappingStore } from '../../services/ebay-article-mapping.store';
import { CatalogService } from '../../../../core/services/catalog.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { StockService } from '../../../../core/services/stock.service';
import type { EbayListing } from '../../../../../../supabase/functions/_shared/ebay-contracts';
import type { EbayArticleMapping } from '../../../../../../supabase/functions/_shared/ebay-order-import-contracts';

const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const listing: EbayListing = {
  id: '123',
  title: 'Inserat',
  price: 10,
  quantity: 2,
  currency: 'EUR',
  listingType: 'FixedPriceItem',
  url: null,
  hasVariations: true,
  variants: [
    { id: '456', sku: null, quantity: 2, aspects: [{ name: 'Größe', value: 'M' }] },
    { id: null, sku: null, quantity: 2, aspects: [{ name: 'Größe', value: 'L' }] },
  ],
};
describe('Artikelzuordnung im eBay-Inserat', () => {
  let component: EbayArticleMappingComponent;
  let mappings: ReturnType<typeof signal<readonly EbayArticleMapping[]>>;
  let save: ReturnType<typeof vi.fn>;
  let quantity: ReturnType<typeof signal<number>>;
  beforeEach(() => {
    mappings = signal([]);
    save = vi.fn(async () => true);
    quantity = signal(2);
    const loadedWorkspaceId = signal(scope.workspaceId);
    const loadError = signal(null);
    const products = signal([
      {
        id: productId,
        workspace_id: scope.workspaceId,
        title: 'Flipbase-Artikel',
        tracking_mode: 'quantity',
        archived_at: null,
      },
    ]);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EbayArticleMappingStore,
          useValue: {
            mappings,
            loading: signal(false),
            error: signal(null),
            load: vi.fn(),
            clear: vi.fn(),
            save,
            remove: vi.fn(),
          },
        },
        {
          provide: CatalogService,
          useValue: { products, loadedWorkspaceId, loadError, loadProducts: vi.fn() },
        },
        {
          provide: InventoryService,
          useValue: { items: signal([]), loadedWorkspaceId, loadError, loadInventory: vi.fn() },
        },
        {
          provide: PurchaseService,
          useValue: { purchases: signal([]), loadedWorkspaceId, loadError, loadPurchases: vi.fn() },
        },
        {
          provide: StockService,
          useValue: {
            positions: () => [{ catalog_product_id: productId, available_quantity: quantity() }],
            loadedWorkspaceId,
            loadError,
            loadPositions: vi.fn(),
          },
        },
      ],
    });
    component = TestBed.runInInjectionContext(() => new EbayArticleMappingComponent());
    vi.spyOn(component, 'scope').mockImplementation(() => scope);
    vi.spyOn(component, 'listing').mockImplementation(() => listing);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('zeigt Varianten getrennt und sperrt eine gespeicherte Zuordnung ohne stabile Kennung', async () => {
    expect(component.rows().map((row) => row.canMap)).toEqual([true, false]);
    await component.openPicker(component.rows()[1]);
    expect(component.pickerOpen()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('verwendet den gemeinsamen Picker und speichert genau das konkrete Variantenziel', async () => {
    await component.openPicker(component.rows()[0]);
    expect(component.pickerOpen()).toBe(true);
    await component.selectArticle([component.entries()[0]]);
    expect(save).toHaveBeenCalledWith(scope, '123', '456', { catalogProductId: productId });
    expect(component.pickerOpen()).toBe(false);
  });
  it('erhält gespeicherten Nullbestand sichtbar und verhindert die Neuauswahl', async () => {
    quantity.set(0);
    mappings.set([
      {
        id: 'mapping',
        listingId: '123',
        variationId: '456',
        target: { catalogProductId: productId },
      },
    ]);
    await component.openPicker(component.rows()[0]);
    expect(component.rows()[0].targetLabel).toContain('Flipbase-Artikel');
    expect(component.rows()[0].targetLabel).toContain('Kein verfügbarer Bestand');
    await component.selectArticle([component.entries()[0]]);
    expect(save).not.toHaveBeenCalled();
  });
  it('prüft den aktuellen Bestand statt einer alten Picker-Auswahl', async () => {
    await component.openPicker(component.rows()[0]);
    const selected = component.entries()[0];
    quantity.set(0);
    await component.selectArticle([selected]);
    expect(save).not.toHaveBeenCalled();
  });
  it('verwirft die Auswahl nach einem Inseratwechsel vor dem nächsten Rendern', async () => {
    await component.openPicker(component.rows()[0]);
    vi.spyOn(component, 'listing').mockImplementation(() => ({ ...listing, id: '789' }));
    await component.selectArticle([component.entries()[0]]);
    expect(save).not.toHaveBeenCalled();
  });
});

import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { StoreService } from './store.service';
import {
  CatalogProduct,
  InventoryItem,
  InventoryItemSaleState,
  ItemStatus,
  StockLot,
  StockMovement,
} from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { CatalogService } from './catalog.service';
import { StockService } from './stock.service';
import { WorkspaceService } from './workspace.service';

describe('Store & Live Checkout Service', () => {
  it('projiziert Shopdaten, zieht Reservierungen ab und verwirft fremde oder ungültige Bestände', () => {
    const workspace = signal<{ id: string } | null>({ id: 'ws-1' });
    const product: CatalogProduct = {
      id: 'product',
      workspace_id: 'ws-1',
      title: 'Kamera',
      description: 'Mit Objektiv',
      tracking_mode: 'quantity',
      is_public_store: true,
      listing_price: 95,
      seo_title: 'Kamera kaufen',
      seo_description: 'Beschreibung für Suche',
      url_handle: 'kamera',
      primary_media_path: 'catalog-products/ws-1/product/main.webp',
    };
    const products = signal([product]);
    const positions = signal([
      {
        catalog_product_id: product.id,
        available_quantity: 4,
        reserved_quantity: 0,
        on_hand_quantity: 4,
      },
    ]);
    const lots = signal<StockLot[]>([
      {
        id: 'lot',
        workspace_id: 'ws-1',
        catalog_product_id: product.id,
        purchase_id: 'purchase',
        purchase_line_id: 'line',
        received_quantity: 4,
        remaining_quantity: 4,
        unit_cost: 10,
        received_at: '2026-09-13',
      },
    ]);
    const movements = signal<StockMovement[]>([
      {
        id: 'reserve',
        workspace_id: 'ws-1',
        stock_lot_id: 'lot',
        direction: 'out',
        reason: 'reservation',
        quantity: 1,
      },
    ]);
    const injector = Injector.create({
      providers: [
        {
          provide: CatalogService,
          useValue: { products, loadedWorkspaceId: signal('ws-1'), loadError: signal(null) },
        },
        {
          provide: StockService,
          useValue: {
            positions,
            lots,
            movements,
            loadedWorkspaceId: signal('ws-1'),
            loadError: signal(null),
          },
        },
        { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      ],
    });
    const service = runInInjectionContext(injector, () => new StoreService());
    expect(service.publicProducts()).toEqual([
      expect.objectContaining({
        id: 'product',
        availableQuantity: 3,
        unitPrice: 95,
        description: 'Mit Objektiv',
        seoTitle: 'Kamera kaufen',
        seoDescription: 'Beschreibung für Suche',
        urlHandle: 'kamera',
        thumbnailPath: product.primary_media_path,
      }),
    ]);
    expect(service.publicProducts()[0]).not.toHaveProperty('unit_cost');
    workspace.set({ id: 'ws-2' });
    expect(service.publicProducts()).toEqual([]);
    workspace.set({ id: 'ws-1' });
    for (const listing_price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      products.set([{ ...product, listing_price }]);
      expect(service.publicProducts()).toEqual([]);
    }
    products.set([{ ...product, is_public_store: false }]);
    expect(service.publicProducts()).toEqual([]);
    products.set([product]);
    movements.set([{ ...movements()[0], quantity: 5 }]);
    expect(service.publicProducts()).toEqual([]);
    workspace.set(null);
    expect(service.publicProducts()).toEqual([]);
  });

  it('erfindet für Einzelstücke ohne Verkaufspreis keinen Preis aus den Einkaufskosten', () => {
    const items = signal<InventoryItem[]>([
      {
        id: 'piece',
        workspace_id: 'ws-1',
        title: 'Einzelstück',
        condition: 'used',
        status: 'ready',
        sale_state: 'no_active_sale',
        is_public_store: true,
        allocated_purchase_cost: 100,
        expected_value: null,
      },
    ]);
    const injector = Injector.create({
      providers: [{ provide: InventoryService, useValue: { items } }],
    });
    const service = runInInjectionContext(injector, () => new StoreService());
    expect(service.publicProducts()).toEqual([]);
    items.update((entries) =>
      entries.map((item) => ({ ...item, expected_value: 150, description: 'Echte Beschreibung' })),
    );
    expect(service.publicProducts()[0]).toMatchObject({
      unitPrice: 150,
      description: 'Echte Beschreibung',
      kind: 'inventory_item',
    });
    expect(service.publicProducts()[0]).not.toHaveProperty('allocated_purchase_cost');
  });
  it('verwendet verfügbaren Produktbestand unabhängig vom historischen Typmarker', () => {
    const injector = Injector.create({
      providers: [
        {
          provide: CatalogService,
          useValue: {
            products: signal([
              {
                id: 'product',
                title: 'Schuh',
                tracking_mode: 'individual',
                is_public_store: true,
                listing_price: 20,
              },
            ]),
          },
        },
        {
          provide: StockService,
          useValue: {
            positions: signal([
              {
                catalog_product_id: 'product',
                available_quantity: 3,
                on_hand_quantity: 3,
                reserved_quantity: 0,
              },
            ]),
            lots: signal([]),
            movements: signal([]),
          },
        },
      ],
    });
    const service = runInInjectionContext(injector, () => new StoreService());
    expect(service.publicProducts()).toEqual([
      expect.objectContaining({ id: 'product', availableQuantity: 3 }),
    ]);
  });
  let storeService: StoreService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    storeService = runInInjectionContext(injector, () => new StoreService());
    storeService.clearCart();
  });

  it('should initialize with default store and payment settings', () => {
    const settings = storeService.storeSettings();
    expect(settings.payments.stripeEnabled).toBe(true);
    expect(settings.payments.paypalEnabled).toBe(true);
    expect(settings.payments.bankTransferEnabled).toBe(true);
  });

  it('veröffentlicht Einzelstücke nur für ready oder listed plus no_active_sale', () => {
    const statuses: readonly ItemStatus[] = [
      'received',
      'needs_review',
      'researched',
      'ready',
      'listed',
      'reserved',
      'sold',
      'defective',
      'returned',
      'archived',
    ];
    const states: readonly (InventoryItemSaleState | undefined)[] = [
      'no_active_sale',
      'sold',
      'legacy_sold_unverified',
      'legacy_sale_header_without_line',
      'sale_status_conflict',
      'multiple_active_sales',
      undefined,
    ];
    const items = statuses.flatMap((status) =>
      states.map((saleState) => ({
        id: `${status}-${saleState ?? 'missing'}`,
        workspace_id: 'ws-1',
        title: 'Matrixartikel',
        condition: 'used' as const,
        status,
        sale_state: saleState,
        is_public_store: true,
        allocated_purchase_cost: 10,
        expected_value: 20,
      })),
    );
    const injector = Injector.create({
      providers: [{ provide: InventoryService, useValue: { items: signal(items) } }],
    });
    const service = runInInjectionContext(injector, () => new StoreService());

    expect(service.publicProducts().map(({ id }) => id)).toEqual([
      'ready-no_active_sale',
      'listed-no_active_sale',
    ]);
  });

  it('should calculate cart totals and shipping costs correctly', () => {
    const sampleItem: InventoryItem = {
      id: 'inv-test-1',
      workspace_id: 'ws-1',
      sku: 'SKU-TEST-1',
      title: 'Sony PlayStation 5 Disc Edition',
      status: 'ready',
      allocated_purchase_cost: 300,
      expected_value: 450,
      condition: 'very_good',
      created_at: '2026-08-18',
    };

    storeService.addToCart(sampleItem, 1);
    expect(storeService.cartItemCount()).toBe(1);
    expect(storeService.cartSubtotal()).toBe(450);
    // Subtotal 450 >= freeShippingThreshold 50 -> shippingCost = 0
    expect(storeService.cartShippingCost()).toBe(0);
    expect(storeService.cartTotal()).toBe(450);
  });

  it('should process Stripe payment and simulate gateway roundtrip', async () => {
    const res = await storeService.processStripePayment(100, {
      holder: 'Max Mustermann',
      last4: '4242',
      brand: 'Visa',
    });

    expect(res.success).toBe(true);
    expect(res.transactionId).toContain('ch_stripe_');
  });

  it('should process PayPal payment and generate transaction ID', async () => {
    const res = await storeService.processPayPalPayment(150);

    expect(res.success).toBe(true);
    expect(res.transactionId).toContain('PAYID-');
  });

  it('should update payment gateway configuration', () => {
    storeService.updatePaymentsConfig({
      stripePublishableKey: 'pk_live_custom_key_456',
      paypalEmail: 'shop@myflipbasedomain.com',
    });

    const pm = storeService.storeSettings().payments;
    expect(pm.stripePublishableKey).toBe('pk_live_custom_key_456');
    expect(pm.paypalEmail).toBe('shop@myflipbasedomain.com');
  });
});

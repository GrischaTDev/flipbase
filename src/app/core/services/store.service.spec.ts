import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { StoreService } from './store.service';
import { InventoryItem, InventoryItemSaleState, ItemStatus } from '../models/flipbase.models';
import { InventoryService } from './inventory.service';
import { CatalogService } from './catalog.service';
import { StockService } from './stock.service';

describe('Store & Live Checkout Service', () => {
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
            positions: signal([{ catalog_product_id: 'product', available_quantity: 3 }]),
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

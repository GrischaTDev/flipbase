import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { CartItem, CheckoutCustomerInfo } from '../models/store.models';
import { MockDataStoreService } from './mock-data-store.service';
import { SalesService } from './sales.service';
import { StockService } from './stock.service';
import { StoreService } from './store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceService } from './workspace.service';

const ledLampId = '22222222-2222-4222-8222-222222222222';

const cartLine: CartItem = {
  item: {
    kind: 'catalog_product',
    id: ledLampId,
    title: 'LED-Lampe',
    availableQuantity: 5,
  },
  quantity: 2,
  unitPrice: 9.99,
};

const kunde: CheckoutCustomerInfo = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  street: 'Testweg',
  houseNumber: '1',
  zip: '12345',
  city: 'Berlin',
  country: 'Deutschland',
  shippingMethod: 'dhl_standard',
  paymentMethod: 'bank_transfer',
};

const dbBestellung = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: '11111111-1111-4111-8111-111111111111',
  order_number: 'RF-100001',
  customer: kunde,
  subtotal: 100,
  shipping_cost: 0,
  total: 100,
  payment_method: 'bank_transfer',
  payment_status: 'pending',
  payment_id: 'REF-TEST',
  status: 'pending',
  created_at: '2026-08-24T10:00:00.000Z',
};

const versuch = { orderId: dbBestellung.id, orderNumber: dbBestellung.order_number };

interface RpcAntwort {
  readonly data: typeof dbBestellung | null;
  readonly error: Error | null;
}

function erstelleService(rpcAntwort: RpcAntwort) {
  const rpc = vi.fn(async () => rpcAntwort);
  const client = {
    rpc,
    from: vi.fn((tabelle: string) => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () =>
            tabelle === 'store_orders' ? rpcAntwort : { data: null, error: null },
          ),
        })),
        then: (ok: (wert: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok),
      })),
    })),
  };
  const syncStatus = new SyncStatusService();
  const sales = signal([{ id: 'alter-verkauf' }]);
  const positions = signal([{ catalog_product_id: ledLampId, available_quantity: 5 }]);
  const loadSales = vi.fn(async () => sales.set([{ id: 'shop-verkauf' }]));
  const loadPositions = vi.fn(async () =>
    positions.set([{ catalog_product_id: ledLampId, available_quantity: 3 }]),
  );
  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: SyncStatusService, useValue: syncStatus },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: () => ({ id: dbBestellung.workspace_id }) },
      },
      { provide: MockDataStoreService, useValue: { isDemoMode: () => false } },
      { provide: SalesService, useValue: { sales, loadSales } },
      { provide: StockService, useValue: { positions, loadPositions } },
    ],
  });
  const service = runInInjectionContext(injector, () => new StoreService());
  service.cart.set([cartLine]);

  return { loadPositions, loadSales, positions, rpc, sales, service, syncStatus };
}

function erstelleDemoService() {
  localStorage.clear();
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(true);
  mockStore.savePurchase({
    id: 'purchase-1',
    workspace_id: 'ws-1',
    title: 'LED-Einkauf',
    type: 'lot',
    purchase_date: '2026-08-24',
    purchase_price: 24.95,
    cost_allocation_mode: 'even',
    pricing_mode: 'individual',
    entry_status: 'draft',
  });
  mockStore.saveCatalogProduct({
    id: ledLampId,
    workspace_id: 'ws-1',
    title: 'LED-Lampe',
    tracking_mode: 'quantity',
    is_public_store: true,
  });
  mockStore.savePurchaseLine({
    id: 'purchase-line-1',
    workspace_id: 'ws-1',
    purchase_id: 'purchase-1',
    catalog_product_id: ledLampId,
    title_snapshot: 'LED-Lampe',
    line_kind: 'quantity',
    ordered_quantity: 5,
    received_quantity: 0,
    unit_purchase_price: 4.99,
    line_total: 24.95,
  });
  expect(
    mockStore.receivePurchaseLines('ws-1', 'purchase-1', [
      { purchaseLineId: 'purchase-line-1', receivedQuantity: 5 },
    ]).error,
  ).toBeNull();

  expect(mockStore.finalizePurchaseCosting('ws-1', 'purchase-1').error).toBeNull();

  const workspaceService = { currentWorkspace: signal({ id: 'ws-1' }) };
  const stockService = Object.create(StockService.prototype) as StockService;
  Object.assign(stockService, {
    positions: signal([]),
    lots: signal([]),
    movements: signal([]),
    isLoading: signal(false),
    loadError: signal(null),
    loadedWorkspaceId: signal(null),
    loadRequestId: 0,
    mockStore,
    workspaceService,
    syncStatus: new SyncStatusService(),
  });
  const salesService = Object.create(SalesService.prototype) as SalesService;
  Object.assign(salesService, {
    sales: signal([]),
    mockStore,
    syncStatus: new SyncStatusService(),
    workspaceService,
    profitEngine: {
      calculateProfit: (revenue: number, costs: number) => revenue - costs,
      calculateRoi: () => 0,
      calculateHoldingDurationDays: () => 0,
    },
    stockService,
    inventoryService: { loadInventory: vi.fn(async () => undefined) },
  });
  const injector = Injector.create({
    providers: [
      { provide: MockDataStoreService, useValue: mockStore },
      { provide: WorkspaceService, useValue: workspaceService },
      { provide: SalesService, useValue: salesService },
      { provide: StockService, useValue: stockService },
    ],
  });
  const service = runInInjectionContext(injector, () => new StoreService());
  service.cart.set([cartLine]);

  return { mockStore, salesService, service, stockService };
}

describe('StoreService – bestätigte Bestellpersistenz', () => {
  it('bucht Mengenartikel atomar als custom_store-Verkaufsposition und leert erst nach Bestätigung', async () => {
    const { loadPositions, loadSales, positions, rpc, sales, service } = erstelleService({
      data: dbBestellung,
      error: null,
    });

    const ergebnis = await service.placeOrder(kunde, versuch);

    expect(ergebnis).toMatchObject({ status: 'success', order: { id: dbBestellung.id } });
    expect(rpc).toHaveBeenCalledWith(
      'place_store_order',
      expect.objectContaining({
        p_items: [
          expect.objectContaining({
            catalog_product_id: ledLampId,
            inventory_item_id: null,
            item_title: 'LED-Lampe',
            quantity: 2,
            price: 9.99,
          }),
        ],
      }),
    );
    expect(service.orders()).toHaveLength(1);
    expect(service.cart()).toEqual([]);
    expect(loadSales).toHaveBeenCalledWith(dbBestellung.workspace_id);
    expect(loadPositions).toHaveBeenCalledWith(dbBestellung.workspace_id);
    expect(sales()).toEqual([{ id: 'shop-verkauf' }]);
    expect(positions()).toEqual([{ catalog_product_id: ledLampId, available_quantity: 3 }]);
  });

  it('bucht den Demo-Checkout über den zentralen Verkaufs- und FIFO-Pfad', async () => {
    const { mockStore, salesService, service, stockService } = erstelleDemoService();

    const result = await service.placeOrder(kunde, {
      orderId: 'demo-order-1',
      orderNumber: 'RF-DEMO-1',
    });

    expect(result.status).toBe('success');
    expect(mockStore.getStockLots('ws-1')[0].remaining_quantity).toBe(3);
    expect(mockStore.getSales('ws-1')[0]).toMatchObject({
      platform: 'custom_store',
      external_order_id: 'RF-DEMO-1',
      sale_price: 24.97,
      sale_price_total: 24.97,
      shipping_revenue: 4.99,
      shipping_cost: 0,
      shipping_mode: 'seller_arranged',
    });
    expect(salesService.sales()).toHaveLength(1);
    expect(stockService.positions()[0].available_quantity).toBe(3);
  });

  it.each([
    { paymentMethod: 'stripe_card' as const, expectedFee: 0.39 },
    { paymentMethod: 'paypal' as const, expectedFee: 0.6 },
  ])(
    'persistiert $paymentMethod im Demo-Verkauf als strukturierte Zahlungsgebühr',
    async ({ paymentMethod, expectedFee }) => {
      const { mockStore, service } = erstelleDemoService();
      vi.spyOn(service, 'processStripePayment').mockResolvedValue({
        success: true,
        transactionId: 'stripe-test',
      });
      vi.spyOn(service, 'processPayPalPayment').mockResolvedValue({
        success: true,
        transactionId: 'paypal-test',
      });

      const result = await service.placeOrder(
        { ...kunde, paymentMethod },
        { orderId: `demo-${paymentMethod}`, orderNumber: `RF-${paymentMethod}` },
      );

      expect(result.status).toBe('success');
      expect(mockStore.getSales('ws-1')[0]).toMatchObject({
        sale_price_total: 24.97,
        shipping_revenue: 4.99,
        shipping_cost: 0,
        shipping_mode: 'seller_arranged',
        other_costs: expectedFee,
        cost_entries: [expect.objectContaining({ category: 'payment_fee', amount: expectedFee })],
      });
    },
  );

  it('behält den Warenkorb bei unzureichendem Bestand unverändert', async () => {
    const { service } = erstelleService({
      data: null,
      error: new Error('Nicht genügend verfügbarer Bestand'),
    });

    const ergebnis = await service.placeOrder(kunde, versuch);

    expect(ergebnis).toMatchObject({ status: 'failed', order: null });
    expect(service.orders()).toEqual([]);
    expect(service.cart()).toEqual([cartLine]);
  });

  it('behandelt eine leere RPC-Rückgabe wie einen fehlgeschlagenen Parent', async () => {
    const { service, syncStatus } = erstelleService({ data: null, error: null });

    const ergebnis = await service.placeOrder(kunde, versuch);

    expect(ergebnis).toMatchObject({ status: 'failed', order: null });
    expect(syncStatus.fehler()).toHaveLength(1);
    expect(service.cart()).toHaveLength(1);
  });
});

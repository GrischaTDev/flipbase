import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Sale } from '../models/flipbase.models';
import { SalesService } from './sales.service';
import { SyncStatusService } from './sync-status.service';
import { MockDataStoreService } from './mock-data-store.service';

const sale: Sale = {
  id: 'sale-1',
  workspace_id: 'workspace-1',
  platform: 'vinted',
  sale_price: 19.98,
  sale_price_total: 19.98,
  sale_date: '2026-08-26',
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
};

function createService(response: { data: unknown; error: unknown }): {
  service: SalesService;
  stockService: { loadPositions: ReturnType<typeof vi.fn> };
  rpc: ReturnType<typeof vi.fn>;
} {
  const stockService = { loadPositions: vi.fn(async () => undefined) };
  const rpc = vi.fn(async () => response);
  const service = Object.create(SalesService.prototype) as SalesService;
  Object.assign(service, {
    sales: signal<Sale[]>([]),
    mockStore: { isDemoMode: signal(false), saveSale: () => undefined },
    syncStatus: new SyncStatusService(),
    workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
    profitEngine: {
      calculateProfit: () => 0,
      calculateRoi: () => 0,
      calculateHoldingDurationDays: () => 0,
    },
    supabase: { client: { rpc } },
    stockService,
  });
  return { service, stockService, rpc };
}

function createDemoService(saleState: 'no_active_sale' | null = 'no_active_sale') {
  localStorage.clear();
  const mockStore = new MockDataStoreService();
  mockStore.isDemoMode.set(true);
  mockStore.saveItem({
    id: 'demo-item-1',
    workspace_id: 'workspace-1',
    title: 'Demo-Einzelstück',
    condition: 'used',
    status: 'ready',
    sale_state: saleState ?? undefined,
    allocated_purchase_cost: 10,
  });
  const service = Object.create(SalesService.prototype) as SalesService;
  Object.assign(service, {
    sales: signal<Sale[]>([]),
    mockStore,
    syncStatus: new SyncStatusService(),
    workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
    profitEngine: {
      calculateProfit: () => 0,
      calculateRoi: () => 0,
      calculateHoldingDurationDays: () => 0,
    },
    stockService: { loadPositions: vi.fn(async () => undefined) },
    inventoryService: { loadInventory: vi.fn(async () => undefined) },
  });
  return { mockStore, service };
}

const demoSaleInput = {
  platform: 'direct',
  saleDate: '2026-08-29',
  lines: [
    {
      inventoryItemId: 'demo-item-1',
      titleSnapshot: 'Demo-Einzelstück',
      quantity: 1,
      unitSalePrice: 25,
    },
  ],
};

describe('SalesService', () => {
  it('setzt einen bestätigten Demo-Einzelverkauf wie Supabase auf sold und verhindert den Doppelverkauf', async () => {
    const { mockStore, service } = createDemoService();

    const first = await service.recordSale(demoSaleInput);
    const second = await service.recordSale(demoSaleInput);

    expect(first.error).toBeNull();
    expect(mockStore.getItems('workspace-1')[0]).toMatchObject({
      status: 'sold',
      sale_state: 'sold',
    });
    expect(second.error?.message).toContain('nicht verkaufbar');
    expect(mockStore.getSales('workspace-1')).toHaveLength(1);
  });

  it('behandelt auch im Demo-Verkauf einen fehlenden Sale-State fail-closed', async () => {
    const { mockStore, service } = createDemoService(null);

    const result = await service.recordSale(demoSaleInput);

    expect(result.error?.message).toContain('nicht verkaufbar');
    expect(mockStore.getItems('workspace-1')[0].status).toBe('ready');
    expect(mockStore.getSales('workspace-1')).toEqual([]);
  });

  it('rollt den gesamten Demo-Verkauf zurück, wenn nur der Sales-Key nicht geschrieben werden kann', async () => {
    const { mockStore, service } = createDemoService();
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    let salesWriteFailed = false;
    const setItem = vi
      .spyOn(globalThis.localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === 'flipbase_local_sales' && !salesWriteFailed) {
          salesWriteFailed = true;
          throw new Error('sales write failed');
        }
        originalSetItem(key, value);
      });

    try {
      const result = await service.recordSale(demoSaleInput);

      expect(result.error?.message).toContain('sales write failed');
      expect(service.sales()).toEqual([]);
      expect(mockStore.getItems('workspace-1')[0]).toMatchObject({
        status: 'ready',
        sale_state: 'no_active_sale',
      });
      expect(mockStore.getSales('workspace-1')).toEqual([]);
      expect(mockStore.getStockMovements()).toEqual([]);
    } finally {
      setItem.mockRestore();
    }
  });

  it.each([
    { restock: true, expectedStatus: 'ready', expectedRestockedQuantity: 1 },
    { restock: false, expectedStatus: 'returned', expectedRestockedQuantity: 0 },
  ] as const)(
    'setzt einen vollständig retournierten Demo-Einzelartikel bei Wiedereinlagerung=$restock auf $expectedStatus',
    async ({ restock, expectedStatus, expectedRestockedQuantity }) => {
      const { mockStore, service } = createDemoService();
      const booking = await service.recordSale(demoSaleInput);

      const result = await service.recordReturn({
        saleId: booking.data!.sale.id,
        refundAmount: 25,
        restock,
        reason: 'buyer_remorse',
      });

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({
        restockedQuantity: expectedRestockedQuantity,
        sale: { refund_amount: 25 },
      });
      expect(result.data?.saleReturnedAt).toBeTruthy();
      expect(mockStore.getItems('workspace-1')[0]).toMatchObject({
        status: expectedStatus,
        sale_state: 'no_active_sale',
        active_sale_count: 0,
        active_sale_id: null,
      });
      expect(mockStore.getSales('workspace-1')[0]).toMatchObject({
        id: booking.data!.sale.id,
        refund_amount: 25,
        returned_at: result.data!.saleReturnedAt,
      });
      expect(mockStore.getSales('workspace-1')[0].lines?.[0].inventory_item_id).toBe('demo-item-1');
    },
  );

  it('rollt eine Demo-Vollretoure bei einem Fehler am Sales-Key vollständig zurück', async () => {
    const { mockStore, service } = createDemoService();
    const booking = await service.recordSale(demoSaleInput);
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    const movementsBefore = mockStore.getStockMovements('workspace-1');
    let salesWriteFailed = false;
    const setItem = vi
      .spyOn(globalThis.localStorage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === 'flipbase_local_sales' && !salesWriteFailed) {
          salesWriteFailed = true;
          throw new Error('return sales write failed');
        }
        originalSetItem(key, value);
      });

    try {
      const result = await service.recordReturn({
        saleId: booking.data!.sale.id,
        refundAmount: 25,
        restock: true,
        reason: 'buyer_remorse',
      });

      expect(result.data).toBeNull();
      expect(result.error?.message).toContain('return sales write failed');
      expect(mockStore.getItems('workspace-1')[0]).toMatchObject({
        status: 'sold',
        sale_state: 'sold',
        active_sale_count: 1,
        active_sale_id: booking.data!.sale.id,
      });
      expect(mockStore.getSales('workspace-1')[0]).not.toHaveProperty('returned_at');
      expect(mockStore.getSales('workspace-1')[0]).not.toHaveProperty('refund_amount');
      expect(mockStore.getStockMovements('workspace-1')).toEqual(movementsBefore);
      expect(service.sales()[0]).not.toHaveProperty('returned_at');
    } finally {
      setItem.mockRestore();
    }
  });

  it('behält bei identischer Uhrzeit zwei Verkäufe verschiedener Demo-Einzelartikel samt Beziehungen', async () => {
    const { mockStore, service } = createDemoService();
    mockStore.saveItem({
      id: 'demo-item-2',
      workspace_id: 'workspace-1',
      title: 'Zweites Demo-Einzelstück',
      condition: 'used',
      status: 'ready',
      sale_state: 'no_active_sale',
      allocated_purchase_cost: 12,
    });
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_788_000_000_000);

    try {
      const first = await service.recordSale(demoSaleInput);
      const second = await service.recordSale({
        ...demoSaleInput,
        lines: [
          {
            inventoryItemId: 'demo-item-2',
            titleSnapshot: 'Zweites Demo-Einzelstück',
            quantity: 1,
            unitSalePrice: 30,
          },
        ],
      });

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(first.data!.sale.id).not.toBe(second.data!.sale.id);
      expect(first.data!.saleLines[0].id).not.toBe(second.data!.saleLines[0].id);

      const sales = mockStore.getSales('workspace-1');
      expect(sales).toHaveLength(2);
      expect(new Set(sales.map((entry) => entry.id)).size).toBe(2);
      expect(sales.map((entry) => entry.lines?.[0].inventory_item_id).sort()).toEqual([
        'demo-item-1',
        'demo-item-2',
      ]);
      expect(
        mockStore
          .getItems('workspace-1')
          .map((item) => ({ id: item.id, saleId: item.active_sale_id, saleState: item.sale_state }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      ).toEqual([
        { id: 'demo-item-1', saleId: first.data!.sale.id, saleState: 'sold' },
        { id: 'demo-item-2', saleId: second.data!.sale.id, saleState: 'sold' },
      ]);
    } finally {
      now.mockRestore();
    }
  });

  it('disambiguiert beim Laden alle Verkaufsbeziehungen mit mehreren Fremdschlüsseln', async () => {
    const selects: string[] = [];
    const result = { data: [], error: null };
    let orderCount = 0;
    const query = {
      select: (columns: string) => {
        selects.push(columns);
        return query;
      },
      eq: () => query,
      order: () => (++orderCount === 2 ? Promise.resolve(result) : query),
    };
    const service = Object.create(SalesService.prototype) as SalesService;
    Object.assign(service, {
      sales: signal<Sale[]>([]),
      isLoading: signal(false),
      mockStore: { isDemoMode: signal(false) },
      supabase: { client: { from: () => query } },
      syncStatus: { melde: vi.fn() },
      retryPendingFollowUps: vi.fn(async () => undefined),
    });

    await service.loadSales('workspace-1');

    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain('sale_lines:sale_lines!sale_lines_sale_id_fkey(');
    expect(selects[0]).toContain(
      'lot_allocations:sale_line_lot_allocations!sale_line_lot_allocations_sale_line_id_fkey(*)',
    );
    expect(selects[0]).toContain(
      'stock_movements:stock_movements!stock_movements_sale_line_id_fkey(*)',
    );
  });

  it('lehnt Preisänderungen an persistierten Verkaufspositionen ohne atomaren Positionsadapter ab', async () => {
    const { service, rpc } = createService({ data: null, error: null });
    const persistedSale: Sale = {
      ...sale,
      has_persisted_lines: true,
      lines: [
        {
          id: 'sale-line-1',
          sale_id: sale.id,
          catalog_product_id: 'led-lamp-1',
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 9.99,
          line_total: 19.98,
          cost_of_goods_sold: 9.98,
          tax_mode: 'diff_25a',
        },
      ],
    };
    service.sales.set([persistedSale]);

    const result = await service.updateSale(sale.id, { sale_price: 29.98 });

    expect(result.error?.message).toContain('Korrekturvorgang');
    expect(service.sales()).toEqual([persistedSale]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('verwendet für persistierte Positionen deren Summe als kanonischen Verkaufspreis', () => {
    const { service } = createService({ data: null, error: null });

    const enriched = service.enrichSaleMetrics({
      ...sale,
      sale_price: 99,
      sale_price_total: 99,
      has_persisted_lines: true,
      lines: [
        {
          id: 'sale-line-1',
          sale_id: sale.id,
          catalog_product_id: 'led-lamp-1',
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 9.99,
          line_total: 19.98,
          cost_of_goods_sold: 9.98,
          tax_mode: 'diff_25a',
        },
      ],
    });

    expect(enriched.sale_price).toBe(19.98);
    expect(enriched.sale_price_total).toBe(19.98);
  });

  it('übernimmt einen atomar bestätigten Mengenverkauf mit seinen Positionen', async () => {
    const { service, stockService, rpc } = createService({
      data: {
        sale,
        sale_lines: [
          {
            id: 'sale-line-1',
            sale_id: sale.id,
            catalog_product_id: 'led-lamp-1',
            title_snapshot: 'LED-Lampe',
            quantity: 2,
            unit_sale_price: 9.99,
            line_total: 19.98,
            cost_of_goods_sold: 9.98,
            tax_mode: 'diff_25a',
          },
        ],
        lot_allocations: [],
        stock_movements: [],
        stock_quantities: [],
      },
      error: null,
    });

    const payload = {
      platform: 'ebay',
      saleDate: '2026-08-26',
      lines: [{ catalogProductId: 'led-lamp-1', quantity: 2, unitSalePrice: 9.99 }],
    };
    const result = await service.recordSale(payload);

    expect(payload.lines).toEqual([
      { catalogProductId: 'led-lamp-1', quantity: 2, unitSalePrice: 9.99 },
    ]);
    expect(payload.platform).toBe('ebay');
    expect(payload.saleDate).toBe('2026-08-26');
    expect(result.error).toBeNull();
    expect(service.sales()[0].lines?.[0].quantity).toBe(2);
    expect(stockService.loadPositions).toHaveBeenCalledWith('workspace-1');
    expect(rpc).toHaveBeenCalledWith(
      'record_sale',
      expect.objectContaining({
        p_lines: [
          expect.objectContaining({
            catalog_product_id: 'led-lamp-1',
            quantity: 2,
            unit_sale_price: 9.99,
          }),
        ],
      }),
    );
  });

  it('übergibt Käufer-Versand und strukturierte Zusatzkosten getrennt an die Verkaufs-RPC', async () => {
    const { service, rpc } = createService({
      data: {
        sale: {
          ...sale,
          sale_price: 42.98,
          sale_price_total: 42.98,
          shipping_revenue: 2.99,
          shipping_mode: 'seller_arranged',
          shipping_cost: 5.19,
          packaging_cost: 0.45,
          other_costs: 1.25,
        },
        sale_lines: [
          {
            id: 'sale-line-1',
            sale_id: sale.id,
            catalog_product_id: 'led-lamp-1',
            title_snapshot: 'LED-Lampe',
            quantity: 1,
            unit_sale_price: 39.99,
            line_total: 39.99,
            cost_of_goods_sold: 9.98,
            tax_mode: 'diff_25a',
          },
        ],
        cost_entries: [
          { category: 'packaging', description: 'Karton', amount: 0.45 },
          { category: 'promotion', description: 'Angebot hervorheben', amount: 1.25 },
        ],
        lot_allocations: [],
        stock_movements: [],
      },
      error: null,
    });

    const result = await service.recordSale({
      platform: 'ebay',
      saleDate: '2026-08-26',
      shippingRevenue: 2.99,
      shippingMode: 'seller_arranged',
      shippingCost: 5.19,
      additionalCosts: [
        { category: 'packaging', description: 'Karton', amount: 0.45 },
        { category: 'promotion', description: 'Angebot hervorheben', amount: 1.25 },
      ],
      lines: [{ catalogProductId: 'led-lamp-1', quantity: 1, unitSalePrice: 39.99 }],
    });

    expect(result.error).toBeNull();
    expect(result.data?.sale).toMatchObject({
      sale_price: 42.98,
      shipping_revenue: 2.99,
      shipping_mode: 'seller_arranged',
      shipping_cost: 5.19,
      packaging_cost: 0.45,
      other_costs: 1.25,
      cost_entries: [
        { category: 'packaging', description: 'Karton', amount: 0.45 },
        { category: 'promotion', description: 'Angebot hervorheben', amount: 1.25 },
      ],
    });
    expect(rpc).toHaveBeenCalledWith(
      'record_sale',
      expect.objectContaining({
        p_sale: expect.objectContaining({
          shipping_revenue: 2.99,
          shipping_mode: 'seller_arranged',
          shipping_cost: 5.19,
          cost_entries: [
            { category: 'packaging', description: 'Karton', amount: 0.45 },
            { category: 'promotion', description: 'Angebot hervorheben', amount: 1.25 },
          ],
        }),
      }),
    );
  });

  it('ruft für den Legacy-Nachtrag nur den eng begrenzten protokollierten RPC auf', async () => {
    const { service, rpc } = createService({
      data: { sale, sale_lines: [], lot_allocations: [], stock_movements: [] },
      error: null,
    });

    const recordSaleRpc = vi.spyOn(service, 'recordSale');
    await service.recordLegacySale('legacy-item-1', {
      platform: 'direct',
      saleDate: '2026-08-26',
      lines: [{ inventoryItemId: 'legacy-item-1', quantity: 1, unitSalePrice: 19.98 }],
    });

    expect(rpc).toHaveBeenCalledWith(
      'record_legacy_inventory_sale',
      expect.objectContaining({
        p_inventory_item_id: 'legacy-item-1',
        p_reason: 'Historische Statuskorrektur: Verkauf nachgetragen.',
      }),
    );
    expect(recordSaleRpc).not.toHaveBeenCalled();
  });

  it('verdeckt technische Fehler beim historischen Verkaufsnachtrag', async () => {
    const { service } = createService({
      data: null,
      error: new Error('Legacy-Datensatz ist unvollständig'),
    });

    const result = await service.recordLegacySale('legacy-item-1', {
      platform: 'direct',
      saleDate: '2026-08-26',
      lines: [{ inventoryItemId: 'legacy-item-1', quantity: 1, unitSalePrice: 19.98 }],
    });

    expect(result.error?.message).toContain(
      'Der historische Verkauf konnte nicht nachgetragen werden.',
    );
    expect(result.error?.message).not.toContain('Legacy');
  });

  it('lässt den Verkaufszustand bei unzureichendem Bestand unverändert', async () => {
    const { service } = createService({
      data: null,
      error: new Error('Nicht genügend verfügbarer Bestand'),
    });
    const existing = { ...sale, id: 'existing-sale' };
    service.sales.set([existing]);

    const result = await service.recordSale({
      platform: 'vinted',
      saleDate: '2026-08-26',
      lines: [{ catalogProductId: 'product-1', quantity: 4, unitSalePrice: 9.99 }],
    });

    expect(result.error?.message).toContain('Nicht genügend verfügbarer Bestand');
    expect(service.sales()).toEqual([existing]);
  });

  it('gibt die wiedereingelagerte Menge und den Retourenzeitpunkt zurück', async () => {
    const { service } = createService({
      data: {
        sale: { ...sale, returned_at: '2026-08-27T10:00:00.000Z', refund_amount: 19.98 },
        sale_lines: [],
        lot_allocations: [],
        stock_movements: [],
        restocked_quantity: 2,
        return: {
          id: 'return-1',
          workspace_id: 'workspace-1',
          sale_id: sale.id,
          inventory_item_id: null,
          credit_note_number: 'GS-2026-0001',
          return_date: '2026-08-27',
          reason: 'buyer_remorse',
          refund_amount: 19.98,
          is_full_refund: true,
          restock_action: 'restock_ready',
          notes: 'OVP',
          created_at: '2026-08-27T10:00:00.000Z',
        },
      },
      error: null,
    });

    const returnResult = (
      await service.recordReturn({
        saleId: sale.id,
        reason: 'buyer_remorse',
        refundAmount: 19.98,
        restock: true,
        restockAction: 'restock_ready',
        buyerName: 'Max Mustermann',
        notes: 'OVP',
      })
    ).data!;

    expect(returnResult.restockedQuantity).toBe(2);
    expect(returnResult.saleReturnedAt).toBeTruthy();
    expect(returnResult.returnRecord?.credit_note_number).toBe('GS-2026-0001');
  });

  it('berechnet Mengenverkaufs-Kennzahlen aus den persistierten COGS', () => {
    const service = Object.create(SalesService.prototype) as SalesService;
    Object.assign(service, {
      profitEngine: {
        calculateProfit: (revenue: number, costs: number) => revenue - costs,
        calculateRoi: (profit: number, costs: number) => (costs === 0 ? 0 : (profit / costs) * 100),
        calculateHoldingDurationDays: () => 0,
      },
    });

    const enriched = service.enrichSaleMetrics({
      ...sale,
      sale_price: 40,
      inventory_item: {
        id: 'item-1',
        workspace_id: sale.workspace_id,
        title: 'LED-Lampe',
        condition: 'new',
        status: 'sold',
        allocated_purchase_cost: 999,
        costs: [],
      },
      lines: [
        {
          id: 'line-1',
          sale_id: sale.id,
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 20,
          line_total: 40,
          cost_of_goods_sold: 15,
          tax_mode: 'diff_25a',
        },
      ],
    });

    expect(enriched.net_profit).toBe(25);
    expect(enriched.roi).toBeCloseTo(166.67, 2);
  });
});

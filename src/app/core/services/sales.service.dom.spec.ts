import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Sale } from '../models/flipbase.models';
import { SalesService } from './sales.service';
import { SyncStatusService } from './sync-status.service';

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
  stockService: {
    loadPositions: ReturnType<typeof vi.fn>;
    lots: ReturnType<typeof signal>;
  };
  rpc: ReturnType<typeof vi.fn>;
} {
  const stockService = {
    loadPositions: vi.fn(async () => undefined),
    lots: signal([]),
  };
  const rpc = vi.fn(async () => response);
  const service = Object.create(SalesService.prototype) as SalesService;
  Object.assign(service, {
    sales: signal<Sale[]>([]),
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

describe('SalesService', () => {
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
      loadError: signal<Error | null>(null),
      loadedWorkspaceId: signal<string | null>(null),
      loadRequestId: 0,
      workspaceService: { currentWorkspace: () => ({ id: 'workspace-1' }) },
      supabase: { client: { from: () => query } },
      syncStatus: { melde: vi.fn() },
      retryPendingFollowUps: vi.fn(async () => undefined),
    });

    await service.loadSales('workspace-1');

    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain('sale_lines:sale_lines!sale_lines_sale_id_fkey(');
    expect(selects[0]).toContain(
      'lot_allocations:sale_line_lot_allocations!sale_line_lot_allocations_sale_line_id_fkey(*, stock_lot:stock_lots!sale_line_lot_allocations_stock_lot_id_fkey(*, purchase:purchases!stock_lots_purchase_id_fkey(*)))',
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

  it('berechnet die Verkaufskosten nach dem Bestands-Refresh sofort neu', async () => {
    const finalizedPurchase = {
      id: 'purchase-1',
      workspace_id: 'workspace-1',
      type: 'single' as const,
      title: 'LED-Einkauf',
      purchase_date: '2026-08-20',
      purchase_price: 9.98,
      cost_allocation_mode: 'even' as const,
      entry_status: 'finalized' as const,
    };
    const allocation = {
      id: 'allocation-1',
      workspace_id: 'workspace-1',
      sale_line_id: 'sale-line-1',
      stock_lot_id: 'stock-lot-1',
      quantity: 1,
      unit_cost: 9.98,
    };
    const { service, stockService } = createService({
      data: {
        sale,
        sale_lines: [
          {
            id: 'sale-line-1',
            sale_id: sale.id,
            catalog_product_id: 'led-lamp-1',
            title_snapshot: 'LED-Lampe',
            quantity: 1,
            unit_sale_price: 19.98,
            line_total: 19.98,
            cost_of_goods_sold: 9.98,
            tax_mode: 'diff_25a',
          },
        ],
        lot_allocations: [allocation],
        stock_movements: [],
      },
      error: null,
    });
    stockService.loadPositions.mockImplementation(async () => {
      stockService.lots.set([
        {
          id: 'stock-lot-1',
          workspace_id: 'workspace-1',
          purchase_id: finalizedPurchase.id,
          purchase_line_id: 'purchase-line-1',
          catalog_product_id: 'led-lamp-1',
          received_quantity: 1,
          remaining_quantity: 0,
          unit_cost: 9.98,
          received_at: '2026-08-21T10:00:00.000Z',
          purchase: finalizedPurchase,
        },
      ]);
    });

    const result = await service.recordSale({
      platform: 'vinted',
      saleDate: sale.sale_date,
      lines: [{ catalogProductId: 'led-lamp-1', quantity: 1, unitSalePrice: 19.98 }],
    });

    expect(result.data?.sale.cost_basis_status).toBe('known');
    expect(result.data?.sale.net_profit).toBe(10);
    expect(service.sales()[0].cost_basis_status).toBe('known');
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

  it('berechnet Verkaufserlös, Verkaufskosten und Ergebnis aus dem gemeinsamen Kennzahlenvertrag', () => {
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
      sale_price: 42.98,
      sale_price_total: 42.98,
      shipping_revenue: 2.99,
      platform_fee: 7.7,
      shipping_cost: 5.19,
      packaging_cost: 99,
      other_costs: 99,
      cost_entries: [
        {
          id: 'cost-1',
          workspace_id: sale.workspace_id,
          sale_id: sale.id,
          category: 'packaging',
          amount: 1.5,
        },
      ],
      inventory_item: {
        id: 'item-1',
        workspace_id: sale.workspace_id,
        title: 'LED-Lampe',
        condition: 'new',
        status: 'sold',
        allocated_purchase_cost: 999,
        purchase: {
          id: 'purchase-1',
          title: 'Einkauf',
          workspace_id: sale.workspace_id,
          type: 'single',
          purchase_date: '2026-08-01',
          purchase_price: 10,
          cost_allocation_mode: 'even',
          entry_status: 'finalized',
        },
        costs: [],
      },
      lines: [
        {
          id: 'line-1',
          inventory_item_id: 'item-1',
          sale_id: sale.id,
          title_snapshot: 'LED-Lampe',
          quantity: 2,
          unit_sale_price: 19.995,
          line_total: 39.99,
          cost_of_goods_sold: 10,
          tax_mode: 'diff_25a',
        },
      ],
    });

    expect(enriched.sale_price).toBe(42.98);
    expect(enriched.selling_costs).toBe(14.39);
    expect(enriched.net_profit).toBe(18.59);
    expect(enriched.margin_percent).toBe(43.25);
    expect(enriched.roi).toBe(185.9);
  });
});

describe('Paketkosten im Verkaufssnapshot', () => {
  it('übernimmt einen NULL-Snapshot aus dem RPC ohne Gewinn zu erfinden', async () => {
    const line = {
      id: 'line',
      sale_id: sale.id,
      inventory_item_id: 'content',
      title_snapshot: 'Schuh',
      quantity: 1,
      unit_sale_price: 19.98,
      line_total: 19.98,
      cost_of_goods_sold: null,
      tax_mode: 'diff_25a',
    };
    const { service } = createService({
      data: { sale, sale_lines: [line], lot_allocations: [], stock_movements: [] },
      error: null,
    });
    const result = await service.recordSale({
      platform: 'direct',
      saleDate: sale.sale_date,
      lines: [{ inventoryItemId: 'content', quantity: 1, unitSalePrice: 19.98 }],
    });
    expect(result.error).toBeNull();
    expect(result.data?.saleLines[0].cost_of_goods_sold).toBeNull();
    expect(result.data?.sale).toMatchObject({
      net_profit: null,
      roi: null,
      margin_percent: null,
      cost_basis_status: 'unknown',
    });
  });
});

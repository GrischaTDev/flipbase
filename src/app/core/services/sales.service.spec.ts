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

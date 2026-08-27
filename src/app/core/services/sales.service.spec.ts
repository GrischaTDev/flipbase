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
      },
      error: null,
    });

    const returnResult = (
      await service.recordReturn({
        saleId: sale.id,
        reason: 'buyer_remorse',
        refundAmount: 19.98,
        restock: true,
      })
    ).data!;

    expect(returnResult.restockedQuantity).toBe(2);
    expect(returnResult.saleReturnedAt).toBeTruthy();
  });
});

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { Purchase, Sale } from '../models/flipbase.models';
import { DashboardReportService } from './dashboard-report.service';

const now = new Date(2026, 7, 28);

const receipt: Purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  type: 'lot',
  title: 'Fünf LED-Lampen',
  purchase_date: '2026-08-26',
  purchase_price: 24.95,
  cost_allocation_mode: 'even',
  total_purchase_cost: 24.95,
};

const sale: Sale = {
  id: 'sale-1',
  workspace_id: 'workspace-1',
  platform: 'ebay',
  sale_price: 19.98,
  sale_price_total: 19.98,
  sale_date: '2026-08-27',
  platform_fee: 1,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  lines: [
    {
      id: 'line-1',
      sale_id: 'sale-1',
      catalog_product_id: 'lamp-1',
      title_snapshot: 'LED-Lampe',
      quantity: 2,
      unit_sale_price: 9.99,
      line_total: 19.98,
      cost_of_goods_sold: 9.98,
      tax_mode: 'diff_25a',
    },
  ],
};

function createService(): DashboardReportService {
  return Object.create(DashboardReportService.prototype) as DashboardReportService;
}

describe('DashboardReportService', () => {
  it('trennt Einkaufs-Ausgaben sauber von COGS und realisiertem Gewinn', () => {
    const report = createService().createReportForRecords(
      'last_7_days',
      'all',
      { purchases: [receipt], sales: [sale], inventoryItems: [], stockLots: [] },
      now,
    );

    expect(report.expenses).toBe(24.95);
    expect(report.revenue).toBe(19.98);
    // 19,98 € Umsatz - 9,98 € COGS - 1,00 € Plattformgebühr.
    expect(report.realizedProfit).toBe(9);
    expect(report.rows[0]).toMatchObject({ quantity: 2, costOfGoodsSold: 9.98, profit: 9 });
  });

  it.each([
    ['today', 1],
    ['last_7_days', 7],
    ['month', 28],
    ['year', 8],
  ] as const)('liefert für %s die passende Punktzahl', (range, expectedPoints) => {
    const report = createService().createReportForRecords(
      range,
      'all',
      { purchases: [receipt], sales: [sale], inventoryItems: [], stockLots: [] },
      now,
    );

    expect(report.points).toHaveLength(expectedPoints);
    if (range === 'today') {
      expect(report.rows).toEqual([]);
      expect(report.revenue).toBe(0);
    } else {
      expect(report.rows).toHaveLength(1);
      expect(report.revenue).toBe(19.98);
    }
  });

  it('nimmt einen retournierten Verkauf nach seinem Retourendatum nicht mehr in Umsatz und Gewinn auf', () => {
    const report = createService().createReportForRecords(
      'last_7_days',
      'all',
      {
        purchases: [receipt],
        sales: [{ ...sale, returned_at: '2026-08-28T10:00:00.000Z' }],
        inventoryItems: [],
        stockLots: [],
      },
      now,
    );

    expect(report.expenses).toBe(24.95);
    expect(report.revenue).toBe(0);
    expect(report.realizedProfit).toBe(0);
    expect(report.rows).toEqual([]);
  });
});

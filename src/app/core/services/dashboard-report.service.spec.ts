import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { Expense } from '../models/expense.models';
import { DashboardRange, InventoryItem, Purchase, Sale } from '../models/flipbase.models';
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
      inventory_item: {
        id: 'item-1',
        workspace_id: 'workspace-1',
        title: 'LED-Lampe',
        status: 'sold',
        condition: 'new',
        allocated_purchase_cost: 9.98,
        purchase: { ...receipt, entry_status: 'finalized' },
      },
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

/** Verkauf ohne Positionen und ohne Artikel: Kosten sind nicht nachvollziehbar. */
const saleWithoutCostBasis: Sale = {
  ...sale,
  id: 'sale-without-cost-basis',
  lines: [],
  has_persisted_lines: false,
  inventory_item: undefined,
};

function createService(): DashboardReportService {
  return Object.create(DashboardReportService.prototype) as DashboardReportService;
}

function report(
  range: DashboardRange,
  records: {
    purchases?: Purchase[];
    sales?: Sale[];
    inventoryItems?: InventoryItem[];
    expenses?: Expense[];
  },
  at = now,
  platform = 'all',
) {
  return createService().createReportForRecords(
    range,
    platform,
    {
      purchases: records.purchases ?? [],
      sales: records.sales ?? [],
      inventoryItems: records.inventoryItems ?? [],
      stockLots: [],
      expenses: records.expenses ?? [],
    },
    at,
  );
}

function saleOn(id: string, date: string, revenue: number): Sale {
  return {
    ...sale,
    id,
    sale_date: date,
    sale_price: revenue,
    sale_price_total: revenue,
    lines: [{ ...sale.lines![0], id: `${id}-line`, sale_id: id, line_total: revenue }],
  };
}

describe('DashboardReportService', () => {
  it('erhält nach zwei Entnahmen den exakten Restwert des korrigierten 100-Euro-Loses', () => {
    const result = createService().createReportForRecords(
      'last_7_days',
      'all',
      {
        purchases: [{ ...receipt, entry_status: 'finalized', purchase_price: 100 }],
        inventoryItems: [],
        stockLots: [
          {
            id: 'lot-1',
            workspace_id: 'workspace-1',
            purchase_id: receipt.id,
            purchase_line_id: 'purchase-line-1',
            catalog_product_id: 'lamp-1',
            received_quantity: 6,
            remaining_quantity: 4,
            unit_cost: 16.666667,
            received_at: '2026-08-26',
          },
        ],
        sales: [
          {
            ...sale,
            lot_allocations: [
              {
                id: 'allocation-1',
                workspace_id: 'workspace-1',
                sale_line_id: 'line-1',
                stock_lot_id: 'lot-1',
                quantity: 2,
                unit_cost: 16.67,
                allocated_cost: 33.34,
                active_allocated_cost: 33.34,
              },
            ],
          },
        ],
      },
      now,
    );
    expect(result.inventoryCostValue).toBe(66.66);
    expect(result.inventoryItemsWithoutCost).toBe(0);
  });

  it('trennt Einkaufskosten, Verkaufskosten und Gewinn', () => {
    const result = report('last_7_days', { purchases: [receipt], sales: [sale] });

    expect(result.purchaseSpend).toBe(24.95);
    expect(result.sellingCosts).toBe(1);
    expect(result.totalExpenses).toBe(25.95);
    expect(result.purchasesIncluded).toBe(true);
    expect(result.revenue).toBe(19.98);
    // 19,98 € Umsatz - 9,98 € Wareneinsatz - 1,00 € Plattformgebühr.
    expect(result.grossProfit).toBe(9);
    expect(result.rows[0]).toMatchObject({ quantity: 2, costOfGoodsSold: 9.98, profit: 9 });
  });

  it('zählt nur bezahlte Betriebsausgaben nach Zahlungsdatum zum Cashflow, ohne Gewinn oder Marge zu ändern', () => {
    const paid: Expense = {
      id: 'expense-paid',
      workspace_id: 'workspace-1',
      category_id: 'category-1',
      recurring_rule_id: null,
      occurrence_date: null,
      title: 'Server',
      gross_amount: 15,
      vat_rate: 19,
      expense_date: '2026-08-20',
      due_date: null,
      status: 'paid',
      payment_date: '2026-08-27',
      notes: null,
      deleted_at: null,
      created_at: '2026-08-20T00:00:00Z',
      created_by: 'user-1',
      updated_at: '2026-08-27T00:00:00Z',
    };
    const open: Expense = {
      ...paid,
      id: 'expense-open',
      gross_amount: 20,
      status: 'open',
      payment_date: null,
    };
    const paidOutside: Expense = {
      ...paid,
      id: 'expense-outside',
      gross_amount: 30,
      payment_date: '2026-08-01',
    };

    const withoutOperating = report('last_7_days', { purchases: [receipt], sales: [sale] });
    const result = report('last_7_days', {
      purchases: [receipt],
      sales: [sale],
      expenses: [paid, open, paidOutside],
    });

    expect(result.operatingExpenseSpend).toBe(15);
    expect(result.totalExpenses).toBe(40.95);
    expect(result.grossProfit).toBe(withoutOperating.grossProfit);
    expect(result.averageMarginPercent).toBe(withoutOperating.averageMarginPercent);
  });

  it('zählt bei Plattformfilter nur die Verkaufskosten dieser Plattform zu den Ausgaben', () => {
    const vintedSale: Sale = { ...sale, id: 'sale-vinted', platform: 'vinted', platform_fee: 2 };
    const result = report(
      'last_7_days',
      { purchases: [receipt], sales: [sale, vintedSale] },
      now,
      'vinted',
    );

    expect(result.purchasesIncluded).toBe(false);
    expect(result.purchaseSpend).toBe(0);
    expect(result.sellingCosts).toBe(2);
    expect(result.totalExpenses).toBe(2);
    expect(result.openCosts).toEqual([]);
  });

  it('zählt Käufer-Versand bei persistierten Positionen zum Umsatz und Gewinn', () => {
    const saleWithShippingRevenue: Sale = {
      ...sale,
      sale_price: 42.98,
      sale_price_total: 42.98,
      shipping_revenue: 2.99,
      shipping_cost: 5.19,
      platform_fee: 7.7,
      lines: [
        { ...sale.lines![0], line_total: 39.99, unit_sale_price: 19.995, cost_of_goods_sold: 10 },
      ],
    };

    const result = report('last_7_days', { sales: [saleWithShippingRevenue] });

    expect(result.revenue).toBe(42.98);
    expect(result.grossProfit).toBe(20.09);
    expect(result.averageMarginPercent).toBe(46.74);
    expect(result.soldItems).toBe(2);
    expect(result.rows[0]).toMatchObject({
      revenue: 42.98,
      costOfGoodsSold: 10,
      sellingCosts: 12.89,
      resultAfterDirectCosts: 20.09,
      marginPercent: 46.74,
    });
    expect(result.points.find((point) => point.date === '2026-08-27')).toMatchObject({
      revenue: 42.98,
      costOfGoodsSold: 10,
      sellingCosts: 12.89,
      resultAfterDirectCosts: 20.09,
    });
  });

  it('gewichtet die Dashboard-Marge nach Umsatz statt kleine und große Verkäufe gleich zu behandeln', () => {
    const smallSale: Sale = {
      ...sale,
      id: 'sale-small',
      sale_price: 20,
      sale_price_total: 20,
      platform_fee: 0,
      lines: [
        {
          ...sale.lines![0],
          id: 'line-small',
          sale_id: 'sale-small',
          quantity: 1,
          unit_sale_price: 20,
          line_total: 20,
          cost_of_goods_sold: 10,
        },
      ],
    };
    const largeSale: Sale = {
      ...sale,
      id: 'sale-large',
      sale_price: 100,
      sale_price_total: 100,
      platform_fee: 0,
      lines: [
        {
          ...sale.lines![0],
          id: 'line-large',
          sale_id: 'sale-large',
          quantity: 1,
          unit_sale_price: 100,
          line_total: 100,
          cost_of_goods_sold: 90,
        },
      ],
    };

    const result = report('last_7_days', { sales: [smallSale, largeSale] });

    expect(result.revenue).toBe(120);
    expect(result.grossProfit).toBe(20);
    expect(result.averageMarginPercent).toBe(16.67);
  });

  it('nimmt Verkäufe ohne belegbaren Wareneinsatz aus dem Gewinn und weist ihren Umsatz getrennt aus', () => {
    const result = report('last_7_days', { sales: [sale, saleWithoutCostBasis] });

    expect(result.rows.find((row) => row.saleId === saleWithoutCostBasis.id)).toMatchObject({
      costOfGoodsSold: null,
      resultAfterDirectCosts: null,
      marginPercent: null,
    });
    expect(result.revenue).toBe(39.96);
    expect(result.grossProfit).toBe(9);
    expect(result.revenueWithoutCost).toBe(19.98);
    expect(result.salesWithoutCostCount).toBe(1);
    expect(result.averageMarginPercent).toBe(45.05);
    expect(result.salesWithoutPurchase).toBe(1);
    // Das Diagramm zeigt weiterhin keinen erfundenen Tageswert.
    expect(result.points.find((point) => point.date === '2026-08-27')).toMatchObject({
      costOfGoodsSold: null,
      resultAfterDirectCosts: null,
      realizedProfit: null,
    });
  });

  it('lässt die Marge leer, wenn kein Verkauf bekannte Kosten hat', () => {
    const result = report('last_7_days', { sales: [saleWithoutCostBasis] });

    expect(result.grossProfit).toBe(0);
    expect(result.averageMarginPercent).toBeNull();
  });

  it('schließt unbekannte Draftkosten aus den Ausgaben aus und meldet sie als offen', () => {
    const result = report('last_7_days', {
      purchases: [
        receipt,
        {
          ...receipt,
          id: 'purchase-unknown',
          title: 'Flohmarkt ohne Preis',
          purchase_price: null,
          total_purchase_cost: null,
          shipping_cost: 5,
          other_costs: 7,
        },
        {
          ...receipt,
          id: 'purchase-free',
          purchase_price: 0,
          total_purchase_cost: null,
          shipping_cost: 2,
          other_costs: 0,
        },
        {
          ...receipt,
          id: 'purchase-priced-draft',
          purchase_price: 10,
          total_purchase_cost: null,
          shipping_cost: 1,
          other_costs: 2,
          costs: [{ type: 'travel', amount: 3 }],
        },
      ],
    });

    expect(result.purchaseSpend).toBe(42.95);
    expect(result.points.find((point) => point.date === '2026-08-26')?.expenses).toBe(42.95);
    expect(result.openCosts).toEqual([
      {
        purchaseId: 'purchase-unknown',
        title: 'Flohmarkt ohne Preis',
        recordNumber: null,
        reason: 'price_missing',
        affectedSales: 0,
        affectedInventory: 0,
      },
    ]);
  });

  it.each([
    ['today', 1],
    ['last_7_days', 7],
    ['month', 28],
    ['year', 8],
  ] as const)('liefert für %s die passende Punktzahl', (range, expectedPoints) => {
    const result = report(range, { purchases: [receipt], sales: [sale] });

    expect(result.points).toHaveLength(expectedPoints);
    if (range === 'today') {
      expect(result.rows).toEqual([]);
      expect(result.revenue).toBe(0);
    } else {
      expect(result.rows).toHaveLength(1);
      expect(result.revenue).toBe(19.98);
    }
  });

  it('nimmt einen retournierten Verkauf nach seinem Retourendatum nicht mehr in Umsatz und Gewinn auf', () => {
    const result = report('last_7_days', {
      purchases: [receipt],
      sales: [{ ...sale, returned_at: '2026-08-28T10:00:00.000Z' }],
    });

    expect(result.purchaseSpend).toBe(24.95);
    expect(result.revenue).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.rows).toEqual([]);
  });

  it('zieht eine Teilgutschrift ohne Warenrückgabe finanziell von Umsatz und Gewinn ab', () => {
    const result = report('last_7_days', {
      sales: [{ ...sale, returned_at: '2026-08-28T10:00:00.000Z', refund_amount: 5 }],
    });

    expect(result.revenue).toBe(14.98);
    expect(result.grossProfit).toBe(4);
    expect(result.rows).toEqual([
      expect.objectContaining({ saleId: sale.id, revenue: 14.98, profit: 4 }),
    ]);
  });

  it('aggregiert Tagesbuchungen im Jahresbericht in den passenden Monats-Bucket', () => {
    const result = report('year', {
      purchases: [receipt],
      sales: [
        sale,
        {
          ...sale,
          id: 'sale-2',
          sale_date: '2026-08-03',
          sale_price: 10,
          sale_price_total: 10,
          lines: [
            {
              ...sale.lines![0],
              id: 'line-2',
              sale_id: 'sale-2',
              quantity: 1,
              unit_sale_price: 10,
              line_total: 10,
              cost_of_goods_sold: 4,
            },
          ],
        },
      ],
    });

    const august = result.points.find((point) => point.date === '2026-08-01');
    expect(august).toMatchObject({ revenue: 29.98, expenses: 24.95, realizedProfit: 14 });
    expect(result.revenue).toBe(29.98);
    expect(result.purchaseSpend).toBe(24.95);
    expect(result.grossProfit).toBe(14);
  });
});

describe('Vergleich mit dem Zeitraum davor', () => {
  const september17 = new Date(2026, 8, 17);

  it.each([
    ['today', 'gestern', '2026-09-16', '2026-09-15'],
    ['last_7_days', '04.–10.09.', '2026-09-04', '2026-09-03'],
    ['month', '01.–17.08.', '2026-08-17', '2026-08-18'],
    ['year', '01.01.–17.09.2025', '2025-09-17', '2025-09-18'],
  ] as const)(
    'vergleicht %s mit %s und zählt nur Verkäufe innerhalb der Grenzen',
    (range, label, insideDate, outsideDate) => {
      const result = report(
        range,
        {
          sales: [
            saleOn('current', '2026-09-17', 50),
            saleOn('previous-inside', insideDate, 20),
            saleOn('previous-outside', outsideDate, 7),
          ],
        },
        september17,
      );

      expect(result.comparison.label).toBe(label);
      expect(result.comparison.revenue).toBe(20);
      expect(result.comparison.soldItems).toBe(2);
    },
  );

  it('endet bei einem kürzeren Vormonat am Monatsende', () => {
    const result = report(
      'month',
      { sales: [saleOn('february-end', '2026-02-28', 12)] },
      new Date(2026, 2, 31),
    );

    expect(result.comparison.label).toBe('01.–28.02.');
    expect(result.comparison.revenue).toBe(12);
  });

  it('macht aus dem 29.02. im Vorjahr den 28.02.', () => {
    const result = report(
      'year',
      { sales: [saleOn('last-year', '2027-02-28', 8)] },
      new Date(2028, 1, 29),
    );

    expect(result.comparison.label).toBe('01.01.–28.02.2027');
    expect(result.comparison.revenue).toBe(8);
  });

  it('rechnet Gewinn, Ausgaben und Marge des Vergleichszeitraums nach denselben Regeln', () => {
    const result = report(
      'last_7_days',
      {
        purchases: [{ ...receipt, purchase_date: '2026-09-05' }],
        sales: [saleOn('previous', '2026-09-06', 19.98)],
      },
      september17,
    );

    expect(result.comparison).toEqual({
      label: '04.–10.09.',
      grossProfit: 9,
      revenue: 19.98,
      totalExpenses: 25.95,
      soldItems: 2,
      averageMarginPercent: 45.05,
    });
  });
});

describe('Offene Kosten', () => {
  function inStock(id: string, purchase: Purchase, allocated: number | null): InventoryItem {
    return {
      id,
      workspace_id: 'workspace-1',
      title: `Artikel ${id}`,
      status: 'ready',
      condition: 'used',
      purchase_id: purchase.id,
      allocated_purchase_cost: allocated,
    } as InventoryItem;
  }

  function soldFrom(id: string, item: InventoryItem): Sale {
    return {
      ...sale,
      id,
      lines: [
        {
          ...sale.lines![0],
          id: `${id}-line`,
          sale_id: id,
          inventory_item_id: item.id,
          inventory_item: { ...item, status: 'sold' },
          cost_of_goods_sold: null,
        },
      ],
    } as Sale;
  }

  it('ordnet Verkäufe und Bestand ohne Kosten ihrem Einkauf mit Grund zu und sortiert nach Umfang', () => {
    const draft: Purchase = {
      ...receipt,
      id: 'purchase-draft',
      title: 'Kiste vom Flohmarkt',
      record_number: 'EK-0007',
      entry_status: 'draft',
      purchase_date: '2026-06-01',
    };
    const finalized: Purchase = {
      ...receipt,
      id: 'purchase-finalized',
      title: 'Paket ohne Verteilung',
      entry_status: 'finalized',
      purchase_date: '2026-06-02',
    };
    const draftItem = inStock('draft-item', draft, 5);
    const unallocatedItem = inStock('unallocated-item', finalized, null);

    const result = report('last_7_days', {
      purchases: [draft, finalized],
      sales: [soldFrom('draft-sale-1', draftItem), soldFrom('draft-sale-2', draftItem)],
      inventoryItems: [draftItem, unallocatedItem, inStock('known-item', finalized, 3)],
    });

    expect(result.openCosts).toEqual([
      {
        purchaseId: 'purchase-draft',
        title: 'Kiste vom Flohmarkt',
        recordNumber: 'EK-0007',
        reason: 'not_finalized',
        affectedSales: 2,
        affectedInventory: 1,
      },
      {
        purchaseId: 'purchase-finalized',
        title: 'Paket ohne Verteilung',
        recordNumber: null,
        reason: 'cost_not_allocated',
        affectedSales: 0,
        affectedInventory: 1,
      },
    ]);
    expect(result.salesWithoutCostCount).toBe(2);
    expect(result.salesWithoutPurchase).toBe(0);
    expect(result.inventoryItemsWithoutCost).toBe(2);
    expect(result.inventoryCostValue).toBe(3);
  });

  it('meldet einen gemischten Paketverkauf und den restlichen Paketinhalt am abgeschlossenen Einkauf', () => {
    const content = {
      ...sale.lines![0].inventory_item!,
      id: 'content',
      purchase_id: receipt.id,
      source_package_line_id: 'package',
      allocated_purchase_cost: null,
      status: 'ready' as const,
    };
    const unknownSale = {
      ...sale,
      id: 'unknown',
      lines: [{ ...sale.lines![0], inventory_item: content, cost_of_goods_sold: null }],
    };
    const result = report('last_7_days', {
      purchases: [
        { ...receipt, entry_status: 'finalized', purchase_price: 100, total_purchase_cost: 100 },
      ],
      sales: [sale, unknownSale],
      inventoryItems: [content],
    });

    expect(result.purchaseSpend).toBe(100);
    expect(result.revenue).toBe(39.96);
    expect(result.grossProfit).toBe(9);
    expect(result.revenueWithoutCost).toBe(19.98);
    expect(result.averageMarginPercent).toBe(45.05);
    expect(result.inventoryCostValue).toBe(0);
    expect(result.inventoryItemsWithoutCost).toBe(1);
    expect(result.openCosts).toEqual([
      expect.objectContaining({
        purchaseId: receipt.id,
        reason: 'cost_not_allocated',
        affectedSales: 1,
        affectedInventory: 1,
      }),
    ]);
    expect(result.points.find((point) => point.date === '2026-08-27')).toMatchObject({
      costOfGoodsSold: null,
      resultAfterDirectCosts: null,
    });
  });
});

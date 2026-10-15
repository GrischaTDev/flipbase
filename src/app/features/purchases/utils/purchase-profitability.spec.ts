import { describe, expect, it } from 'vitest';
import type { InventoryItem, Purchase, Sale, SaleLine } from '../../../core/models/flipbase.models';
import type { PurchasePresentationContext } from './purchase-presentation';
import { summarizePurchaseProfitability } from './purchase-profitability';

const purchase: Purchase = {
  id: 'purchase-a',
  workspace_id: 'workspace-1',
  type: 'single',
  title: 'Schuhe',
  purchase_date: '2026-10-01',
  purchase_price: 300,
  total_purchase_cost: 300,
  cost_allocation_mode: 'even',
};
const item = (id: string, purchaseId = purchase.id): InventoryItem => ({
  id,
  workspace_id: purchase.workspace_id,
  purchase_id: purchaseId,
  title: id,
  allocated_purchase_cost: 150,
  condition: 'used',
  status: 'sold',
  sale_state: 'sold',
});
const line = (id: string, amount: number, inventoryItem = item(id)): SaleLine => ({
  id,
  sale_id: 'sale-1',
  inventory_item_id: inventoryItem.id,
  inventory_item: inventoryItem,
  title_snapshot: id,
  quantity: 1,
  unit_sale_price: amount,
  line_total: amount,
  cost_of_goods_sold: 150,
  tax_mode: 'diff_25a',
});
const sale = (patch: Partial<Sale> = {}): Sale => ({
  id: 'sale-1',
  workspace_id: purchase.workspace_id,
  platform: 'direct',
  sale_date: '2026-10-10',
  sale_price: 400,
  sale_price_total: 400,
  platform_fee: 0,
  shipping_cost: 0,
  packaging_cost: 0,
  other_costs: 0,
  has_persisted_lines: true,
  lines: [line('shoe-1', 200), line('shoe-2', 200)],
  ...patch,
});
const context = (
  sales: Sale[],
  patch: Partial<PurchasePresentationContext> = {},
): PurchasePresentationContext => ({
  sales,
  inventoryItems: [],
  stockLots: [],
  stockMovements: [],
  inventoryState: 'loaded',
  stockState: 'loaded',
  salesState: 'loaded',
  ...patch,
});

describe('Ergebnis je Einkauf', () => {
  it('zieht die gesamten Einkaufskosten genau einmal von beiden Verkäufen ab', () => {
    expect(summarizePurchaseProfitability(purchase, context([sale()]), 300)).toMatchObject({
      revenue: 400,
      sellingCosts: 0,
      result: 100,
      hasSales: true,
      state: 'loaded',
    });
  });
  it('zeigt bei einem Teilverkauf die noch nicht gedeckten Gesamtkosten', () => {
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([sale({ lines: [line('shoe-1', 200)], sale_price: 200 })]),
        300,
      ).result,
    ).toBe(-100);
  });
  it('unterscheidet keinen Verkauf, echte Null und unbekannte Einkaufskosten', () => {
    expect(summarizePurchaseProfitability(purchase, context([]), 300)).toMatchObject({
      revenue: 0,
      result: -300,
      hasSales: false,
    });
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([sale({ lines: [line('shoe-1', 0)], sale_price: 0 })]),
        0,
      ),
    ).toMatchObject({ revenue: 0, result: 0, hasSales: true });
    expect(summarizePurchaseProfitability(purchase, context([sale()]), null)).toMatchObject({
      revenue: 400,
      result: null,
    });
  });
  it('verteilt Versand, Gebühren und Erstattungen nach dem Artikelerlös auf gemischte Einkäufe', () => {
    const mixed = sale({
      lines: [line('a', 100), line('b', 300, item('b', 'purchase-b'))],
      shipping_revenue: 20,
      platform_fee: 20,
      shipping_cost: 10,
      refund_amount: 40,
      cost_entries: [
        {
          id: 'cost',
          workspace_id: purchase.workspace_id,
          sale_id: 'sale-1',
          category: 'packaging',
          amount: 10,
        },
      ],
      packaging_cost: 99,
    });
    expect(summarizePurchaseProfitability(purchase, context([mixed]), 50)).toMatchObject({
      revenue: 95,
      sellingCosts: 10,
      result: 35,
    });
    expect(
      summarizePurchaseProfitability({ ...purchase, id: 'purchase-b' }, context([mixed]), 150),
    ).toMatchObject({ revenue: 285, sellingCosts: 30, result: 105 });
  });
  it('teilt Mengenpositionen anhand der tatsächlich entnommenen Einkaufslose auf', () => {
    const quantitySale = sale({
      lines: [
        {
          ...line('quantity', 300),
          inventory_item: undefined,
          inventory_item_id: null,
          quantity: 3,
          unit_sale_price: 100,
        },
      ],
      lot_allocations: [
        {
          id: 'allocation-a',
          workspace_id: purchase.workspace_id,
          sale_line_id: 'quantity',
          stock_lot_id: 'lot-a',
          quantity: 1,
          unit_cost: 30,
        },
        {
          id: 'allocation-b',
          workspace_id: purchase.workspace_id,
          sale_line_id: 'quantity',
          stock_lot_id: 'lot-b',
          quantity: 2,
          unit_cost: 30,
        },
      ],
      platform_fee: 30,
    });
    const lots = ['a', 'b'].map((id) => ({
      id: `lot-${id}`,
      workspace_id: purchase.workspace_id,
      purchase_id: `purchase-${id}`,
      purchase_line_id: `line-${id}`,
      catalog_product_id: 'catalog-1',
      received_quantity: 3,
      remaining_quantity: 0,
      unit_cost: 30,
      received_at: '2026-10-01',
    }));
    expect(
      summarizePurchaseProfitability(purchase, context([quantitySale], { stockLots: lots }), 30),
    ).toMatchObject({ revenue: 100, sellingCosts: 10, result: 60 });
  });
  it('berücksichtigt Retouren mit Erstattung und verbleibenden direkten Kosten, aber keine Stornos', () => {
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([sale({ returned_at: '2026-10-12', refund_amount: 400, platform_fee: 10 })]),
        300,
      ),
    ).toMatchObject({ revenue: 0, sellingCosts: 10, result: -310, hasSales: true });
    expect(
      summarizePurchaseProfitability(purchase, context([sale({ voided_at: '2026-10-12' })]), 300),
    ).toMatchObject({ revenue: 0, sellingCosts: 0, hasSales: false });
  });
  it('bewertet eine alte Retoure ohne bekannten Erstattungsbetrag nicht als vollen Erlös', () => {
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([sale({ returned_at: '2026-10-12', refund_amount: null })]),
        300,
      ),
    ).toMatchObject({ state: 'review', revenue: null, result: null });
  });
  it('ordnet Altverkäufe mit enthaltenem Käuferversand ohne doppelte Versandzählung zu', () => {
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([
          sale({
            has_persisted_lines: false,
            inventory_item_id: 'legacy',
            inventory_item: item('legacy'),
            sale_price: 205,
            sale_price_total: 205,
            shipping_revenue: 5,
            lines: [],
            shipping_cost: 5,
          }),
        ]),
        150,
      ),
    ).toMatchObject({ revenue: 205, sellingCosts: 5, result: 50 });
  });
  it.each(['loading', 'error'] as const)(
    'stellt nicht geladene Verkäufe nicht als null dar: %s',
    (salesState) => {
      expect(
        summarizePurchaseProfitability(purchase, context([], { salesState }), 300),
      ).toMatchObject({ state: salesState, revenue: null, result: null });
    },
  );
  it('meldet einen verkauften Artikel ohne Verkaufsbeleg zur Prüfung', () => {
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([], { inventoryItems: [item('missing')] }),
        300,
      ),
    ).toMatchObject({ state: 'review', revenue: null, result: null });
  });

  it.each(['legacy_sold_unverified', 'multiple_active_sales', 'sale_status_conflict'] as const)(
    'stellt einen widersprüchlichen Verkaufsstand nicht als vollständige Summe dar: %s',
    (saleState) => {
      expect(
        summarizePurchaseProfitability(
          purchase,
          context([sale()], { inventoryItems: [{ ...item('shoe-1'), sale_state: saleState }] }),
          300,
        ),
      ).toMatchObject({ state: 'review', result: null });
    },
  );
  it('ignoriert fremde Workspaces und verteilt bei Nullerlösen gemeinsame Kosten nach Menge', () => {
    const free = sale({
      lines: [line('a', 0), line('b', 0, item('b', 'purchase-b'))],
      platform_fee: 1,
    });
    expect(
      summarizePurchaseProfitability(
        purchase,
        context([free, sale({ id: 'foreign', workspace_id: 'other' })]),
        0,
      ),
    ).toMatchObject({ revenue: 0, sellingCosts: 0.5, result: -0.5 });
  });
  it('verteilt Rundungsreste deterministisch, sodass kein Cent verschwindet', () => {
    const shared = sale({
      lines: [
        line('a', 1),
        line('b', 1, item('b', 'purchase-b')),
        line('c', 1, item('c', 'purchase-c')),
      ],
      platform_fee: 0.01,
    });
    const results = ['purchase-a', 'purchase-b', 'purchase-c'].map((id) =>
      summarizePurchaseProfitability({ ...purchase, id }, context([shared]), 0),
    );
    expect(results.map((result) => result.sellingCosts)).toEqual([0.01, 0, 0]);
  });

  it('behält stornierte Mengenverkäufe als bekannten Verlauf, ohne Erlöse zu zählen', () => {
    const stockLot = {
      id: 'lot-a',
      workspace_id: purchase.workspace_id,
      purchase_id: purchase.id,
      purchase_line_id: 'purchase-line',
      catalog_product_id: 'catalog',
      received_quantity: 1,
      remaining_quantity: 1,
      unit_cost: 150,
      received_at: '2026-10-01',
    };
    const quantityLine = {
      ...line('quantity', 200),
      inventory_item_id: null,
      inventory_item: undefined,
      lot_allocations: [
        {
          id: 'allocation',
          workspace_id: purchase.workspace_id,
          sale_line_id: 'quantity',
          stock_lot_id: 'lot-a',
          quantity: 1,
          unit_cost: 150,
        },
      ],
    };
    const state = context([sale({ voided_at: '2026-10-12', lines: [quantityLine] })], {
      stockLots: [stockLot],
      stockMovements: [
        {
          id: 'out',
          workspace_id: purchase.workspace_id,
          stock_lot_id: 'lot-a',
          sale_line_id: 'quantity',
          reason: 'sale',
          direction: 'out',
          quantity: 1,
        },
      ],
    });
    expect(summarizePurchaseProfitability(purchase, state, 150)).toMatchObject({
      state: 'loaded',
      revenue: 0,
      sellingCosts: 0,
      hasSales: false,
    });
  });
});

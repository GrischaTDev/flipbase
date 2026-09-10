import { describe, expect, it } from 'vitest';
import { Purchase, PurchaseLine } from '../models/flipbase.models';
import { buildProductCostPlan } from './product-cost-plan';

const purchase: Purchase = {
  id: 'p',
  workspace_id: 'w',
  type: 'lot',
  title: 'Einkauf',
  purchase_date: '2026-09-08',
  purchase_price: 65,
  pricing_mode: 'individual',
  cost_allocation_mode: 'even',
};
const line = (id: string, quantity: number, price: number): PurchaseLine => ({
  id,
  workspace_id: 'w',
  purchase_id: 'p',
  catalog_product_id: 'product',
  title_snapshot: 'Schuh',
  line_kind: 'quantity',
  ordered_quantity: quantity,
  received_quantity: quantity,
  unit_purchase_price: price,
  line_total: quantity * price,
  price_mode: 'priced',
});

describe('buildProductCostPlan', () => {
  it('verteilt Waren- und Zusatzcentpools separat wie der Datenbankvertrag', () => {
    const result = buildProductCostPlan(
      {
        ...purchase,
        purchase_price: 0.03,
        discount_amount: 0.02,
        costs: [{ type: 'shipping', amount: 0.01, allocation_method: 'quantity' }],
      },
      [line('a', 3, 0.01)],
    );
    expect(result[0]?.unitCents).toEqual([2, 0, 0]);
  });
  it('behält unterschiedliche Einkaufspreise für dieselbe Produkt-ID', () => {
    const result = buildProductCostPlan(purchase, [line('a', 2, 10), line('b', 3, 15)]);
    expect(result.map((entry) => entry.totalCents)).toEqual([2000, 4500]);
    expect(result.map((entry) => entry.unitCents)).toEqual([
      [1000, 1000],
      [1500, 1500, 1500],
    ]);
  });
  it('verteilt Gesamtkosten als eine stabile Centfolge über alle Einheiten', () => {
    const lines = [line('a', 2, 0), line('b', 3, 0)].map((entry) => ({
      ...entry,
      unit_purchase_price: null,
      line_total: null,
      price_mode: 'unpriced_mystery' as const,
    }));
    const result = buildProductCostPlan(
      { ...purchase, pricing_mode: 'total', purchase_price: 0.12 },
      lines,
    );
    expect(result.flatMap((entry) => entry.unitCents)).toEqual([3, 3, 2, 2, 2]);
    expect(result.map((entry) => entry.totalCents)).toEqual([6, 6]);
  });
  it('verteilt Rabatt nach Wert, Zusatzkosten nach Menge und direkte Kosten auf die Zielposition', () => {
    const result = buildProductCostPlan(
      {
        ...purchase,
        discount_amount: 6.5,
        costs: [
          { type: 'shipping', amount: 5, allocation_method: 'quantity' },
          { type: 'customs', amount: 2, allocation_method: 'direct', target_purchase_line_id: 'a' },
        ],
      },
      [line('a', 2, 10), line('b', 3, 15)],
    );
    expect(result.map((entry) => entry.totalCents)).toEqual([2200, 4350]);
    expect(result.map((entry) => entry.additionalCents)).toEqual([400, 300]);
  });
  it('weist offene Preise und einen widersprüchlichen Warenbetrag zurück', () => {
    expect(() => buildProductCostPlan(purchase, [line('a', 1, 10)])).toThrow();
    expect(() =>
      buildProductCostPlan({ ...purchase, purchase_price: null }, [
        { ...line('a', 1, 10), line_total: null, unit_purchase_price: null },
      ]),
    ).toThrow();
  });
});

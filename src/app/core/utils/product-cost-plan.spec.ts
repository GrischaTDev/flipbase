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
  it('trennt Verkäuferkosten von externen Kosten im steuerlichen Einkaufspreis', () => {
    const result = buildProductCostPlan(
      {
        ...purchase,
        purchase_price: 100,
        costs: [
          {
            type: 'shipping',
            amount: 10,
            allocation_method: 'quantity',
            tax_treatment: 'purchase_price',
          },
          { type: 'shipping', amount: 20, allocation_method: 'quantity', tax_treatment: 'expense' },
        ],
      },
      [line('a', 1, 100)],
    );
    expect(result[0].unitCents).toEqual([13000]);
    expect(result[0].unitTaxPurchaseCents).toEqual([11000]);
  });
  it.each([0, 0.01, 0.02, 0.03])(
    'ordnet Verkäufer-Restcent denselben Einheiten zu bei %s Euro externen Kosten',
    (expense) => {
      const [result] = buildProductCostPlan(
        {
          ...purchase,
          purchase_price: 0.03,
          discount_amount: 0.02,
          costs: [
            {
              type: 'shipping',
              amount: 0.02,
              allocation_method: 'quantity',
              tax_treatment: 'purchase_price',
            },
            {
              type: 'shipping',
              amount: expense,
              allocation_method: 'quantity',
              tax_treatment: 'expense',
            },
          ],
        },
        [line('a', 3, 0.01)],
      );
      expect(result.unitTaxPurchaseCents).toEqual([2, 1, 0]);
      expect(result.unitTaxPurchaseCents?.reduce((sum, value) => sum + value, 0)).toBe(3);
      expect(result.unitCents.reduce((sum, value) => sum + value, 0)).toBe(
        3 + Math.round(expense * 100),
      );
      result.unitTaxPurchaseCents?.forEach((value, index) => {
        expect(value).toBeLessThanOrEqual(result.unitCents[index]);
      });
    },
  );
  it('bewahrt beim 10-Euro-Restcentfall identische Stückwerte, wenn alle Zusatzkosten steuerlich dazugehören', () => {
    const [result] = buildProductCostPlan(
      {
        ...purchase,
        purchase_price: 10.02,
        discount_amount: 0.02,
        costs: [
          {
            type: 'shipping',
            amount: 0.01,
            allocation_method: 'quantity',
            tax_treatment: 'purchase_price',
          },
        ],
      },
      [line('a', 3, 3.34)],
    );
    expect(result.unitCents).toEqual([335, 333, 333]);
    expect(result.unitTaxPurchaseCents).toEqual(result.unitCents);
    expect(result.unitTaxPurchaseCents?.reduce((sum, value) => sum + value, 0)).toBe(1001);
  });
  it('entnimmt einen steuerlichen Teilbetrag ausschließlich aus den am Stück vorhandenen Zusatzkosten', () => {
    const base = { ...purchase, purchase_price: 10.02, discount_amount: 0.02 };
    const goodsOnly = buildProductCostPlan(base, [line('a', 3, 3.34)])[0];
    const [result] = buildProductCostPlan(
      {
        ...base,
        costs: [
          {
            type: 'shipping',
            amount: 0.02,
            allocation_method: 'quantity',
            tax_treatment: 'purchase_price',
          },
          {
            type: 'shipping',
            amount: 0.02,
            allocation_method: 'quantity',
            tax_treatment: 'expense',
          },
        ],
      },
      [line('a', 3, 3.34)],
    );
    expect(result.unitCents).toEqual([336, 334, 334]);
    expect(result.unitTaxPurchaseCents).toEqual([335, 334, 333]);
    expect(result.unitTaxPurchaseCents?.reduce((sum, value) => sum + value, 0)).toBe(1002);
    result.unitTaxPurchaseCents?.forEach((cost, index) => {
      const taxExtra = cost - goodsOnly.unitCents[index];
      const availableExtra = result.unitCents[index] - goodsOnly.unitCents[index];
      expect(taxExtra).toBeGreaterThanOrEqual(0);
      expect(taxExtra).toBeLessThanOrEqual(availableExtra);
    });
  });
  it('erfindet bei ungeklärter Belegzuordnung keinen steuerlichen Einkaufspreis', () => {
    const result = buildProductCostPlan(
      {
        ...purchase,
        purchase_price: 100,
        costs: [
          { type: 'shipping', amount: 20, allocation_method: 'quantity', tax_treatment: null },
        ],
      },
      [line('a', 1, 100)],
    );
    expect(result[0].unitCents).toEqual([12000]);
    expect(result[0].unitTaxPurchaseCents).toBeNull();
  });
  it('verteilt den steuerlichen Centpool bei Gesamtpreisen unabhängig von externen Kosten', () => {
    const result = buildProductCostPlan(
      {
        ...purchase,
        pricing_mode: 'total',
        purchase_price: 0.04,
        costs: [
          {
            type: 'shipping',
            amount: 0.01,
            allocation_method: 'quantity',
            tax_treatment: 'purchase_price',
          },
          {
            type: 'shipping',
            amount: 0.02,
            allocation_method: 'quantity',
            tax_treatment: 'expense',
          },
        ],
      },
      [{ ...line('a', 3, 0), unit_purchase_price: null, line_total: null }],
    );
    expect(result[0].unitCents).toEqual([3, 2, 2]);
    expect(result[0].unitTaxPurchaseCents).toEqual([2, 2, 1]);
  });
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

import { describe, expect, it } from 'vitest';
import {
  PURCHASE_COST_ADJUSTMENT_OPTIONS,
  createPurchaseCostAdjustmentRows,
  serializePurchaseCostAdjustmentRows,
} from './purchase-cost-adjustments';

describe('purchase cost adjustments', () => {
  it('bietet die zehn Anpassungen aus der Einkaufsreferenz an', () => {
    expect(PURCHASE_COST_ADJUSTMENT_OPTIONS.map((option) => option.label)).toEqual([
      'Versandkosten',
      'Zollgebühren',
      'Rabatt',
      'Auslandstransaktionsgebühr',
      'Frachtgebühr',
      'Versicherung',
      'Eilgebühr',
      'Zuschlag',
      'Zölle',
      'Sonstiges',
    ]);
  });

  it('trennt Rabatt beim Speichern von positiven Zusatzkosten', () => {
    const result = serializePurchaseCostAdjustmentRows([
      {
        adjustment: 'discount',
        amount: 12.5,
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
        sourceCost: null,
      },
      {
        adjustment: 'shipping',
        amount: 8,
        allocationMethod: 'by_quantity',
        targetPurchaseLineId: null,
        sourceCost: null,
      },
    ]);

    expect(result).toEqual({
      discountAmount: 12.5,
      costs: [
        {
          type: 'shipping',
          amount: 8,
          description: 'Versandkosten',
          allocationMethod: 'by_quantity',
          targetPurchaseLineId: null,
        },
      ],
    });
  });

  it('bewahrt bestehende Kostenarten und Beschreibungen bei unveränderter Anpassung', () => {
    const existingCost = {
      type: 'travel' as const,
      amount: 25,
      description: 'Abholung Hamburg',
      allocationMethod: 'direct' as const,
      targetPurchaseLineId: 'line-1',
    };

    const [row] = createPurchaseCostAdjustmentRows([existingCost], 0);
    const result = serializePurchaseCostAdjustmentRows([{ ...row, amount: 30 }]);

    expect(result.costs).toEqual([{ ...existingCost, amount: 30 }]);
  });

  it('führt einen vorhandenen Rabatt als bearbeitbare Anpassungszeile', () => {
    expect(createPurchaseCostAdjustmentRows([], 19)).toEqual([
      {
        adjustment: 'discount',
        amount: 19,
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
        sourceCost: null,
      },
    ]);
  });
});

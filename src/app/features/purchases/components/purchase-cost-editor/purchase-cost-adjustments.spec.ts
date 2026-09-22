import { describe, expect, it } from 'vitest';
import {
  PURCHASE_COST_ADJUSTMENT_OPTIONS,
  createPurchaseCostAdjustmentRows,
  serializePurchaseCostAdjustmentRows,
} from './purchase-cost-adjustments';

describe('purchase cost adjustments', () => {
  it('bietet die relevanten Zusatzausgaben in Prioritätsreihenfolge an', () => {
    expect(PURCHASE_COST_ADJUSTMENT_OPTIONS.map((option) => option.label)).toEqual([
      'Versandkosten',
      'Käuferschutzgebühr',
      'Zollgebühren',
      'Versicherung',
      'Rabatt',
      'Sonstiges',
    ]);
  });

  it('speichert die Käuferschutzgebühr als eigenständige Gebühr', () => {
    expect(
      serializePurchaseCostAdjustmentRows([
        {
          adjustment: 'buyer_protection_fee',
          amount: 1.95,
          allocationMethod: 'by_value',
          targetPurchaseLineId: null,
          sourceCost: null,
        },
      ]).costs,
    ).toEqual([
      {
        type: 'fee',
        amount: 1.95,
        description: 'Käuferschutzgebühr',
        taxTreatment: null,
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
      },
    ]);
  });

  it('bewahrt ältere Fracht- und Auslandsgebühren beim Bearbeiten unter Sonstiges', () => {
    const legacyCosts = [
      {
        type: 'transport' as const,
        amount: 7,
        description: 'Frachtgebühr',
        allocationMethod: 'by_value' as const,
        targetPurchaseLineId: null,
      },
      {
        type: 'fee' as const,
        amount: 2,
        description: 'Auslandstransaktionsgebühr',
        allocationMethod: 'by_value' as const,
        targetPurchaseLineId: null,
      },
    ];
    const rows = createPurchaseCostAdjustmentRows(legacyCosts, 0);
    expect(rows.map((row) => row.adjustment)).toEqual(['other', 'other']);
    expect(serializePurchaseCostAdjustmentRows(rows).costs.map((cost) => cost.description)).toEqual(
      ['Frachtgebühr', 'Auslandstransaktionsgebühr'],
    );
  });

  it('fasst ältere Zölle unter Zollgebühren zusammen', () => {
    const rows = createPurchaseCostAdjustmentRows(
      [
        {
          type: 'customs',
          amount: 5,
          description: 'Zölle',
          allocationMethod: 'by_value',
          targetPurchaseLineId: null,
        },
      ],
      0,
    );
    expect(rows[0].adjustment).toBe('customs_fee');
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
          taxTreatment: null,
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

    expect(result.costs).toEqual([{ ...existingCost, amount: 30, taxTreatment: null }]);
  });

  it.each(['purchase_price', 'expense', null] as const)(
    'bewahrt die ausdrückliche Kostenzuordnung %s beim Bearbeiten',
    (taxTreatment) => {
      const cost = {
        type: 'shipping' as const,
        amount: 12,
        description: 'Versand',
        allocationMethod: 'by_value' as const,
        targetPurchaseLineId: null,
        taxTreatment,
      };
      const rows = createPurchaseCostAdjustmentRows([cost], 0);
      expect(serializePurchaseCostAdjustmentRows(rows).costs).toEqual([cost]);
    },
  );

  it('leitet beim Wechsel der Kostenart keine neue Zuordnung ab', () => {
    const [row] = createPurchaseCostAdjustmentRows(
      [
        {
          type: 'shipping',
          amount: 12,
          description: 'Versand',
          allocationMethod: 'by_value',
          targetPurchaseLineId: null,
          taxTreatment: null,
        },
      ],
      0,
    );
    expect(
      serializePurchaseCostAdjustmentRows([{ ...row, adjustment: 'buyer_protection_fee' }]).costs[0]
        .taxTreatment,
    ).toBeNull();
  });

  it('führt einen vorhandenen Rabatt als bearbeitbare Anpassungszeile', () => {
    expect(createPurchaseCostAdjustmentRows([], 19)).toEqual([
      {
        adjustment: 'discount',
        amount: 19,
        taxTreatment: null,
        allocationMethod: 'by_value',
        targetPurchaseLineId: null,
        sourceCost: null,
      },
    ]);
  });
});

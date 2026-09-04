import { describe, expect, it } from 'vitest';
import type { Sale } from '../models/flipbase.models';
import { calculateSaleMetrics, calculateStoredSaleMetrics } from './sale-metrics';

describe('calculateSaleMetrics', () => {
  it('trennt im eBay-Beispiel Verkaufserlös, Verkaufskosten und Wareneinsatz', () => {
    expect(
      calculateSaleMetrics({
        itemRevenue: 39.99,
        buyerShippingRevenue: 2.99,
        costOfGoodsSold: 10,
        platformFees: 7.7,
        sellerShippingCost: 5.19,
        extraCosts: [],
      }),
    ).toEqual({
      revenue: 42.98,
      costOfGoodsSold: 10,
      sellingCosts: 12.89,
      resultAfterDirectCosts: 20.09,
      marginPercent: 46.74,
      roiPercent: 200.9,
    });
  });

  it('zieht Erstattungen vom Verkaufserlös ab und erhält Verluste', () => {
    expect(
      calculateSaleMetrics({
        itemRevenue: 50,
        buyerShippingRevenue: 5,
        costOfGoodsSold: 40,
        platformFees: 6,
        sellerShippingCost: 8,
        extraCosts: [{ amount: 2 }],
        refundAmount: 20,
      }),
    ).toEqual({
      revenue: 35,
      costOfGoodsSold: 40,
      sellingCosts: 16,
      resultAfterDirectCosts: -21,
      marginPercent: -60,
      roiPercent: -52.5,
    });
  });

  it('weist bei unbekanntem Wareneinsatz weder Ergebnis noch Marge oder ROI aus', () => {
    expect(
      calculateSaleMetrics({
        itemRevenue: 25,
        buyerShippingRevenue: 0,
        costOfGoodsSold: null,
        platformFees: 2,
        sellerShippingCost: 0,
        extraCosts: [],
      }),
    ).toEqual({
      revenue: 25,
      costOfGoodsSold: null,
      sellingCosts: 2,
      resultAfterDirectCosts: null,
      marginPercent: null,
      roiPercent: null,
    });
  });

  it('berechnet bei echtem Null-Wareneinsatz Ergebnis und Marge, aber keinen ROI', () => {
    expect(
      calculateSaleMetrics({
        itemRevenue: 25,
        buyerShippingRevenue: 0,
        costOfGoodsSold: 0,
        platformFees: 2,
        sellerShippingCost: 0,
        extraCosts: [],
      }),
    ).toEqual({
      revenue: 25,
      costOfGoodsSold: 0,
      sellingCosts: 2,
      resultAfterDirectCosts: 23,
      marginPercent: 92,
      roiPercent: null,
    });
  });

  it('summiert weitere Kosten und rundet erst an der Kennzahlengrenze auf Cent', () => {
    expect(
      calculateSaleMetrics({
        itemRevenue: 0.1 + 0.2,
        buyerShippingRevenue: 0,
        costOfGoodsSold: 0.1,
        platformFees: 0.07,
        sellerShippingCost: 0,
        extraCosts: [{ amount: 0.03 }, { amount: 0.04 }],
      }),
    ).toEqual({
      revenue: 0.3,
      costOfGoodsSold: 0.1,
      sellingCosts: 0.14,
      resultAfterDirectCosts: 0.06,
      marginPercent: 20,
      roiPercent: 60,
    });
  });

  it('weist bei null Euro Verkaufserlös keine Marge aus', () => {
    expect(
      calculateSaleMetrics({
        itemRevenue: 10,
        buyerShippingRevenue: 0,
        costOfGoodsSold: 5,
        platformFees: 1,
        sellerShippingCost: 0,
        extraCosts: [],
        refundAmount: 10,
      }),
    ).toMatchObject({
      revenue: 0,
      resultAfterDirectCosts: -6,
      marginPercent: null,
      roiPercent: -120,
    });
  });
});

describe('calculateStoredSaleMetrics', () => {
  const knownItem = {
    id: 'item-1',
    allocated_purchase_cost: 10,
    purchase: { entry_status: 'finalized', purchase_price: 10 },
  } as NonNullable<Sale['inventory_item']>;
  it.each(['draft', 'needs_review'] as const)(
    'behandelt gespeicherte Nullkosten bei %s nicht als gültig',
    (entry_status) => {
      const inventory_item = {
        allocated_purchase_cost: 0,
        purchase: { entry_status, purchase_price: null },
      } as Sale['inventory_item'];
      expect(
        calculateStoredSaleMetrics({
          ...persistedSale,
          inventory_item,
          lines: [{ ...persistedSale.lines![0], inventory_item, cost_of_goods_sold: 0 }],
        }).costOfGoodsSold,
      ).toBeNull();
      expect(
        calculateStoredSaleMetrics({ ...persistedSale, inventory_item, has_persisted_lines: false })
          .costOfGoodsSold,
      ).toBeNull();
    },
  );

  it('erhält finalisierte echte Nullkosten und lehnt fehlende Herkunft ab', () => {
    const inventory_item = {
      allocated_purchase_cost: 0,
      purchase: { entry_status: 'finalized', purchase_price: 0 },
    } as Sale['inventory_item'];
    expect(
      calculateStoredSaleMetrics({ ...persistedSale, inventory_item, has_persisted_lines: false })
        .costOfGoodsSold,
    ).toBe(0);
    expect(
      calculateStoredSaleMetrics({
        ...persistedSale,
        inventory_item: { allocated_purchase_cost: 0 } as Sale['inventory_item'],
        has_persisted_lines: false,
      }).costOfGoodsSold,
    ).toBeNull();
  });
  const persistedSale: Sale = {
    id: 'sale-1',
    workspace_id: 'workspace-1',
    platform: 'ebay',
    sale_price: 42.98,
    sale_price_total: 42.98,
    sale_date: '2026-08-30',
    platform_fee: 7.7,
    shipping_cost: 5.19,
    packaging_cost: 99,
    other_costs: 99,
    shipping_revenue: 2.99,
    refund_amount: 0,
    has_persisted_lines: true,
    lines: [
      {
        id: 'line-1',
        inventory_item_id: 'item-1',
        inventory_item: knownItem,
        sale_id: 'sale-1',
        title_snapshot: 'Nackenkissen',
        quantity: 1,
        unit_sale_price: 39.99,
        line_total: 39.99,
        cost_of_goods_sold: 10,
        tax_mode: 'diff_25a',
      },
    ],
    cost_entries: [
      {
        id: 'cost-1',
        workspace_id: 'workspace-1',
        sale_id: 'sale-1',
        category: 'packaging',
        amount: 0.5,
      },
      {
        id: 'cost-2',
        workspace_id: 'workspace-1',
        sale_id: 'sale-1',
        category: 'other',
        amount: 1,
      },
    ],
  };

  it('nutzt persistierte Positionen und strukturierte Zusatzkosten ohne skalare Doppelerfassung', () => {
    expect(calculateStoredSaleMetrics(persistedSale)).toMatchObject({
      revenue: 42.98,
      costOfGoodsSold: 10,
      sellingCosts: 14.39,
      resultAfterDirectCosts: 18.59,
    });
  });

  it('verwendet für Altverkäufe ohne Kostenzeilen die skalaren Zusatzkosten', () => {
    expect(
      calculateStoredSaleMetrics({
        ...persistedSale,
        has_persisted_lines: false,
        lines: [],
        cost_entries: [],
        packaging_cost: 0.5,
        other_costs: 1,
        inventory_item: knownItem,
      }),
    ).toMatchObject({
      revenue: 42.98,
      costOfGoodsSold: 10,
      sellingCosts: 14.39,
      resultAfterDirectCosts: 18.59,
    });
  });

  it('meldet bei einem Altverkauf ohne Position und Artikel den Wareneinsatz als unbekannt', () => {
    expect(
      calculateStoredSaleMetrics({
        ...persistedSale,
        has_persisted_lines: false,
        lines: [],
        inventory_item: undefined,
      }),
    ).toMatchObject({
      costOfGoodsSold: null,
      resultAfterDirectCosts: null,
      marginPercent: null,
      roiPercent: null,
    });
  });

  it('nimmt bei Altverkäufen belegte Artikel-Zusatzkosten in den Wareneinsatz auf', () => {
    expect(
      calculateStoredSaleMetrics({
        ...persistedSale,
        has_persisted_lines: false,
        lines: [],
        cost_entries: [],
        packaging_cost: 0,
        other_costs: 0,
        inventory_item: {
          ...knownItem,
          allocated_purchase_cost: 10,
          costs: [{ type: 'repair', amount: 2 }],
        } as Sale['inventory_item'],
      }),
    ).toMatchObject({ costOfGoodsSold: 12, resultAfterDirectCosts: 18.09 });
  });

  it('erhält bei sparsamen Altverkäufen den Verkaufspreis und die gespeicherten Gesamtkosten', () => {
    expect(
      calculateStoredSaleMetrics({
        ...persistedSale,
        has_persisted_lines: false,
        lines: undefined,
        sale_price_total: undefined,
        sale_price: 100,
        shipping_revenue: undefined,
        platform_fee: undefined as unknown as number,
        shipping_cost: undefined as unknown as number,
        packaging_cost: undefined as unknown as number,
        other_costs: undefined as unknown as number,
        refund_amount: undefined,
        cost_entries: undefined,
        inventory_item: {
          ...knownItem,
          allocated_purchase_cost: 10,
          total_item_cost: 40,
        } as Sale['inventory_item'],
      }),
    ).toEqual({
      revenue: 100,
      costOfGoodsSold: 40,
      sellingCosts: 0,
      resultAfterDirectCosts: 60,
      marginPercent: 60,
      roiPercent: 150,
    });
  });
});

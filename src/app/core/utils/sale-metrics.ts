import { SaleMetrics, SaleMetricsInput } from '../models/sale-metrics.models';
import { Sale, SaleLine } from '../models/flipbase.models';

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateSaleMetrics(input: SaleMetricsInput): SaleMetrics {
  const revenue = round(
    input.itemRevenue + input.buyerShippingRevenue - (input.refundAmount ?? 0),
    2,
  );
  const sellingCosts = round(
    input.platformFees +
      input.sellerShippingCost +
      input.extraCosts.reduce((sum, cost) => sum + cost.amount, 0),
    2,
  );
  const costOfGoodsSold = input.costOfGoodsSold === null ? null : round(input.costOfGoodsSold, 2);

  if (costOfGoodsSold === null) {
    return {
      revenue,
      costOfGoodsSold,
      sellingCosts,
      resultAfterDirectCosts: null,
      marginPercent: null,
      roiPercent: null,
    };
  }

  const resultAfterDirectCosts = round(revenue - costOfGoodsSold - sellingCosts, 2);
  return {
    revenue,
    costOfGoodsSold,
    sellingCosts,
    resultAfterDirectCosts,
    marginPercent: revenue === 0 ? null : round((resultAfterDirectCosts / revenue) * 100, 2),
    roiPercent:
      costOfGoodsSold > 0 ? round((resultAfterDirectCosts / costOfGoodsSold) * 100, 2) : null,
  };
}

function lineTotal(lines: readonly SaleLine[], field: 'line_total' | 'cost_of_goods_sold'): number {
  return lines.reduce((sum, line) => sum + Number(line[field] ?? 0), 0);
}

/** Übersetzt einen gespeicherten Verkauf einmalig in den gemeinsamen Kennzahlenvertrag. */
export function calculateStoredSaleMetrics(sale: Sale): SaleMetrics {
  const persistedLines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
  const buyerShippingRevenue = Number(sale.shipping_revenue ?? 0);
  const grossFallback = Number(sale.sale_price_total ?? sale.sale_price ?? 0);
  const itemRevenue =
    persistedLines.length > 0
      ? lineTotal(persistedLines, 'line_total')
      : grossFallback - buyerShippingRevenue;

  let costOfGoodsSold: number | null = null;
  if (persistedLines.length > 0) {
    costOfGoodsSold = lineTotal(persistedLines, 'cost_of_goods_sold');
  } else if (sale.inventory_item) {
    costOfGoodsSold =
      sale.inventory_item.total_item_cost !== undefined
        ? Number(sale.inventory_item.total_item_cost)
        : Number(sale.inventory_item.allocated_purchase_cost) +
          (sale.inventory_item.costs ?? []).reduce(
            (sum, cost) => sum + Number(cost.amount ?? 0),
            0,
          );
  }

  const extraCosts = sale.cost_entries?.length
    ? sale.cost_entries
    : [{ amount: Number(sale.packaging_cost ?? 0) }, { amount: Number(sale.other_costs ?? 0) }];

  return calculateSaleMetrics({
    itemRevenue,
    buyerShippingRevenue,
    costOfGoodsSold,
    platformFees: Number(sale.platform_fee ?? 0),
    sellerShippingCost: Number(sale.shipping_cost ?? 0),
    extraCosts,
    refundAmount: Number(sale.refund_amount ?? 0),
  });
}

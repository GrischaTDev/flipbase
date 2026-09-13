import type { Sale } from '../models/flipbase.models';

/** Unvollständige Gruppen bleiben offen; eine echte 0 bleibt ein bekannter Wert. */
export function sumKnownAmounts(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value == null || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

export function roundKnownAmount(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}

export function averageKnownAmounts(values: readonly (number | null | undefined)[]): number | null {
  const total = sumKnownAmounts(values);
  return total === null
    ? null
    : values.length === 0
      ? 0
      : roundKnownAmount(total / values.length, 1);
}

/** Gespeicherte Ergebniswerte dürfen einen offenen Wareneinsatz nicht überdecken. */
export function reportedSaleProfit(sale: Sale): number | null {
  return sale.cost_basis_status === 'unknown' ||
    sale.lines?.some((line) => !Number.isFinite(line.cost_of_goods_sold)) ||
    sale.inventory_item?.allocated_purchase_cost === null ||
    sale.net_profit == null ||
    !Number.isFinite(sale.net_profit)
    ? null
    : sale.net_profit;
}

export function reportedSaleRoi(sale: Sale): number | null {
  return reportedSaleProfit(sale) === null || sale.roi == null || !Number.isFinite(sale.roi)
    ? null
    : sale.roi;
}

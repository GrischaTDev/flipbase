import type {
  InventoryItem,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../../core/models/flipbase.models';
import {
  hasInventoryIntegrityConflict,
  isSellableInventoryItem,
} from '../../../../core/models/inventory-sellability';
import { summarizeStockQuantities } from '../../../../core/utils/stock-quantity';

export interface ProductStockSummary {
  readonly onHand: number | null;
  readonly available: number | null;
  readonly reserved: number | null;
}

/** Mengen und nachweislich zugeordnete Stücke; unklare Daten ergeben keine erfundene Null. */
export function summarizeProductStock(
  position: StockPosition | undefined,
  lots: readonly StockLot[],
  items: readonly InventoryItem[],
  movements: readonly StockMovement[] = [],
): ProductStockSummary {
  const stock = summarizeStockQuantities(position ? [position] : [], lots, movements);
  if (stock.state !== 'known') {
    return { onHand: null, available: null, reserved: null };
  }
  let { onHand, available, reserved } = stock;
  for (const item of new Map(items.map((item) => [item.id, item])).values()) {
    if (item.archived_at || item.status === 'archived') continue;
    if (
      hasInventoryIntegrityConflict(item) ||
      item.sale_state === 'legacy_sold_unverified' ||
      item.sale_state === 'legacy_sale_header_without_line'
    )
      return { onHand: null, available: null, reserved: null };
    if (item.status === 'sold' || item.sale_state === 'sold') continue;
    onHand++;
    if (isSellableInventoryItem(item)) available++;
    if (item.status === 'reserved') reserved++;
  }
  return { onHand, available, reserved };
}

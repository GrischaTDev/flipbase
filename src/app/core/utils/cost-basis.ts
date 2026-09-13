import type { InventoryItem, Purchase, Sale, SaleLine, StockLot } from '../models/flipbase.models';

export interface CostBasisRecords {
  readonly purchases?: readonly Purchase[];
  readonly inventoryItems?: readonly InventoryItem[];
  readonly stockLots?: readonly StockLot[];
}

export function purchaseForCost(
  source: Pick<InventoryItem, 'purchase_id' | 'workspace_id' | 'purchase'>,
  records: CostBasisRecords,
): Purchase | undefined {
  return (
    records.purchases?.find(
      (purchase) =>
        purchase.id === source.purchase_id && purchase.workspace_id === source.workspace_id,
    ) ?? source.purchase
  );
}

export function purchaseIsFinalized(purchase: Purchase | undefined): boolean {
  return (
    !!purchase &&
    purchase.purchase_price !== null &&
    Number.isFinite(purchase.purchase_price) &&
    (purchase.entry_status === 'finalized' || !!purchase.finalized_at)
  );
}

export function inventoryItemCost(item: InventoryItem, purchase = item.purchase): number | null {
  if (!purchaseIsFinalized(purchase) || item.allocated_purchase_cost == null) return null;
  const amount =
    item.total_item_cost ??
    item.allocated_purchase_cost + (item.costs ?? []).reduce((sum, cost) => sum + cost.amount, 0);
  return Number.isFinite(amount) ? amount : null;
}

function itemHasBasis(item: InventoryItem | undefined, records: CostBasisRecords): boolean {
  return !!item && inventoryItemCost(item, purchaseForCost(item, records)) !== null;
}

export function saleCostBasisStatus(
  sale: Sale,
  records: CostBasisRecords = {},
): 'known' | 'unknown' {
  const lines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
  if (lines.length === 0)
    return itemHasBasis(
      sale.inventory_item ??
        records.inventoryItems?.find(
          (item) => item.id === sale.inventory_item_id && item.workspace_id === sale.workspace_id,
        ),
      records,
    )
      ? 'known'
      : 'unknown';
  return lines.every((line) => lineHasBasis(line, sale, records)) ? 'known' : 'unknown';
}

function lineHasBasis(line: SaleLine, sale: Sale, records: CostBasisRecords): boolean {
  if (!Number.isFinite(line.cost_of_goods_sold)) return false;
  const item =
    line.inventory_item ??
    records.inventoryItems?.find(
      (item) => item.id === line.inventory_item_id && item.workspace_id === sale.workspace_id,
    ) ??
    (sale.inventory_item?.id === line.inventory_item_id ? sale.inventory_item : undefined);
  if (line.inventory_item_id || line.inventory_item) return itemHasBasis(item, records);
  const allocations = (line.lot_allocations ?? sale.lot_allocations ?? []).filter(
    (allocation) => allocation.sale_line_id === line.id,
  );
  return (
    allocations.length > 0 &&
    allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) === line.quantity &&
    allocations.every((allocation) => {
      const lot =
        allocation.stock_lot ??
        records.stockLots?.find(
          (lot) => lot.id === allocation.stock_lot_id && lot.workspace_id === sale.workspace_id,
        );
      return !!lot && purchaseIsFinalized(purchaseForCost(lot, records));
    })
  );
}

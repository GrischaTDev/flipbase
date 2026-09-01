import type { InventoryItem } from './flipbase.models';

type InventoryItemSellability = Pick<InventoryItem, 'status' | 'sale_state'>;

const lockedSaleStates = new Set<NonNullable<InventoryItemSellability['sale_state']>>([
  'sold',
  'legacy_sold_unverified',
  'legacy_sale_header_without_line',
  'sale_status_conflict',
  'multiple_active_sales',
]);

export function isSellableInventoryItem(item: InventoryItemSellability): boolean {
  return (
    (item.status === 'ready' || item.status === 'listed') && item.sale_state === 'no_active_sale'
  );
}

export function isInventoryItemMutationLocked(item: InventoryItemSellability): boolean {
  return (
    item.status === 'sold' ||
    hasInventoryIntegrityConflict(item) ||
    (!!item.sale_state && lockedSaleStates.has(item.sale_state))
  );
}

export function hasInventoryIntegrityConflict(item: InventoryItemSellability): boolean {
  return (
    !item.sale_state ||
    item.sale_state === 'sale_status_conflict' ||
    item.sale_state === 'multiple_active_sales'
  );
}

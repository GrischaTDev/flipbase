import type { InventoryItem } from './flipbase.models';

type InventoryItemSellability = Pick<InventoryItem, 'status' | 'sale_state'>;

export function isSellableInventoryItem(item: InventoryItemSellability): boolean {
  return (
    (item.status === 'ready' || item.status === 'listed') && item.sale_state === 'no_active_sale'
  );
}

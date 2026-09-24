import type {
  CatalogProduct,
  InventoryItem,
  PurchaseLine,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../core/models/flipbase.models';
import {
  hasInventoryIntegrityConflict,
  isSellableInventoryItem,
} from '../../../core/models/inventory-sellability';
import { summarizeStockQuantities } from '../../../core/utils/stock-quantity';
import type { ArticleRow } from '../models/article-row';

export interface CatalogOverviewRow extends ArticleRow {
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly ean?: string | null;
  readonly category?: string | null;
  readonly is_public_store: boolean;
  readonly primary_media_path?: string | null;
}

function itemQuantityState(item: InventoryItem): 'known' | 'review_required' {
  return !item.sale_state ||
    item.sale_state === 'legacy_sold_unverified' ||
    item.sale_state === 'legacy_sale_header_without_line' ||
    item.sale_state === 'sale_status_conflict' ||
    item.sale_state === 'multiple_active_sales' ||
    (item.sale_state === 'sold') !== (item.status === 'sold')
    ? 'review_required'
    : 'known';
}

function itemOnHand(item: InventoryItem): number | null {
  if (itemQuantityState(item) !== 'known') return null;
  return item.sale_state === 'sold' || item.status === 'archived' ? 0 : 1;
}

function itemValue(item: InventoryItem): number | null {
  const quantity = itemOnHand(item);
  if (quantity === null) return null;
  if (quantity === 0) return 0;
  const amount = Number(item.total_item_cost ?? item.allocated_purchase_cost);
  return Number.isFinite(amount) && item.allocated_purchase_cost !== null ? amount : null;
}

function availableItem(item: InventoryItem): number | null {
  if (itemQuantityState(item) !== 'known' || hasInventoryIntegrityConflict(item)) return null;
  if (item.archived_at || item.status === 'sold' || item.sale_state === 'sold') return 0;
  if (
    item.sale_state === 'legacy_sold_unverified' ||
    item.sale_state === 'legacy_sale_header_without_line'
  )
    return null;
  return isSellableInventoryItem(item) ? 1 : 0;
}

/** Nur gespeicherte Beziehungen verbinden Stücke mit einem Stammartikel. */
export function buildCatalogOverview(
  workspaceId: string,
  products: readonly CatalogProduct[],
  items: readonly InventoryItem[],
  purchaseLines: readonly PurchaseLine[],
  positions: readonly StockPosition[],
  lots: readonly StockLot[] = [],
  movements: readonly StockMovement[] = [],
): CatalogOverviewRow[] {
  const workspaceProducts = products.filter((product) => product.workspace_id === workspaceId);
  const productIds = new Set(workspaceProducts.map((product) => product.id));
  const lineProducts = new Map(
    purchaseLines
      .filter(
        (line) =>
          line.workspace_id === workspaceId &&
          !!line.catalog_product_id &&
          productIds.has(line.catalog_product_id),
      )
      .map((line) => [line.id, line.catalog_product_id!]),
  );
  const linked = new Map<string, InventoryItem[]>();
  const standalone: CatalogOverviewRow[] = [];
  for (const item of items.filter((entry) => entry.workspace_id === workspaceId)) {
    const productId = item.purchase_line_id ? lineProducts.get(item.purchase_line_id) : undefined;
    if (productId) {
      linked.set(productId, [...(linked.get(productId) ?? []), item]);
    } else {
      const media = [...(item.media ?? [])].sort(
        (a, b) =>
          Number(b.is_primary) - Number(a.is_primary) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      standalone.push({
        ...item,
        key: `item:${item.id}`,
        kind: 'item',
        is_public_store: item.is_public_store ?? false,
        primary_media_path: media[0]?.storage_path ?? null,
        onHand: itemOnHand(item),
        available: availableItem(item),
        reserved: itemQuantityState(item) === 'known' ? Number(item.status === 'reserved') : null,
        quantityState: itemQuantityState(item),
        inventoryValue: itemValue(item),
        archivedAt: item.archived_at ?? null,
        canOfferDelete:
          !item.purchase_id &&
          !item.purchase_line_id &&
          !item.source_package_line_id &&
          !item.costs?.length &&
          !item.is_public_store &&
          item.status !== 'reserved' &&
          item.status !== 'sold',
        detailLink: `/inventory/${item.id}`,
      });
    }
  }
  return [
    ...workspaceProducts.map((product): CatalogOverviewRow => {
      const counts = (linked.get(product.id) ?? []).map(availableItem);
      const stock = summarizeStockQuantities(
        positions.filter((position) => position.catalog_product_id === product.id),
        lots.filter(
          (lot) => lot.workspace_id === workspaceId && lot.catalog_product_id === product.id,
        ),
        movements,
      );
      const linkedItems = linked.get(product.id) ?? [];
      const linkedOnHand = linkedItems.map(itemOnHand);
      const linkedValue = linkedItems.map(itemValue);
      const quantityState =
        stock.state === 'known' && linkedOnHand.every((count) => count !== null)
          ? 'known'
          : 'review_required';
      const onHand =
        quantityState === 'known'
          ? stock.onHand + linkedOnHand.reduce<number>((sum, count) => sum + (count ?? 0), 0)
          : null;
      const reserved =
        quantityState === 'known'
          ? stock.reserved + linkedItems.filter((item) => item.status === 'reserved').length
          : null;
      const available =
        counts.some((count) => count === null) || stock.state !== 'known'
          ? null
          : product.archived_at
            ? 0
            : stock.available + counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
      const remainingLots = lots.filter(
        (lot) =>
          lot.workspace_id === workspaceId &&
          lot.catalog_product_id === product.id &&
          lot.remaining_quantity > 0,
      );
      const lotValue = remainingLots.reduce<number | null>((sum, lot) => {
        if (sum === null || lot.unit_cost == null) return null;
        if (lot.remaining_unit_costs?.length === lot.remaining_quantity) {
          const remainingCost = lot.remaining_unit_costs.reduce(
            (total, cost) => total + Number(cost),
            0,
          );
          return Number.isFinite(remainingCost) ? sum + remainingCost : null;
        }
        if (lot.remaining_quantity !== lot.received_quantity) return null;
        const unitCost = Number(lot.unit_cost);
        return Number.isFinite(unitCost) ? sum + unitCost * lot.remaining_quantity : null;
      }, 0);
      const inventoryValue =
        quantityState === 'known' &&
        lotValue !== null &&
        linkedValue.every((value) => value !== null)
          ? lotValue + linkedValue.reduce<number>((sum, value) => sum + (value ?? 0), 0)
          : null;
      return {
        ...product,
        key: `catalog:${product.id}`,
        kind: 'catalog',
        onHand,
        available,
        reserved,
        quantityState,
        inventoryValue,
        archivedAt: product.archived_at ?? null,
        canOfferDelete:
          !product.is_public_store &&
          !purchaseLines.some(
            (line) => line.workspace_id === workspaceId && line.catalog_product_id === product.id,
          ) &&
          !positions.some((position) => position.catalog_product_id === product.id) &&
          !lots.some(
            (lot) => lot.workspace_id === workspaceId && lot.catalog_product_id === product.id,
          ) &&
          linkedItems.length === 0,
        detailLink: `/catalog/${product.id}`,
      };
    }),
    ...standalone,
  ];
}

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

export interface CatalogOverviewRow {
  readonly key: string;
  readonly id: string;
  readonly kind: 'catalog' | 'item';
  readonly title: string;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly ean?: string | null;
  readonly category?: string | null;
  readonly is_public_store: boolean;
  readonly primary_media_path?: string | null;
  readonly available: number | null;
  readonly detailLink: string;
}

function availableItem(item: InventoryItem): number | null {
  if (hasInventoryIntegrityConflict(item)) return null;
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
        available: availableItem(item),
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
      const available =
        counts.some((count) => count === null) || stock.state !== 'known'
          ? null
          : stock.available + counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
      return {
        ...product,
        key: `catalog:${product.id}`,
        kind: 'catalog',
        available,
        detailLink: `/catalog/${product.id}`,
      };
    }),
    ...standalone,
  ];
}

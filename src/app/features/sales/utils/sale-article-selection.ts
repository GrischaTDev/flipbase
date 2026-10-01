import type { ArticlePickerEntry } from '../../../shared/components/article-picker/article-picker.models';

export interface SalePurchaseLineReference {
  readonly id: string;
  readonly workspace_id: string;
  readonly purchase_id?: string;
  readonly catalog_product_id?: string | null;
}
export interface SalePurchaseReference {
  readonly id: string;
  readonly workspace_id: string;
  readonly purchase_lines?: readonly SalePurchaseLineReference[];
}
export interface SaleInventoryReference {
  readonly id: string;
  readonly workspace_id: string;
  readonly purchase_id?: string | null;
  readonly purchase_line_id?: string | null;
  readonly title: string;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly category?: string | null;
  readonly sku?: string | null;
  readonly ean?: string | null;
}
export interface SaleCatalogReference {
  readonly id: string;
  readonly workspace_id: string;
  readonly variant_group_id?: string | null;
  readonly title: string;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly category?: string | null;
  readonly size?: string | null;
  readonly color?: string | null;
  readonly sku?: string | null;
  readonly ean?: string | null;
  readonly tracking_mode: 'quantity' | 'individual';
  readonly archived_at?: string | null;
}
export interface SaleStockReference {
  readonly catalog_product_id: string;
  readonly available_quantity: number;
  readonly archived_at?: string | null;
}
export interface SaleLineSelection {
  readonly target: string;
  readonly quantity: number;
}

function purchaseLineIndex(
  workspaceId: string,
  purchases: readonly SalePurchaseReference[],
): Map<string, SalePurchaseLineReference> {
  const lines = new Map<string, SalePurchaseLineReference>();
  for (const purchase of purchases) {
    if (purchase.workspace_id !== workspaceId) continue;
    for (const line of purchase.purchase_lines ?? []) {
      if (
        line.workspace_id === workspaceId &&
        (!line.purchase_id || line.purchase_id === purchase.id)
      ) {
        lines.set(line.id, { ...line, purchase_id: purchase.id });
      }
    }
  }
  return lines;
}

/** Der Aufrufer filtert zuvor mit isSellableInventoryItem; Statusregeln bleiben zentral. */
export function selectLinkedSaleItems<T extends SaleInventoryReference>(
  workspaceId: string | null,
  items: readonly T[],
  purchases: readonly SalePurchaseReference[],
  products: readonly SaleCatalogReference[],
  linkedSourcesReady: boolean,
): T[] {
  if (!workspaceId) return [];
  const lines = purchaseLineIndex(workspaceId, purchases);
  const productsById = new Map(
    products
      .filter((product) => product.workspace_id === workspaceId)
      .map((product) => [product.id, product]),
  );
  return items.filter((item) => {
    if (item.workspace_id !== workspaceId) return false;
    if (!item.purchase_line_id) return true;
    if (!linkedSourcesReady) return false;
    const line = lines.get(item.purchase_line_id);
    if (!line || (item.purchase_id && line.purchase_id !== item.purchase_id)) return false;
    if (!line.catalog_product_id) return true;
    const product = productsById.get(line.catalog_product_id);
    return !!product && !product.archived_at;
  });
}

/** Artikelstämme liefern Merkmale; Mengen entstehen ausschließlich aus geladenem Bestand. */
export function buildSaleArticleEntries(
  workspaceId: string | null,
  products: readonly SaleCatalogReference[],
  items: readonly SaleInventoryReference[],
  purchases: readonly SalePurchaseReference[],
  positions: readonly SaleStockReference[],
  selectedKeys: ReadonlySet<string>,
): ArticlePickerEntry[] {
  if (!workspaceId) return [];
  const workspaceProducts = products.filter(
    (product) => product.workspace_id === workspaceId && !product.archived_at,
  );
  const productsById = new Map(workspaceProducts.map((product) => [product.id, product]));
  const lines = purchaseLineIndex(workspaceId, purchases);
  const representedProducts = new Set<string>();
  const itemEntries: ArticlePickerEntry[] = [];
  for (const item of selectLinkedSaleItems(workspaceId, items, purchases, products, true)) {
    if (item.workspace_id !== workspaceId) continue;
    const line = item.purchase_line_id ? lines.get(item.purchase_line_id) : undefined;
    if (
      item.purchase_line_id &&
      (!line || (item.purchase_id && line.purchase_id !== item.purchase_id))
    )
      continue;
    const product = line?.catalog_product_id ? productsById.get(line.catalog_product_id) : undefined;
    if (line?.catalog_product_id && !product) continue;
    if (product) representedProducts.add(product.id);
    const id = `inventory:${item.id}`;
    itemEntries.push({
      id,
      groupId: product ? `catalog:${product.variant_group_id ?? product.id}` : id,
      title: product?.title ?? item.title,
      brand: product?.brand ?? item.brand,
      model: product?.model ?? item.model,
      category: product?.category ?? item.category,
      size: product?.size,
      color: product?.color,
      ean: item.ean ?? product?.ean,
      sku: item.sku ?? product?.sku,
      imageKey: item.id,
      availableQuantity: 1,
      disabledReason: selectedKeys.has(id) ? 'Bereits im Verkauf enthalten' : null,
    });
  }

  const productEntries: ArticlePickerEntry[] = [];
  for (const product of workspaceProducts) {
    const matchingPositions = positions.filter(
      (position) => position.catalog_product_id === product.id,
    );
    if (
      product.tracking_mode === 'individual' &&
      matchingPositions.length === 0 &&
      representedProducts.has(product.id)
    )
      continue;
    const isIndividualPlaceholder =
      product.tracking_mode === 'individual' && matchingPositions.length === 0;
    const id = `${isIndividualPlaceholder ? 'unavailable' : 'catalog'}:${product.id}`;
    const position = matchingPositions[0];
    const quantity =
      matchingPositions.length > 1
        ? null
        : position?.archived_at
          ? 0
          : (position?.available_quantity ?? 0);
    const valid = quantity !== null && Number.isSafeInteger(quantity) && quantity >= 0;
    productEntries.push({
      id,
      groupId: `catalog:${product.variant_group_id ?? product.id}`,
      title: product.title,
      brand: product.brand,
      model: product.model,
      category: product.category,
      size: product.size,
      color: product.color,
      ean: product.ean,
      sku: product.sku,
      imageKey: product.id,
      availableQuantity: valid ? quantity : null,
      disabledReason: !valid
        ? 'Bestand muss geprüft werden'
        : selectedKeys.has(id)
          ? 'Bereits im Verkauf enthalten'
          : quantity === 0
            ? 'Kein verfügbarer Bestand'
            : null,
    });
  }
  return [...productEntries, ...itemEntries];
}

/** Dieselbe Variante darf über mehrere Zeilen hinweg nie mehr als ihren Bestand verbrauchen. */
export function remainingLineQuantity(
  capacity: number,
  lines: readonly SaleLineSelection[],
  target: string,
  index: number,
): number {
  if (!Number.isSafeInteger(capacity) || capacity < 0) return 0;
  let used = 0;
  for (let current = 0; current < lines.length; current++) {
    const line = lines[current];
    if (current === index || line.target !== target) continue;
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) return 0;
    used += line.quantity;
    if (!Number.isSafeInteger(used)) return 0;
  }
  return Math.max(0, capacity - used);
}

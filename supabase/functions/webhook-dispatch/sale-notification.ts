interface Purchase {
  purchase_price: number | null;
  entry_status?: string;
  finalized_at?: string | null;
}
interface CostItem {
  title?: string;
  allocated_purchase_cost: number | null;
  total_item_cost?: number | null;
  purchase: Purchase | null;
  costs?: { amount: number }[];
}
export interface StoredWebhookSale {
  sale_price: number;
  sale_price_total?: number | null;
  platform: string | null;
  shipping_revenue?: number;
  refund_amount?: number | null;
  platform_fee: number;
  shipping_cost: number;
  packaging_cost: number;
  other_costs: number;
  inventory_item: CostItem | null;
  cost_entries: { amount: number }[];
  sale_lines: {
    title_snapshot: string;
    line_total: number;
    cost_of_goods_sold: number | null;
    quantity: number;
    inventory_item_id: string | null;
    inventory_item: CostItem | null;
    lot_allocations: { quantity: number; stock_lot: { purchase: Purchase | null } | null }[];
  }[];
}
export interface WebhookSale {
  title: string;
  price: number;
  platform: string | null;
  profit: number | null;
  roi: number | null;
}
const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
function finalized(purchase: Purchase | null): boolean {
  return (
    !!purchase &&
    Number.isFinite(purchase.purchase_price) &&
    (purchase.entry_status === 'finalized' || !!purchase.finalized_at)
  );
}
function itemCost(item: CostItem | null): number | null {
  if (!item || !finalized(item.purchase) || item.allocated_purchase_cost === null) return null;
  const amount =
    item.total_item_cost ??
    item.allocated_purchase_cost + (item.costs ?? []).reduce((sum, cost) => sum + cost.amount, 0);
  return Number.isFinite(amount) ? amount : null;
}

// Derselbe Kennzahlenvertrag wie calculateStoredSaleMetrics: unbekannter Einkauf bleibt unbekannt.
export function saleNotification(sale: StoredWebhookSale): WebhookSale {
  const lines = sale.sale_lines;
  const price = round(
    lines.length
      ? lines.reduce((sum, line) => sum + line.line_total, 0) + Number(sale.shipping_revenue ?? 0)
      : Number(sale.sale_price_total ?? sale.sale_price),
  );
  const basisKnown = lines.every((line) => {
    if (!Number.isFinite(line.cost_of_goods_sold)) return false;
    if (line.inventory_item_id || line.inventory_item)
      return itemCost(line.inventory_item) !== null;
    return (
      line.lot_allocations.length > 0 &&
      line.lot_allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) ===
        line.quantity &&
      line.lot_allocations.every((allocation) => finalized(allocation.stock_lot?.purchase ?? null))
    );
  });
  const cost = lines.length
    ? basisKnown
      ? round(lines.reduce((sum, line) => sum + Number(line.cost_of_goods_sold), 0))
      : null
    : itemCost(sale.inventory_item);
  const sellingCosts = round(
    sale.platform_fee +
      sale.shipping_cost +
      (sale.cost_entries.length
        ? sale.cost_entries.reduce((sum, entry) => sum + entry.amount, 0)
        : sale.packaging_cost + sale.other_costs),
  );
  const profit =
    cost === null
      ? null
      : round(round(price - Number(sale.refund_amount ?? 0)) - round(cost) - sellingCosts);
  return {
    title:
      lines.map((line) => line.title_snapshot).join(', ') ||
      sale.inventory_item?.title ||
      'Artikel',
    price,
    platform: sale.platform,
    profit,
    roi:
      profit === null || cost === null || round(cost) <= 0
        ? null
        : round((profit / round(cost)) * 100),
  };
}

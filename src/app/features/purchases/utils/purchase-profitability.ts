import type {
  InventoryItem,
  Purchase,
  Sale,
  SaleLine,
  StockLot,
} from '../../../core/models/flipbase.models';
import type { PurchasePresentationContext } from './purchase-presentation';

export interface PurchaseProfitability {
  readonly state: 'loaded' | 'loading' | 'error' | 'review';
  readonly revenue: number | null;
  readonly sellingCosts: number | null;
  readonly result: number | null;
  readonly hasSales: boolean;
}

const unknownPurchase = '\u0000';
const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
const validAmount = (amount: number) =>
  Number.isFinite(amount) && Number.isSafeInteger(cents(amount));

/** Verteilt Centbeträge mit festen Rundungsresten; die Summe bleibt unverändert. */
function allocate(amount: number, weights: ReadonlyMap<string, number>): Map<string, number> {
  const entries = [...weights].sort(([left], [right]) => left.localeCompare(right, 'en'));
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const absolute = Math.abs(amount);
  const shares = entries.map(([id, weight]) => {
    const exact = (absolute * weight) / total;
    return { id, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = absolute - shares.reduce((sum, share) => sum + share.amount, 0);
  for (const share of [...shares].sort(
    (left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id, 'en'),
  )) {
    if (remaining-- <= 0) break;
    share.amount++;
  }
  return new Map(shares.map((share) => [share.id, share.amount * Math.sign(amount)]));
}

function add(target: Map<string, number>, id: string, amount: number): void {
  target.set(id, (target.get(id) ?? 0) + amount);
}

function unavailable(state: 'loading' | 'error' | 'review'): PurchaseProfitability {
  return { state, revenue: null, sellingCosts: null, result: null, hasSales: false };
}

/** Einkaufsbezogene Deckung: Erlöse minus direkte Verkaufskosten minus gesamter Einkauf. */
export function summarizePurchaseProfitability(
  purchase: Purchase,
  context: PurchasePresentationContext,
  totalCost: number | null,
): PurchaseProfitability {
  const states = [context.salesState, context.inventoryState, context.stockState];
  if (states.includes('error')) return unavailable('error');
  if (states.includes('loading')) return unavailable('loading');

  const items = new Map(
    context.inventoryItems
      .filter((item) => item.workspace_id === purchase.workspace_id)
      .map((item) => [item.id, item]),
  );
  const lots = new Map(
    context.stockLots
      .filter((lot) => lot.workspace_id === purchase.workspace_id)
      .map((lot) => [lot.id, lot]),
  );
  if (
    [...items.values()].some(
      (item) =>
        item.purchase_id === purchase.id &&
        item.sale_state !== undefined &&
        item.sale_state !== 'sold' &&
        item.sale_state !== 'no_active_sale',
    )
  ) {
    return unavailable('review');
  }
  const recordedItems = new Set<string>();
  const recordedLines = new Set<string>();
  const seenSales = new Set<string>();
  let revenue = 0;
  let sellingCosts = 0;
  let hasSales = false;

  for (const sale of context.sales) {
    if (sale.workspace_id !== purchase.workspace_id || seenSales.has(sale.id)) continue;
    seenSales.add(sale.id);
    if (sale.voided_at) {
      for (const line of sale.lines ?? []) recordedLines.add(line.id);
      continue;
    }
    const lineRevenue = new Map<string, number>();
    const quantities = new Map<string, number>();
    let invalid = false;
    const lines = sale.has_persisted_lines === false ? [] : (sale.lines ?? []);
    if (lines.length === 0) {
      const item = sale.inventory_item ?? items.get(sale.inventory_item_id ?? '');
      if (!item || item.workspace_id !== purchase.workspace_id) continue;
      recordedItems.add(item.id);
      const id = item.purchase_id ?? unknownPurchase;
      const amount = (sale.sale_price_total ?? sale.sale_price) - (sale.shipping_revenue ?? 0);
      invalid = !validAmount(amount) || amount < 0;
      add(lineRevenue, id, cents(amount));
      add(quantities, id, 1);
    } else {
      for (const line of lines) {
        const weights = purchaseQuantities(line, sale, purchase.workspace_id, items, lots);
        for (const [id, quantity] of weights) add(quantities, id, quantity);
        invalid ||=
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          !validAmount(line.line_total) ||
          line.line_total < 0 ||
          [...weights.values()].some((quantity) => !Number.isFinite(quantity) || quantity <= 0) ||
          Math.abs([...weights.values()].reduce((sum, value) => sum + value, 0) - line.quantity) >
            0.000001;
        if (line.inventory_item_id) recordedItems.add(line.inventory_item_id);
        if (weights.has(purchase.id)) recordedLines.add(line.id);
        if (!invalid) {
          for (const [id, amount] of allocate(cents(line.line_total), weights))
            add(lineRevenue, id, amount);
        }
      }
    }
    if (!quantities.has(purchase.id)) continue;
    if (invalid || !validSaleCosts(sale)) return unavailable('review');
    const totalRevenue = [...lineRevenue.values()].reduce((sum, amount) => sum + amount, 0);
    const weights = totalRevenue > 0 ? lineRevenue : quantities;
    const shipping = allocate(cents(sale.shipping_revenue ?? 0), weights).get(purchase.id) ?? 0;
    const refund = allocate(cents(sale.refund_amount ?? 0), weights).get(purchase.id) ?? 0;
    const costs =
      sale.platform_fee +
      sale.shipping_cost +
      (sale.cost_entries?.length
        ? sale.cost_entries.reduce((sum, cost) => sum + cost.amount, 0)
        : sale.packaging_cost + sale.other_costs);
    revenue += (lineRevenue.get(purchase.id) ?? 0) + shipping - refund;
    sellingCosts += allocate(cents(costs), weights).get(purchase.id) ?? 0;
    hasSales = true;
  }

  const missingItemSale = [...items.values()].some(
    (item) =>
      item.purchase_id === purchase.id &&
      (item.sale_state === 'sold' || item.status === 'sold') &&
      !recordedItems.has(item.id),
  );
  const missingLotSale = context.stockMovements.some(
    (movement) =>
      movement.workspace_id === purchase.workspace_id &&
      movement.reason === 'sale' &&
      movement.direction === 'out' &&
      lots.get(movement.stock_lot_id)?.purchase_id === purchase.id &&
      (!movement.sale_line_id || !recordedLines.has(movement.sale_line_id)),
  );
  if (missingItemSale || missingLotSale) return unavailable('review');

  return {
    state: 'loaded',
    revenue: revenue / 100,
    sellingCosts: sellingCosts / 100,
    hasSales,
    result:
      totalCost === null || !validAmount(totalCost)
        ? null
        : (revenue - sellingCosts - cents(totalCost)) / 100,
  };
}

function validSaleCosts(sale: Sale): boolean {
  if (sale.returned_at && sale.refund_amount == null) return false;
  return [
    sale.shipping_revenue ?? 0,
    sale.refund_amount ?? 0,
    sale.platform_fee,
    sale.shipping_cost,
    ...(sale.cost_entries?.length
      ? sale.cost_entries.map((cost) => cost.amount)
      : [sale.packaging_cost, sale.other_costs]),
  ].every(validAmount);
}

function purchaseQuantities(
  line: SaleLine,
  sale: Sale,
  workspaceId: string,
  items: ReadonlyMap<string, InventoryItem>,
  lots: ReadonlyMap<string, StockLot>,
): Map<string, number> {
  if (line.inventory_item_id) {
    const item =
      line.inventory_item ??
      (sale.inventory_item?.id === line.inventory_item_id ? sale.inventory_item : undefined) ??
      items.get(line.inventory_item_id);
    return new Map([
      [
        item?.workspace_id === workspaceId
          ? (item.purchase_id ?? unknownPurchase)
          : unknownPurchase,
        line.quantity,
      ],
    ]);
  }
  const result = new Map<string, number>();
  const seen = new Set<string>();
  for (const allocation of line.lot_allocations?.length
    ? line.lot_allocations
    : (sale.lot_allocations ?? []).filter((allocation) => allocation.sale_line_id === line.id)) {
    if (seen.has(allocation.id) || allocation.workspace_id !== workspaceId) continue;
    seen.add(allocation.id);
    const lot = allocation.stock_lot ?? lots.get(allocation.stock_lot_id);
    const id = lot?.workspace_id === workspaceId ? lot.purchase_id : unknownPurchase;
    add(result, id, allocation.quantity);
  }
  if (result.size === 0) result.set(unknownPurchase, line.quantity);
  return result;
}

import type {
  InventoryItem,
  ItemStatus,
  Purchase,
  Sale,
  SaleLine,
  StockLot,
  StockMovement,
  StockPosition,
} from '../../../core/models/flipbase.models';
import {
  hasInventoryIntegrityConflict,
  isInventoryItemMutationLocked,
  isSellableInventoryItem,
} from '../../../core/models/inventory-sellability';
import type { CostState } from '../../../shared/components/cost-state/cost-state.component';
import type {
  InventoryOriginView,
  InventoryOriginState,
  InventoryPresentationResult,
  InventoryPresentationRow,
  InventoryQuantityState,
  InventorySaleView,
  InventoryStatusView,
} from '../models/inventory-presentation.models';
import { editableItemStatusLabels } from '../models/item-status-options';
import { summarizeStockQuantities } from '../../../core/utils/stock-quantity';
import { lotCostResult } from '../../../core/utils/lot-cost';

export type InventorySourceState = 'known' | 'loading' | 'error';

export interface InventoryPresentationInput {
  readonly workspaceId: string;
  readonly inventoryState: InventorySourceState;
  readonly stockState: InventorySourceState;
  readonly stockWorkspaceId?: string | null;
  readonly purchaseState: InventorySourceState;
  readonly salesState: InventorySourceState;
  readonly individualItems: readonly InventoryItem[];
  readonly positions: readonly StockPosition[];
  readonly lots: readonly StockLot[];
  readonly movements: readonly StockMovement[];
  readonly purchases: readonly Purchase[];
  readonly sales: readonly Sale[];
}

type StockLotWithProduct = StockLot & {
  readonly catalog_product?: {
    readonly id: string;
    readonly title?: string | null;
    readonly is_public_store?: boolean | null;
  } | null;
};

function cents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function euros(valueInCents: number): number {
  return valueInCents / 100;
}

function purchaseLabel(purchase: Purchase): string {
  return purchase.title || purchase.supplier?.name || purchase.source?.name || 'Einkauf';
}

function origin(purchase: Purchase): InventoryOriginView {
  return {
    purchaseId: purchase.id,
    label: purchaseLabel(purchase),
    link: `/purchases/${purchase.id}`,
  };
}

function purchaseIsFinalized(purchase: Purchase | undefined): boolean {
  return purchase?.entry_status === 'finalized' || !!purchase?.finalized_at;
}

function knownCost(amount: number): CostState {
  return { kind: 'known', amount: euros(cents(amount)) };
}

function knownCostCents(amount: number): CostState {
  return { kind: 'known', amount: euros(amount) };
}

function individualCost(
  item: InventoryItem,
  purchase: Purchase | undefined,
  hasPurchaseLink: boolean,
): CostState {
  const amount = Number(item.total_item_cost ?? item.allocated_purchase_cost);
  if (hasPurchaseLink && !purchaseIsFinalized(purchase)) return { kind: 'open' };
  if (amount !== 0 || purchaseIsFinalized(purchase)) return knownCost(amount);
  return { kind: 'open' };
}

function saleLines(sale: Sale): readonly SaleLine[] {
  return sale.lines ?? [];
}

function saleView(sale: Sale, lines: readonly SaleLine[]): InventorySaleView {
  const state = sale.voided_at ? 'voided' : sale.returned_at ? 'returned' : 'active';
  const revenue =
    lines.length > 0
      ? lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0)
      : Number(sale.sale_price_total ?? sale.sale_price ?? 0);
  const hasSingleSaleLine = saleLines(sale).length === 1 && lines.length === 1;
  const directResult =
    state !== 'active' ||
    !hasSingleSaleLine ||
    sale.net_profit === undefined ||
    sale.net_profit === null
      ? null
      : euros(cents(Number(sale.net_profit)));
  return {
    id: sale.id,
    state,
    stateLabel: state === 'active' ? 'Aktiv' : state === 'returned' ? 'Retourniert' : 'Storniert',
    saleDate: sale.sale_date,
    revenue: euros(cents(revenue)),
    revenueLabel: state === 'active' ? 'Verkaufsbetrag' : 'Historischer Verkaufsbetrag',
    directResult,
    showResultInSale: state === 'active' && directResult === null,
    link: `/sales?saleId=${encodeURIComponent(sale.id)}`,
  };
}

function individualOriginState(
  item: InventoryItem,
  linkedPurchase: Purchase | undefined,
  purchaseState: InventorySourceState,
): InventoryOriginState {
  if (linkedPurchase) return 'known';
  if (!item.purchase_id) return 'not_linked';
  return purchaseState === 'known' ? 'error' : purchaseState;
}

function salesForIndividual(itemId: string, sales: readonly Sale[]): InventorySaleView[] {
  return sales.flatMap((sale) => {
    const matching = saleLines(sale).filter((line) => line.inventory_item_id === itemId);
    const legacyMatch = sale.inventory_item_id === itemId;
    return matching.length > 0 || legacyMatch ? [saleView(sale, matching)] : [];
  });
}

function salesForProduct(productId: string, sales: readonly Sale[]): InventorySaleView[] {
  return sales.flatMap((sale) => {
    const matching = saleLines(sale).filter((line) => line.catalog_product_id === productId);
    return matching.length > 0 ? [saleView(sale, matching)] : [];
  });
}

function individualStatus(item: InventoryItem): InventoryStatusView {
  if (item.sale_state === 'legacy_sold_unverified') {
    return { kind: 'review', label: 'Verkaufsstatus klären' };
  }
  if (item.sale_state === 'legacy_sale_header_without_line') {
    return { kind: 'conflict', label: 'Korrektur erforderlich' };
  }
  if (hasInventoryIntegrityConflict(item)) {
    return { kind: 'conflict', label: 'Prüfung erforderlich' };
  }
  if (item.sale_state === 'sold' || item.status === 'sold') {
    return { kind: 'sold', label: 'Verkauft' };
  }
  return {
    kind: 'editable',
    label: editableItemStatusLabels[item.status as Exclude<ItemStatus, 'sold'>],
    value: item.status,
  };
}

function individualQuantityState(
  item: InventoryItem,
  inventoryState: InventorySourceState,
): InventoryQuantityState {
  if (inventoryState !== 'known') return inventoryState;
  if (
    !item.sale_state ||
    item.sale_state === 'legacy_sold_unverified' ||
    item.sale_state === 'legacy_sale_header_without_line' ||
    item.sale_state === 'sale_status_conflict' ||
    item.sale_state === 'multiple_active_sales' ||
    (item.sale_state === 'sold') !== (item.status === 'sold')
  ) {
    return 'review_required';
  }
  return 'known';
}

function buildIndividualRows(input: InventoryPresentationInput, purchases: Map<string, Purchase>) {
  return input.individualItems
    .filter((item) => item.workspace_id === input.workspaceId)
    .map<InventoryPresentationRow>((item) => {
      const linkedPurchase =
        item.purchase?.workspace_id === input.workspaceId
          ? item.purchase
          : item.purchase_id
            ? purchases.get(item.purchase_id)
            : undefined;
      const sold = item.sale_state === 'sold' ? 1 : 0;
      const reserved = sold === 0 && item.status === 'reserved' ? 1 : 0;
      const available = isSellableInventoryItem(item) ? 1 : 0;
      const quantityState = individualQuantityState(item, input.inventoryState);
      const onHandQuantity =
        quantityState !== 'known' ? null : sold === 1 || item.status === 'archived' ? 0 : 1;
      const costPerUnit = individualCost(item, linkedPurchase, !!item.purchase_id);
      const currentValue =
        quantityState !== 'known'
          ? { kind: 'open' as const }
          : onHandQuantity === 1
            ? costPerUnit
            : knownCost(0);
      return {
        id: `individual:${item.id}`,
        workspaceId: input.workspaceId,
        trackingMode: 'individual',
        actionId: item.id,
        title: item.title,
        condition: item.condition,
        quantity: { total: 1, available, reserved, sold },
        onHandQuantity,
        quantityState,
        costPerUnit,
        inventoryValue: currentValue,
        origins: linkedPurchase ? [origin(linkedPurchase)] : [],
        originState: individualOriginState(item, linkedPurchase, input.purchaseState),
        sales: salesForIndividual(item.id, input.sales),
        salesState: input.salesState,
        status:
          quantityState === 'review_required' && individualStatus(item).kind === 'sold'
            ? { kind: 'conflict', label: 'Verkaufsstatus klären' }
            : individualStatus(item),
        canMutate: !isInventoryItemMutationLocked(item),
        canSell: isSellableInventoryItem(item),
        isPublicStore: item.is_public_store !== false,
        inventoryItem: item,
        lots: [],
      };
    });
}

function buildQuantityRows(input: InventoryPresentationInput, purchases: Map<string, Purchase>) {
  const positionsByProduct = new Map<string, StockPosition[]>();
  for (const position of input.positions) {
    const current = positionsByProduct.get(position.catalog_product_id) ?? [];
    current.push(position);
    positionsByProduct.set(position.catalog_product_id, current);
  }

  const lotsByProduct = new Map<string, StockLotWithProduct[]>();
  for (const rawLot of input.lots) {
    if (rawLot.workspace_id !== input.workspaceId) continue;
    const lot = rawLot as StockLotWithProduct;
    const current = lotsByProduct.get(lot.catalog_product_id) ?? [];
    current.push(lot);
    lotsByProduct.set(lot.catalog_product_id, current);
  }

  const productIds = new Set([...positionsByProduct.keys(), ...lotsByProduct.keys()]);
  return [...productIds].map<InventoryPresentationRow>((productId) => {
    const positions = positionsByProduct.get(productId) ?? [];
    const lots = (lotsByProduct.get(productId) ?? []).sort((left, right) =>
      left.received_at.localeCompare(right.received_at),
    );
    const summary = summarizeStockQuantities(positions, lots, input.movements);
    const { available, reserved, onHand, sold } = summary;
    const total = Math.max(onHand, available + reserved) + sold;
    const currentLots = lots.filter((lot) => lot.remaining_quantity > 0);
    const quantityState = input.stockState === 'known' ? summary.state : input.stockState;
    const linkedPurchases = [...new Set(lots.map((lot) => lot.purchase_id))]
      .map((id) => purchases.get(id))
      .filter((purchase): purchase is Purchase => !!purchase);
    const lotCosts = new Map(
      lots.map((lot) => [
        lot.id,
        lotCostResult(lot, purchases.get(lot.purchase_id), input.sales, input.salesState),
      ]),
    );
    const currentValueCents = currentLots.reduce<number | null>((sum, lot) => {
      const value = lotCosts.get(lot.id)?.remainingValueCents ?? null;
      return sum === null || value === null ? null : sum + value;
    }, 0);
    const currentQuantity = currentLots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
    const historicalQuantity = lots.reduce((sum, lot) => sum + lot.received_quantity, 0);
    const historicalPoolCents = lots.reduce<number | null>((sum, lot) => {
      const value = lotCosts.get(lot.id)?.historicalPoolCents ?? null;
      return sum === null || value === null ? null : sum + value;
    }, 0);
    const purchaseIds = new Set(lots.map((lot) => lot.purchase_id));
    const originState: InventoryOriginState =
      purchaseIds.size === 0
        ? 'not_linked'
        : linkedPurchases.length === purchaseIds.size
          ? 'known'
          : input.purchaseState === 'known'
            ? 'error'
            : input.purchaseState;
    const purchaseLineTitle = linkedPurchases
      .flatMap((purchase) => purchase.purchase_lines ?? [])
      .find((line) => line.catalog_product_id === productId)?.title_snapshot;
    const title =
      positions[0]?.title ??
      lots.find((lot) => lot.catalog_product?.title)?.catalog_product?.title ??
      purchaseLineTitle ??
      'Unbekannter Artikel';
    const status: InventoryStatusView =
      quantityState === 'review_required'
        ? { kind: 'review', label: 'Prüfung erforderlich' }
        : available + reserved === 0 && sold > 0
          ? { kind: 'sold', label: 'Verkauft' }
          : { kind: 'available', label: available > 0 ? 'Verfügbar' : 'Nicht verfügbar' };
    return {
      id: `quantity:${productId}`,
      workspaceId: input.workspaceId,
      trackingMode: 'quantity',
      actionId: productId,
      title,
      condition: null,
      quantity: { total, available, reserved, sold },
      onHandQuantity: quantityState === 'known' ? onHand : null,
      quantityState,
      costPerUnit:
        currentQuantity > 0 && currentValueCents !== null
          ? knownCost(currentValueCents / 100 / currentQuantity)
          : currentQuantity === 0 && historicalQuantity > 0 && historicalPoolCents !== null
            ? knownCost(historicalPoolCents / 100 / historicalQuantity)
            : { kind: 'open' },
      inventoryValue:
        quantityState === 'review_required'
          ? { kind: 'open' }
          : currentLots.length === 0 && lots.length > 0
            ? knownCost(0)
            : currentLots.length > 0 && currentValueCents !== null
              ? knownCostCents(currentValueCents)
              : { kind: 'open' },
      origins: linkedPurchases.map(origin),
      originState,
      sales: salesForProduct(productId, input.sales),
      salesState: input.salesState,
      status,
      canMutate: false,
      canSell: available > 0 && quantityState === 'known',
      isPublicStore:
        positions[0]?.is_public_store ?? lots[0]?.catalog_product?.is_public_store ?? false,
      inventoryItem: null,
      lots: lots.map((lot) => ({
        id: lot.id,
        purchaseId: lot.purchase_id,
        receivedQuantity: lot.received_quantity,
        remainingQuantity: lot.remaining_quantity,
        receivedAt: lot.received_at,
        costPerUnit: lotCosts.get(lot.id)?.costPerUnit ?? { kind: 'open' },
      })),
    };
  });
}

export function buildInventoryPresentation(
  input: InventoryPresentationInput,
): InventoryPresentationResult {
  const purchases = new Map(
    input.purchases
      .filter((purchase) => purchase.workspace_id === input.workspaceId)
      .map((purchase) => [purchase.id, purchase]),
  );
  const workspaceSales = input.sales.filter((sale) => sale.workspace_id === input.workspaceId);
  const stockMatchesWorkspace =
    input.stockWorkspaceId === undefined || input.stockWorkspaceId === input.workspaceId;
  const scopedInput = {
    ...input,
    positions: stockMatchesWorkspace ? input.positions : [],
    lots: stockMatchesWorkspace ? input.lots : [],
    movements: stockMatchesWorkspace ? input.movements : [],
    sales: workspaceSales,
  };
  const rows = [
    ...buildQuantityRows(scopedInput, purchases),
    ...buildIndividualRows(scopedInput, purchases),
  ].sort((left, right) => left.title.localeCompare(right.title, 'de'));
  const states = [input.inventoryState, input.stockState, input.purchaseState, input.salesState];
  const sourceState = states.includes('error')
    ? 'error'
    : states.includes('loading')
      ? 'loading'
      : 'known';
  const hasCompleteInventoryValue =
    sourceState === 'known' &&
    rows.every((row) => row.quantityState === 'known' && row.inventoryValue.kind === 'known');
  return {
    rows,
    sourceState,
    inventoryValue: hasCompleteInventoryValue
      ? knownCostCents(
          rows.reduce(
            (sum, row) =>
              sum + (row.inventoryValue.kind === 'known' ? cents(row.inventoryValue.amount) : 0),
            0,
          ),
        )
      : { kind: 'open' },
  };
}

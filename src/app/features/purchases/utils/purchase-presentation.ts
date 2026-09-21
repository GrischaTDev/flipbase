import type {
  InventoryItem,
  Purchase,
  PurchaseLine,
  Sale,
  StockLot,
  StockMovement,
} from '../../../core/models/flipbase.models';
import { purchaseSellerLabel } from './purchase-seller';
import type { CostState } from '../../../shared/components/cost-state/cost-state.component';
import { PurchaseTypeLabelPipe } from '../../../shared/pipes/purchase-type-label.pipe';
import type {
  PurchaseDetailRow,
  PurchaseListRow,
  PurchaseReceiptSummary,
  PresentationLoadState,
  RecordedSalePresentation,
} from '../models/purchase-presentation.models';
import { getPurchaseStatusPresentation } from './purchase-status-presentation';

export interface PurchasePresentationContext {
  readonly inventoryItems: readonly InventoryItem[];
  readonly stockLots: readonly StockLot[];
  readonly stockMovements: readonly StockMovement[];
  readonly sales: readonly Sale[];
  readonly inventoryState: PresentationLoadState;
  readonly stockState: PresentationLoadState;
  readonly salesState: PresentationLoadState;
}

const purchaseTypeLabels = new PurchaseTypeLabelPipe();

const availableIndividualStatuses = new Set<InventoryItem['status']>([
  'received',
  'researched',
  'ready',
  'listed',
  'returned',
]);

function money(amount: number | null | undefined): CostState {
  return amount === null || amount === undefined || !Number.isFinite(amount)
    ? { kind: 'open' }
    : { kind: 'known', amount: Number(amount) };
}

function purchaseLines(purchase: Purchase): readonly PurchaseLine[] {
  return purchase.purchase_lines ?? [];
}

function summarizeReceipt(purchase: Purchase): PurchaseReceiptSummary {
  const lines = purchaseLines(purchase);
  if (lines.length === 0) {
    return purchase.content_status === 'unknown' || purchase.type === 'mystery_pack'
      ? { kind: 'unknown-content' }
      : { kind: 'unavailable' };
  }

  const quantitiesAreReliable = lines.every(
    (line) =>
      Number.isFinite(line.received_quantity) &&
      line.received_quantity >= 0 &&
      Number.isFinite(line.ordered_quantity) &&
      line.ordered_quantity >= 0,
  );
  if (!quantitiesAreReliable) return { kind: 'unavailable' };

  return {
    kind: 'known',
    received: lines.reduce((sum, line) => sum + line.received_quantity, 0),
    ordered: lines.reduce((sum, line) => sum + line.ordered_quantity, 0),
    lines: lines.map((line) => ({
      id: line.id,
      title: line.title_snapshot || 'Artikel',
      received: line.received_quantity,
      ordered: line.ordered_quantity,
    })),
  };
}

function purchaseItems(
  purchase: Purchase,
  context: PurchasePresentationContext,
): readonly InventoryItem[] {
  const authoritative = context.inventoryItems.filter((item) => item.purchase_id === purchase.id);
  return authoritative.length > 0 ? authoritative : (purchase.items ?? []);
}

function isRecordedSale(item: InventoryItem): boolean {
  return item.sale_state === 'sold';
}

function isAvailableIndividual(item: InventoryItem): boolean {
  return item.sale_state === 'no_active_sale' && availableIndividualStatuses.has(item.status);
}

function getLineItems(
  line: PurchaseLine,
  items: readonly InventoryItem[],
): readonly InventoryItem[] {
  return items.filter((item) => item.purchase_line_id === line.id);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) ? Number(value) : null;
}

function recordedSales(
  purchase: Purchase,
  items: readonly InventoryItem[],
  lots: readonly StockLot[],
  context: PurchasePresentationContext,
): readonly RecordedSalePresentation[] | null {
  if (context.salesState !== 'loaded') return null;
  const itemIds = new Set(items.map((item) => item.id));
  const lotIds = new Set(lots.map((lot) => lot.id));
  const result = new Map<string, RecordedSalePresentation>();

  for (const sale of context.sales) {
    if (sale.workspace_id !== purchase.workspace_id || sale.has_persisted_lines === false) continue;
    const matchesItem = (sale.lines ?? []).some(
      (line) => !!line.inventory_item_id && itemIds.has(line.inventory_item_id),
    );
    const matchesLot =
      (sale.lot_allocations ?? []).some((allocation) => lotIds.has(allocation.stock_lot_id)) ||
      (sale.stock_movements ?? []).some((movement) => lotIds.has(movement.stock_lot_id));
    if (!matchesItem && !matchesLot) continue;
    const status: RecordedSalePresentation['status'] = sale.voided_at
      ? 'voided'
      : sale.returned_at
        ? 'returned'
        : 'active';
    result.set(sale.id, {
      id: sale.id,
      status,
      revenue: status === 'active' ? finiteOrNull(sale.sale_price_total ?? sale.sale_price) : null,
      directResult: status === 'active' ? finiteOrNull(sale.net_profit) : null,
    });
  }
  return [...result.values()];
}

function getPurchaseLots(
  purchaseId: string,
  context: PurchasePresentationContext,
): readonly StockLot[] {
  return context.stockLots.filter((lot) => lot.purchase_id === purchaseId);
}

function getLotSoldUnits(lots: readonly StockLot[], movements: readonly StockMovement[]): number {
  const lotIds = new Set(lots.map((lot) => lot.id));
  let sold = 0;
  for (const movement of movements) {
    if (!lotIds.has(movement.stock_lot_id)) continue;
    if (movement.reason === 'sale' && movement.direction === 'out') sold += movement.quantity;
    if (movement.reason === 'return' && movement.direction === 'in') sold -= movement.quantity;
  }
  return Math.max(0, sold);
}

function totalPurchaseCost(purchase: Purchase): number | null {
  if (purchase.total_purchase_cost !== undefined) return purchase.total_purchase_cost;
  if (purchase.purchase_price === null || !Number.isFinite(purchase.purchase_price)) return null;
  return Number(
    (
      purchase.purchase_price -
      (purchase.discount_amount ?? 0) +
      (purchase.shipping_cost ?? 0) +
      (purchase.other_costs ?? 0) +
      (purchase.costs ?? []).reduce((sum, cost) => sum + Number(cost.amount), 0)
    ).toFixed(2),
  );
}

function getAllocationOpen(
  purchase: Purchase,
  items: readonly InventoryItem[],
  total: number | null,
): boolean {
  if (total === null || total === undefined || !Number.isFinite(total)) return true;

  const lines = purchaseLines(purchase);
  const allocated =
    lines.length > 0
      ? lines.reduce((sum, line) => sum + (line.allocated_total_cost ?? Number.NaN), 0)
      : items.reduce((sum, item) => sum + (item.allocated_purchase_cost ?? Number.NaN), 0);
  if (!Number.isFinite(allocated)) return true;
  return Math.abs(allocated - total) >= 0.005;
}

function summarizeQuantities(
  purchase: Purchase,
  items: readonly InventoryItem[],
  context: PurchasePresentationContext,
): Pick<PurchaseListRow, 'totalUnits' | 'availableUnits' | 'soldUnits' | 'quantityState'> {
  const lines = purchaseLines(purchase);
  const representedLineIds = new Set(lines.map((line) => line.id));
  const legacyItems = items.filter(
    (item) => !item.purchase_line_id || !representedLineIds.has(item.purchase_line_id),
  );
  const totalUnits =
    lines.filter((line) => !line.is_package).reduce((sum, line) => sum + line.ordered_quantity, 0) +
    legacyItems.length;

  const needsInventory =
    legacyItems.length > 0 || lines.some((line) => line.line_kind === 'individual');
  const needsStock = lines.some((line) => line.line_kind === 'quantity');
  const requiredStates = [
    ...(needsInventory ? [context.inventoryState] : []),
    ...(needsStock ? [context.stockState] : []),
  ];
  const quantityState: PresentationLoadState = requiredStates.includes('error')
    ? 'error'
    : requiredStates.includes('loading')
      ? 'loading'
      : 'loaded';

  let availableUnits = legacyItems.filter(isAvailableIndividual).length;
  let soldUnits = legacyItems.filter(isRecordedSale).length;
  const lots = getPurchaseLots(purchase.id, context);

  for (const line of lines) {
    if (line.line_kind === 'individual') {
      const lineItems = getLineItems(line, items);
      availableUnits += lineItems.filter(isAvailableIndividual).length;
      soldUnits += lineItems.filter(isRecordedSale).length;
      continue;
    }

    if (context.stockState !== 'loaded') continue;
    const lineLots = lots.filter((lot) => lot.purchase_line_id === line.id);
    availableUnits += lineLots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
    soldUnits += getLotSoldUnits(lineLots, context.stockMovements);
  }

  return {
    totalUnits,
    availableUnits: quantityState === 'loaded' ? availableUnits : null,
    soldUnits: quantityState === 'loaded' ? soldUnits : null,
    quantityState,
  };
}

export function getPurchaseDisplayTitle(purchase?: Purchase | null): string | null {
  if (!purchase) return null;
  const candidate =
    purchase.record_number?.trim() || purchase.notes?.trim() || purchase.supplier?.name?.trim();
  return candidate || null;
}

export function mapPurchaseListRow(
  purchase: Purchase,
  context: PurchasePresentationContext,
): PurchaseListRow {
  const items = purchaseItems(purchase, context);
  const totalCost = totalPurchaseCost(purchase);
  const purchaseStatus = getPurchaseStatusPresentation(purchase);
  return {
    reference: purchase.record_number
      ? purchase.record_number.startsWith('#')
        ? purchase.record_number
        : `#${purchase.record_number}`
      : '—',
    supplierReference: purchase.supplier_reference ?? '',
    captureStatus:
      purchase.entry_status === 'finalized'
        ? 'Erfassung abgeschlossen'
        : purchase.type === 'single' && purchaseLines(purchase).length === 0 && items.length > 0
          ? 'Prüfung erforderlich'
          : purchase.content_status === 'unknown' || purchase.type === 'mystery_pack'
            ? 'Inhalt erfassen'
            : 'Erfassung offen',
    id: purchase.id,
    title: purchase.notes?.trim() ?? '',
    type: purchase.type,
    typeLabel: purchaseTypeLabels.transform(purchase.type),
    purchaseDate: purchase.purchase_date,
    supplierLabel: purchaseSellerLabel(purchase),
    sellerSearchText: [purchase.seller_name, purchase.supplier?.name].filter(Boolean).join(' '),
    purchaseStatus: purchaseStatus.label,
    purchaseStatusTone: purchaseStatus.tone,
    allocationOpen: getAllocationOpen(purchase, items, totalCost),
    totalCost: money(totalCost),
    receipt: summarizeReceipt(purchase),
    ...summarizeQuantities(purchase, items, context),
  };
}

function safePerUnit(total: number | null | undefined, quantity: number): CostState {
  return total === null || total === undefined || !Number.isFinite(total) || quantity <= 0
    ? { kind: 'open' }
    : money(Number((total / quantity).toFixed(2)));
}

export function mapPurchaseDetailRows(
  purchase: Purchase,
  context: PurchasePresentationContext,
): readonly PurchaseDetailRow[] {
  const items = purchaseItems(purchase, context);
  const lots = getPurchaseLots(purchase.id, context);
  const lines = purchaseLines(purchase);
  const lineRows = lines.map((line): PurchaseDetailRow => {
    const lineItems = getLineItems(line, items);
    const lineLots = lots.filter((lot) => lot.purchase_line_id === line.id);
    const inventoryItemId = lineItems.length === 1 ? lineItems[0].id : null;
    const inventoryItemLinks = lineItems.map((item, index) => ({
      id: item.id,
      label: `Artikel ${index + 1}`,
    }));
    const quantityState =
      line.line_kind === 'individual' ? context.inventoryState : context.stockState;
    const quantities =
      quantityState !== 'loaded'
        ? { availableUnits: null, soldUnits: null, quantityState }
        : line.line_kind === 'individual'
          ? {
              availableUnits: lineItems.filter(isAvailableIndividual).length,
              soldUnits: lineItems.filter(isRecordedSale).length,
              quantityState,
            }
          : {
              availableUnits: lineLots.reduce((sum, lot) => sum + lot.remaining_quantity, 0),
              soldUnits: getLotSoldUnits(lineLots, context.stockMovements),
              quantityState,
            };
    const sales = recordedSales(purchase, lineItems, lineLots, context);
    const captureRemaining =
      line.line_kind === 'individual'
        ? Math.max(0, line.ordered_quantity - Math.max(line.received_quantity, lineItems.length))
        : 0;

    if (purchase.type === 'mystery_pack') {
      return {
        kind: 'mystery',
        id: line.id,
        title: line.title_snapshot,
        orderedQuantity: line.ordered_quantity,
        receivedQuantity: line.received_quantity,
        unitPurchasePrice: safePerUnit(line.allocated_total_cost, line.ordered_quantity),
        lineTotal: money(line.allocated_total_cost),
        inventoryItemId,
        inventoryItemLinks,
        recordedSales: sales,
        salesState: context.salesState,
        captureRemaining,
        ...quantities,
      };
    }

    return {
      kind: 'normal',
      id: line.id,
      title: line.title_snapshot,
      orderedQuantity: line.ordered_quantity,
      receivedQuantity: line.received_quantity,
      inventoryItemId,
      inventoryItemLinks,
      recordedSales: sales,
      salesState: context.salesState,
      captureRemaining,
      unitPurchasePrice: money(line.unit_purchase_price),
      lineTotal: money(line.line_total),
      ...quantities,
    };
  });

  const representedLineIds = new Set(lines.map((line) => line.id));
  const legacyRows = items
    .filter((item) => !item.purchase_line_id || !representedLineIds.has(item.purchase_line_id))
    .map((item): PurchaseDetailRow => {
      const quantities = {
        availableUnits:
          context.inventoryState === 'loaded' ? (isAvailableIndividual(item) ? 1 : 0) : null,
        soldUnits: context.inventoryState === 'loaded' ? (isRecordedSale(item) ? 1 : 0) : null,
        quantityState: context.inventoryState,
      };
      const sales = recordedSales(purchase, [item], [], context);
      const allocatedCost =
        (item.allocated_purchase_cost !== null && item.allocated_purchase_cost > 0) ||
        purchase.total_purchase_cost === 0
          ? money(item.allocated_purchase_cost)
          : ({ kind: 'open' } as const);
      if (purchase.type === 'mystery_pack') {
        return {
          kind: 'mystery',
          id: item.id,
          title: item.title,
          orderedQuantity: 1,
          receivedQuantity: 1,
          unitPurchasePrice: allocatedCost,
          lineTotal: allocatedCost,
          inventoryItemId: item.id,
          inventoryItemLinks: [{ id: item.id, label: 'Artikel 1' }],
          recordedSales: sales,
          salesState: context.salesState,
          captureRemaining: 0,
          ...quantities,
        };
      }
      return {
        kind: 'normal',
        id: item.id,
        title: item.title,
        orderedQuantity: 1,
        receivedQuantity: 1,
        inventoryItemId: item.id,
        inventoryItemLinks: [{ id: item.id, label: 'Artikel 1' }],
        recordedSales: sales,
        salesState: context.salesState,
        captureRemaining: 0,
        unitPurchasePrice: { kind: 'open' },
        lineTotal: allocatedCost,
        ...quantities,
      };
    });

  return [...lineRows, ...legacyRows];
}

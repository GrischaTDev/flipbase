export type PurchaseLinePriceMode = 'priced' | 'unpriced_mystery';

export type PurchaseEntryStatus = 'draft' | 'capturing' | 'finalized';

export type PurchaseCostAllocationMethod = 'value_weighted' | 'quantity' | 'direct';

export interface PurchaseCostingResult {
  readonly purchaseId: string;
  readonly totalPurchaseCost: number | null;
  readonly allocatedTotalCost: number;
  readonly entryStatus: PurchaseEntryStatus;
  readonly eventId: string;
}

export interface BusinessEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly entityType: 'purchase' | 'inventory_item' | 'sale' | 'return' | 'export';
  readonly entityId: string;
  readonly eventType: string;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly changes: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
  readonly createdAt: string;
}

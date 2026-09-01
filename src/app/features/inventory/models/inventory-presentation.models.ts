import type {
  InventoryItem,
  ItemCondition,
  ItemStatus,
  TrackingMode,
} from '../../../core/models/flipbase.models';
import type { CostState } from '../../../shared/components/cost-state/cost-state.component';

export interface InventoryQuantitySummary {
  readonly total: number;
  readonly available: number;
  readonly reserved: number;
  readonly sold: number;
}

export type InventoryQuantityState = 'known' | 'loading' | 'error' | 'review_required';

export interface InventoryOriginView {
  readonly purchaseId: string;
  readonly label: string;
  readonly link: string;
}

export interface InventorySaleView {
  readonly id: string;
  readonly state: 'active' | 'returned' | 'voided';
  readonly stateLabel: string;
  readonly saleDate: string;
  readonly revenue: number;
  readonly revenueLabel: 'Verkaufsbetrag' | 'Historischer Verkaufsbetrag';
  readonly directResult: number | null;
  readonly showResultInSale: boolean;
  readonly link: string;
}

export type InventoryOriginState = 'known' | 'loading' | 'error' | 'not_linked';

export interface InventoryLotView {
  readonly id: string;
  readonly purchaseId: string;
  readonly receivedQuantity: number;
  readonly remainingQuantity: number;
  readonly receivedAt: string;
  readonly costPerUnit: CostState;
}

export type InventoryStatusView =
  | { readonly kind: 'editable'; readonly label: string; readonly value: ItemStatus }
  | { readonly kind: 'available' | 'sold' | 'review' | 'conflict'; readonly label: string };

export interface InventoryPresentationRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly trackingMode: TrackingMode;
  readonly actionId: string;
  readonly title: string;
  readonly condition: ItemCondition | null;
  readonly quantity: InventoryQuantitySummary;
  readonly quantityState: InventoryQuantityState;
  readonly costPerUnit: CostState;
  readonly inventoryValue: CostState;
  readonly origins: readonly InventoryOriginView[];
  readonly originState: InventoryOriginState;
  readonly sales: readonly InventorySaleView[];
  readonly salesState: 'known' | 'loading' | 'error';
  readonly status: InventoryStatusView;
  readonly canMutate: boolean;
  readonly canSell: boolean;
  readonly isPublicStore: boolean;
  readonly inventoryItem: InventoryItem | null;
  readonly lots: readonly InventoryLotView[];
}

export interface InventoryPresentationResult {
  readonly rows: readonly InventoryPresentationRow[];
  readonly sourceState: 'known' | 'loading' | 'error';
  readonly inventoryValue: CostState;
}

import type { CostState } from '../../../shared/components/cost-state/cost-state.component';
import type { ItemCondition, PurchaseType } from '../../../core/models/flipbase.models';
import type { BadgeTone } from '../../../shared/components/badge/badge.component';

export type PurchaseStatusLabel =
  | 'Entwurf'
  | 'Bestellt'
  | 'Unterwegs'
  | 'Angekommen'
  | 'Teillieferung'
  | 'Eingetroffen'
  | 'Inhalt erfassen'
  | 'Erfassung abgeschlossen'
  | 'Abgeschlossen'
  | 'Storniert'
  | 'Archiviert'
  | 'Prüfung erforderlich';

export type PresentationLoadState = 'loading' | 'loaded' | 'error';

export interface RecordedSalePresentation {
  readonly id: string;
  readonly status: 'active' | 'returned' | 'voided';
  readonly revenue: number | null;
  readonly directResult: number | null;
}

export interface InventoryItemLinkPresentation {
  readonly id: string;
  readonly label: string;
}

export interface PurchaseListRow {
  readonly reference: string;
  readonly supplierReference: string;
  readonly captureStatus: string;
  readonly id: string;
  readonly title: string;
  readonly type: PurchaseType;
  readonly typeLabel: string;
  readonly purchaseDate: string;
  readonly supplierLabel: string;
  readonly purchaseStatus: PurchaseStatusLabel;
  readonly purchaseStatusTone: BadgeTone;
  readonly allocationOpen: boolean;
  readonly totalCost: CostState;
  readonly totalUnits: number;
  readonly availableUnits: number | null;
  readonly soldUnits: number | null;
  readonly quantityState: PresentationLoadState;
}

interface PurchaseDetailRowBase {
  readonly id: string;
  readonly title: string;
  readonly quantity: number;
  readonly inventoryItemId: string | null;
  readonly inventoryItemLinks: readonly InventoryItemLinkPresentation[];
  readonly availableUnits: number | null;
  readonly soldUnits: number | null;
  readonly quantityState: PresentationLoadState;
  readonly recordedSales: readonly RecordedSalePresentation[] | null;
  readonly salesState: PresentationLoadState;
  readonly captureRemaining: number;
}

export interface NormalPurchaseDetailRow extends PurchaseDetailRowBase {
  readonly kind: 'normal';
  readonly unitPurchasePrice: CostState;
  readonly additionalCostPerUnit: CostState;
  readonly totalCostPerUnit: CostState;
}

export interface MysteryPurchaseDetailRow extends PurchaseDetailRowBase {
  readonly kind: 'mystery';
  readonly condition: ItemCondition | null;
  readonly estimatedMarketValue: number | null;
  readonly allocatedCostPerUnit: CostState;
}

export type PurchaseDetailRow = NormalPurchaseDetailRow | MysteryPurchaseDetailRow;

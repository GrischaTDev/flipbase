import type { CostState } from '../../../shared/components/cost-state/cost-state.component';
import type { ItemCondition, PurchaseType } from '../../../core/models/flipbase.models';

export type PurchaseStatusLabel =
  | 'Entwurf'
  | 'Bestellt'
  | 'Unterwegs'
  | 'Angekommen'
  | 'Teillieferung'
  | 'Eingetroffen'
  | 'Inhalt erfassen'
  | 'Erfassung abgeschlossen'
  | 'Storniert'
  | 'Archiviert'
  | 'Prüfung erforderlich';

export type PresentationLoadState = 'loading' | 'loaded' | 'error';
export type PurchaseStatusTone = 'neutral' | 'info' | 'success' | 'caution' | 'critical';

export interface PurchaseReceiptLinePresentation {
  readonly id: string;
  readonly title: string;
  readonly received: number;
  readonly ordered: number;
}

export type PurchaseReceiptSummary =
  | {
      readonly kind: 'known';
      readonly received: number;
      readonly ordered: number;
      readonly lines: readonly PurchaseReceiptLinePresentation[];
    }
  | { readonly kind: 'unknown-content' }
  | { readonly kind: 'unavailable' };

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
  readonly purchaseStatusTone: PurchaseStatusTone;
  readonly allocationOpen: boolean;
  readonly totalCost: CostState;
  readonly receipt: PurchaseReceiptSummary;
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

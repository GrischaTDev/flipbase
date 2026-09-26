import type { CostState } from '../../../shared/components/cost-state/cost-state.component';
import type { PurchaseType } from '../../../core/models/flipbase.models';
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
export type PurchaseStatusTone = 'neutral' | 'info' | 'success' | 'caution' | 'critical';

export interface PurchaseReceiptLinePresentation {
  readonly id: string;
  readonly title: string;
  readonly catalogProductId: string | null;
  readonly ean: string | null;
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
  /** Benutzername, Name, Bestellnummer und Stammdaten-Name für die Suche. */
  readonly sellerSearchText: string;
  readonly purchaseStatus: PurchaseStatusLabel;
  readonly purchaseStatusTone: BadgeTone;
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
  readonly orderedQuantity: number;
  readonly receivedQuantity: number;
  readonly unitPurchasePrice: CostState;
  readonly lineTotal: CostState;
  readonly inventoryItemId: string | null;
  readonly inventoryItemLinks: readonly InventoryItemLinkPresentation[];
  readonly availableUnits: number | null;
  readonly soldUnits: number | null;
  readonly quantityState: PresentationLoadState;
  readonly recordedSales: readonly RecordedSalePresentation[] | null;
  readonly salesState: PresentationLoadState;
  readonly captureRemaining: number;
}

export interface PurchaseDetailRow extends PurchaseDetailRowBase {
  readonly kind: 'normal' | 'mystery';
}

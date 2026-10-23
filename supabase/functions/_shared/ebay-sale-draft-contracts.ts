import type { AccountScope } from './marketplace-contracts.ts';
import type {
  EbayOrderAssignment,
  EbayOrderCosts,
  EbayOrderSource,
} from './ebay-order-import-contracts.ts';

export type EbaySaleDraftState =
  | 'needs_mapping'
  | 'needs_stock'
  | 'needs_costs'
  | 'ready_for_review'
  | 'blocked'
  | 'booked'
  | 'linked_existing'
  | 'dismissed';
export interface EbaySaleDraftCosts extends Omit<
  EbayOrderCosts,
  'platformFeeCents' | 'shippingCostCents'
> {
  readonly platformFeeCents: number | null;
  readonly shippingCostCents: number | null;
}
export type EbaySaleSourceIssue = 'canceled' | 'cancellation_pending' | 'refund_or_unknown';
export function ebaySaleSourceIssues(source: EbayOrderSource): readonly EbaySaleSourceIssue[] {
  const issues: EbaySaleSourceIssue[] = [];
  if (source.cancelStatus === 'CANCELED') issues.push('canceled');
  else if (source.cancelStatus && source.cancelStatus !== 'NONE_REQUESTED')
    issues.push('cancellation_pending');
  if (
    source.blockers.includes('refund_or_unknown') ||
    ['FULLY_REFUNDED', 'PARTIALLY_REFUNDED'].includes(source.paymentStatus) ||
    source.lines.some((line) => line.hasRefund)
  )
    issues.push('refund_or_unknown');
  return issues;
}
export interface EbaySaleDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly environment: 'production' | 'sandbox';
  readonly orderId: string;
  readonly source: EbayOrderSource;
  readonly assignments: readonly EbayOrderAssignment[];
  readonly costs: EbaySaleDraftCosts;
  readonly costsOrigin?: 'automatic' | 'personal';
  readonly sourceIssues?: readonly EbaySaleSourceIssue[];
  readonly state: EbaySaleDraftState;
  readonly saleId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface EbaySaleDraftSaveRequest extends AccountScope {
  readonly snapshotId: string;
  readonly assignments: readonly EbayOrderAssignment[];
  readonly costs: EbaySaleDraftCosts;
}
export interface EbayExistingSaleLinkRequest extends AccountScope {
  readonly snapshotId: string;
  readonly saleId: string;
  readonly assignments: readonly EbayOrderAssignment[];
  readonly reason: string;
}
export interface EbayExistingSale {
  readonly id: string;
  readonly saleDate: string;
  readonly total: number;
  readonly externalOrderId: string | null;
  readonly lines: readonly {
    readonly id: string;
    readonly inventoryItemId: string | null;
    readonly catalogProductId: string | null;
    readonly title: string;
    readonly quantity: number;
    readonly total: number;
  }[];
}
export interface EbaySaleNotification extends AccountScope {
  readonly sourceIssues?: readonly EbaySaleSourceIssue[];
  readonly eventId: number;
  readonly eventKey: string;
  readonly orderId: string;
  readonly draftId: string | null;
  readonly state: EbaySaleDraftState;
  readonly createdAt: string;
  readonly readAt: string | null;
}
export type EbaySaleNotificationAction = 'read' | 'unread' | 'dismiss';
export interface EbayStockReservation {
  readonly id: number;
  readonly draftId: string;
  readonly inventoryItemId: string | null;
  readonly stockLotId: string | null;
  readonly quantity: number;
  readonly createdAt: string;
}

// Persönliche RPCs (Nutzer-JWT, p_ als SQL-Argumentpräfix):
// ebay_sale_drafts_read(workspace_id, connection_id) → { workspaceId, connectionId, drafts: EbaySaleDraft[] }
// ebay_save_sale_draft(workspace_id, connection_id, snapshot_id, assignments, costs) → EbaySaleDraft
// ebay_existing_sales_read(workspace_id, connection_id, page=1) → EbayExistingSale[] (50/Seite)
// ebay_link_existing_sale(workspace_id, connection_id, snapshot_id, sale_id, assignments, reason) → EbayOrderBooking
// ebay_sale_notifications_read(workspace_id, connection_id, page=1) → EbaySaleNotification[] (100/Seite)
// ebay_sale_notification_update(workspace_id, connection_id, event_id, action) → boolean
// Interne Bestandsklärung auch nach Kontotrennung, ohne private Quelldaten:
// ebay_reservations_read(workspace_id) → EbayStockReservation[]
// ebay_reservation_resolve(workspace_id, draft_id, reason) → boolean
// Endgültige Buchung bleibt ausschließlich order_book mit neuem Anbieterabruf.

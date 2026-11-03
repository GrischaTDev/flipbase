export type MarketplaceInboxNotificationKind =
  | 'message'
  | 'offer_received'
  | 'sale_sold'
  | 'purchase_created'
  | 'order_cancelled'
  | 'transaction_cancelled'
  | 'item_relisted'
  | 'shipping_label_ready'
  | 'shipment_sent'
  | 'ready_for_pickup'
  | 'delivered'
  | 'order_completed'
  | 'order_suspended'
  | 'issue_reported'
  | 'refund_started'
  | 'refund_completed'
  | 'refund_accepted'
  | 'return_shipped'
  | 'feedback_received'
  | 'feedback_sent'
  | 'support_closed'
  | 'item_unavailable'
  | 'other_status';

export interface MarketplaceInboxEvent {
  readonly externalId: string;
  readonly externalConversationId: string;
  readonly occurredAt: string;
  readonly direction: 'inbound';
  readonly source: 'conversation_snapshot';
  readonly notificationKind?: MarketplaceInboxNotificationKind;
}

export interface MarketplaceInboxEventBatch {
  readonly observedAt: string;
  readonly events: readonly MarketplaceInboxEvent[];
  readonly complete: boolean;
  readonly coveredConversationIds: readonly string[];
}

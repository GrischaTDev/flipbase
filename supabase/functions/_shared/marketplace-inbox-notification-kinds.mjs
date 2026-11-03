export const marketplaceInboxEventMaxBytes = 768 * 1024;

/** @type {Record<import('./marketplace-inbox-event-contracts.d.ts').MarketplaceInboxNotificationKind, true>} */
const notificationKinds = {
  message: true,
  offer_received: true,
  sale_sold: true,
  purchase_created: true,
  order_cancelled: true,
  transaction_cancelled: true,
  item_relisted: true,
  shipping_label_ready: true,
  shipment_sent: true,
  ready_for_pickup: true,
  delivered: true,
  order_completed: true,
  order_suspended: true,
  issue_reported: true,
  refund_started: true,
  refund_completed: true,
  refund_accepted: true,
  return_shipped: true,
  feedback_received: true,
  feedback_sent: true,
  support_closed: true,
  item_unavailable: true,
  other_status: true,
};

/**
 * @param {unknown} input
 * @param {string} externalId
 * @returns {input is import('./marketplace-inbox-event-contracts.d.ts').MarketplaceInboxNotificationKind}
 */
export function isMarketplaceInboxNotificationKind(input, externalId) {
  if (typeof input !== 'string' || !Object.hasOwn(notificationKinds, input)) return false;
  if (externalId.startsWith('message:')) return input === 'message';
  if (externalId.startsWith('offer_request_message:')) return input === 'offer_received';
  return (
    /^(status_message|action_message|payment_message):/.test(externalId) &&
    input !== 'message' &&
    input !== 'offer_received'
  );
}

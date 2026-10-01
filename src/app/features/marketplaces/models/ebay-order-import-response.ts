import type { AccountScope } from './marketplace.models';
import type {
  EbayArticleMapping,
  EbayOrderAssignment,
  EbayOrderBooking,
  EbayOrderBookResponse,
  EbayOrderReview,
  EbayOrderSource,
  EbaySaleTarget,
} from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';

const invalid = (): never => {
  throw new Error('Die eBay-Prüfantwort ist ungültig. Lade die Bestellung erneut.');
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}
function text(value: unknown, maximum = 500): string {
  return typeof value === 'string' && value.length <= maximum ? value : invalid();
}
function identifier(value: unknown): string {
  const result = text(value, 256);
  return result.trim() && result === result.trim() ? result : invalid();
}
function uuid(value: unknown): string {
  const result = text(value);
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result)
    ? result
    : invalid();
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function cents(value: unknown): number | null {
  return value === null
    ? null
    : typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 999999999999
      ? value
      : invalid();
}
function quantity(value: unknown): number | null {
  return value === null
    ? null
    : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
      ? value
      : invalid();
}
function boolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}
export function parseEbayVariationAspects(
  value: unknown,
): readonly { name: string; value: string }[] {
  if (!Array.isArray(value) || value.length > 50) return invalid();
  return value.map((item) => {
    const row = record(item);
    return { name: text(row['name']), value: text(row['value']) };
  });
}
function target(value: unknown): EbaySaleTarget {
  const row = record(value);
  if (Object.keys(row).length !== 1) return invalid();
  if ('inventoryItemId' in row) return { inventoryItemId: uuid(row['inventoryItemId']) };
  if ('catalogProductId' in row) return { catalogProductId: uuid(row['catalogProductId']) };
  return invalid();
}
export function parseEbayArticleMapping(value: unknown): EbayArticleMapping {
  const row = record(value);
  return {
    id: uuid(row['id']),
    listingId: identifier(row['listingId']),
    variationId: row['variationId'] === null ? null : identifier(row['variationId']),
    target: target(row['target']),
  };
}
export function parseEbayOrderBooking(value: unknown): EbayOrderBooking {
  const row = record(value);
  if (row['status'] === 'unrecorded' && row['saleId'] === null)
    return { status: 'unrecorded', saleId: null };
  if (row['status'] === 'recorded_elsewhere')
    return {
      status: 'recorded_elsewhere',
      saleId: row['saleId'] === null ? null : uuid(row['saleId']),
    };
  if (row['status'] === 'imported')
    return {
      status: 'imported',
      saleId: uuid(row['saleId']),
      alreadyRecorded: boolean(row['alreadyRecorded']),
    };
  return invalid();
}
export function parseEbayOrderSource(value: unknown, orderId: string): EbayOrderSource {
  const row = record(value);
  if (
    row['orderId'] !== orderId ||
    !Array.isArray(row['lines']) ||
    row['lines'].length > 200 ||
    !Array.isArray(row['blockers']) ||
    row['blockers'].length > 50
  )
    return invalid();
  const ids = new Set<string>();
  const lines = row['lines'].map((item) => {
    const line = record(item);
    const lineItemId = line['lineItemId'] === null ? null : identifier(line['lineItemId']);
    // Gesperrte Quellen dürfen fehlende Kennungen erklären; doppelte Kennungen bleiben ungültig.
    if (lineItemId && ids.has(lineItemId)) return invalid();
    if (lineItemId) ids.add(lineItemId);
    return {
      lineItemId,
      listingId: line['listingId'] === null ? null : identifier(line['listingId']),
      variationId: line['variationId'] === null ? null : identifier(line['variationId']),
      sku: nullableText(line['sku']),
      title: text(line['title']),
      quantity: quantity(line['quantity']),
      goodsCents: cents(line['goodsCents']),
      hasRefund: boolean(line['hasRefund']),
      variationAspects: parseEbayVariationAspects(line['variationAspects']),
    };
  });
  return {
    orderId,
    createdAt: text(row['createdAt']),
    lastModifiedAt: nullableText(row['lastModifiedAt']),
    observedAt: identifier(row['observedAt']),
    paymentStatus: identifier(row['paymentStatus']),
    cancelStatus: nullableText(row['cancelStatus']),
    fulfillmentStatus: identifier(row['fulfillmentStatus']),
    currency: nullableText(row['currency']),
    totalCents: cents(row['totalCents']),
    shippingRevenueCents: cents(row['shippingRevenueCents']),
    lines,
    blockers: row['blockers'].map((blocker) => identifier(blocker)),
  };
}
export function parseEbayOrderReview(
  value: unknown,
  scope: AccountScope,
  orderId: string,
): EbayOrderReview {
  const row = record(value);
  if (
    row['workspaceId'] !== scope.workspaceId ||
    row['connectionId'] !== scope.connectionId ||
    typeof row['reviewHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(row['reviewHash']) ||
    !Array.isArray(row['assignments']) ||
    row['assignments'].length > 200
  )
    return invalid();
  const expiresAt = text(row['expiresAt']);
  if (!Number.isFinite(Date.parse(expiresAt))) return invalid();
  const source = parseEbayOrderSource(row['source'], orderId);
  const ids = new Set<string>();
  const assignments: EbayOrderAssignment[] = row['assignments'].map((item) => {
    const assignment = record(item);
    const lineItemId = identifier(assignment['lineItemId']);
    if (ids.has(lineItemId) || !source.lines.some((line) => line.lineItemId === lineItemId))
      return invalid();
    ids.add(lineItemId);
    return { lineItemId, target: target(assignment['target']) };
  });
  return {
    ...scope,
    snapshotId: uuid(row['snapshotId']),
    reviewHash: row['reviewHash'],
    expiresAt,
    source,
    assignments,
    booking: parseEbayOrderBooking(row['booking']),
  };
}
export function parseEbayOrderBookResponse(
  value: unknown,
  scope: AccountScope,
  orderId: string,
): EbayOrderBookResponse {
  const row = record(value);
  if (row['status'] === 'review_changed')
    return {
      status: 'review_changed',
      review: parseEbayOrderReview(row['review'], scope, orderId),
    };
  const booking = parseEbayOrderBooking(value);
  return booking.status === 'imported' ? booking : invalid();
}

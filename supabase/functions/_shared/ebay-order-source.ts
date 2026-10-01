import type { EbayOrderSource, EbayOrderSourceLine } from './ebay-order-import-contracts.ts';
import type { EbayEnvironment } from './ebay-contracts.ts';
import { isEbayCents, parseEbayMoney } from './ebay-order-amounts.ts';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : null;
}
function timestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}
export function ebaySaleDate(createdAt: string): string {
  if (!timestamp(createdAt)) throw new Error('invalid_sale_date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(createdAt));
  const part = (name: string) => parts.find((value) => value.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function parseEbayOrderSource(
  row: Record<string, unknown>,
  observedAt: string,
): EbayOrderSource {
  const summary = record(row.pricingSummary);
  const total = parseEbayMoney(summary.total);
  const currency = total?.currency ?? text(record(summary.total).currency);
  const delivery = parseEbayMoney(summary.deliveryCost);
  const discount =
    summary.deliveryDiscount === undefined
      ? { cents: 0, currency }
      : parseEbayMoney(summary.deliveryDiscount);
  const shipping =
    delivery &&
    discount &&
    delivery.currency === currency &&
    discount.currency === currency &&
    delivery.cents >= discount.cents
      ? delivery.cents - discount.cents
      : null;
  const blockers = new Set<string>();
  if (currency !== 'EUR') blockers.add('currency_unsupported');
  if (!text(row.orderId) || !timestamp(row.creationDate)) blockers.add('invalid_order');
  if (!total || shipping === null) blockers.add('invalid_amounts');
  if (row.orderPaymentStatus !== 'PAID') blockers.add('payment_unconfirmed');
  if (record(row.cancelStatus).cancelState !== 'NONE_REQUESTED') blockers.add('cancellation');
  for (const field of ['tax', 'fee', 'adjustment']) {
    if (summary[field] !== undefined) {
      const amount = parseEbayMoney(summary[field]);
      if (!amount || amount.currency !== currency || amount.cents !== 0)
        blockers.add('unsupported_adjustment');
    }
  }
  const lineIds = new Set<string>();
  const lines: EbayOrderSourceLine[] = Array.isArray(row.lineItems)
    ? row.lineItems.map((value) => {
        const line = record(value);
        const amount = parseEbayMoney(
          line.discountedLineItemCost === undefined
            ? line.lineItemCost
            : line.discountedLineItemCost,
        );
        const original = parseEbayMoney(line.lineItemCost);
        const lineItemId = text(line.lineItemId);
        const listingId = text(line.legacyItemId);
        const quantity =
          typeof line.quantity === 'number' &&
          Number.isInteger(line.quantity) &&
          line.quantity >= 1 &&
          line.quantity <= 2_147_483_647
            ? line.quantity
            : null;
        const hasRefund = !Array.isArray(line.refunds) || line.refunds.length > 0;
        if (hasRefund) blockers.add('refund_or_unknown');
        if (
          !lineItemId ||
          !listingId ||
          lineIds.has(lineItemId) ||
          quantity === null ||
          !amount ||
          !original ||
          amount.currency !== currency ||
          original.currency !== currency ||
          amount.cents > original.cents ||
          amount.cents < (quantity ?? 1)
        )
          blockers.add('invalid_lines');
        if (lineItemId) lineIds.add(lineItemId);
        for (const field of ['taxes', 'ebayCollectAndRemitTaxes', 'ebayCollectedCharges']) {
          if (line[field] !== undefined && (!Array.isArray(line[field]) || line[field].length > 0))
            blockers.add('unsupported_adjustment');
        }
        const variationAspects = Array.isArray(line.variationAspects)
          ? line.variationAspects.map((aspect) => ({
              name: text(record(aspect).name) ?? '',
              value: text(record(aspect).value) ?? '',
            }))
          : [];
        if (variationAspects.some((aspect) => !aspect.name || !aspect.value))
          blockers.add('invalid_lines');
        return {
          lineItemId,
          listingId,
          variationId: text(line.legacyVariationId),
          sku: text(line.sku),
          title: typeof line.title === 'string' ? line.title.slice(0, 500) : 'eBay-Artikel',
          quantity,
          goodsCents: amount?.cents ?? null,
          hasRefund,
          variationAspects,
        };
      })
    : [];
  if (lines.length === 0 || lines.length > 200) blockers.add('invalid_lines');
  const goods = lines.reduce((sum, line) => sum + (line.goodsCents ?? 0), 0);
  if (!isEbayCents(goods) || shipping === null || !total || goods + shipping !== total.cents)
    blockers.add('amount_mismatch');
  return {
    orderId: text(row.orderId) ?? '',
    createdAt: typeof row.creationDate === 'string' ? row.creationDate : '',
    lastModifiedAt: timestamp(row.lastModifiedDate) ? row.lastModifiedDate : null,
    observedAt,
    paymentStatus: text(row.orderPaymentStatus) ?? 'UNKNOWN',
    cancelStatus: text(record(row.cancelStatus).cancelState),
    fulfillmentStatus: text(row.orderFulfillmentStatus) ?? 'UNKNOWN',
    currency,
    totalCents: total?.cents ?? null,
    shippingRevenueCents: shipping,
    lines,
    blockers: [...blockers].sort(),
  };
}
export function ebayMappingMatchesLine(
  mapping: { listingId: string; variationId: string | null },
  line: EbayOrderSourceLine,
): boolean {
  return (
    mapping.listingId === line.listingId &&
    mapping.variationId === line.variationId &&
    (line.variationId !== null || line.variationAspects.length === 0)
  );
}
const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function ebayOrderReviewHash(source: EbayOrderSource): Promise<string> {
  const {
    observedAt: _observed,
    lastModifiedAt: _modified,
    fulfillmentStatus: _fulfillment,
    ...booking
  } = source;
  const canonical = {
    ...booking,
    lines: [...source.lines].sort((a, b) => (a.lineItemId ?? '').localeCompare(b.lineItemId ?? '')),
  };
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(canonical))));
}
export async function ebayOrderSourceKey(
  secret: string,
  workspaceId: string,
  environment: EbayEnvironment,
  accountId: string,
  orderId: string,
): Promise<string> {
  const raw = Uint8Array.from(atob(secret), (value) => value.charCodeAt(0));
  if (raw.length !== 32) throw new Error('invalid_source_key');
  const master = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('flipbase:ebay:source:v1'),
      info: encoder.encode('order-booking'),
    },
    master,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(JSON.stringify([workspaceId, environment, accountId, orderId])),
    ),
  );
}

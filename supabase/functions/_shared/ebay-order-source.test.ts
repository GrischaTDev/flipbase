import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ebayOrderReviewHash,
  ebayOrderSourceKey,
  ebaySaleDate,
  parseEbayOrderSource,
  ebayMappingMatchesLine,
} from './ebay-order-source.ts';

const money = (value: string) => ({ value, currency: 'EUR' });
function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderId: 'order-1',
    creationDate: '2026-09-30T22:30:00Z',
    lastModifiedDate: '2026-10-01T01:00:00Z',
    orderPaymentStatus: 'PAID',
    orderFulfillmentStatus: 'NOT_STARTED',
    cancelStatus: { cancelState: 'NONE_REQUESTED' },
    pricingSummary: {
      total: money('14.00'),
      deliveryCost: money('5.00'),
      deliveryDiscount: money('1.00'),
    },
    lineItems: [
      {
        lineItemId: 'line-1',
        legacyItemId: '123',
        title: 'Artikel',
        quantity: 3,
        lineItemCost: money('12.00'),
        discountedLineItemCost: money('10.00'),
        refunds: [],
      },
    ],
    ...overrides,
  };
}
const observedAt = '2026-10-01T12:00:00Z';

test('normalizes discounted goods and shipping without exposing buyer data', () => {
  const source = parseEbayOrderSource(order({ buyer: { username: 'private-buyer' } }), observedAt);
  assert.equal(source.totalCents, 1400);
  assert.equal(source.shippingRevenueCents, 400);
  assert.equal(source.lines[0].goodsCents, 1000);
  assert.deepEqual(source.blockers, []);
  assert.equal(JSON.stringify(source).includes('private-buyer'), false);
});

test('preserves missing values and blocks partial or ambiguous source data', () => {
  const source = parseEbayOrderSource(order({ lineItems: [{ title: 'Unklar' }] }), observedAt);
  assert.equal(source.lines[0].quantity, null);
  assert.equal(source.lines[0].lineItemId, null);
  assert.equal(source.lines[0].goodsCents, null);
  assert.ok(source.blockers.includes('invalid_lines'));
  const duplicates = parseEbayOrderSource(
    order({
      lineItems: [
        {
          lineItemId: 'x',
          legacyItemId: '123',
          quantity: 1,
          lineItemCost: money('5'),
          refunds: [],
        },
        {
          lineItemId: 'x',
          legacyItemId: '123',
          quantity: 1,
          lineItemCost: money('5'),
          refunds: [],
        },
      ],
    }),
    observedAt,
  );
  assert.ok(duplicates.blockers.includes('invalid_lines'));
});

test('blocks unconfirmed payment, cancellation, refunds, taxes and zero prices', () => {
  for (const overrides of [
    { orderPaymentStatus: 'PENDING' },
    { cancelStatus: { cancelState: 'CANCEL_REQUESTED' } },
    { pricingSummary: { total: money('15'), deliveryCost: money('4'), tax: money('1') } },
    {
      lineItems: [
        {
          lineItemId: 'x',
          legacyItemId: '123',
          quantity: 1,
          lineItemCost: money('10'),
          refunds: [{ refundStatus: 'SUCCEEDED' }],
        },
      ],
    },
    {
      lineItems: [{ lineItemId: 'x', legacyItemId: '123', quantity: 1, lineItemCost: money('10') }],
    },
    {
      lineItems: [
        {
          lineItemId: 'x',
          legacyItemId: '123',
          quantity: 3,
          lineItemCost: money('0.02'),
          refunds: [],
        },
      ],
    },
  ])
    assert.ok(parseEbayOrderSource(order(overrides), observedAt).blockers.length > 0);
  assert.ok(
    parseEbayOrderSource(
      order({ pricingSummary: { total: { value: '14', currency: 'USD' } } }),
      observedAt,
    ).blockers.includes('currency_unsupported'),
  );
});

test('uses Berlin date across midnight and daylight saving transitions', () => {
  assert.equal(ebaySaleDate('2026-09-30T22:30:00Z'), '2026-10-01');
  assert.equal(ebaySaleDate('2026-03-29T01:30:00Z'), '2026-03-29');
  assert.equal(ebaySaleDate('2026-10-25T01:30:00Z'), '2026-10-25');
  assert.throws(() => ebaySaleDate('invalid'));
  assert.throws(() => ebaySaleDate('2026-02-30T12:00:00Z'));
});

test('never replaces an explicitly malformed discounted amount with the original price', () => {
  const source = parseEbayOrderSource(
    order({
      lineItems: [
        {
          lineItemId: 'x',
          legacyItemId: '123',
          quantity: 1,
          lineItemCost: money('10'),
          discountedLineItemCost: null,
          refunds: [],
        },
      ],
    }),
    observedAt,
  );
  assert.ok(source.blockers.includes('invalid_lines'));
});

test('review hash ignores observation and fulfillment but catches changed goods and payment', async () => {
  const source = parseEbayOrderSource(order(), observedAt);
  const hash = await ebayOrderReviewHash(source);
  assert.equal(
    hash,
    await ebayOrderReviewHash({
      ...source,
      observedAt: '2026-10-02T00:00:00Z',
      fulfillmentStatus: 'FULFILLED',
      lastModifiedAt: '2026-10-02T00:00:00Z',
    }),
  );
  assert.notEqual(hash, await ebayOrderReviewHash({ ...source, paymentStatus: 'PENDING' }));
  assert.notEqual(
    hash,
    await ebayOrderReviewHash({ ...source, lines: [{ ...source.lines[0], goodsCents: 999 }] }),
  );
});

test('stable source key separates account, environment and workspace and prevents tuple ambiguity', async () => {
  const secret = btoa('12345678901234567890123456789012');
  const key = await ebayOrderSourceKey(secret, 'workspace', 'production', 'seller', 'order');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, await ebayOrderSourceKey(secret, 'workspace', 'production', 'seller', 'order'));
  for (const params of [
    ['other', 'production', 'seller', 'order'],
    ['workspace', 'sandbox', 'seller', 'order'],
    ['workspace', 'production', 'other', 'order'],
    ['workspace', 'production', 'seller', 'other'],
  ] as const) {
    assert.notEqual(
      key,
      await ebayOrderSourceKey(secret, params[0], params[1], params[2], params[3]),
    );
  }
  assert.notEqual(
    await ebayOrderSourceKey(secret, 'w', 'production', 'a:b', 'c'),
    await ebayOrderSourceKey(secret, 'w', 'production', 'a', 'b:c'),
  );
});

test('never applies an unqualified mapping to an ambiguous listing variation', () => {
  const line = parseEbayOrderSource(order(), observedAt).lines[0];
  assert.equal(ebayMappingMatchesLine({ listingId: '123', variationId: null }, line), true);
  assert.equal(
    ebayMappingMatchesLine(
      { listingId: '123', variationId: null },
      { ...line, variationAspects: [{ name: 'Größe', value: '38' }] },
    ),
    false,
  );
  assert.equal(
    ebayMappingMatchesLine({ listingId: '123', variationId: 'v1' }, { ...line, variationId: 'v2' }),
    false,
  );
});

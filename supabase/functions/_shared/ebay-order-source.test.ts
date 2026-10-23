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

test('Belegter Zahlungseingang verwendet die letzte gültige Empfangszeit und keine Änderungszeit', () => {
  const source = parseEbayOrderSource(
    order({
      paymentSummary: {
        payments: [
          { paymentDate: '2026-10-01T00:00:00Z' },
          { paymentDate: '2026-10-01T01:00:00Z' },
        ],
      },
    }),
    observedAt,
  );
  assert.equal(source.paidAt, '2026-10-01T01:00:00Z');
});

test('Fehlender oder unsicherer Zahlungszeitpunkt bleibt unbekannt', () => {
  for (const payments of [
    undefined,
    [],
    [{ paymentDate: 'invalid' }],
    [{ paymentDate: '2026-09-01T12:00:00Z' }],
    [{ paymentDate: '2027-10-01T12:00:00Z' }],
    [{ paymentDate: '2026-10-01T01:00:00Z' }, {}],
  ]) {
    assert.equal(
      parseEbayOrderSource(order({ paymentSummary: { payments } }), observedAt).paidAt,
      null,
    );
  }
  assert.equal(
    parseEbayOrderSource(
      order({
        orderPaymentStatus: 'PENDING',
        paymentSummary: { payments: [{ paymentDate: '2026-10-01T01:00:00Z' }] },
      }),
      observedAt,
    ).paidAt,
    null,
  );
});

test('Gebühren verwenden nur die belegte Marktplatzsumme einschließlich echter Null', () => {
  for (const [fee, expected] of [
    [money('1.23'), 123],
    [money('0'), 0],
    [undefined, null],
    [{ value: '1', currency: 'USD' }, null],
    [money('-1'), null],
  ] as const) {
    const source = parseEbayOrderSource(
      order({ totalMarketplaceFee: fee, totalFeeBasisAmount: money('14') }),
      observedAt,
    );
    assert.equal(source.platformFeeCents, expected);
  }
});

test('Positionsbilder akzeptieren nur sichere eBay-Bildquellen', () => {
  for (const [imageUrl, expected] of [
    [
      'https://i.ebayimg.com/images/g/abc/s-l500.jpg',
      'https://i.ebayimg.com/images/g/abc/s-l500.jpg',
    ],
    ['https://evil.test/x', null],
    ['javascript:alert(1)', null],
  ] as const) {
    const source = parseEbayOrderSource(
      order({ lineItems: [{ legacyItemId: '123', image: { imageUrl } }] }),
      observedAt,
    );
    assert.equal(source.lines[0].imageUrl, expected);
  }
});

test('normalizes discounted goods and shipping without exposing buyer data', () => {
  const source = parseEbayOrderSource(order({ buyer: { username: 'private-buyer' } }), observedAt);
  assert.equal(source.totalCents, 1400);
  assert.equal(source.shippingRevenueCents, 400);
  assert.equal(source.lines[0].goodsCents, 1000);
  assert.deepEqual(source.blockers, []);
  assert.equal(JSON.stringify(source).includes('private-buyer'), false);
});

test('accepts omitted line refunds when the order explicitly reports no refunds', () => {
  const source = parseEbayOrderSource(
    order({
      orderFulfillmentStatus: 'FULFILLED',
      paymentSummary: { refunds: [] },
      lineItems: [
        { lineItemId: 'line-1', legacyItemId: '123', quantity: 1, lineItemCost: money('10') },
      ],
    }),
    observedAt,
  );
  assert.deepEqual(source.blockers, []);
  assert.equal(source.lines[0].hasRefund, false);
});

test('blocks order refunds even when all line refund arrays are empty', () => {
  for (const refunds of [
    [{ refundStatus: 'SUCCEEDED' }],
    [{ refundStatus: 'PENDING' }],
    null,
    {},
  ]) {
    const source = parseEbayOrderSource(order({ paymentSummary: { refunds } }), observedAt);
    assert.ok(source.blockers.includes('refund_or_unknown'));
    assert.equal(source.lines[0].hasRefund, true);
  }
});

test('an empty order refund array never overrides refunded or malformed line data', () => {
  for (const refunds of [[{ refundStatus: 'SUCCEEDED' }], null, {}]) {
    const source = parseEbayOrderSource(
      order({
        paymentSummary: { refunds: [] },
        lineItems: [
          {
            lineItemId: 'line-1',
            legacyItemId: '123',
            quantity: 1,
            lineItemCost: money('10'),
            refunds,
          },
        ],
      }),
      observedAt,
    );
    assert.ok(source.blockers.includes('refund_or_unknown'));
  }
});

test('keeps missing refund evidence blocked instead of assuming zero refunds', () => {
  for (const paymentSummary of [undefined, {}, { refunds: null }]) {
    const source = parseEbayOrderSource(
      order({
        paymentSummary,
        lineItems: [
          { lineItemId: 'line-1', legacyItemId: '123', quantity: 1, lineItemCost: money('10') },
        ],
      }),
      observedAt,
    );
    assert.ok(source.blockers.includes('refund_or_unknown'));
  }
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

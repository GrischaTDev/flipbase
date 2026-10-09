import { deepStrictEqual as assertEquals, throws as assertThrows } from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateNegotiationPrices,
  createDefaultNegotiationConfig,
  decideNegotiation,
  isNegotiationConfig,
  isNegotiationEvent,
  isNegotiationOffer,
  parseNegotiationConfig,
  renderNegotiationTemplate,
} from './negotiation-config.ts';

test('Verhandlung: Euro, Prozente, Preisbereiche und Centrundung', () => {
  const config = createDefaultNegotiationConfig();
  assertEquals(
    calculateNegotiationPrices(5000, { ...config, discountType: 'amount', discountValue: 10 }),
    { minimumPriceCents: 4000, stagePriceCents: [4500, 4200, 4000] },
  );
  assertEquals(calculateNegotiationPrices(999, config), {
    minimumPriceCents: 899,
    stagePriceCents: [949, 919, 899],
  });
  assertEquals(
    calculateNegotiationPrices(10000, { ...config, discountValue: 28.57 }).minimumPriceCents,
    7143,
  );
  assertEquals(
    calculateNegotiationPrices(10000, { ...config, discountValue: 0.29 }).minimumPriceCents,
    9971,
  );
  const bands = [
    { upToCents: 5000, discountType: 'amount' as const, discountValue: 5 },
    { upToCents: null, discountType: 'percentage' as const, discountValue: 20 },
  ];
  assertEquals(
    calculateNegotiationPrices(5000, { ...config, priceBands: bands }).minimumPriceCents,
    4500,
  );
  assertEquals(
    calculateNegotiationPrices(5001, { ...config, priceBands: bands }).minimumPriceCents,
    4001,
  );
  assertThrows(() =>
    calculateNegotiationPrices(100, { ...config, discountType: 'amount', discountValue: 0.51 }),
  );
  assertThrows(() => calculateNegotiationPrices(1, config));
  assertThrows(() => calculateNegotiationPrices(10.5, config));
});

test('Verhandlung: Nachrichtenclaims tragen einen streng validierten Angebots-Snapshot', () => {
  const offer = {
    offerId: '11',
    transactionId: '22',
    itemId: '33',
    buyerId: '44',
    sellerId: '55',
    originalPriceCents: 10000,
    offeredPriceCents: 8000,
    currency: 'EUR',
    status: 'pending',
  };
  assertEquals(isNegotiationOffer(offer), true);
  for (const invalid of [
    { ...offer, status: 'cancelled' },
    { ...offer, currency: null },
    { ...offer, buyerId: offer.sellerId },
    { ...offer, offeredPriceCents: 10001 },
    { ...offer, offeredPriceCents: 1.1 },
    { ...offer, offerId: null },
    { ...offer, unknown: true },
  ])
    assertEquals(isNegotiationOffer(invalid), false);
});

test('Verhandlung: Kaufpreise benötigen ein vollständiges bestätigtes Preistripel', () => {
  const event = { id: '11', type: 'purchased', transactionId: '22', confirmed: true };
  assertEquals(isNegotiationEvent(event), true);
  assertEquals(
    isNegotiationEvent({ ...event, originalPriceCents: 10000, priceCents: 9000, currency: 'EUR' }),
    true,
  );
  for (const invalid of [
    { ...event, confirmed: false },
    { ...event, id: null },
    { ...event, priceCents: 9000 },
    { ...event, originalPriceCents: 10000, priceCents: 9000, currency: null },
    { ...event, originalPriceCents: 10000, priceCents: 10001, currency: 'EUR' },
    { ...event, unknown: true },
  ])
    assertEquals(isNegotiationEvent(invalid), false);
});

test('Verhandlung: exakte Annahmegrenze und Stufen reagieren auf neue Eingänge', () => {
  const config = createDefaultNegotiationConfig();
  assertEquals(decideNegotiation(10000, 9000, 0, false, config), {
    action: 'accept',
    event: 'accepted',
    priceCents: null,
  });
  assertEquals(decideNegotiation(10000, 8999, 0, false, config), {
    action: 'counter',
    event: 'counter',
    priceCents: 9500,
  });
  assertEquals(decideNegotiation(10000, 8999, 1, false, config).priceCents, 9200);
  assertEquals(decideNegotiation(10000, 8999, 2, false, config), {
    action: 'counter',
    event: 'final',
    priceCents: 9000,
  });
  assertEquals(decideNegotiation(10000, 8000, 3, false, config), {
    action: null,
    event: 'after_final',
    priceCents: null,
  });
  assertEquals(decideNegotiation(10000, 8000, 1, true, config), {
    action: null,
    event: 'after_acceptance',
    priceCents: null,
  });
  assertThrows(() => decideNegotiation(10000, 10001, 0, false, config));
  assertThrows(() => decideNegotiation(10000, 8000, 11, false, config));
});

test('Verhandlung: keine unbekannten oder unbeschränkten Konfigurationsfelder', () => {
  const config = createDefaultNegotiationConfig();
  assertEquals(isNegotiationConfig(config), true);
  for (const invalid of [
    null,
    [],
    { ...config, unexpected: true },
    { ...config, sendOrder: null },
    { ...config, priceBands: null },
    { ...config, stages: null },
    { ...config, messages: null },
    { ...config, discountValue: NaN },
    { ...config, discountValue: Infinity },
    { ...config, discountValue: 50.01 },
    { ...config, discountValue: 1.001 },
    { ...config, stages: [] },
    { ...config, stages: [80, 50, 100] },
    { ...config, stages: [50, 80] },
    { ...config, delaySeconds: 604801 },
    { ...config, delaySeconds: 0.5 },
    { ...config, purchaseEnabled: 'true' },
    {
      ...config,
      priceBands: [
        { upToCents: null, discountType: 'amount', discountValue: 5 },
        { upToCents: 5000, discountType: 'amount', discountValue: 5 },
      ],
    },
    {
      ...config,
      messages: { ...config.messages, counter: [{ templates: [''], delaySeconds: 0 }] },
    },
    {
      ...config,
      messages: {
        ...config.messages,
        counter: [{ templates: ['Test'], delaySeconds: 0, extra: 1 }],
      },
    },
  ]) {
    assertEquals(isNegotiationConfig(invalid), false);
    assertThrows(() => parseNegotiationConfig(invalid));
  }
  assertEquals(
    isNegotiationConfig({
      ...config,
      messages: {
        ...config.messages,
        counter: [
          { templates: ['Hallo', 'Guten Tag'], delaySeconds: 30 },
          { templates: ['Danach'], delaySeconds: 60 },
        ],
      },
    }),
    true,
  );
  assertEquals(
    renderNegotiationTemplate('{article}: {original_price} / {price}', 5000, 4500, 'Jacke'),
    'Jacke: 50,00 € / 45,00 €',
  );
  assertThrows(() => renderNegotiationTemplate('{article}', 5000, 4500, 'a'.repeat(2001)));
});

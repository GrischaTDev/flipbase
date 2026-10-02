import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEbayMoney, splitEbayLineAmount } from './ebay-order-amounts.ts';

test('parses exact cents and preserves zero without accepting malformed money', () => {
  assert.deepEqual(parseEbayMoney({ value: '10.01', currency: 'EUR' }), {
    currency: 'EUR',
    cents: 1001,
  });
  assert.deepEqual(parseEbayMoney({ value: '0.0', currency: 'EUR' }), {
    currency: 'EUR',
    cents: 0,
  });
  for (const value of ['1.234', '-1', 'NaN', '1e2', ' 1.00', '10000000000.00']) {
    assert.equal(parseEbayMoney({ value, currency: 'EUR' }), null, value);
  }
  assert.equal(parseEbayMoney({ value: 1, currency: 'EUR' }), null);
  assert.equal(parseEbayMoney({ value: '1.00' }), null);
});

test('splits discounted cents without changing revenue or quantity', () => {
  assert.deepEqual(splitEbayLineAmount(1000, 3), [
    { quantity: 2, unitCents: 333 },
    { quantity: 1, unitCents: 334 },
  ]);
  assert.deepEqual(splitEbayLineAmount(900, 3), [{ quantity: 3, unitCents: 300 }]);
  assert.deepEqual(splitEbayLineAmount(1, 1), [{ quantity: 1, unitCents: 1 }]);
});

test('rejects nonpositive unit prices and invalid source quantities', () => {
  for (const [cents, quantity] of [
    [0, 1],
    [1, 2],
    [100, 0],
    [100, 1.5],
    [NaN, 1],
    [100, -1],
  ]) {
    assert.throws(() => splitEbayLineAmount(cents, quantity));
  }
});

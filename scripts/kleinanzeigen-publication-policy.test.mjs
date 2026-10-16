import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context = vm.createContext({});
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-publication-policy.js', 'utf8'),
  context,
);
const policy = context.FlipbaseKleinanzeigenPolicy;
const now = Date.parse('2026-10-16T06:00:30Z');
const free = {
  externalAccountId: '123',
  accountType: 'private',
  categoryGroup: 'consumer_goods',
  quota: {
    externalAccountId: '123',
    accountType: 'private',
    used: 99,
    source: 'account_settings',
    observedAt: '2026-10-16T06:00:00Z',
  },
  fee: { state: 'free', observedAt: '2026-10-16T06:00:29Z' },
  reserved: 0,
};
test('the hundredth private consumer listing can proceed after fresh provider checks', () =>
  assert.equal(policy.evaluate(free, now).allowed, true));
for (const used of [100, 101, 1000])
  test('stops before publishing when used quota is ' + used, () =>
    assert.equal(
      policy.evaluate({ ...free, quota: { ...free.quota, used } }, now).reason,
      'quota_exhausted',
    ),
  );
test('an account reservation consumes the last available slot', () =>
  assert.equal(policy.evaluate({ ...free, reserved: 1 }, now).reason, 'quota_exhausted'));
for (const state of ['paid', 'unknown', null])
  test('fee state ' + state + ' never permits publication', () =>
    assert.equal(policy.evaluate({ ...free, fee: { ...free.fee, state } }, now).allowed, false),
  );
test('a paid warning wins over an apparently empty quota', () =>
  assert.equal(
    policy.evaluate(
      { ...free, quota: { ...free.quota, used: 0 }, fee: { ...free.fee, state: 'paid' } },
      now,
    ).reason,
    'fees_due',
  ));
for (const patch of [
  { quota: null },
  { accountType: 'commercial' },
  { categoryGroup: 'real_estate' },
  { quota: { ...free.quota, source: 'active_listings' } },
  { quota: { ...free.quota, externalAccountId: '124' } },
  { quota: { ...free.quota, observedAt: '2026-10-16T05:00:00Z' } },
  { quota: { ...free.quota, observedAt: '2026-10-16T07:00:00Z' } },
  { quota: { ...free.quota, used: -1 } },
  { quota: { ...free.quota, used: 99.5 } },
  { reserved: -1 },
  { fee: { ...free.fee, observedAt: '2026-10-16T05:59:00Z' } },
])
  test('unknown or untrusted facts stop: ' + JSON.stringify(patch), () =>
    assert.equal(policy.evaluate({ ...free, ...patch }, now).allowed, false),
  );
test('invalid wall-clock time stops publication', () =>
  assert.equal(policy.evaluate(free, NaN).allowed, false));

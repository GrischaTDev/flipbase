import assert from 'node:assert/strict';
import test from 'node:test';
import { EbayOrderObserver } from '../src/ebay-order-observer.ts';
import { readConfig } from '../src/config.ts';
test('Observer bleibt standardmaessig aus und akzeptiert nur die interne Dienstadresse', async () => {
  await new EbayOrderObserver(readConfig({}), async () => {
    throw new Error('must not fetch');
  }).observe();
  assert.throws(() => readConfig({ WEB_PUSH_OBSERVER_URL: 'https://evil.test' }));
});
test('Observer uebernimmt keine Kontotokens oder Clientidentitaeten und begrenzt Fehler', async () => {
  let now = 0,
    calls = 0;
  const config = {
    ...readConfig({ WEB_PUSH_OBSERVER_URL: 'http://push-functions:9000/ebay-order-observer' }),
    enabled: true,
    serviceKey: 'server',
  };
  const observer = new EbayOrderObserver(
    config,
    async (input, init) => {
      calls++;
      assert.equal(input, config.observerUrl);
      assert.equal(init?.body, '{}');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server');
      return new Response(null, { status: 429 });
    },
    () => now,
  );
  await assert.rejects(() => observer.observe());
  await observer.observe();
  assert.equal(calls, 1);
  now = 300000;
  await assert.rejects(() => observer.observe());
  assert.equal(calls, 2);
});

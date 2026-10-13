import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.ts';
import { createPushDeliveryStore } from '../src/push-delivery-store.ts';
test('Produktiver Store verweigert ueber vier Claims statt spaete Sendwellen zu starten', async (context) => {
  const claim = {
    id: '47200000-0000-4000-8000-000000000001',
    binding_generation: '47200000-0000-4000-8000-000000000002',
    claim_token: '47200000-0000-4000-8000-000000000003',
  };
  let count = 5;
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json(Array.from({ length: count }, () => claim)),
  );
  const store = createPushDeliveryStore({
    ...readConfig({}),
    supabaseUrl: 'https://api.test',
    serviceKey: 'server',
  });
  await assert.rejects(() => store.claim(), /Invalid push claims/u);
  count = 4;
  assert.equal((await store.claim()).length, 4);
});

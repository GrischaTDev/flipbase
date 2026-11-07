import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createPushDeliveryStore } from '../src/push-delivery-store.ts';
import type { PushWorkerConfig } from '../src/config.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('meldet Schalterstand und Zähler an die Statusfunktion', async () => {
  const requests: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const store = createPushDeliveryStore({
    supabaseUrl: 'https://db.example.test/',
    serviceKey: 'service-key',
  } as PushWorkerConfig);

  await store.reportStatus(true, { waiting: 4, retry: 1, configuration_error: 0, accepted: 9 });

  assert.deepEqual(requests, [
    {
      url: 'https://db.example.test/rest/v1/rpc/push_worker_report_status',
      body: { p_enabled: true, p_waiting: 4, p_retry: 1, p_configuration_error: 0 },
    },
  ]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlatformFeatureSwitch } from '../src/platform-feature-switch.ts';

function reader(responses: (() => Promise<Response>)[], now: { value: number }) {
  const requests: string[] = [];
  const featureSwitch = new PlatformFeatureSwitch({
    url: 'https://db.example.test',
    serviceRoleKey: 'service-key',
    feature: 'vinted',
    cacheMs: 1_000,
    now: () => now.value,
    fetch: async (input, init) => {
      requests.push(String(input));
      assert.equal((init?.headers as Record<string, string>).apikey, 'service-key');
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return next();
    },
  });
  return { featureSwitch, requests };
}

const json = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });

test('reads the switch of its own feature and caches the answer', async () => {
  const now = { value: 0 };
  const { featureSwitch, requests } = reader(
    [json([{ enabled: false }]), json([{ enabled: true }])],
    now,
  );
  assert.equal(await featureSwitch.isEnabled(), false);
  assert.equal(await featureSwitch.isEnabled(), false);
  assert.equal(requests.length, 1);
  assert.match(requests[0]!, /platform_feature_switches\?select=enabled&feature_key=eq\.vinted$/);

  now.value = 1_000;
  assert.equal(await featureSwitch.isEnabled(), true);
  assert.equal(requests.length, 2);
});

test('treats read errors and missing rows as enabled', async () => {
  const now = { value: 0 };
  const { featureSwitch } = reader(
    [
      async () => new Response('nope', { status: 500 }),
      async () => {
        throw new Error('offline');
      },
      json([]),
    ],
    now,
  );
  assert.equal(await featureSwitch.isEnabled(), true);
  now.value += 1_000;
  assert.equal(await featureSwitch.isEnabled(), true);
  now.value += 1_000;
  assert.equal(await featureSwitch.isEnabled(), true);
});

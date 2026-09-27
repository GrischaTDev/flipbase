import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GoLoginProfileNetwork } from '../src/gologin-profile-network.ts';

test('assigns a German residential proxy from existing traffic without purchasing or rotating', async () => {
  const calls: { path: string; body: unknown }[] = [];
  const network = new GoLoginProfileNetwork('synthetic', async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path.endsWith('/traffic'))
      return Response.json({
        residentTrafficData: { trafficUsedBytes: 0, trafficLimitBytes: 500 },
      });
    if (path.endsWith('/mobile-proxy')) return Response.json({});
    return Response.json({
      proxyEnabled: true,
      proxy: { mode: 'geolocation', host: 'synthetic.example', port: 1234 },
    });
  });
  await network.configureNew('profile-a');
  assert.deepEqual(calls[1], {
    path: '/users-proxies/mobile-proxy',
    body: {
      countryCode: 'de',
      isDc: false,
      isMobile: false,
      profileIdToLink: 'profile-a',
    },
  });
  assert.equal(calls.length, 3);
});

test('refuses exhausted traffic before assigning a proxy', async () => {
  let calls = 0;
  const network = new GoLoginProfileNetwork('synthetic', async () => {
    calls++;
    return Response.json({
      residentTrafficData: { trafficUsedBytes: 500, trafficLimitBytes: 500 },
    });
  });
  await assert.rejects(network.configureNew('profile-a'));
  assert.equal(calls, 1);
});

test('never starts a saved profile without a confirmed proxy and never rotates an existing proxy', async () => {
  for (const mode of ['none', 'geolocation']) {
    const methods: string[] = [];
    const network = new GoLoginProfileNetwork('synthetic', async (_input, init) => {
      methods.push(init?.method ?? 'GET');
      return Response.json({
        proxyEnabled: true,
        proxy: { mode, host: 'synthetic.example', port: 1234 },
      });
    });
    if (mode === 'none') await assert.rejects(network.assertConfigured('profile-a'));
    else await network.assertConfigured('profile-a');
    assert.deepEqual(methods, ['GET']);
  }
});

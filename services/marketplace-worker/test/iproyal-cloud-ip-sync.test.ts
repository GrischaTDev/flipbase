import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { IpRoyalCloudIpSync } from '../src/iproyal-cloud-ip-sync.ts';
import { ChromiumNetworkProfiles } from '../src/chromium-network-profiles.ts';

const ip = '8.8.8.8';
const fingerprint = createHash('sha256').update(ip).digest('hex');
const order = {
  id: 123,
  product_name: 'ISP Dedicated',
  status: 'confirmed',
  location: 'Germany',
  locations: 'Germany',
  quantity: 1,
  is_test: false,
  expire_date: '2099-02-01 12:30:00',
  proxy_data: {
    ports: { 'http|https': 12323 },
    proxies: [{ ip, username: 'fixture-user', password: 'fixture-password' }],
  },
};
async function fixture(existing = false) {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-iproyal-sync-'));
  const file = join(root, 'networks.json');
  await writeFile(
    file,
    JSON.stringify({
      networkProfiles: existing
        ? [
            {
              id: 'iproyal-pilot-a',
              kind: 'proxy',
              server: `http://${ip}:12323`,
              username: 'fixture-user',
              password: 'fixture-password',
            },
          ]
        : [],
    }),
    { mode: 0o600 },
  );
  const networks = await ChromiumNetworkProfiles.load(file);
  const rows: Record<string, unknown>[] = existing
    ? [
        {
          network_id: 'iproyal-pilot-a',
          exit_ip_fingerprint: fingerprint,
          order_reference: '123',
          provider: 'iproyal',
          country_code: 'DE',
          is_dedicated_isp: true,
          enabled: true,
          expires_at: '2099-01-01T00:00:00Z',
          verified_at: '2026-10-05T00:00:00Z',
        },
      ]
    : [];
  const requests: { url: URL; method: string }[] = [];
  let orders: unknown[] = [order];
  let apiFails = false;
  let responseOverride: unknown;
  let pageResponses: unknown[] | undefined;
  let probeExit = { ip, countryCode: 'DE' };
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    const method = options?.method ?? 'GET';
    requests.push({ url, method });
    if (url.hostname === 'apid.iproyal.com') {
      assert.equal(method, 'GET');
      assert.equal(new Headers(options?.headers).get('X-Access-Token'), 'fixture-token');
      if (apiFails) return new Response('', { status: 503 });
      if (url.pathname.endsWith('/products'))
        return Response.json({ data: [{ id: 9, name: 'ISP Dedicated' }] });
      assert.equal(url.searchParams.get('product_id'), '9');
      if (pageResponses)
        return Response.json(pageResponses[Number(url.searchParams.get('page')) - 1]);
      if (responseOverride !== undefined) return Response.json(responseOverride);
      return Response.json({
        data: orders,
        meta: { current_page: 1, last_page: 1, total: orders.length },
      });
    }
    if (method === 'POST') rows.push(JSON.parse(String(options?.body)));
    if (method === 'PATCH') {
      const row = rows.find(
        (candidate) => `eq.${candidate['network_id']}` === url.searchParams.get('network_id'),
      );
      if (row) Object.assign(row, JSON.parse(String(options?.body)));
    }
    if (method !== 'GET') return new Response(null, { status: 204 });
    const requested = url.searchParams.get('network_id');
    return Response.json(
      requested ? rows.filter((row) => `eq.${row['network_id']}` === requested) : rows,
    );
  };
  const service = new IpRoyalCloudIpSync({
    token: 'fixture-token',
    file,
    networks,
    url: 'https://database.test',
    serviceRoleKey: 'fixture-service-key',
    fetch: fetcher,
    probe: async () => probeExit,
    now: () => Date.parse('2026-10-05T00:00:00Z'),
  });
  return {
    root,
    file,
    rows,
    networks,
    requests,
    service,
    setOrders: (next: unknown[]) => {
      orders = next;
    },
    failApi: () => {
      apiFails = true;
    },
    setResponse: (next: unknown) => {
      responseOverride = next;
    },
    setExit: (next: typeof probeExit) => {
      probeExit = next;
    },
    setPages: (next: unknown[]) => {
      pageResponses = next;
    },
  };
}
test('reads purchased dedicated German IPs, registers privately and reloads the running resolver', async () => {
  const item = await fixture();
  try {
    await Promise.all([item.service.refresh(), item.service.refresh()]);
    assert.equal(item.rows.length, 1);
    const networkId = String(item.rows[0]?.['network_id']);
    assert.equal(item.networks.resolve(networkId).kind, 'proxy');
    assert.ok((await readFile(item.file, 'utf8')).includes('fixture-password'));
    assert.equal(JSON.stringify(item.rows).includes('fixture-password'), false);
    assert.equal(
      item.requests.filter((request) => request.url.pathname.endsWith('/products')).length,
      1,
    );
    await item.service.refresh();
    assert.equal(item.rows.length, 1);
    assert.equal(item.rows[0]?.['enabled'], true);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('reads all purchased-order pages before importing or expiring inventory', async () => {
  const item = await fixture();
  try {
    item.setPages([
      { data: [order], meta: { current_page: 1, last_page: 2, total: 2 } },
      {
        data: [{ ...order, id: 2, location: 'United States', locations: 'United States' }],
        meta: { current_page: 2, last_page: 2, total: 2 },
      },
    ]);
    await item.service.refresh();
    assert.equal(item.rows.length, 1);
    const secondPage = item.requests.findIndex(
      (request) =>
        request.url.hostname === 'apid.iproyal.com' && request.url.searchParams.get('page') === '2',
    );
    assert.ok(secondPage >= 0);
    assert.ok(item.requests.findIndex((request) => request.method !== 'GET') > secondPage);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('malformed or incomplete provider pagination never expires existing inventory', async () => {
  for (const response of [
    { data: [], meta: { current_page: 1, last_page: 1, total: 1 } },
    { data: [order], meta: { current_page: 1, last_page: 2, total: 1 } },
    { data: [], meta: { current_page: 1, last_page: 10000, total: 0 } },
    { data: [order, order], meta: { current_page: 1, last_page: 1, total: 2 } },
  ]) {
    const item = await fixture(true);
    try {
      const before = JSON.stringify(item.rows);
      item.setResponse(response);
      await assert.rejects(item.service.refresh(), /IPRoyal/);
      assert.equal(JSON.stringify(item.rows), before);
      assert.equal(
        item.requests.some((request) => request.method !== 'GET'),
        false,
      );
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  }
});

test('rejects private proxy addresses, non-German exits and changed physical exits before registration', async () => {
  for (const failure of ['private-address', 'wrong-country', 'wrong-exit']) {
    const item = await fixture();
    try {
      const before = await readFile(item.file, 'utf8');
      if (failure === 'private-address')
        item.setOrders([
          {
            ...order,
            proxy_data: {
              ...order.proxy_data,
              proxies: [
                { ip: '127.0.0.1', username: 'fixture-user', password: 'fixture-password' },
              ],
            },
          },
        ]);
      if (failure === 'wrong-country') item.setExit({ ip, countryCode: 'US' });
      if (failure === 'wrong-exit') item.setExit({ ip: '1.1.1.1', countryCode: 'DE' });
      await assert.rejects(item.service.refresh(), /IPRoyal/);
      assert.equal(await readFile(item.file, 'utf8'), before);
      assert.equal(item.rows.length, 0);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  }
});

test('does not import shared, test, expired or non-German proxies', async () => {
  const item = await fixture();
  try {
    item.setOrders([
      { ...order, id: 1, product_name: 'ISP Shared' },
      { ...order, id: 2, is_test: true },
      { ...order, id: 3, location: 'United States', locations: 'United States' },
      { ...order, id: 4, expire_date: '2026-01-01 12:30:00' },
    ]);
    await item.service.refresh();
    assert.equal(item.rows.length, 0);
    assert.deepEqual(JSON.parse(await readFile(item.file, 'utf8')), { networkProfiles: [] });
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});
test('preserves an existing manual network and disabled setting while refreshing expiry', async () => {
  const item = await fixture(true);
  try {
    if (item.rows[0]) item.rows[0]['enabled'] = false;
    await item.service.refresh();
    assert.equal(item.rows[0]?.['network_id'], 'iproyal-pilot-a');
    assert.equal(item.rows[0]?.['enabled'], false);
    assert.equal(item.rows[0]?.['expires_at'], '2099-01-31T00:00:00.000Z');
    assert.equal(
      item.requests.some((request) => request.url.pathname.includes('marketplace_cloud_setups')),
      false,
    );
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});
test('missing provider orders expire inventory without deleting bindings or credentials', async () => {
  const item = await fixture(true);
  try {
    item.setOrders([]);
    await item.service.refresh();
    assert.equal(item.rows[0]?.['expires_at'], '2026-10-05T00:00:00.000Z');
    assert.equal(item.rows[0]?.['enabled'], true);
    assert.equal(item.networks.resolve('iproyal-pilot-a').kind, 'proxy');
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});
test('provider failure and changed credentials fail without modifying the existing file or inventory', async () => {
  const item = await fixture(true);
  try {
    const before = await readFile(item.file, 'utf8');
    item.setOrders([
      {
        ...order,
        proxy_data: {
          ...order.proxy_data,
          proxies: [{ ip, username: 'changed', password: 'changed' }],
        },
      },
    ]);
    await assert.rejects(item.service.refresh(), /IPRoyal/);
    assert.equal(await readFile(item.file, 'utf8'), before);
    item.failApi();
    await assert.rejects(item.service.refresh(), /IPRoyal/);
    assert.equal(
      item.requests.some((request) => request.method !== 'GET'),
      false,
    );
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IpRoyalCloudIpRenewal } from '../src/iproyal-cloud-ip-renewal.ts';

interface Row {
  order_reference: string;
  marketplace_cloud_setups: { state: string }[];
}
function fixture(
  rows: Row[],
  orders: Record<string, unknown>,
  options: { pendingOrders?: string[]; toggleStatus?: number; paymentMethodId?: number } = {},
) {
  const toggles: Record<string, unknown>[] = [];
  const calls: string[] = [];
  const renewal = new IpRoyalCloudIpRenewal({
    token: 'private-token',
    paymentMethodId: options.paymentMethodId ?? 42,
    url: 'https://example.test',
    serviceRoleKey: 'server',
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      calls.push(`${init?.method ?? 'GET'}:${url.pathname}`);
      if (url.origin === 'https://example.test') {
        assert.equal(headers.get('authorization'), 'Bearer server');
        assert.equal(init?.method ?? 'GET', 'GET');
        if (url.pathname.endsWith('/marketplace_cloud_ips')) return Response.json(rows);
        if (url.pathname.endsWith('/marketplace_cloud_ip_purchases'))
          return Response.json(
            (options.pendingOrders ?? []).map((provider_order_id) => ({ provider_order_id })),
          );
        throw new Error('Unexpected database request');
      }
      assert.equal(url.origin, 'https://apid.iproyal.com');
      assert.equal(headers.get('x-access-token'), 'private-token');
      if (init?.method === 'POST') {
        assert.equal(url.pathname, '/v1/reseller/orders/toggle-auto-extend');
        toggles.push(JSON.parse(String(init.body)));
        return Response.json({}, { status: options.toggleStatus ?? 200 });
      }
      const order = orders[url.pathname.split('/').at(-1) ?? ''];
      return order ? Response.json(order) : Response.json({}, { status: 404 });
    }) as typeof fetch,
  });
  return { renewal, toggles, calls };
}
function order(id: number, isEnabled: boolean, overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: 'confirmed',
    is_test: false,
    product_name: 'ISP Dedicated',
    plan_name: '30 Days',
    quantity: 1,
    auto_extend_settings: { is_enabled: isEnabled, payment_type: 'card', card_id: 42 },
    ...overrides,
  };
}
const used = [{ state: 'completed' }];
const released = [{ state: 'cancelled' }];

test('a released IP stops renewing and a reused IP renews again', async () => {
  const { renewal, toggles } = fixture(
    [
      { order_reference: '101', marketplace_cloud_setups: released },
      { order_reference: '102', marketplace_cloud_setups: [...released, { state: 'login' }] },
      { order_reference: '103', marketplace_cloud_setups: used },
      { order_reference: '104', marketplace_cloud_setups: [] },
    ],
    {
      '101': order(101, true),
      '102': order(102, false),
      '103': order(103, true),
      '104': order(104, false),
    },
  );
  assert.deepEqual(await renewal.reconcile(), { enabled: 1, disabled: 1, failed: 0 });
  assert.deepEqual(toggles, [
    { order_id: 101, is_enabled: false, payment_type: 'card', card_id: 42 },
    { order_id: 102, is_enabled: true, payment_type: 'card', card_id: 42 },
  ]);
});

test('a bought IP that still waits for its account keeps renewing', async () => {
  const { renewal, toggles } = fixture(
    [{ order_reference: '201', marketplace_cloud_setups: [] }],
    { '201': order(201, true) },
    { pendingOrders: ['201'] },
  );
  assert.deepEqual(await renewal.reconcile(), { enabled: 0, disabled: 0, failed: 0 });
  assert.deepEqual(toggles, []);
});

test('unknown, foreign or unclear orders are never changed', async () => {
  const { renewal, toggles, calls } = fixture(
    [
      { order_reference: 'order-manual', marketplace_cloud_setups: released },
      { order_reference: '301', marketplace_cloud_setups: released },
      { order_reference: '302', marketplace_cloud_setups: released },
      { order_reference: '303', marketplace_cloud_setups: released },
      { order_reference: '304', marketplace_cloud_setups: released },
      { order_reference: '305', marketplace_cloud_setups: released },
    ],
    {
      '301': order(301, true, { product_name: 'Residential' }),
      '302': order(302, true, { is_test: true }),
      '303': order(303, true, { auto_extend_settings: null }),
      '304': order(999, true),
      '305': order(305, true, { status: 'unpaid' }),
    },
  );
  assert.deepEqual(await renewal.reconcile(), { enabled: 0, disabled: 0, failed: 5 });
  assert.deepEqual(toggles, []);
  assert.ok(!calls.some((call) => call.includes('order-manual')));
});

test('a rejected change is reported and does not stop the remaining orders', async () => {
  const { renewal, toggles } = fixture(
    [
      { order_reference: '401', marketplace_cloud_setups: released },
      { order_reference: '402', marketplace_cloud_setups: released },
    ],
    { '401': order(401, true), '402': order(402, true) },
    { toggleStatus: 422 },
  );
  assert.deepEqual(await renewal.reconcile(), { enabled: 0, disabled: 0, failed: 2 });
  assert.equal(toggles.length, 2);
});

test('an unreadable inventory changes nothing and exposes no provider details', async () => {
  const renewal = new IpRoyalCloudIpRenewal({
    token: 'private-token',
    paymentMethodId: 42,
    url: 'https://example.test',
    serviceRoleKey: 'server',
    fetch: (async () => Response.json({ secret: 'private' }, { status: 500 })) as typeof fetch,
  });
  await assert.rejects(renewal.reconcile(), (failure: unknown) => {
    assert.ok(failure instanceof Error && !failure.message.includes('private'));
    return true;
  });
});

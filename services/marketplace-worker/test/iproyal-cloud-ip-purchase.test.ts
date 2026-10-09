import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IpRoyalCloudIpPurchase,
  type CloudIpPurchaseStore,
} from '../src/iproyal-cloud-ip-purchase.ts';

const request = {
  workspaceId: '37100000-0000-4000-8000-000000000011',
  displayName: 'Cloud',
  requestId: '37100000-0000-4000-8000-000000000031',
};
const userId = '37100000-0000-4000-8000-000000000001';
function fixture(overrides: { paymentMethodId?: number; maxPriceCents?: number } = {}) {
  const events: string[] = [];
  let state = 'missing';
  let orderId: string | undefined;
  let posts = 0;
  let price = 3.5;
  let stock = 1;
  let planName = '30 Days';
  let orderStatus = 'confirmed';
  let rejection = 0;
  let lostReply = false;
  let lostDatabaseReply = false;
  let unknownStock = false;
  let paymentMethod = 'paypal';
  let paymentCurrency = 'USD';
  let methodAvailable = true;
  let purchaseBody: Record<string, unknown> | undefined;
  const store: CloudIpPurchaseStore = {
    operation: async (action, received, receivedUser, fields) => {
      assert.deepEqual(received, request);
      assert.equal(receivedUser, userId);
      events.push(`db:${action}`);
      if (action === 'claim') {
        assert.equal(fields?.priceCents, Math.round(price * 100));
        if (state !== 'missing') return { status: state, orderId };
        state = 'purchase_pending';
        if (lostDatabaseReply) throw new Error('ACK lost');
        return { status: 'submit' };
      }
      if (action === 'ordered') {
        orderId = fields?.orderId;
        state = 'ordered';
      }
      if (action === 'failed') state = 'purchase_failed';
      return { status: state, orderId };
    },
  };
  const options = {
    token: 'private-token',
    paymentMethodId: 42,
    maxPriceCents: 800,
    ...overrides,
    store,
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://apid.iproyal.com');
      events.push(`${init?.method ?? 'GET'}:${url.pathname}`);
      assert.equal(new Headers(init?.headers).get('X-Access-Token'), 'private-token');
      if (url.pathname.endsWith('/products'))
        return Response.json({
          data: [
            {
              id: 9,
              name: 'ISP Dedicated',
              plans: [{ id: 4, name: planName, min_quantity: 1, max_quantity: 100 }],
              locations: [
                {
                  id: 51,
                  name: 'Germany',
                  out_of_stock: stock === 0,
                  available_proxies_count: unknownStock ? null : stock,
                },
              ],
              questions: unknownStock
                ? [{ id: 7, text: 'Extra requirements:', is_required: null }]
                : [],
            },
          ],
        });
      if (url.pathname.endsWith('/calculate-pricing')) {
        assert.equal(url.searchParams.get('quantity'), '1');
        return Response.json({ price_with_vat: price, price });
      }
      if (url.pathname.endsWith('/cards'))
        return Response.json({
          data: methodAvailable
            ? [
                {
                  id: 42,
                  provider: 'paddle',
                  payment_method: paymentMethod,
                  currency: paymentCurrency,
                },
              ]
            : [],
        });
      if (init?.method === 'POST') {
        posts++;
        assert.equal(state, 'purchase_pending', 'Durable record exists before payment');
        purchaseBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        assert.deepEqual(purchaseBody, {
          product_id: 9,
          product_plan_id: 4,
          product_location_id: 51,
          quantity: 1,
          card_id: 42,
          auto_extend: false,
          product_question_answers: {},
        });
        if (lostReply) throw new Error('Timeout after payment, token=private-token');
        if (rejection)
          return Response.json({ error: 'private provider message' }, { status: rejection });
        return Response.json({ id: 420, status: orderStatus });
      }
      if (url.pathname.endsWith('/orders/420'))
        return Response.json({
          id: 420,
          status: orderStatus,
          product_name: 'ISP Dedicated',
          plan_name: '30 Days',
          quantity: 1,
          is_test: false,
          location: 'Germany',
          locations: 'Germany',
        });
      throw new Error('Unexpected URL');
    }) as typeof fetch,
  };
  const service = new IpRoyalCloudIpPurchase(options);
  return {
    service,
    restart: () => new IpRoyalCloudIpPurchase(options),
    events,
    posts: () => posts,
    purchaseBody: () => purchaseBody,
    removePaymentMethod: () => {
      methodAvailable = false;
    },
    setPaymentMethod: (next: string, currency = 'USD') => {
      paymentMethod = next;
      paymentCurrency = currency;
    },
    setState: (next: string, id?: string) => {
      state = next;
      orderId = id;
    },
    setPrice: (next: number) => {
      price = next;
    },
    setStock: (next: number) => {
      stock = next;
    },
    nullableProviderFields: () => {
      unknownStock = true;
    },
    setPlan: (next: string) => {
      planName = next;
    },
    pending: (status: 'in-progress' | 'unpaid' = 'in-progress') => {
      orderStatus = status;
    },
    loseReply: () => {
      lostReply = true;
    },
    loseDatabaseReply: () => {
      lostDatabaseReply = true;
    },
    reject: (status: number) => {
      rejection = status;
    },
  };
}

test('purchases exactly one German dedicated ISP for 30 days at the current quoted price', async () => {
  const item = fixture();
  item.setPrice(4);
  assert.equal(await item.service.ensure(request, userId), 'available');
  assert.equal(item.posts(), 1);
  assert.ok(item.events.indexOf('db:claim') < item.events.indexOf('POST:/v1/reseller/orders'));
});

test('uses the configured saved PayPal method instead of the balance and validates it before claiming payment', async () => {
  const item = fixture();
  assert.equal(await item.service.ensure(request, userId), 'available');
  assert.equal(item.purchaseBody()?.['card_id'], 42);
  assert.ok(item.events.indexOf('GET:/v1/reseller/cards') < item.events.indexOf('db:claim'));
  assert.equal(
    item.events.some((event) => event.includes('/balance')),
    false,
  );
});

test('allows exactly 8 USD but rejects a higher total quote before persisting or charging', async () => {
  const boundary = fixture();
  boundary.setPrice(8);
  assert.equal(await boundary.service.ensure(request, userId), 'available');
  for (const amount of [8.01, 17.25]) {
    const blocked = fixture();
    blocked.setPrice(amount);
    assert.equal(await blocked.service.ensure(request, userId), 'price_limit_exceeded');
    assert.equal(blocked.posts(), 0);
    assert.equal(blocked.events.includes('db:claim'), false);
  }
});

test('can apply a lower price ceiling and refuses invalid or higher configured ceilings', async () => {
  const lower = fixture({ maxPriceCents: 300 });
  assert.equal(await lower.service.ensure(request, userId), 'price_limit_exceeded');
  assert.equal(lower.posts(), 0);
  for (const maxPriceCents of [0, -1, 801, Number.NaN, 400.5]) {
    const invalid = fixture({ maxPriceCents });
    await assert.rejects(invalid.service.ensure(request, userId), /Cloud-IP/);
    assert.equal(invalid.posts(), 0);
  }
});

test('missing, unsupported or foreign-currency saved methods cannot fall back to balance payments', async () => {
  const missing = fixture({ paymentMethodId: undefined });
  const removed = fixture();
  removed.removePaymentMethod();
  const unsupported = fixture();
  unsupported.setPaymentMethod('unknown');
  const foreign = fixture();
  foreign.setPaymentMethod('paypal', 'EUR');
  for (const item of [missing, removed, unsupported, foreign]) {
    assert.equal(await item.service.ensure(request, userId), 'purchase_failed');
    assert.equal(item.posts(), 0);
    assert.equal(item.events.includes('db:claim'), false);
  }
});
test('supports the live provider response with unpublished stock count and nullable optional questions', async () => {
  const item = fixture();
  item.nullableProviderFields();
  assert.equal(await item.service.ensure(request, userId), 'available');
  assert.equal(item.posts(), 1);
});
test('known pending orders are checked again without another purchase, including after restart', async () => {
  for (const status of ['in-progress', 'unpaid'] as const) {
    const item = fixture();
    item.pending(status);
    assert.equal(await item.service.ensure(request, userId), 'purchase_pending');
    assert.equal(await item.restart().ensure(request, userId), 'purchase_pending');
    assert.equal(item.posts(), 1);
  }
});
test('lost payment response remains blocked and is never automatically submitted again', async () => {
  const item = fixture();
  item.loseReply();
  assert.equal(await item.service.ensure(request, userId), 'purchase_pending');
  assert.equal(await item.service.ensure(request, userId), 'purchase_pending');
  assert.equal(item.posts(), 1);
});
test('lost durable claim response prevents the provider purchase', async () => {
  const item = fixture();
  item.loseDatabaseReply();
  await assert.rejects(item.service.ensure(request, userId), /Cloud-IP/);
  assert.equal(await item.service.ensure(request, userId), 'purchase_pending');
  assert.equal(item.posts(), 0);
});
test('concurrent requests cannot submit two payments', async () => {
  const item = fixture();
  const result = await Promise.all([
    item.service.ensure(request, userId),
    item.service.ensure(request, userId),
  ]);
  assert.ok(result.includes('available'));
  assert.equal(item.posts(), 1);
});
test('provider stock exhaustion and missing monthly plan never buy a substitute', async () => {
  for (const update of [
    (item: ReturnType<typeof fixture>) => item.setStock(0),
    (item: ReturnType<typeof fixture>) => item.setPlan('90 Days'),
  ]) {
    const item = fixture();
    update(item);
    assert.equal(await item.service.ensure(request, userId), 'no_capacity');
    assert.equal(item.posts(), 0);
  }
});
test('package limits and rejected payments never produce another order', async () => {
  const limited = fixture();
  limited.setState('limit_reached');
  assert.equal(await limited.service.ensure(request, userId), 'limit_reached');
  assert.deepEqual(limited.events, ['db:inspect']);
  const rejected = fixture();
  rejected.reject(422);
  assert.equal(await rejected.service.ensure(request, userId), 'purchase_failed');
  assert.equal(await rejected.service.ensure(request, userId), 'purchase_failed');
  assert.equal(rejected.posts(), 1);
});

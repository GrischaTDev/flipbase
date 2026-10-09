import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeVintedNegotiation } from '../src/vinted-browser-negotiation.ts';
import {
  readVintedNegotiationOffer,
  readVintedNegotiationPurchase,
  isVintedNegotiationCommand,
} from '../src/vinted-negotiation-contracts.ts';
import type { MarketplaceNegotiationCommand } from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';
const entity = {
  offer_request_id: 44,
  transaction_id: 66,
  user_id: 73,
  price: '80.00',
  original_price: { amount: '100.00' },
  currency: 'EUR',
  current: true,
  status: 10,
};
const incoming = {
  id: 11,
  entity_type: 'offer_request_message',
  created_at_ts: 1791540000,
  entity,
};
const conversation = {
  id: 77,
  opposite_user: { id: 73 },
  item_id: 42,
  item: { id: 42, price: { amount: '100.00', currency_code: 'EUR' } },
  transaction: { id: 66, seller_id: 9, buyer_id: 73, item_id: 42, item_count: 1, item_ids: [42] },
  messages: [incoming],
};
const command: Extract<MarketplaceNegotiationCommand, { kind: 'offer' }> = {
  kind: 'offer',
  action: 'counter',
  externalConversationId: '77',
  transactionId: '66',
  itemId: '42',
  buyerId: '73',
  offerId: '44',
  originalPriceCents: 10000,
  offeredPriceCents: 8000,
  priceCents: 9500,
  currency: 'EUR',
};
const publication = {
  id: 42,
  is_closed: false,
  is_reserved: false,
  price: { amount: '100.00', currency_code: 'EUR' },
};
function fixture(
  options: {
    status?: number;
    writeLost?: boolean;
    afterUnconfirmed?: boolean;
    mutate?: (detail: typeof conversation) => void;
    rejectAuthorization?: boolean;
  } = {},
) {
  const detail = structuredClone(conversation),
    writes: { path: string; method: string; body: unknown }[] = [],
    calls: string[] = [];
  if (options.status !== undefined) {
    const message = detail.messages[0];
    assert.ok(message);
    message.entity.status = options.status;
  }
  options.mutate?.(detail);
  const adapter = {
    authorize: async () => {
      calls.push('authorize');
      if (options.rejectAuthorization) throw new Error('revoked');
    },
    read: async (path: string) => {
      calls.push(path);
      return path.endsWith('/current')
        ? { user: { id: 9 } }
        : path.includes('/wardrobe/')
          ? { items: [publication], pagination: { total_pages: 1 } }
          : { conversation: detail };
    },
    write: async (path: string, method: 'PUT' | 'POST', body?: Record<string, unknown>) => {
      writes.push({ path, method, body });
      if (options.writeLost) throw new Error('lost');
      if (method === 'PUT' && !options.afterUnconfirmed) {
        const message = detail.messages[0];
        assert.ok(message);
        message.entity.status = path.endsWith('/accept') ? 20 : 30;
      }
      return { offer: { id: 88 } };
    },
    sendMessage: async (
      _message: Extract<MarketplaceNegotiationCommand, { kind: 'message' }>,
      authorize: () => Promise<void>,
    ) => {
      await authorize();
      calls.push('message');
      return { outcome: 'sent' as const, externalId: '91' };
    },
  };
  return { adapter, writes, calls, detail };
}
test('imports only current structured EUR buyer offers with full account and article context', () => {
  assert.deepEqual(readVintedNegotiationOffer(incoming, conversation, '9'), {
    offerId: '44',
    transactionId: '66',
    itemId: '42',
    buyerId: '73',
    sellerId: '9',
    originalPriceCents: 10000,
    offeredPriceCents: 8000,
    currency: 'EUR',
    status: 'pending',
  });
  for (const change of [
    { status: 20 },
    { current: false },
    { currency: 'USD' },
    { user_id: 8 },
    { transaction_id: 99 },
    { price: '80,00' },
  ])
    assert.equal(
      readVintedNegotiationOffer(
        { ...incoming, entity: { ...entity, ...change } },
        conversation,
        '9',
      ),
      null,
    );
  assert.equal(
    readVintedNegotiationOffer(incoming, { ...conversation, is_bundle: true }, '9'),
    null,
  );
  assert.equal(
    readVintedNegotiationOffer(
      incoming,
      { ...conversation, transaction: { id: 66, seller_id: 9 } },
      '9',
    ),
    null,
  );
  assert.equal(
    isVintedNegotiationCommand({ ...command, action: 'accept', priceCents: 9500 }),
    false,
  );
  assert.equal(isVintedNegotiationCommand({ ...command, priceCents: 15000 }), false);
});
test('counter submits one proven POST with exact cents and a numeric provider receipt', async () => {
  const { adapter, writes } = fixture();
  assert.deepEqual(await executeVintedNegotiation(adapter, '9', command, null, null), {
    outcome: 'sent',
    externalId: '88',
  });
  assert.deepEqual(writes, [
    {
      path: '/api/v2/transactions/66/offers',
      method: 'POST',
      body: { offer: { price: '95.00', currency: 'EUR' } },
    },
  ]);
});
test('accept and decline use payload-free PUT and confirm the exact status by readback', async () => {
  for (const action of ['accept', 'decline'] as const) {
    const { adapter, writes } = fixture();
    assert.deepEqual(
      await executeVintedNegotiation(
        adapter,
        '9',
        { ...command, action, priceCents: null },
        null,
        null,
      ),
      { outcome: 'sent', externalId: '44' },
    );
    assert.deepEqual(writes, [
      {
        path: `/api/v2/transactions/66/offer_requests/44/${action === 'accept' ? 'accept' : 'reject'}`,
        method: 'PUT',
        body: undefined,
      },
    ]);
  }
  const { adapter } = fixture({ afterUnconfirmed: true });
  assert.deepEqual(
    await executeVintedNegotiation(
      adapter,
      '9',
      { ...command, action: 'accept', priceCents: null },
      null,
      null,
    ),
    { outcome: 'outcome_unknown', errorCode: 'offer_unconfirmed' },
  );
});
test('cancelled, superseded, wrong actor, bundle and revoked leases never write', async () => {
  const variations = [
    {
      mutate: (detail: typeof conversation) => {
        detail.transaction.item_ids = [];
      },
    },
    {
      mutate: (detail: typeof conversation) => {
        detail.transaction.item_count = 2;
        detail.transaction.item_ids = [42, 81];
      },
    },
    { status: 40 },
    { rejectAuthorization: true },
    {
      mutate: (detail: typeof conversation) => {
        detail.opposite_user.id = 81;
      },
    },
    {
      mutate: (detail: typeof conversation) => {
        detail.transaction.item_id = 81;
      },
    },
    {
      mutate: (detail: typeof conversation) => {
        detail.messages.push({ ...incoming, id: 12, entity: { ...entity, offer_request_id: 45 } });
      },
    },
  ];
  for (const options of variations) {
    const { adapter, writes } = fixture(options);
    assert.equal(
      (await executeVintedNegotiation(adapter, '9', command, null, null)).outcome,
      'skipped',
    );
    assert.equal(writes.length, 0);
  }
});
test('ambiguous writes remain unknown and are never retried', async () => {
  const { adapter, writes } = fixture({ writeLost: true });
  assert.deepEqual(await executeVintedNegotiation(adapter, '9', command, null, null), {
    outcome: 'outcome_unknown',
    errorCode: 'provider_unavailable',
  });
  assert.equal(writes.length, 1);
});
test('message-first checks pending snapshot while own counter follow-up checks its actual current seller offer', async () => {
  const message = { kind: 'message' as const, externalConversationId: '77', text: 'Preis 95 EUR' };
  const offer = readVintedNegotiationOffer(incoming, conversation, '9');
  assert.ok(offer);
  let fixtureState = fixture({ status: 40 });
  assert.equal(
    (await executeVintedNegotiation(fixtureState.adapter, '9', message, offer, null)).outcome,
    'skipped',
  );
  assert.ok(!fixtureState.calls.includes('message'));
  fixtureState = fixture({ status: 40 });
  // Public OfferMessage has id/current/user/price, no status field.
  fixtureState.detail.messages.push({
    id: 12,
    entity_type: 'offer_message',
    entity: {
      id: 88,
      user_id: 9,
      price: '95.00',
      original_price: '100.00',
      currency: 'EUR',
      current: true,
    },
    created_at_ts: 1791540001,
  } as unknown as typeof incoming);
  assert.deepEqual(
    await executeVintedNegotiation(fixtureState.adapter, '9', message, null, {
      command,
      externalId: '88',
    }),
    { outcome: 'sent', externalId: '91' },
  );
  const own = fixtureState.detail.messages[1];
  assert.ok(own);
  own.entity.current = false;
  assert.equal(
    (
      await executeVintedNegotiation(fixtureState.adapter, '9', message, null, {
        command,
        externalId: '88',
      })
    ).outcome,
    'skipped',
  );
});
const paid = {
  id: 66,
  purchase_id: 99,
  user_side: 'seller',
  seller: { id: 9 },
  items_count: 1,
  order: { item_ids: [42] },
  debit_processed_at: '2026-10-09T10:00:00Z',
  offer: { price: { amount: '95.00', currency_code: 'EUR' } },
};
test('purchase requires exact paid seller transaction and article, independent from offer acceptance', () => {
  const now = '2026-10-09T11:00:00Z';
  assert.deepEqual(readVintedNegotiationPurchase(paid, conversation, '9', now), {
    event: {
      id: '99',
      type: 'purchased',
      transactionId: '66',
      confirmed: true,
      originalPriceCents: 10000,
      priceCents: 9500,
      currency: 'EUR',
    },
    occurredAt: '2026-10-09T10:00:00.000Z',
  });
  for (const changes of [
    { debit_processed_at: null },
    { debit_processed_at: 'invalid' },
    { debit_processed_at: '2026-10-10T10:00:00Z' },
    { seller: { id: 8 } },
    { user_side: 'buyer' },
    { order: { item_ids: [42, 43] } },
    { id: 67 },
  ])
    assert.equal(
      readVintedNegotiationPurchase({ ...paid, ...changes }, conversation, '9', now),
      null,
    );
  assert.equal(
    readVintedNegotiationPurchase(
      { ...paid, offer: { price: { amount: '100.00', currency_code: 'USD' } } },
      conversation,
      '9',
      now,
    ),
    null,
  );
});

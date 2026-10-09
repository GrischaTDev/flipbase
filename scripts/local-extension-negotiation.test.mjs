import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  readVintedNegotiationOffer,
  readVintedNegotiationPurchase,
} from '../services/marketplace-worker/src/vinted-negotiation-contracts.ts';
const require = createRequire(import.meta.url);
const negotiation = require('../tools/flipbase-extension/vinted-local-negotiation.js');
const core = require('../tools/flipbase-extension/vinted-local-core.js');
const messages = require('../tools/flipbase-extension/vinted-local-messages.js');
const scope = {
  workspaceId: '20000000-0000-4000-8000-000000000001',
  connectionId: '20000000-0000-4000-8000-000000000002',
};
const binding = {
  ...scope,
  externalAccountId: '9',
  expiresAt: '2099-01-01T00:00:00Z',
  appOrigin: 'https://app.flipbase.de',
  apiUrl: 'https://api.flipbase.de/functions/v1/marketplace-local-extension',
};
const command = {
  kind: 'offer',
  action: 'accept',
  externalConversationId: '77',
  transactionId: '66',
  itemId: '42',
  buyerId: '73',
  offerId: '44',
  originalPriceCents: 10000,
  offeredPriceCents: 8000,
  priceCents: null,
  currency: 'EUR',
};
const claim = {
  jobId: '20000000-0000-4000-8000-000000000004',
  claimToken: '20000000-0000-4000-8000-000000000005',
  ...scope,
  externalAccountId: '9',
  expiresAt: '2099-01-01T00:00:00Z',
  command,
  sourceOffer: null,
  confirmedOffer: null,
};
const incoming = {
  id: 11,
  entity_type: 'offer_request_message',
  created_at_ts: '2026-10-09T10:00:00Z',
  entity: {
    offer_request_id: 44,
    transaction_id: 66,
    user_id: 73,
    price: '80.00',
    original_price: '100.00',
    currency: 'EUR',
    current: true,
    status: 10,
  },
};
const conversation = {
  id: 77,
  opposite_user: { id: 73 },
  item_id: 42,
  item: { id: 42, price: { amount: '100.00', currency_code: 'EUR' } },
  transaction: {
    id: 66,
    seller_id: 9,
    buyer_id: 73,
    item_ids: [42],
    item_count: 1,
    current_user_side: 'seller',
  },
  messages: [incoming],
};
function runtimeFixture(options = {}) {
  let stored = {
    binding,
    secret: 'ab'.repeat(32),
    tabId: 7,
    identity: { id: '9', username: 'seller' },
  };
  const calls = [];
  const adapter = {
    load: async () => structuredClone(stored),
    save: async (next) => {
      stored = structuredClone(next);
    },
    now: () => Date.parse('2026-10-09T11:00:00Z'),
    readIdentity: async () => ({ identity: { id: '9' }, tabId: 7 }),
    edge: async (_binding, _secret, payload) => {
      calls.push(payload.action);
      if (payload.action === 'heartbeat')
        return {
          ok: true,
          externalAccountId: '9',
          expiresAt: binding.expiresAt,
          messagesRead: true,
          messagesSend: true,
        };
      if (payload.action === 'negotiation_claim') return structuredClone(claim);
      if (payload.action === 'negotiation_start' && options.beginLost)
        throw new Error('lost begin');
      if (payload.action === 'negotiation_finish' && options.finishLost)
        throw new Error('lost finish');
      if (payload.action === 'negotiation_finish') assert.equal(payload.externalId, '44');
      return { ok: true };
    },
    sendNegotiation: async () => {
      calls.push('provider');
      assert.equal(stored.pendingFinish.outcome, 'outcome_unknown');
      return { outcome: { outcome: 'sent', externalId: '44' } };
    },
  };
  return { adapter, calls, stored: () => stored };
}
test('new jobs use independent claim/begin/finish actions with durable uncertainty before provider access', async () => {
  const fixture = runtimeFixture();
  assert.deepEqual(
    await core
      .createRuntime(fixture.adapter)
      .run({ action: 'NEGOTIATIONS_SEND', payload: scope }, binding.appOrigin),
    { outcome: 'sent' },
  );
  assert.deepEqual(fixture.calls, [
    'heartbeat',
    'negotiation_claim',
    'negotiation_start',
    'provider',
    'negotiation_finish',
  ]);
  assert.equal(fixture.stored().pendingFinish, undefined);
});
test('lost Begin-ACK never executes provider and a restart reports the saved result without another claim', async () => {
  const fixture = runtimeFixture({ beginLost: true });
  await assert.rejects(
    core
      .createRuntime(fixture.adapter)
      .run({ action: 'NEGOTIATIONS_SEND', payload: scope }, binding.appOrigin),
  );
  assert.ok(!fixture.calls.includes('provider'));
  assert.equal(fixture.stored().pendingFinish.errorCode, 'begin_unconfirmed');
  const saved = fixture.stored();
  const calls = [];
  await core
    .createRuntime({
      ...fixture.adapter,
      edge: async (_binding, _secret, payload) => {
        calls.push(payload);
        return { ok: true };
      },
    })
    .run({ action: 'MESSAGES_SEND', payload: scope }, binding.appOrigin);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'negotiation_finish');
  assert.equal(calls[0].outcome, 'outcome_unknown');
  assert.equal(calls[0].id, claim.jobId);
  assert.equal(saved.pendingFinish.negotiation, true);
});
test('lost finish persists exact success and restart reports once without repeating the provider write', async () => {
  const fixture = runtimeFixture({ finishLost: true });
  await assert.rejects(
    core
      .createRuntime(fixture.adapter)
      .run({ action: 'NEGOTIATIONS_SEND', payload: scope }, binding.appOrigin),
  );
  assert.equal(fixture.stored().pendingFinish.externalId, '44');
  assert.equal(fixture.calls.filter((call) => call === 'provider').length, 1);
  const calls = [];
  await core
    .createRuntime({
      ...fixture.adapter,
      edge: async (_binding, _secret, payload) => {
        calls.push(payload);
        return { ok: true };
      },
    })
    .run({ action: 'NEGOTIATIONS_SEND', payload: scope }, binding.appOrigin);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].externalId, '44');
  assert.equal(fixture.stored().pendingFinish, undefined);
});
test('local claim parser denies old text outbox envelopes, malformed snapshots and foreign account/scope', () => {
  assert.equal(negotiation.validClaim(claim, binding, Date.now()), true);
  for (const changes of [
    { messageId: claim.jobId },
    { externalAccountId: '8' },
    { workspaceId: '30000000-0000-4000-8000-000000000001' },
    { sourceOffer: { ...readVintedNegotiationOffer(incoming, conversation, '9'), extra: true } },
    { confirmedOffer: { command, externalId: 'non-numeric' } },
    { command: { ...command, priceCents: 8000 } },
    { command: { kind: 'message', externalConversationId: '77', text: 'Hi', attachment: null } },
  ])
    assert.equal(negotiation.validClaim({ ...claim, ...changes }, binding, Date.now()), false);
});
test('both importers agree on structured offers, paid events and missing original event prices', () => {
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
  assert.deepEqual(
    negotiation.readOffer(incoming, conversation, '9'),
    readVintedNegotiationOffer(incoming, conversation, '9'),
  );
  for (const detail of [
    paid,
    { ...paid, debit_processed_at: null },
    { ...paid, offer: {} },
    { ...paid, seller: { id: 8 } },
  ])
    assert.deepEqual(
      negotiation.readPurchase(detail, conversation, '9', '2026-10-09T11:00:00Z'),
      readVintedNegotiationPurchase(detail, conversation, '9', '2026-10-09T11:00:00Z'),
    );
});
test('local executor uses payload-free PUT, confirms accepted source and never retries lost writes', async () => {
  for (const lost of [false, true]) {
    const detail = structuredClone(conversation),
      writes = [];
    let checks = 0;
    const adapter = {
      csrf: 'test-csrf',
      authorize: async () => {
        checks++;
      },
      read: async (path) =>
        path.endsWith('/current')
          ? { user: { id: 9, login: 'seller' } }
          : path.includes('/wardrobe/')
            ? {
                items: [
                  {
                    id: 42,
                    is_closed: false,
                    is_reserved: false,
                    price: { amount: '100.00', currency_code: 'EUR' },
                  },
                ],
                pagination: { total_pages: 1 },
              }
            : { conversation: detail },
      write: async (path, request) => {
        writes.push({ path, ...request });
        if (lost) throw new Error('lost');
        detail.messages[0].entity.status = 20;
        return {};
      },
    };
    assert.deepEqual(
      await negotiation.send(adapter, '9', claim, messages),
      lost
        ? { outcome: 'outcome_unknown', errorCode: 'provider_unavailable' }
        : { outcome: 'sent', externalId: '44' },
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, 'PUT');
    assert.equal(writes[0].path, '/api/v2/transactions/66/offer_requests/44/accept');
    assert.equal(writes[0].body, undefined);
    assert.ok(checks >= 3);
  }
});
test('local inbox imports real offers and payments with provider time, never scrape time', async () => {
  const state = {
    ok: true,
    externalAccountId: '9',
    messagesRead: true,
    expiresAt: '2099-01-01T00:00:00Z',
    nextPage: 1,
    versions: [],
  };
  const paid = {
    id: 66,
    purchase_id: 99,
    user_side: 'seller',
    seller: { id: 9 },
    items_count: 1,
    order: { item_ids: [42] },
    debit_processed_at: '2026-10-09T10:10:00Z',
    offer: { price: { amount: '95.00', currency_code: 'EUR' } },
  };
  const batch = await core.readInbox(
    async (path) =>
      path.endsWith('/current')
        ? { user: { id: 9, login: 'seller' } }
        : path.startsWith('/api/v2/inbox')
          ? {
              conversations: [
                { ...conversation, updated_at: '2026-10-09T10:12:00Z', unread: false },
              ],
              pagination: { total_pages: 1 },
            }
          : path.includes('/transactions/')
            ? { transaction: paid }
            : { conversation },
    '9',
    state,
    () => '2026-10-09T11:00:00Z',
  );
  assert.equal(
    batch.entries.find((entry) => entry.body.negotiationOffer)?.sortAt,
    '2026-10-09T10:00:00.000Z',
  );
  assert.equal(
    batch.entries.find((entry) => entry.body.negotiationEvent)?.sortAt,
    '2026-10-09T10:10:00.000Z',
  );
  for (const input of [undefined, 'invalid', '2026-02-30T12:00:00Z', '2026-10-10T10:00:00Z'])
    assert.equal(negotiation.providerTime(input, '2026-10-09T11:00:00Z'), null);
});

test('installed content rechecks its background lease and permits only the confirmed decision PUT', async () => {
  for (const active of [true, false]) {
    const dom = new JSDOM(
      '<!doctype html><html><head><meta name="csrf-token" content="test-csrf"></head><body><main>Vinted</main></body></html>',
      { url: 'https://www.vinted.de/' },
    );
    const rectangle = { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 };
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => rectangle;
    dom.window.Range.prototype.getClientRects = () => [rectangle];
    let listener;
    const writes = [],
      checks = [];
    const detail = structuredClone(conversation);
    const chrome = {
      runtime: {
        id: 'extension',
        getURL: (path) => 'chrome-extension://extension/' + path,
        onMessage: {
          addListener: (callback) => {
            listener = callback;
          },
        },
        sendMessage: async (request) => {
          checks.push(request);
          return { active };
        },
      },
    };
    const fetch = async (path, request) => {
      if (request.method === 'PUT') {
        writes.push({ path, request });
        detail.messages[0].entity.status = 20;
      }
      const payload = path.endsWith('/current')
        ? { user: { id: 9, login: 'seller' } }
        : path.includes('/wardrobe/')
          ? {
              items: [
                {
                  id: 42,
                  is_closed: false,
                  is_reserved: false,
                  price: { amount: '100.00', currency_code: 'EUR' },
                },
              ],
              pagination: { total_pages: 1 },
            }
          : path.includes('/conversations/')
            ? { conversation: detail }
            : {};
      return {
        ok: true,
        status: 200,
        url: `https://www.vinted.de${path}`,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => payload,
      };
    };
    Object.assign(dom.window, {
      FlipbaseVintedLocal: core,
      FlipbaseVintedMessages: messages,
      FlipbaseVintedNegotiation: negotiation,
    });
    const context = vm.createContext({
      globalThis: dom.window,
      window: dom.window,
      location: dom.window.location,
      document: dom.window.document,
      chrome,
      URL,
      AbortSignal,
      fetch,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      Date,
      Error,
      Number,
    });
    try {
      vm.runInContext(
        readFileSync(
          new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
          'utf8',
        ),
        context,
      );
      const result = await new Promise((resolve) =>
        listener(
          { type: 'VINTED_LOCAL_NEGOTIATION_SEND', externalAccountId: '9', claim, timeoutMs: 1000 },
          { id: 'extension' },
          resolve,
        ),
      );
      assert.equal(result.success, true);
      assert.equal(result.result.outcome.outcome, active ? 'sent' : 'skipped');
      assert.equal(writes.length, active ? 1 : 0);
      assert.ok(checks.length >= 1);
      assert.ok(
        checks.every(
          (check) =>
            check.type === 'VINTED_LOCAL_NEGOTIATION_CHECK' &&
            check.jobId === claim.jobId &&
            check.claimToken === claim.claimToken,
        ),
      );
      if (active) {
        assert.equal(writes[0].path, '/api/v2/transactions/66/offer_requests/44/accept');
        assert.equal(writes[0].request.body, undefined);
      }
    } finally {
      dom.window.close();
    }
  }
});

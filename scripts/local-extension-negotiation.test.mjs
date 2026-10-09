import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import ts from 'typescript';
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
const scheduler = require('../tools/flipbase-extension/vinted-local-scheduler.js');
const runtime = require('../tools/flipbase-extension/vinted-negotiation-runtime.js');
const scriptSource = (filename) =>
  readFileSync(new URL('../tools/flipbase-extension/' + filename, import.meta.url), 'utf8');
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
      if (payload.action === 'negotiation_finish') {
        assert.equal(payload.retryAfter, undefined);
        if (options.outcome) {
          options.onFinish?.(stored, payload);
          assert.equal(payload.errorCode, options.outcome.errorCode);
        } else assert.equal(payload.externalId, '44');
      }
      return { ok: true };
    },
    sendNegotiation: async () => {
      calls.push('provider');
      assert.equal(stored.pendingFinish.outcome, 'outcome_unknown');
      return { outcome: options.outcome ?? { outcome: 'sent', externalId: '44' } };
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
  await assert.rejects(
    core
      .createRuntime({
        ...fixture.adapter,
        edge: async (_binding, _secret, payload) => {
          calls.push(payload);
          return { ok: true };
        },
      })
      .run({ action: 'MESSAGES_SEND', payload: scope }, binding.appOrigin),
    (error) => error.code === 'begin_unconfirmed',
  );
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
    Object.assign(dom.window, {});
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
      for (const filename of [
        'vinted-local-inbox-events.js',
        'vinted-negotiation-runtime.js',
        'vinted-local-negotiation.js',
        'vinted-local-core.js',
        'vinted-local-messages.js',
        'vinted-local-favorites.js',
      ])
        vm.runInContext(scriptSource(filename), context);
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

test('actual Classic and Service Worker entry scripts load without exports, module or require', () => {
  const context = vm.createContext({
    URL,
    Date,
    Error,
    Number,
    console,
    chrome: {
      runtime: {
        id: 'extension',
        getManifest: () => ({ version: '1.8.0' }),
        onMessage: { addListener() {} },
      },
      storage: { local: { get: async () => ({}), setAccessLevel: async () => {} } },
    },
  });
  context.importScripts = (...filenames) =>
    filenames.forEach((filename) => vm.runInContext(scriptSource(filename), context));
  vm.runInContext(scriptSource('background.js'), context);
  assert.equal(typeof context.FlipbaseVintedNegotiation.send, 'function');
  assert.equal(typeof context.FlipbaseVintedLocal.createRuntime, 'function');
  const classic = vm.createContext({});
  for (const filename of ['vinted-negotiation-runtime.js', 'vinted-local-negotiation.js'])
    vm.runInContext(scriptSource(filename), classic);
  assert.equal(typeof classic.FlipbaseVintedNegotiation.readOffer, 'function');
  assert.equal(classic.exports, undefined);
  assert.equal(context.exports, undefined);
});

function providerFixture(detail, options = {}) {
  const writes = [],
    sent = [];
  const adapter = {
    csrf: 'test-csrf',
    authorize: async () => {},
    read: async (path) =>
      path.endsWith('/current')
        ? { user: { id: 9 } }
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
      writes.push({ path, request });
      if (options.error) throw Object.assign(new Error('provider error'), options.error);
      detail.messages[0].entity.status = 20;
      options.after?.(detail);
      return { offer: { id: 88 } };
    },
  };
  return { adapter, writes, sent };
}

test('every supplied EUR field agrees before importing, writing, confirming or following up', async () => {
  for (const changes of [
    { price: { amount: '80.00', currency_code: 'USD' } },
    { original_price: { amount: '100.00', currency_code: 'USD' } },
    { price: { amount: '80.00', currency: 'USD' } },
    { currency_code: 'USD' },
  ]) {
    const detail = structuredClone(conversation);
    Object.assign(detail.messages[0].entity, changes);
    assert.equal(readVintedNegotiationOffer(detail.messages[0], detail, '9'), null);
    const fixture = providerFixture(detail);
    assert.equal(
      (await negotiation.send(fixture.adapter, '9', claim, messages)).outcome,
      'skipped',
    );
    assert.equal(fixture.writes.length, 0);
  }
  const after = providerFixture(structuredClone(conversation), {
    after: (detail) => {
      detail.messages[0].entity.price = { amount: '80.00', currency_code: 'USD' };
    },
  });
  assert.equal(
    (await negotiation.send(after.adapter, '9', claim, messages)).outcome,
    'outcome_unknown',
  );
  const own = structuredClone(conversation);
  own.messages.push({
    entity_type: 'offer_message',
    entity: {
      id: 88,
      user_id: 9,
      current: true,
      currency: 'EUR',
      price: { amount: '95.00', currency_code: 'USD' },
    },
  });
  const counter = { ...command, action: 'counter', priceCents: 9500 };
  const fixture = providerFixture(own);
  assert.equal(
    (
      await negotiation.send(
        fixture.adapter,
        '9',
        {
          ...claim,
          command: { kind: 'message', externalConversationId: '77', text: 'Hi' },
          confirmedOffer: { command: counter, externalId: '88' },
        },
        messages,
      )
    ).outcome,
    'skipped',
  );
  assert.equal(fixture.writes.length, 0);
});

const purchaseProof = {
  id: 66,
  user_side: 'seller',
  seller: { id: 9 },
  items_count: 1,
  order: { item_ids: [42], items: [{ id: 42 }] },
  debit_processed_at: '2026-10-09T10:00:00Z',
  offer: { price: { amount: '95.00', currency_code: 'EUR' } },
};
test('offer, purchase and independent event texts reject all contradictory article, quantity, bundle and role proofs', async () => {
  const mutations = [
    (detail) => {
      detail.item.id = 81;
      detail.item.price.amount = '999.00';
    },
    (detail) => {
      detail.transaction.item_ids = [81];
    },
    (detail) => {
      detail.transaction.item_count = 2;
      detail.transaction.item_ids = [42, 81];
    },
    (detail) => {
      detail.transaction.is_bundle = true;
    },
    (detail) => {
      detail.transaction.current_user_side = 'buyer';
    },
    (detail) => {
      detail.transaction.buyer_id = 9;
    },
    (detail) => {
      detail.transaction.seller = { id: 81 };
    },
    (detail) => {
      detail.item.quantity = 2;
    },
    (detail) => {
      detail.item_id = 'invalid';
    },
  ];
  for (const mutate of mutations) {
    const detail = structuredClone(conversation);
    mutate(detail);
    assert.equal(readVintedNegotiationOffer(detail.messages[0], detail, '9'), null);
    assert.equal(
      readVintedNegotiationPurchase(purchaseProof, detail, '9', '2026-10-09T11:00:00Z'),
      null,
    );
    const fixture = providerFixture(detail);
    assert.equal(
      (
        await negotiation.send(
          fixture.adapter,
          '9',
          { ...claim, command: { kind: 'message', externalConversationId: '77', text: 'Paid' } },
          messages,
        )
      ).outcome,
      'skipped',
    );
    assert.equal(fixture.writes.length, 0);
  }
  for (const changes of [
    { order: { item_ids: [42], items: [{ id: 81, price: { amount: '999.00' } }] } },
    { seller_id: 81 },
    { buyer_id: 9 },
    { is_bundle: true },
    { item_id: 81 },
    { quantity: 2 },
    { offer: { currency: 'USD', price: { amount: '95.00', currency_code: 'EUR' } } },
  ])
    assert.equal(
      readVintedNegotiationPurchase(
        { ...purchaseProof, ...changes },
        conversation,
        '9',
        '2026-10-09T11:00:00Z',
      ),
      null,
    );
  const missingItemId = structuredClone(conversation);
  delete missingItemId.item.id;
  assert.deepEqual(
    readVintedNegotiationPurchase(purchaseProof, missingItemId, '9', '2026-10-09T11:00:00Z').event,
    { id: '66', type: 'purchased', transactionId: '66', confirmed: true },
  );
});

test('local provider errors retain code and retry metadata both before and after a write', async () => {
  const retryAfter = Date.parse('2026-10-09T11:30:00Z');
  for (const attempted of [false, true]) {
    const fixture = providerFixture(structuredClone(conversation), {
      error: { code: 'rate_limited', retryAfter },
    });
    if (!attempted)
      fixture.adapter.read = async () => {
        throw Object.assign(new Error('429'), { code: 'rate_limited', retryAfter });
      };
    assert.deepEqual(await negotiation.send(fixture.adapter, '9', claim, messages), {
      outcome: attempted ? 'outcome_unknown' : 'skipped',
      errorCode: 'rate_limited',
      retryAfter,
    });
    assert.equal(fixture.writes.length, attempted ? 1 : 0);
  }
});

test('pause is durable before Finish, stripped from server receipt, and interrupts the scheduler after acknowledgement', async () => {
  for (const errorCode of [
    'rate_limited',
    'identity_changed',
    'interaction_required',
    'provider_unavailable',
  ]) {
    const retryAfter = Date.parse('2026-10-09T11:30:00Z');
    const outcome = {
      outcome: 'skipped',
      errorCode,
      ...(errorCode === 'rate_limited' ? { retryAfter } : {}),
    };
    let beforeFinish = false;
    const fixture = runtimeFixture({
      outcome,
      onFinish: (saved) => {
        beforeFinish = true;
        if (errorCode !== 'provider_unavailable')
          assert.equal(
            errorCode === 'rate_limited' ? saved.schedule.retryAfter : saved.schedule.pauseReason,
            errorCode === 'rate_limited' ? retryAfter : errorCode,
          );
        assert.equal(saved.pendingFinish.errorCode, errorCode);
      },
    });
    const scheduled = [];
    const runtime = core.createRuntime(fixture.adapter);
    const schedule = {
      latestAt: retryAfter,
      commandsAt: retryAfter,
      favoritesAt: 0,
      favoriteCommandsAt: 0,
    };
    await fixture.adapter.save({ ...fixture.stored(), schedule });
    await scheduler
      .createScheduler({
        ...fixture.adapter,
        run: async (action, currentBinding) => {
          scheduled.push(action);
          return runtime.run({ action, payload: scope }, currentBinding.appOrigin);
        },
      })
      .tick();
    assert.equal(beforeFinish, true);
    assert.deepEqual(scheduled, ['NEGOTIATIONS_SEND']);
    assert.equal(fixture.stored().pendingFinish, undefined);
    assert.equal(fixture.stored().schedule.lastError, errorCode);
  }
});

test('lost Finish keeps durable pause and restart only reports receipt before stopping', async () => {
  const retryAfter = Date.parse('2026-10-09T11:30:00Z');
  const fixture = runtimeFixture({
    finishLost: true,
    outcome: { outcome: 'outcome_unknown', errorCode: 'rate_limited', retryAfter },
  });
  await assert.rejects(
    core
      .createRuntime(fixture.adapter)
      .run({ action: 'NEGOTIATIONS_SEND', payload: scope }, binding.appOrigin),
  );
  assert.equal(fixture.stored().schedule.retryAfter, retryAfter);
  const calls = [];
  const restarted = core.createRuntime({
    ...fixture.adapter,
    edge: async (_binding, _secret, receipt) => {
      calls.push(receipt);
      return { ok: true };
    },
  });
  await assert.rejects(
    restarted.run({ action: 'MESSAGES_SEND', payload: scope }, binding.appOrigin),
    (error) => error.code === 'rate_limited' && error.retryAfter === retryAfter,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'negotiation_finish');
  assert.equal(calls[0].retryAfter, undefined);
  assert.equal(fixture.stored().pendingFinish, undefined);
  assert.equal(fixture.calls.filter((call) => call === 'provider').length, 1);
});

test('Worker wrappers use the single source and Docker runtime copy resolves from the actual app/dist layout', async () => {
  assert.equal(readVintedNegotiationOffer, runtime.readOffer);
  assert.equal(readVintedNegotiationPurchase, runtime.readPurchase);
  const docker = readFileSync(
    new URL('../services/marketplace-worker/Dockerfile', import.meta.url),
    'utf8',
  );
  assert.ok(
    docker.includes(
      'COPY tools/flipbase-extension/vinted-negotiation-runtime.js /tools/flipbase-extension/',
    ),
  );
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'flipbase-negotiation-layout-'));
  try {
    const app = join(fixtureRoot, 'runtime', 'app'),
      dist = join(app, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(app, 'package.json'), '{"type":"module"}');
    const wrapperPath = join(dist, 'vinted-negotiation-contracts.js');
    const source = readFileSync(
      new URL(
        '../services/marketplace-worker/src/vinted-negotiation-contracts.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    writeFileSync(wrapperPath, compiled);
    const runtimePath = fileURLToPath(
      new URL(
        '../../../tools/flipbase-extension/vinted-negotiation-runtime.js',
        pathToFileURL(wrapperPath),
      ),
    );
    assert.equal(
      runtimePath,
      join(fixtureRoot, 'tools', 'flipbase-extension', 'vinted-negotiation-runtime.js'),
    );
    mkdirSync(dirname(runtimePath), { recursive: true });
    writeFileSync(runtimePath, scriptSource('vinted-negotiation-runtime.js'));
    const deployed = await import(pathToFileURL(wrapperPath).href);
    assert.equal(deployed.readVintedNegotiationOffer(incoming, conversation, '9').itemId, '42');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('Worker Docker context explicitly includes each shared contract copied into the build', () => {
  const docker = readFileSync(
    new URL('../services/marketplace-worker/Dockerfile', import.meta.url),
    'utf8',
  );
  const ignored = readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8').split(/\r?\n/);
  const deniedAt = ignored.indexOf('supabase/functions/_shared/*');
  assert.ok(deniedAt >= 0);
  const contracts = docker.match(/supabase\/functions\/_shared\/[a-z-]+\.d\.ts/g);
  assert.ok(contracts?.length);
  for (const contract of contracts)
    assert.ok(
      ignored.indexOf('!' + contract) > deniedAt,
      `${contract} must survive the shared-directory exclusion`,
    );
});

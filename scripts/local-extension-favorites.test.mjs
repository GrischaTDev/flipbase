import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const favorites = require('../tools/flipbase-extension/vinted-local-favorites.js');
const core = require('../tools/flipbase-extension/vinted-local-core.js');
const messages = require('../tools/flipbase-extension/vinted-local-messages.js');
const notification = {
  id: '38100000-0000-4000-8000-000000000041',
  entry_type: 20,
  subject_id: 42,
  link: '/items/42/want_it/new?offering_id=73',
  updated_at: '2026-10-05T17:07:58Z',
};
test('read favorites preserves unread notifications and normalizes the proven provider format', async () => {
  const calls = [];
  const entries = await favorites.read(
    async (path) => {
      calls.push(path);
      return path.endsWith('/current') ? { user: { id: 9 } } : { notifications: [notification] };
    },
    '9',
    Date.parse('2026-10-05T18:00:00Z'),
  );
  assert.deepEqual(entries, [
    {
      externalId: notification.id,
      actorId: '73',
      itemId: '42',
      eventAt: '2026-10-05T17:07:58.000Z',
    },
  ]);
  assert.ok(calls[1].endsWith('mark_as_read=false'));
});
test('read rejects changed identity, malformed dates and failed notification responses', async () => {
  await assert.rejects(
    favorites.read(async () => ({ user: { id: 8 } }), '9'),
    /gewechselt/,
  );
  for (const response of [{}, { notifications: [{ ...notification, updated_at: 'not a date' }] }])
    await assert.rejects(
      favorites.read(
        async (path) => (path.endsWith('/current') ? { user: { id: 9 } } : response),
        '9',
      ),
    );
});
test('read ignores unrelated notifications and deduplicates overlapping pages', async () => {
  const rows = Array.from({ length: 100 }, () => notification);
  const entries = await favorites.read(
    async (path) =>
      path.endsWith('/current')
        ? { user: { id: 9 } }
        : { notifications: rows, pagination: { total_pages: 2 } },
    '9',
    Date.parse('2026-10-06'),
  );
  assert.equal(entries.length, 1);
});
function setup({ existing = false, history = false, fail = false } = {}) {
  const writes = [];
  const messages = { send: async () => ({ outcome: 'sent', externalMessageId: '123' }) };
  const adapter = {
    csrf: 'synthetic',
    read: async (path) =>
      path.endsWith('/current')
        ? { user: { id: 9 } }
        : path.includes('wardrobe/')
          ? { items: [{ id: 42, is_closed: false }], pagination: { total_pages: 1 } }
          : path.includes('inbox?')
            ? { conversations: existing ? [{ opposite_user: { id: 73 } }] : [] }
            : {
                conversation: {
                  id: 15,
                  opposite_user: { id: 73 },
                  messages: history ? [{ id: 1 }] : [],
                },
              },
    write: async (path, request) => {
      writes.push({ path, request });
      if (fail) throw new Error('lost response');
      return { conversation: { id: 15, opposite_user: { id: 73 } } };
    },
  };
  return { adapter, messages, writes };
}
const command = { actorId: '73', itemId: '42', text: 'Danke für Dein Interesse!' };
function offerFixture() {
  const fixture = setup();
  const originalRead = fixture.adapter.read;
  fixture.adapter.read = async (path) => {
    const result = await originalRead(path);
    if (path.includes('/wardrobe/'))
      result.items[0].price = { amount: '40.00', currency_code: 'EUR' };
    if (result.conversation) {
      result.conversation.transaction = { id: 22, item_id: 42 };
    }
    return result;
  };
  fixture.adapter.write = async (path, request) => {
    fixture.writes.push({ path, request });
    return { offer: { id: 99, price: '35.00', currency: 'EUR' } };
  };
  fixture.command = {
    ...command,
    conversationId: '15',
    transactionId: '22',
    offer: { type: 'amount', value: 5 },
  };
  return fixture;
}
test('real offer uses the proven transaction endpoint after checking live EUR price', async () => {
  const fixture = offerFixture();
  const prepared = await favorites.prepareOffer(fixture.adapter, '9', fixture.command);
  assert.deepEqual(prepared, { originalPriceCents: 4000, offerPriceCents: 3500 });
  const sent = await favorites.sendOffer(fixture.adapter, '9', { ...fixture.command, ...prepared });
  assert.deepEqual(sent, { outcome: 'sent', externalOfferId: '99' });
  assert.equal(fixture.writes[0].path, '/api/v2/transactions/22/offers');
  assert.deepEqual(JSON.parse(fixture.writes[0].request.body), {
    offer: { currency: 'EUR', price: '35.00' },
  });
});
test('changed live price and missing transaction stop before an offer write', async () => {
  for (const mutation of [
    (result) => {
      if (result.items) result.items[0].price.amount = '42.00';
    },
    (result) => {
      if (result.conversation) result.conversation.transaction = null;
    },
    (result) => {
      if (result.items) result.items[0].price.currency_code = 'USD';
    },
  ]) {
    const fixture = offerFixture();
    const originalRead = fixture.adapter.read;
    fixture.adapter.read = async (path) => {
      const result = await originalRead(path);
      mutation(result);
      return result;
    };
    const sent = await favorites.sendOffer(fixture.adapter, '9', {
      ...fixture.command,
      originalPriceCents: 4000,
      offerPriceCents: 3500,
    });
    assert.equal(sent.outcome, 'skipped');
    assert.equal(fixture.writes.length, 0);
  }
});
test('unconfirmed offer receipt is unknown and never repeated', async () => {
  const fixture = offerFixture();
  fixture.adapter.write = async () => {
    fixture.writes.push({});
    throw new Error('lost response');
  };
  const sent = await favorites.sendOffer(fixture.adapter, '9', {
    ...fixture.command,
    originalPriceCents: 4000,
    offerPriceCents: 3500,
  });
  assert.equal(sent.outcome, 'outcome_unknown');
  assert.equal(fixture.writes.length, 1);
});
test('explicit Vinted validation response is a confirmed failure', async () => {
  const fixture = offerFixture();
  fixture.adapter.write = async () => ({
    code: 99,
    message_code: 'validation_error',
    errors: ['synthetic'],
  });
  const sent = await favorites.sendOffer(fixture.adapter, '9', {
    ...fixture.command,
    originalPriceCents: 4000,
    offerPriceCents: 3500,
  });
  assert.deepEqual(sent, { outcome: 'failed', errorCode: 'provider_rejected' });
});
test('confirmed provider rejection is failed while timeout and server errors remain unknown', async () => {
  for (const httpStatus of [400, 401, 403, 408, 422, 429, 500]) {
    const fixture = offerFixture();
    fixture.adapter.write = async () => {
      throw Object.assign(new Error('provider reply'), { httpStatus, code: 'provider_rejected' });
    };
    const sent = await favorites.sendOffer(fixture.adapter, '9', {
      ...fixture.command,
      originalPriceCents: 4000,
      offerPriceCents: 3500,
    });
    assert.equal(
      sent.outcome,
      httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 ? 'failed' : 'outcome_unknown',
    );
  }
});
test('offer calculation preserves cents and refuses discounts over half the price', () => {
  assert.equal(favorites.offerPriceCents(4000, { type: 'percentage', value: 10 }), 3600);
  assert.equal(favorites.offerPriceCents(999, { type: 'percentage', value: 10 }), 899);
  assert.equal(favorites.offerPriceCents(600, { type: 'amount', value: 5 }), null);
  assert.equal(favorites.offerPriceCents(1, { type: 'percentage', value: 10 }), null);
});
test('favorite sends through the existing confirmed message sender', async () => {
  const fixture = setup();
  assert.equal(
    (await favorites.send(fixture.adapter, '9', command, fixture.messages)).outcome,
    'sent',
  );
  assert.equal(JSON.parse(fixture.writes[0].request.body).initiator, 'seller_enters_notification');
});
test('existing conversation never receives a new automatic favorite message', async () => {
  for (const options of [{ existing: true }, { history: true }]) {
    const fixture = setup(options);
    assert.equal(
      (await favorites.send(fixture.adapter, '9', command, fixture.messages)).outcome,
      'skipped',
    );
  }
});
test('lost conversation creation response is unknown and never retried', async () => {
  const fixture = setup({ fail: true });
  assert.equal(
    (await favorites.send(fixture.adapter, '9', command, fixture.messages)).outcome,
    'outcome_unknown',
  );
  assert.equal(fixture.writes.length, 1);
});

test('inactive or unknown items do not create a conversation', async () => {
  for (const item of [
    null,
    { id: 42, is_closed: true },
    { id: 42, is_closed: false, is_reserved: true },
  ]) {
    const fixture = setup();
    const read = fixture.adapter.read;
    fixture.adapter.read = (path) =>
      path.includes('wardrobe/')
        ? Promise.resolve({ items: item ? [item] : [], pagination: { total_pages: 1 } })
        : read(path);
    assert.equal(
      (await favorites.send(fixture.adapter, '9', command, fixture.messages)).outcome,
      'skipped',
    );
    assert.equal(fixture.writes.length, 0);
  }
});

test('identity changes or a challenge stop before creating a conversation', async () => {
  const fixture = setup();
  const read = fixture.adapter.read;
  let identities = 0;
  fixture.adapter.read = (path) =>
    path.endsWith('/current')
      ? Promise.resolve({ user: { id: ++identities === 1 ? 9 : 8 } })
      : read(path);
  const outcome = await favorites.send(fixture.adapter, '9', command, fixture.messages);
  assert.equal(outcome.errorCode, 'identity_changed');
  assert.equal(fixture.writes.length, 0);
});

test('missing browser authorization fails before the first favorite write', async () => {
  const fixture = setup();
  fixture.adapter.csrf = null;
  const result = await favorites.send(fixture.adapter, '9', command, fixture.messages);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.errorCode, 'login_required');
  assert.equal(fixture.writes.length, 0);
});

test('installed content script scans unread favorites and confirms one reply through the existing sender', async () => {
  const dom = new JSDOM(
    '<!doctype html><head><meta name="csrf-token" content="synthetic-csrf"></head><body><main>Garderobe</main></body>',
    { url: 'https://www.vinted.de/' },
  );
  dom.window.Range.prototype.getClientRects = () => [];
  let listener;
  const chrome = {
    runtime: {
      id: 'extension',
      getURL: (path) => `chrome-extension://extension/${path}`,
      onMessage: {
        addListener: (callback) => {
          listener = callback;
        },
      },
    },
  };
  const writes = [];
  let sent = false;
  const fetch = async (path, options) => {
    assert.equal(options.credentials, 'include');
    let payload;
    if (options.method === 'POST') {
      assert.equal(options.headers['X-Csrf-Token'], 'synthetic-csrf');
      writes.push({ path, body: JSON.parse(options.body) });
      if (path.endsWith('/replies')) sent = true;
      payload = path.endsWith('/offers')
        ? { offer: { id: 99, price: '35.00', currency: 'EUR' } }
        : { conversation: { id: 15 } };
    } else if (path.endsWith('/current')) payload = { user: { id: 9 } };
    else if (path.includes('/notifications/')) {
      assert.ok(path.endsWith('mark_as_read=false'));
      payload = {
        notifications: [{ ...notification, updated_at: new Date(Date.now() - 1000).toISOString() }],
      };
    } else if (path.includes('/wardrobe/'))
      payload = {
        items: [{ id: 42, is_closed: false, price: { amount: '40.00', currency_code: 'EUR' } }],
        pagination: { total_pages: 1 },
      };
    else if (path.includes('/inbox?')) payload = { conversations: [] };
    else
      payload = {
        conversation: {
          id: 15,
          opposite_user: { id: 73 },
          transaction: { id: 22, item_id: 42 },
          messages: sent ? [{ id: 123, entity: { user_id: 9, body: command.text } }] : [],
        },
      };
    return {
      status: 200,
      ok: true,
      url: `https://www.vinted.de${path}`,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => payload,
    };
  };
  dom.window.FlipbaseVintedLocal = core;
  dom.window.FlipbaseVintedFavorites = favorites;
  dom.window.FlipbaseVintedMessages = messages;
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
    const scan = await new Promise((resolve) =>
      listener(
        { type: 'VINTED_LOCAL_FAVORITES', externalAccountId: '9', timeoutMs: 1000 },
        { id: 'extension' },
        resolve,
      ),
    );
    assert.equal(scan.success, true);
    assert.equal(scan.result.events.length, 1);
    assert.equal(writes.length, 0);
    const reply = await new Promise((resolve) =>
      listener(
        { type: 'VINTED_LOCAL_FAVORITE_SEND', externalAccountId: '9', command, timeoutMs: 1000 },
        { id: 'extension' },
        resolve,
      ),
    );
    assert.equal(reply.success, true);
    assert.equal(reply.result.outcome.outcome, 'sent');
    assert.equal(reply.result.outcome.externalMessageId, '123');
    assert.deepEqual(
      writes.map((write) => write.path),
      ['/api/v2/conversations', '/api/v2/conversations/15/replies'],
    );
    assert.equal(writes[0].body.opposite_user_id, '73');
    assert.equal(writes[1].body.reply.body, command.text);
    const offerCommand = {
      ...command,
      conversationId: '15',
      transactionId: '22',
      offer: { type: 'amount', value: 5 },
    };
    const prepared = await new Promise((resolve) =>
      listener(
        {
          type: 'VINTED_LOCAL_FAVORITE_OFFER_PREPARE',
          externalAccountId: '9',
          command: offerCommand,
          timeoutMs: 1000,
        },
        { id: 'extension' },
        resolve,
      ),
    );
    assert.equal(prepared.success, true);
    assert.deepEqual(JSON.parse(JSON.stringify(prepared.result.outcome)), {
      originalPriceCents: 4000,
      offerPriceCents: 3500,
    });
    assert.equal(writes.length, 2);
    const offerSent = await new Promise((resolve) =>
      listener(
        {
          type: 'VINTED_LOCAL_FAVORITE_OFFER_SEND',
          externalAccountId: '9',
          command: { ...offerCommand, ...prepared.result.outcome },
          timeoutMs: 1000,
        },
        { id: 'extension' },
        resolve,
      ),
    );
    assert.equal(offerSent.success, true);
    assert.equal(offerSent.result.outcome.externalOfferId, '99');
    assert.equal(writes[2].path, '/api/v2/transactions/22/offers');
    assert.deepEqual(writes[2].body, { offer: { currency: 'EUR', price: '35.00' } });
  } finally {
    dom.window.close();
  }
});

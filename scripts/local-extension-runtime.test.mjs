import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { parseLocalExtensionRequest } from '../supabase/functions/_shared/marketplace-local-extension-contracts.ts';

const require = createRequire(import.meta.url);
const core = require('../tools/flipbase-extension/vinted-local-core.js');
const messages = require('../tools/flipbase-extension/vinted-local-messages.js');
const scheduler = require('../tools/flipbase-extension/vinted-local-scheduler.js');
test('Scheduler persists distinct deadlines and never catches up missed periods in a loop', async () => {
  let stored = { binding: { expiresAt: '2099-01-01T00:00:00Z' } };
  const calls = [];
  const run = scheduler.createScheduler({
    load: async () => stored,
    save: async (next) => {
      stored = next;
    },
    now: () => 1_000_000,
    run: async (action) => {
      calls.push(action);
      return { nextPage: 2 };
    },
  });
  await run.tick();
  await run.tick();
  assert.deepEqual(calls, ['INBOX_SYNC', 'MESSAGES_SEND', 'FAVORITES_SYNC', 'FAVORITES_SEND']);
  assert.equal(stored.schedule.latestAt, 1_300_000);
  assert.equal(stored.schedule.commandsAt, 1_090_000);
  assert.equal(stored.schedule.favoritesAt, 1_300_000);
  assert.equal(stored.schedule.favoriteCommandsAt, 1_090_000);
  assert.equal(stored.schedule.backfillAt, 1_060_000);
});
test('Scheduler preserves a persisted challenge pause across recreation', async () => {
  const stored = {
    binding: { expiresAt: '2099-01-01T00:00:00Z' },
    schedule: { pauseReason: 'interaction_required' },
  };
  let calls = 0;
  await scheduler
    .createScheduler({
      load: async () => stored,
      save: async () => {},
      now: () => 10,
      run: async () => {
        calls++;
      },
    })
    .tick();
  assert.equal(calls, 0);
});
test('Message send verifies account and CSRF before any provider write', async () => {
  let writes = 0;
  assert.deepEqual(
    await messages.send(
      {
        read: async () => ({ user: { id: 999 } }),
        write: async () => {
          writes++;
        },
        csrf: 'real-token',
      },
      '123',
      { externalConversationId: '51', text: 'Hallo', attachment: null },
    ),
    { outcome: 'failed', errorCode: 'identity_changed' },
  );
  assert.equal(writes, 0);
});
test('Message send reports missing CSRF and failed initial reads as unsent', async () => {
  for (const csrf of [undefined, 'synthetic-token']) {
    let writes = 0;
    const outcome = await messages.send(
      {
        csrf,
        read: async () => {
          throw new Error('offline');
        },
        write: async () => {
          writes++;
        },
      },
      '123',
      { externalConversationId: '51', text: 'Hallo', attachment: null },
    );
    assert.equal(outcome.outcome, 'failed');
    assert.equal(writes, 0);
  }
});
test('Browser CSRF reads current Next.js frames and legacy metadata without executing scripts', () => {
  const token = 'synthetic-token';
  const frame = JSON.stringify([1, '0:{"config":{"CSRF_TOKEN":' + JSON.stringify(token) + '}}\n']);
  const dom = new JSDOM('<script>self.__next_f.push(' + frame + ')</script>');
  assert.equal(messages.readCsrfToken(dom.window.document), token);
  dom.window.document.head.insertAdjacentHTML(
    'beforeend',
    '<meta name="csrf-token" content="legacy-token">',
  );
  assert.equal(messages.readCsrfToken(dom.window.document), 'legacy-token');
  for (const source of [
    'self.__next_f.push(notJson)',
    'self.__next_f.push([1,"CSRF_TOKEN"])',
    'otherFunction(' + frame + ')',
    'self.__next_f.push(' + JSON.stringify([1, '{"CSRF_TOKEN":""}']) + ')',
  ]) {
    const invalid = new JSDOM('<script>' + source + '</script>');
    assert.equal(messages.readCsrfToken(invalid.window.document), null);
  }
});
test('Message send performs exactly one reply POST and confirms a new own message by readback', async () => {
  let detailReads = 0;
  const writes = [];
  const outcome = await messages.send(
    {
      csrf: 'real-token',
      read: async (path) =>
        path.endsWith('/current')
          ? profile
          : {
              conversation: {
                id: 51,
                messages:
                  detailReads++ === 0 ? [] : [{ id: 62, entity: { body: 'Hallo', user_id: 123 } }],
              },
            },
      write: async (path, request) => {
        writes.push({ path, request });
        return {};
      },
    },
    '123',
    { externalConversationId: '51', text: 'Hallo', attachment: null },
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/api/v2/conversations/51/replies');
  assert.equal(outcome.outcome, 'sent');
  assert.equal(outcome.externalMessageId, '62');
});
test('Ambiguous provider timeout is never retried', async () => {
  let writes = 0;
  const outcome = await messages.send(
    {
      csrf: 'real-token',
      read: async (path) =>
        path.endsWith('/current') ? profile : { conversation: { id: 51, messages: [] } },
      write: async () => {
        writes++;
        throw new Error('timeout');
      },
    },
    '123',
    { externalConversationId: '51', text: 'Hallo', attachment: null },
  );
  assert.equal(writes, 1);
  assert.equal(outcome.outcome, 'outcome_unknown');
});
test('A rejected readback after an accepted reply does not claim the message was unsent', async () => {
  let writes = 0;
  const outcome = await messages.send(
    {
      csrf: 'synthetic-token',
      read: async (path) => {
        if (writes) {
          const error = new Error('login expired');
          error.httpStatus = 401;
          error.code = 'login_required';
          throw error;
        }
        return path.endsWith('/current') ? profile : { conversation: { id: 51, messages: [] } };
      },
      write: async () => {
        writes++;
        return {};
      },
    },
    '123',
    { externalConversationId: '51', text: 'Hallo', attachment: null },
  );
  assert.equal(writes, 1);
  assert.equal(outcome.outcome, 'outcome_unknown');
});
const appOrigin = 'https://app.flipbase.de';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const anotherId = '33333333-3333-4333-8333-333333333333';
const tokenHash = 'b'.repeat(64);
const secret = 'a'.repeat(64);
const identity = { id: '123', username: 'maike' };
const observedAt = '2026-10-04T10:00:00.000Z';
const expiresAt = '2026-10-05T10:00:00.000Z';
const profile = {
  user: { id: 123, login: 'maike', city: 'Berlin', about: 'Beschreibung', item_count: 1 },
};
const item = {
  id: 456,
  user_id: 123,
  title: 'Jacke',
  price: { amount: '12.00', currency_code: 'EUR' },
  view_count: 4,
  favourite_count: 2,
};
const scope = { workspaceId, connectionId };
test('Inbox reader output satisfies the real Edge import contract', async () => {
  const reader = inboxReader([inboxConversation], {
    '/api/v2/conversations/51': { conversation: { id: 51, messages: [inboxMessage] } },
  });
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  assert.ok(parseLocalExtensionRequest({ ...scope, action: 'inbox_import', batch }));
  assert.deepEqual(batch.identity, { id: '123' });
});
test('Inbox limits UTF-8 batches without claiming truncated details are current', async () => {
  const messages = Array.from({ length: 200 }, (_, index) => ({
    ...inboxMessage,
    id: 1000 + index,
    entity: { body: 'ä'.repeat(8000), user_id: 456 },
  }));
  const reader = inboxReader([inboxConversation], {
    '/api/v2/conversations/51': { conversation: { id: 51, messages } },
  });
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify({ ...scope, action: 'inbox_import', batch })) < 512 * 1024,
  );
  assert.equal(batch.entries[0].body.detailCheckedAt, null);
  assert.ok(batch.entries.filter((entry) => entry.kind === 'message').length < 200);
  assert.ok(parseLocalExtensionRequest({ ...scope, action: 'inbox_import', batch }));
});
const inboxConversation = {
  id: 51,
  unread: false,
  updated_at: '2026-10-04T09:00:00Z',
  description: 'Frage zur Jacke',
  opposite_user: { login: 'Interessentin' },
};
const inboxMessage = {
  id: 61,
  entity_type: 'text_message',
  created_at_ts: '2026-10-04T09:00:00Z',
  entity: { body: 'Ist die Jacke noch da?', user_id: 456 },
};
function inboxReader(conversations, details, pages = 1) {
  const calls = [];
  return {
    calls,
    read: async (path) => {
      calls.push(path);
      if (path === '/api/v2/users/current') return profile;
      if (path.startsWith('/api/v2/inbox?'))
        return { conversations, pagination: { total_pages: pages } };
      const detail = details[path];
      if (detail instanceof Error) throw detail;
      if (!detail) throw new Error(`Unexpected request: ${path}`);
      return detail;
    },
  };
}

test('Opening a detail without updated_at uses the dated messages and imports its article and activity', async () => {
  const reader = inboxReader([], {
    '/api/v2/conversations/51': {
      conversation: {
        id: 51,
        opposite_user: { id: 456, login: 'Anna', last_logged_in_at: '2026-10-04T08:00:00Z' },
        transaction: {
          item_id: 456,
          item_title: 'Jacke',
          offer_price: { amount: '14.00', currency_code: 'EUR' },
        },
        messages: [
          {
            id: 61,
            entity_type: 'message',
            entity: { body: 'Hallo', user_id: 456, created_at_ts: 1791104400 },
          },
          {
            id: 62,
            entity_type: 'message',
            created_at: '2026-10-04T10:00:00Z',
            entity: { body: 'Danke', user_id: 123 },
          },
        ],
      },
    },
  });
  const batch = await core.readInboxDetail(
    reader.read,
    '123',
    { externalConversationId: '51', nextPage: 1, versions: [] },
    () => observedAt,
  );
  const conversation = batch.entries.find((entry) => entry.kind === 'conversation');
  assert.equal(conversation.body.itemTitle, 'Jacke');
  assert.equal(conversation.body.lastActiveAt, '2026-10-04T08:00:00.000Z');
  assert.equal(batch.entries.filter((entry) => entry.kind === 'message').length, 2);
  assert.ok(
    parseLocalExtensionRequest({
      ...scope,
      action: 'inbox_detail_import',
      conversationId: anotherId,
      batch,
    }),
  );
});

test('Offer import preserves both prices and a textual decision in the existing message contract', async () => {
  const reader = inboxReader([inboxConversation], {
    '/api/v2/conversations/51': {
      conversation: {
        id: 51,
        messages: [
          {
            ...inboxMessage,
            entity_type: 'offer_request_message',
            entity: {
              user_id: 456,
              price: { amount: '11.00', currency_code: 'EUR' },
              original_price: { amount: '14.00', currency_code: 'EUR' },
              status_title: 'Abgelehnt',
            },
          },
        ],
      },
    },
  });
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  const offer = batch.entries.find((entry) => entry.kind === 'message');
  assert.match(offer.body.priceLabel, /11,00.*14,00/u);
  assert.equal(offer.body.offerStatus, 'Abgelehnt');
});

test('Inbox reads preserve unread state and normalize only permitted message fields', async () => {
  const reader = inboxReader([inboxConversation, { ...inboxConversation, id: 52, unread: true }], {
    '/api/v2/conversations/51': { conversation: { id: 51, messages: [inboxMessage] } },
  });
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  assert.equal(batch.entries.length, 3);
  const importedMessage = batch.entries.find((entry) => entry.kind === 'message');
  assert.equal(importedMessage.parentExternalId, '51');
  assert.deepEqual(importedMessage.body, {
    title: 'text_message',
    text: 'Ist die Jacke noch da?',
    occurredAt: '2026-10-04T09:00:00.000Z',
    direction: 'inbound',
    messageType: 'text_message',
    priceLabel: null,
    imageUrls: [],
    eventType: null,
    eventGroup: null,
    offerStatus: null,
  });
  assert.equal(batch.conversationsComplete, true);
  assert.equal(batch.nextPage, 1);
  assert.ok(!reader.calls.includes('/api/v2/conversations/52'));
  assert.ok(!reader.calls.some((path) => path.includes('wardrobe')));
});

test('Inbox skips unchanged recent details and retains their longer preview', async () => {
  const reader = inboxReader([inboxConversation], {});
  const batch = await core.readInbox(
    reader.read,
    '123',
    {
      nextPage: 1,
      versions: [
        {
          externalId: '51',
          sourceUpdatedAt: '2026-10-04T09:00:00.000Z',
          detailCheckedAt: '2026-10-04T09:30:00.000Z',
          text: 'Längere gespeicherte Nachricht',
          occurredAt: '2026-10-04T09:00:00.000Z',
        },
      ],
    },
    () => observedAt,
  );
  assert.equal(batch.entries[0].body.text, 'Längere gespeicherte Nachricht');
  assert.equal(reader.calls.filter((path) => path.startsWith('/api/v2/conversations/')).length, 0);
});

test('Inbox resumes pages and bounds detail reads without claiming historical message completeness', async () => {
  const conversations = Array.from({ length: 5 }, (_, index) => ({
    ...inboxConversation,
    id: 51 + index,
  }));
  const details = Object.fromEntries(
    conversations.map((entry) => [
      `/api/v2/conversations/${entry.id}`,
      {
        conversation: { id: entry.id, messages: [{ ...inboxMessage, id: entry.id + 100 }] },
      },
    ]),
  );
  const reader = inboxReader(conversations, details, 3);
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 2, versions: [] },
    () => observedAt,
  );
  assert.ok(reader.calls.includes('/api/v2/inbox?page=2&per_page=20'));
  assert.equal(reader.calls.filter((path) => path.startsWith('/api/v2/conversations/')).length, 3);
  assert.equal(batch.nextPage, 3);
  assert.equal(batch.conversationsComplete, false);
  assert.equal(batch.entries.find((entry) => entry.externalId === '54').body.detailCheckedAt, null);
});

test('Inbox rejects changed account, wrong detail identity, ambiguous rows and provider failures', async () => {
  for (const detail of [
    { conversation: { id: 52, messages: [] } },
    new Error('Vinted begrenzt gerade die Abrufe.'),
  ]) {
    const reader = inboxReader([inboxConversation], { '/api/v2/conversations/51': detail });
    await assert.rejects(
      core.readInbox(reader.read, '123', { nextPage: 1, versions: [] }, () => observedAt),
    );
  }
  const duplicates = inboxReader([inboxConversation, inboxConversation], {});
  await assert.rejects(
    core.readInbox(duplicates.read, '123', { nextPage: 1, versions: [] }, () => observedAt),
  );
  const changed = inboxReader([{ ...inboxConversation, unread: true }], {});
  let identities = 0;
  await assert.rejects(
    core.readInbox(
      (path) =>
        path === '/api/v2/users/current' && ++identities > 1
          ? Promise.resolve({ user: { id: 999, login: 'anderes-konto' } })
          : changed.read(path),
      '123',
      { nextPage: 1, versions: [] },
      () => observedAt,
    ),
    /gewechselt/,
  );
});

test('Inbox truncation does not certify details and system events have stable IDs', async () => {
  const event = {
    entity_type: 'status_message',
    created_at_ts: 1791104400,
    entity: { title: 'Status', event: 'shipping' },
  };
  const messages = Array.from({ length: 202 }, (_, index) => ({
    ...inboxMessage,
    id: index + 1000,
  }));
  const reader = inboxReader([inboxConversation], {
    '/api/v2/conversations/51': {
      conversation: { id: 51, messages: [event, ...messages] },
    },
  });
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  assert.equal(batch.entries.filter((entry) => entry.kind === 'message').length, 200);
  assert.equal(batch.entries[0].body.detailCheckedAt, null);
  const eventReader = inboxReader([inboxConversation], {
    '/api/v2/conversations/51': {
      conversation: { id: 51, messages: [event] },
    },
  });
  const first = await core.readInbox(
    eventReader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  const second = await core.readInbox(
    eventReader.read,
    '123',
    { nextPage: 1, versions: [] },
    () => observedAt,
  );
  assert.match(first.entries[1].externalId, /^event:[0-9a-f]{64}$/);
  assert.equal(first.entries[1].externalId, second.entries[1].externalId);
  const existingSource = JSON.stringify({
    conversationId: '51',
    type: event.entity_type,
    createdAt: event.created_at_ts,
    entity: event.entity,
  });
  const existingDigest = await webcrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(existingSource),
  );
  assert.equal(first.entries[1].externalId, `event:${Buffer.from(existingDigest).toString('hex')}`);
});

test('Inbox runtime requires explicit server permission before any Vinted read', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  setup.adapter.readInbox = async () => {
    throw new Error('Inbox reader must not run');
  };
  await assert.rejects(
    setup.runtime.run(request('INBOX_SYNC', scope), appOrigin),
    /Nachrichtenfreigabe/,
  );
  assert.ok(!setup.edgeCalls.some((entry) => entry.action === 'inbox_import'));
});

test('Inbox runtime imports a separate batch and resumes its server checkpoint after restart', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  const receivedPages = [];
  setup.adapter.edge = async (_binding, authorization, body) => {
    assert.equal(authorization, secret);
    setup.edgeCalls.push(body);
    if (body.action === 'inbox_import')
      return {
        ok: true,
        observedAt,
        counts: { conversation: 1, message: 1 },
        nextPage: 3,
        conversationsComplete: false,
      };
    return {
      ok: true,
      externalAccountId: '123',
      expiresAt,
      messagesRead: true,
      ...(body.action === 'inbox_state' ? { nextPage: 2, versions: [] } : {}),
    };
  };
  setup.adapter.readInbox = async (_tabId, expectedId, state) => {
    assert.equal(expectedId, '123');
    receivedPages.push(state.nextPage);
    return {
      tabId: 12,
      batch: {
        identity,
        observedAt,
        page: 2,
        nextPage: 3,
        conversationsComplete: false,
        entries: [],
      },
    };
  };
  const result = await core
    .createRuntime(setup.adapter)
    .run(request('INBOX_SYNC', scope), appOrigin);
  assert.deepEqual(receivedPages, [2]);
  assert.equal(result.nextPage, 3);
  assert.equal(result.counts.message, 1);
  assert.ok(!setup.edgeCalls.some((entry) => entry.action === 'import'));
});

test('Inbox runtime rechecks message permission after the provider read and denies revoked access', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  let messagePermission = true;
  setup.adapter.edge = async (_binding, _authorization, body) => {
    setup.edgeCalls.push(body);
    return {
      ok: true,
      externalAccountId: '123',
      expiresAt,
      messagesRead: messagePermission,
      ...(body.action === 'inbox_state' ? { nextPage: 1, versions: [] } : {}),
    };
  };
  setup.adapter.readInbox = async () => {
    messagePermission = false;
    return {
      tabId: 12,
      batch: {
        identity,
        observedAt,
        page: 1,
        nextPage: 1,
        conversationsComplete: true,
        entries: [],
      },
    };
  };
  await assert.rejects(
    setup.runtime.run(request('INBOX_SYNC', scope), appOrigin),
    /Nachrichtenfreigabe/,
  );
  assert.ok(!setup.edgeCalls.some((entry) => entry.action === 'inbox_import'));
});
const payload = {
  ...scope,
  externalAccountId: '123',
  apiUrl: 'https://api.flipbase.de/functions/v1/marketplace-local-extension',
  expiresAt,
  tokenHash,
};
const request = (action, body) => ({
  action,
  requestId: `request_${action}`,
  ...(body ? { payload: body } : {}),
});

function harness() {
  let saved;
  let currentIdentity = identity;
  let currentTime = Date.parse(observedAt);
  let revoked = false;
  const edgeCalls = [];
  const adapter = {
    now: () => currentTime,
    load: async () => structuredClone(saved),
    save: async (installation) => {
      saved = structuredClone(installation);
    },
    remove: async () => {
      saved = undefined;
    },
    randomSecret: () => secret,
    hash: async () => tokenHash,
    readIdentity: async () => ({ identity: currentIdentity, tabId: 12 }),
    readSnapshot: async () => ({
      tabId: 12,
      snapshot: core.parseSnapshot(currentIdentity, profile, [item], observedAt, true),
    }),
    edge: async (binding, auth, body) => {
      assert.equal(auth, secret);
      edgeCalls.push(body);
      if (revoked) throw new Error('widerrufen');
      return body.action === 'heartbeat'
        ? { ok: true, externalAccountId: '123', expiresAt }
        : { ok: true, counts: { profile: 1, publication: 1 }, observedAt };
    },
  };
  return {
    adapter,
    edgeCalls,
    runtime: core.createRuntime(adapter),
    get saved() {
      return saved;
    },
    setIdentity: (account) => {
      currentIdentity = account;
    },
    setTime: (time) => {
      currentTime = time;
    },
    revoke: () => {
      revoked = true;
    },
  };
}

test('Bridge schema accepts correlated requests and denies arbitrary hosts, URLs and payloads', () => {
  const valid = { type: 'FLIPBASE_VINTED_LOCAL_BIND', requestId: 'valid-request', payload };
  assert.equal(core.parseRequest(valid, appOrigin).action, 'BIND');
  for (const origin of [
    'https://evil.flipbase.de',
    'https://app.flipbase.de.evil.test',
    'http://app.flipbase.de',
    'null',
  ]) {
    assert.equal(core.parseRequest(valid, origin), null);
  }
  for (const apiUrl of [
    'https://evil.test/functions/v1/marketplace-local-extension',
    'https://api.flipbase.de/other',
    'https://api.flipbase.de/functions/v1/marketplace-local-extension?token=x',
    'http://127.0.0.1:54351/functions/v1/marketplace-local-extension',
  ]) {
    assert.equal(core.parseRequest({ ...valid, payload: { ...payload, apiUrl } }, appOrigin), null);
  }
  assert.equal(core.parseRequest({ ...valid, requestId: '<spoof>' }, appOrigin), null);
  assert.equal(core.parseRequest({ ...valid, payload: { ...payload, secret } }, appOrigin), null);
  assert.ok(
    core.parseRequest(
      {
        ...valid,
        payload: {
          ...payload,
          apiUrl: 'http://127.0.0.1:54351/functions/v1/marketplace-local-extension',
        },
      },
      'http://localhost:4200',
    ),
  );
});

test('Profile parser exports only selected data and rejects foreign or ambiguous publications', () => {
  const snapshot = core.parseSnapshot(
    identity,
    { user: { ...profile.user, access_token: 'private', email: 'private@example.com' } },
    [item],
    observedAt,
    true,
  );
  assert.equal(snapshot.entries[0].body.username, 'maike');
  assert.equal(snapshot.entries[1].body.price, 12);
  assert.equal(snapshot.entries[1].body.metrics.views, 4);
  assert.ok(!JSON.stringify(snapshot).includes('private'));
  assert.throws(
    () => core.parseSnapshot(identity, profile, [item, item], observedAt, true),
    /unvollständige/,
  );
  assert.throws(
    () => core.parseSnapshot(identity, profile, [{ ...item, user_id: 999 }], observedAt, true),
    /fremde/,
  );
  assert.throws(() => core.parseIdentity({ user: { id: 123, login: 'bad\nname' } }), /Anmeldung/);
});

test('Runtime snapshot conforms to the real backend parser for public profile and listing fields', async () => {
  const { parseLocalExtensionRequest } =
    await import('../supabase/functions/_shared/marketplace-local-extension-contracts.ts');
  const snapshot = core.parseSnapshot(
    identity,
    profile,
    [{ ...item, is_closed: false, is_reserved: true }],
    observedAt,
    true,
  );
  const parsed = parseLocalExtensionRequest({ action: 'import', ...scope, snapshot });
  assert.ok(parsed);
  assert.equal(parsed.snapshot.entries[0].body.observedAt, observedAt);
  assert.equal(parsed.snapshot.entries[1].body.isClosed, false);
  assert.equal(parsed.snapshot.entries[1].body.isReserved, true);
});

test('Read pipeline uses only current identity and wardrobe paths, with complete empty pagination', async () => {
  const calls = [];
  const snapshot = await core.readSnapshot(
    async (path) => {
      calls.push(path);
      return path === '/api/v2/users/current'
        ? profile
        : { items: [], pagination: { total_pages: 0 } };
    },
    '123',
    () => observedAt,
  );
  assert.equal(snapshot.publicationsComplete, true);
  assert.equal(snapshot.entries.length, 1);
  assert.deepEqual(calls, [
    '/api/v2/users/current',
    '/api/v2/users/current',
    '/api/v2/wardrobe/123/items?page=1&per_page=20',
    '/api/v2/users/current',
  ]);
});

test('Read pipeline stops on malformed page, changed owner or changed identity', async () => {
  await assert.rejects(
    () =>
      core.readSnapshot(
        async (path) => (path.includes('current') ? profile : { items: [], pagination: {} }),
        '123',
      ),
    /Seitenfolge/,
  );
  let identities = 0;
  await assert.rejects(
    () =>
      core.readSnapshot(
        async (path) =>
          path.includes('current')
            ? ++identities === 3
              ? { user: { id: 999, login: 'other' } }
              : profile
            : { items: [item], pagination: { total_pages: 1 } },
        '123',
      ),
    /gewechselt/,
  );
  await assert.rejects(
    () =>
      core.readSnapshot(
        async (path) =>
          path.includes('current')
            ? profile
            : { items: [{ ...item, user_id: 999 }], pagination: { total_pages: 1 } },
        '123',
      ),
    /fremde/,
  );
});

test('Read pipeline caps pagination and marks an explicitly partial result instead of deleting unseen data', async () => {
  const snapshot = await core.readSnapshot(
    async (path) => {
      if (path.includes('current')) return profile;
      const page = Number(new URL(`https://www.vinted.de${path}`).searchParams.get('page'));
      return { items: [{ ...item, id: 1000 + page }], pagination: { total_pages: 26 } };
    },
    '123',
    () => observedAt,
  );
  assert.equal(snapshot.publicationsComplete, false);
  assert.equal(snapshot.entries.length, 26);
});

test('Background recreation recovers its binding and never returns the secret to the website', async () => {
  const setup = harness();
  const prepared = await setup.runtime.run(request('PREPARE'), appOrigin);
  assert.deepEqual(prepared, { tokenHash, identity });
  const bound = await setup.runtime.run(request('BIND', payload), appOrigin);
  assert.deepEqual(bound, { ...scope, externalAccountId: '123', expiresAt });
  const restartedRuntime = core.createRuntime(setup.adapter);
  const synced = await restartedRuntime.run(request('SYNC', scope), appOrigin);
  assert.equal(synced.counts.publication, 1);
  assert.equal(synced.publicationsComplete, true);
  assert.ok(!JSON.stringify([prepared, bound, synced]).includes(secret));
  assert.equal(setup.saved.secret, secret);
  assert.equal(setup.saved.tabId, 12);
  assert.equal(setup.saved.leaseUntil, undefined);
  assert.deepEqual(
    setup.edgeCalls.map((call) => call.action),
    ['heartbeat', 'heartbeat', 'heartbeat', 'import'],
  );
});

test('Wrong workspace, expired binding and revoked heartbeat prevent import', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  await assert.rejects(
    () => setup.runtime.run(request('SYNC', { workspaceId: anotherId, connectionId }), appOrigin),
    /Arbeitsplatz/,
  );
  setup.setTime(Date.parse(expiresAt) + 1);
  await assert.rejects(() => setup.runtime.run(request('SYNC', scope), appOrigin), /abgelaufen/);
  setup.setTime(Date.parse(observedAt));
  setup.revoke();
  await assert.rejects(() => setup.runtime.run(request('SYNC', scope), appOrigin), /widerrufen/);
  assert.ok(!setup.edgeCalls.some((call) => call.action === 'import'));
});

test('Active binding is preserved during prepare, rejects other accounts and disconnect deletes credentials', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  await assert.rejects(
    () => setup.runtime.run(request('BIND', { ...payload, connectionId: anotherId }), appOrigin),
    /bereits/,
  );
  await setup.runtime.run(request('PREPARE'), appOrigin);
  assert.equal(setup.saved.binding.connectionId, connectionId);
  setup.setIdentity({ id: '999', username: 'other' });
  await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin), /anderes/);
  await assert.rejects(() => setup.runtime.run(request('SYNC', scope), appOrigin), /gewechselt/);
  await assert.rejects(
    () =>
      setup.runtime.run(request('DISCONNECT', { workspaceId: anotherId, connectionId }), appOrigin),
    /Browserprofil/,
  );
  assert.deepEqual(await setup.runtime.run(request('DISCONNECT', scope), appOrigin), {
    disconnected: true,
  });
  assert.equal(setup.saved, undefined);
});

test('Concurrent requests and persisted lease after a terminated background do not overlap reads', async () => {
  const setup = harness();
  await setup.adapter.save({ leaseUntil: Date.parse(observedAt) + 30_000 });
  await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin), /noch ausgeführt/);
  assert.equal(setup.saved.leaseUntil, Date.parse(observedAt) + 30_000);
  setup.setTime(Date.parse(observedAt) + 31_000);
  let finish;
  setup.adapter.readIdentity = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = setup.runtime.run(request('PREPARE'), appOrigin);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin), /läuft bereits/);
  finish({ identity, tabId: 12 });
  await pending;
});

test('A failed bind preserves a retryable pending scope and disconnect removes its secret', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  setup.adapter.edge = async () => {
    throw new Error('Netzwerkfehler');
  };
  await assert.rejects(
    () => setup.runtime.run(request('BIND', payload), appOrigin),
    /Netzwerkfehler/,
  );
  assert.equal(setup.saved.binding, undefined);
  assert.equal(setup.saved.pendingScope.connectionId, connectionId);
  await assert.rejects(
    () => setup.runtime.run(request('BIND', { ...payload, connectionId: anotherId }), appOrigin),
    /bereits/,
  );
  await assert.rejects(
    () => setup.runtime.run(request('DISCONNECT', scope), 'http://localhost:4200'),
    /Browserprofil/,
  );
  assert.deepEqual(await setup.runtime.run(request('DISCONNECT', scope), appOrigin), {
    disconnected: true,
  });
  assert.equal(setup.saved, undefined);
});

test('A definitively deleted or revoked binding can prepare a fresh installation for a new connection', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  setup.adapter.edge = async () => {
    throw new core.LocalBindingInvalidError();
  };
  const freshSecret = 'c'.repeat(64);
  const freshHash = 'd'.repeat(64);
  setup.adapter.randomSecret = () => freshSecret;
  setup.adapter.hash = async () => freshHash;
  const prepared = await setup.runtime.run(request('PREPARE'), appOrigin);
  assert.equal(prepared.tokenHash, freshHash);
  assert.equal(setup.saved.secret, freshSecret);
  assert.equal(setup.saved.binding, undefined);
  assert.equal(setup.saved.pendingScope, undefined);
  setup.adapter.edge = async (binding, authorization) => {
    assert.equal(authorization, freshSecret);
    return { ok: true, externalAccountId: '123', expiresAt };
  };
  const newPayload = { ...payload, connectionId: anotherId, tokenHash: freshHash };
  const bound = await setup.runtime.run(request('BIND', newPayload), appOrigin);
  assert.equal(bound.connectionId, anotherId);
  assert.ok(!JSON.stringify([prepared, bound]).includes(freshSecret));
});

test('Prepare preserves the existing secret and binding after transient or ambiguous server failure', async () => {
  for (const failure of ['network', 'timeout', '503', 'malformed']) {
    const setup = harness();
    await setup.runtime.run(request('PREPARE'), appOrigin);
    await setup.runtime.run(request('BIND', payload), appOrigin);
    setup.adapter.edge = async () => {
      if (failure === 'malformed') return { ok: true, externalAccountId: '999', expiresAt };
      throw new Error(failure);
    };
    await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin));
    assert.equal(setup.saved.secret, secret);
    assert.equal(setup.saved.tokenHash, tokenHash);
    assert.equal(setup.saved.binding.connectionId, connectionId);
  }
});

test('Definitive invalidation erases the stale secret even when the next manual login is pending', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  setup.adapter.edge = async () => {
    throw new core.LocalBindingInvalidError();
  };
  setup.adapter.readIdentity = async () => {
    throw new Error('Anmeldung erforderlich');
  };
  await assert.rejects(
    () => setup.runtime.run(request('PREPARE'), appOrigin),
    /Anmeldung erforderlich/,
  );
  assert.equal(setup.saved.secret, undefined);
  assert.equal(setup.saved.tokenHash, undefined);
  assert.equal(setup.saved.binding, undefined);
  assert.equal(setup.saved.identity, undefined);
});

test('CAPTCHA, SMS, login and block states are distinct and never ready', () => {
  const states = [
    [{ text: 'Deine Sitzung wurde blockiert' }, 'session_blocked'],
    [{ hasChallenge: true }, 'interaction_required'],
    [{ pathname: '/member/login/2fa' }, 'verification_required'],
    [{ hasPassword: true }, 'login_required'],
  ];
  for (const [page, state] of states) {
    assert.equal(core.detectPageState(page), state);
    assert.throws(() => core.assertPageReady(state));
  }
  assert.equal(core.detectPageState({ text: 'Meine Garderobe' }), 'ready');
});

test('Website bridge checks source and origin, preserves request correlation and ignores replay', () => {
  const listeners = new Map();
  const sent = [];
  const replies = [];
  const fakeWindow = {
    location: { origin: appOrigin },
    postMessage: (reply, origin) => replies.push({ reply, origin }),
    dispatchEvent() {},
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  fakeWindow.top = fakeWindow;
  const context = vm.createContext({
    window: fakeWindow,
    globalThis: { FlipbaseVintedLocal: core },
    document: { documentElement: { dataset: {} }, readyState: 'complete' },
    CustomEvent: class {},
    setInterval() {},
    chrome: {
      runtime: {
        sendMessage: (message, callback) => {
          sent.push(message);
          callback({ success: true, result: { tokenHash, identity } });
        },
      },
    },
  });
  vm.runInContext(
    readFileSync(
      new URL('../tools/flipbase-extension/flipbase-bridge.js', import.meta.url),
      'utf8',
    ),
    context,
  );
  const message = { type: 'FLIPBASE_VINTED_LOCAL_PREPARE', requestId: 'prepare-1' };
  const dispatch = listeners.get('message');
  dispatch({ source: {}, origin: appOrigin, data: message });
  dispatch({ source: fakeWindow, origin: 'https://evil.test', data: message });
  assert.equal(sent.length, 0);
  dispatch({ source: fakeWindow, origin: appOrigin, data: message });
  dispatch({ source: fakeWindow, origin: appOrigin, data: message });
  assert.equal(sent.length, 1);
  assert.equal(replies.at(-1).reply.requestId, 'prepare-1');
  assert.equal(replies.at(-1).origin, appOrigin);
  assert.ok(!JSON.stringify(replies).includes(secret));
});

test('Content script renders a reserved tab and only GETs identity with no cookies exported', async () => {
  const dom = new JSDOM('<!doctype html><body><main>Garderobe</main></body>', {
    url: 'https://www.vinted.de/',
  });
  dom.window.Range.prototype.getClientRects = () => [];
  let listener;
  const calls = [];
  const chrome = {
    runtime: {
      id: 'extension',
      getURL: (path) => `chrome-extension://extension/${path}`,
      onMessage: {
        addListener: (callback) => {
          listener = callback;
        },
      },
      sendMessage: (message) => calls.push(message),
    },
  };
  dom.window.FlipbaseVintedLocal = core;
  dom.window.chrome = chrome;
  dom.window.AbortSignal = AbortSignal;
  dom.window.fetch = async (path, options) => {
    calls.push({ path, options });
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'include');
    return {
      status: 200,
      ok: true,
      url: 'https://www.vinted.de/api/v2/users/current',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => profile,
    };
  };
  dom.window.eval = undefined;
  const context = vm.createContext({
    globalThis: dom.window,
    window: dom.window,
    location: dom.window.location,
    document: dom.window.document,
    chrome,
    URL,
    AbortSignal,
    fetch: dom.window.fetch,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    Date,
    Error,
    Number,
  });
  vm.runInContext(
    readFileSync(
      new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
      'utf8',
    ),
    context,
  );
  assert.equal(
    listener({ type: 'VINTED_LOCAL_READY' }, { id: 'another-extension' }, () => {
      assert.fail('A foreign extension must not receive readiness.');
    }),
    false,
  );
  const readiness = await new Promise((resolve) =>
    listener({ type: 'VINTED_LOCAL_READY' }, { id: 'extension' }, resolve),
  );
  assert.equal(readiness.ready, true);
  assert.equal(calls.length, 0);
  assert.equal(dom.window.document.querySelector('#flipbase-vinted-work-tab'), null);
  const response = await new Promise((resolve) =>
    listener({ type: 'VINTED_LOCAL_IDENTITY', timeoutMs: 1000 }, { id: 'extension' }, resolve),
  );
  assert.equal(response.success, true);
  assert.equal(response.result.identity.id, '123');
  assert.equal(
    dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.busy,
    'false',
  );
  const logo = dom.window.document.querySelector('.flipbase-vinted-work-logo');
  assert.equal(logo.src, 'chrome-extension://extension/images/flipbase-mark.png');
  assert.equal(logo.alt, 'Flipbase');
  dom.window.document.querySelector('button').click();
  assert.equal(calls.at(-1).type, 'VINTED_LOCAL_OPEN_USER_TAB');
  dom.window.close();
});

test('Manifest narrows application and provider access without changing Kleinanzeigen autofill scripts', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../tools/flipbase-extension/manifest.json', import.meta.url), 'utf8'),
  );
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  assert.ok(!manifest.content_scripts.some((script) => script.matches.includes('<all_urls>')));
  assert.ok(
    manifest.content_scripts.some(
      (script) =>
        script.js.includes('kleinanzeigen-autofill.js') && script.js.includes('autofill-core.js'),
    ),
  );
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'alarms']);
  assert.deepEqual(manifest.web_accessible_resources, [
    { resources: ['images/flipbase-mark.png'], matches: ['https://www.vinted.de/*'] },
  ]);
  assert.deepEqual(
    readFileSync(new URL('../tools/flipbase-extension/images/flipbase-mark.png', import.meta.url)),
    readFileSync(new URL('../public/images/logo-mark.png', import.meta.url)),
  );
});

function createReservedTabFixture(
  markup = '<main><input><button>Vinted-Aktion</button></main>',
  responseFor = () => profile,
) {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, {
    url: 'https://www.vinted.de/',
  });
  const rectangle = { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 };
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => rectangle;
  dom.window.Range.prototype.getClientRects = () => [rectangle];
  let listener;
  let status = 200;
  let pendingResponse;
  let reads = 0;
  const sentMessages = [];
  const chrome = {
    runtime: {
      id: 'extension',
      getURL: (path) => `chrome-extension://extension/${path}`,
      onMessage: { addListener: (callback) => (listener = callback) },
      sendMessage: (message) => sentMessages.push(message),
    },
  };
  const context = vm.createContext({
    globalThis: { FlipbaseVintedLocal: core, FlipbaseVintedMessages: messages },
    window: dom.window,
    location: dom.window.location,
    document: dom.window.document,
    chrome,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    Date,
    Number,
    Error,
    URL,
    AbortSignal,
    fetch: async (path, options) => {
      reads++;
      if (pendingResponse) await pendingResponse;
      return {
        status,
        ok: status === 200,
        url: 'https://www.vinted.de/api/v2/users/current',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => responseFor(path, options),
      };
    },
  });
  vm.runInContext(
    readFileSync(
      new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
      'utf8',
    ),
    context,
  );
  return {
    dom,
    sentMessages,
    get reads() {
      return reads;
    },
    setStatus: (nextStatus) => (status = nextStatus),
    holdResponse: (response) => (pendingResponse = response),
    readIdentity: () =>
      new Promise((resolve) =>
        listener({ type: 'VINTED_LOCAL_IDENTITY' }, { id: 'extension' }, resolve),
      ),
    sendMessage: (command) =>
      new Promise((resolve) =>
        listener(
          { type: 'VINTED_LOCAL_SEND', externalAccountId: '123', command },
          { id: 'extension' },
          resolve,
        ),
      ),
    readInbox: () =>
      new Promise((resolve) =>
        listener(
          {
            type: 'VINTED_LOCAL_INBOX',
            externalAccountId: '123',
            state: { nextPage: 1, versions: [] },
          },
          { id: 'extension' },
          resolve,
        ),
      ),
    mutationsSettled: () => new Promise((resolve) => setImmediate(resolve)),
  };
}

test('Content inbox reader uses the exact GET whitelist and keeps the reserved tab protected', async () => {
  const calls = [];
  const fixture = createReservedTabFixture(undefined, (path) => {
    calls.push(path);
    if (path === '/api/v2/users/current') return profile;
    if (path === '/api/v2/inbox?page=1&per_page=20')
      return {
        conversations: [inboxConversation],
        pagination: { total_pages: 1 },
      };
    if (path === '/api/v2/conversations/51')
      return { conversation: { id: 51, messages: [inboxMessage] } };
    throw new Error('Unexpected provider path');
  });
  try {
    const response = await fixture.readInbox();
    assert.equal(response.success, true);
    assert.equal(
      response.result.batch.entries.filter((entry) => entry.kind === 'message').length,
      1,
    );
    assert.ok(calls.includes('/api/v2/inbox?page=1&per_page=20'));
    assert.equal(
      fixture.dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.protected,
      'true',
    );
  } finally {
    fixture.dom.window.close();
  }
});

test('Reserved tab stays modal after import and blocks background clicks, typing and focus', async () => {
  const fixture = createReservedTabFixture();
  const { document } = fixture.dom.window;
  try {
    assert.equal((await fixture.readIdentity()).success, true);
    const overlay = document.querySelector('#flipbase-vinted-work-tab');
    assert.equal(overlay.dataset.busy, 'false');
    assert.equal(overlay.dataset.protected, 'true');
    assert.equal(overlay.getAttribute('role'), 'dialog');
    assert.equal(overlay.getAttribute('aria-modal'), 'true');
    assert.ok(document.querySelector('main').hasAttribute('inert'));
    let backgroundClicks = 0;
    const backgroundButton = document.querySelector('main button');
    backgroundButton.addEventListener('click', () => backgroundClicks++);
    const click = new fixture.dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    assert.equal(backgroundButton.dispatchEvent(click), false);
    assert.equal(backgroundClicks, 0);
    const input = document.querySelector('input');
    const typing = new fixture.dom.window.KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true,
    });
    assert.equal(input.dispatchEvent(typing), false);
    input.focus();
    assert.equal(document.activeElement, overlay);
    overlay.querySelector('button').click();
    assert.equal(fixture.sentMessages.at(-1).type, 'VINTED_LOCAL_OPEN_USER_TAB');
    const nextSection = document.createElement('section');
    document.body.append(nextSection);
    await fixture.mutationsSettled();
    assert.ok(nextSection.hasAttribute('inert'));
  } finally {
    fixture.dom.window.close();
  }
});

test('A newly shown manual challenge releases the page and restores its original inert state', async () => {
  const fixture = createReservedTabFixture(
    '<main><input></main><aside inert="original">Hinweis</aside>',
  );
  const { document } = fixture.dom.window;
  try {
    assert.equal((await fixture.readIdentity()).success, true);
    const overlay = document.querySelector('#flipbase-vinted-work-tab');
    const challenge = document.createElement('iframe');
    challenge.src = 'https://captcha-delivery.com/captcha/';
    document.querySelector('main').append(challenge);
    await fixture.mutationsSettled();
    assert.equal(overlay.dataset.protected, 'false');
    assert.equal(overlay.getAttribute('aria-modal'), null);
    assert.ok(!document.querySelector('main').hasAttribute('inert'));
    assert.equal(document.querySelector('aside').getAttribute('inert'), 'original');
    const input = document.querySelector('input');
    assert.equal(
      input.dispatchEvent(
        new fixture.dom.window.KeyboardEvent('keydown', {
          key: 'a',
          bubbles: true,
          cancelable: true,
        }),
      ),
      true,
    );
    input.focus();
    assert.equal(document.activeElement, input);
    assert.equal((await fixture.readIdentity()).success, false);
    assert.equal(fixture.reads, 1);
    challenge.remove();
    await fixture.mutationsSettled();
    assert.equal(overlay.dataset.protected, 'true');
    assert.equal(fixture.reads, 1);
  } finally {
    fixture.dom.window.close();
  }
});

test('Visible login and SMS checks are usable without starting any API read', async () => {
  for (const markup of [
    '<main><input type="password"></main>',
    '<main>Bestätigungscode<input></main>',
  ]) {
    const fixture = createReservedTabFixture(markup);
    try {
      assert.equal((await fixture.readIdentity()).success, false);
      assert.equal(fixture.reads, 0);
      assert.equal(
        fixture.dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.protected,
        'false',
      );
      assert.ok(!fixture.dom.window.document.querySelector('main').hasAttribute('inert'));
    } finally {
      fixture.dom.window.close();
    }
  }
});

test('A blocked reserved session stays stopped even when the block text disappears', async () => {
  const fixture = createReservedTabFixture();
  const { document } = fixture.dom.window;
  try {
    await fixture.readIdentity();
    const main = document.querySelector('main');
    main.textContent = 'Deine Sitzung wurde blockiert';
    await fixture.mutationsSettled();
    main.textContent = 'Garderobe';
    await fixture.mutationsSettled();
    const response = await fixture.readIdentity();
    assert.equal(response.success, false);
    assert.match(response.error, /Sitzung blockiert/);
    assert.equal(fixture.reads, 1);
    assert.equal(document.querySelector('#flipbase-vinted-work-tab').dataset.protected, 'true');
  } finally {
    fixture.dom.window.close();
  }
});

test('An expired API login releases the reserved page for signing in', async () => {
  const fixture = createReservedTabFixture();
  const { document } = fixture.dom.window;
  try {
    fixture.setStatus(401);
    assert.equal((await fixture.readIdentity()).success, false);
    assert.equal(
      fixture.dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.protected,
      'false',
    );
    assert.ok(!fixture.dom.window.document.querySelector('main').hasAttribute('inert'));
    document.querySelector('main').className = 'updated-wardrobe';
    await fixture.mutationsSettled();
    const overlay = document.querySelector('#flipbase-vinted-work-tab');
    assert.equal(overlay.dataset.protected, 'false');
    assert.ok(!document.querySelector('main').hasAttribute('inert'));
    assert.match(overlay.querySelector('p').textContent, /Melde Dich zuerst/);
    assert.equal(fixture.reads, 1);
    fixture.setStatus(200);
    assert.equal((await fixture.readIdentity()).success, true);
    assert.equal(overlay.dataset.protected, 'true');
    assert.equal(fixture.reads, 2);
  } finally {
    fixture.dom.window.close();
  }
});

test('A manual check during an API read stops that read even if the check disappears before the response', async () => {
  const fixture = createReservedTabFixture();
  const { document } = fixture.dom.window;
  try {
    let finishResponse;
    fixture.holdResponse(new Promise((resolve) => (finishResponse = resolve)));
    const read = fixture.readIdentity();
    const challenge = document.createElement('iframe');
    challenge.src = 'https://captcha-delivery.com/captcha/';
    document.querySelector('main').append(challenge);
    await fixture.mutationsSettled();
    challenge.remove();
    await fixture.mutationsSettled();
    finishResponse();
    const response = await read;
    assert.equal(response.success, false);
    assert.match(response.error, /manuelle Prüfung/);
    assert.equal(fixture.reads, 1);
  } finally {
    fixture.dom.window.close();
  }
});

test('Content script ignores transparent and off-screen CAPTCHA frames and pauses for a visible challenge', async () => {
  const cases = [
    {
      markup: '<iframe style="opacity:0" src="https://captcha-delivery.com/captcha/"></iframe>',
      rectangle: { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 },
      expectedReady: true,
    },
    {
      markup:
        '<div style="opacity:0"><iframe src="https://captcha-delivery.com/captcha/"></iframe></div>',
      rectangle: { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 },
      expectedReady: true,
    },
    {
      markup: '<iframe src="https://captcha-delivery.com/captcha/"></iframe>',
      rectangle: { left: -400, top: 20, right: -200, bottom: 120, width: 200, height: 100 },
      expectedReady: true,
    },
    {
      markup: '<iframe src="https://captcha-delivery.com/captcha/"></iframe>',
      rectangle: { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 },
      expectedReady: false,
    },
  ];
  for (const fixture of cases) {
    const dom = new JSDOM(`<!doctype html><body>${fixture.markup}</body>`, {
      url: 'https://www.vinted.de/',
    });
    dom.window.Range.prototype.getClientRects = () => [];
    dom.window.document.querySelector('iframe').getBoundingClientRect = () => fixture.rectangle;
    let listener;
    let reads = 0;
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
    const context = vm.createContext({
      globalThis: { FlipbaseVintedLocal: core },
      window: dom.window,
      location: dom.window.location,
      document: dom.window.document,
      chrome,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      Date,
      Number,
      Error,
      URL,
      AbortSignal,
      fetch: async () => {
        reads++;
        return {
          status: 200,
          ok: true,
          url: 'https://www.vinted.de/api/v2/users/current',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => profile,
        };
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
        'utf8',
      ),
      context,
    );
    const response = await new Promise((resolve) =>
      listener({ type: 'VINTED_LOCAL_IDENTITY' }, { id: 'extension' }, resolve),
    );
    assert.equal(response.success, fixture.expectedReady);
    assert.equal(reads, fixture.expectedReady ? 1 : 0);
    assert.equal(
      dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.busy,
      'false',
    );
    if (!fixture.expectedReady) assert.match(response.error, /manuelle Prüfung/);
    dom.window.close();
  }
});

test('Content script reads rendered messages without script translations, hidden text or its own overlay', async () => {
  const rectangle = { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 };
  const cases = [
    {
      markup:
        '<main>Vinted</main><script>{"sms":"Bestätigungscode","blocked":"Deine Sitzung wurde blockiert"}</script><style>/* Bestätigungscode */</style><noscript>Bestätigungscode</noscript><template><p>Bestätigungscode</p></template>',
      expectedReady: true,
    },
    {
      markup: '<main>Vinted<div style="display:none"><p>Bestätigungscode</p></div></main>',
      expectedReady: true,
    },
    {
      markup: '<main>Vinted<div style="opacity:0"><p>Bestätigungscode</p></div></main>',
      expectedReady: true,
    },
    { markup: '<main><p>Gib Deinen Bestätigungscode ein</p></main>', expectedReady: false },
  ];
  for (const fixture of cases) {
    const dom = new JSDOM(`<!doctype html><body>${fixture.markup}</body>`, {
      url: 'https://www.vinted.de/',
    });
    // Chromiums innerText-Verhalten bei Skripten und sichtbare Textgeometrie nachbilden.
    for (const script of dom.window.document.querySelectorAll('script')) {
      Object.defineProperty(script, 'innerText', { value: script.textContent });
    }
    for (const element of dom.window.document.querySelectorAll('*')) {
      element.getBoundingClientRect = () => rectangle;
    }
    dom.window.Range.prototype.getClientRects = () => [rectangle];
    let listener;
    let reads = 0;
    const chrome = {
      runtime: {
        id: 'extension',
        getURL: (path) => `chrome-extension://extension/${path}`,
        onMessage: { addListener: (callback) => (listener = callback) },
      },
    };
    const context = vm.createContext({
      globalThis: { FlipbaseVintedLocal: core },
      window: dom.window,
      location: dom.window.location,
      document: dom.window.document,
      chrome,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      Date,
      Number,
      Error,
      URL,
      AbortSignal,
      fetch: async () => {
        reads++;
        return {
          status: 200,
          ok: true,
          url: 'https://www.vinted.de/api/v2/users/current',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => profile,
        };
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
        'utf8',
      ),
      context,
    );
    const readIdentity = () =>
      new Promise((resolve) =>
        listener({ type: 'VINTED_LOCAL_IDENTITY' }, { id: 'extension' }, resolve),
      );
    const response = await readIdentity();
    assert.equal(response.success, fixture.expectedReady);
    assert.equal(reads, fixture.expectedReady ? 1 : 0);
    if (!fixture.expectedReady) assert.match(response.error, /Bestätigungscode/);
    if (fixture.expectedReady) {
      dom.window.document.querySelector('#flipbase-vinted-work-tab p').textContent =
        'Bestätigungscode';
      assert.equal((await readIdentity()).success, true);
      assert.equal(reads, 2);
    }
    dom.window.close();
  }
});

function createChromeBackgroundFixture({
  receive,
  existingTab,
  edgeResponse,
  accelerateTimers = false,
} = {}) {
  let stored = existingTab ? { [core.storageKey]: { tabId: existingTab.id } } : {};
  let nextTabId = 10;
  let edgeStatus = 200;
  const tabs = new Map();
  if (existingTab) tabs.set(existingTab.id, existingTab);
  const messages = [];
  const edgeCalls = [];
  const createdTabs = [];
  const updatedTabs = [];
  let currentTime = Date.now();
  class FixtureDate extends Date {
    static now() {
      return accelerateTimers ? currentTime : Date.now();
    }
  }
  const sender = {
    id: 'extension',
    frameId: 0,
    url: `${appOrigin}/marketplaces/vinted`,
    origin: appOrigin,
    tab: { id: 4, incognito: false },
  };
  const validExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  function startBackground() {
    const listeners = [];
    const local = {
      setAccessLevel: async (options) => assert.equal(options.accessLevel, 'TRUSTED_CONTEXTS'),
      get: async (key) => ({ [key]: structuredClone(stored[key]) }),
      set: async (input) => {
        stored = { ...stored, ...structuredClone(input) };
      },
      remove: async (key) => {
        delete stored[key];
      },
    };
    const chrome = {
      storage: { local },
      runtime: {
        id: 'extension',
        onMessage: { addListener: (listener) => listeners.push(listener) },
      },
      tabs: {
        create: async (options) => {
          createdTabs.push(options);
          const { url } = options;
          const tab = { ...options, id: nextTabId++, url, status: 'complete', incognito: false };
          tabs.set(tab.id, tab);
          return tab;
        },
        get: async (tabId) => {
          if (!tabs.has(tabId)) throw new Error('closed');
          return tabs.get(tabId);
        },
        update: async (tabId, options) => {
          updatedTabs.push({ tabId, ...options });
          const tab = { ...tabs.get(tabId), ...options };
          tabs.set(tabId, tab);
          return tab;
        },
        move: async (tabId, options) => {
          const tab = { ...tabs.get(tabId), ...options };
          tabs.set(tabId, tab);
          return tab;
        },
        sendMessage: async (tabId, message) => {
          assert.ok(tabs.has(tabId));
          messages.push({ tabId, message });
          if (receive) {
            const response = await receive(tabId, message);
            if (response !== undefined) return response;
          }
          if (message.type === 'VINTED_LOCAL_READY') return { success: true, ready: true };
          assert.ok(message.timeoutMs > 0 && message.timeoutMs <= 35000);
          return {
            success: true,
            result:
              message.type === 'VINTED_LOCAL_IDENTITY'
                ? { identity }
                : {
                    snapshot: core.parseSnapshot(
                      identity,
                      profile,
                      [item],
                      new Date().toISOString(),
                      true,
                    ),
                  },
          };
        },
      },
    };
    const context = vm.createContext({
      chrome,
      globalThis: { FlipbaseVintedLocal: core },
      crypto: webcrypto,
      TextEncoder,
      URL,
      Date: FixtureDate,
      Number,
      Error,
      JSON,
      Uint8Array,
      AbortSignal,
      setTimeout: (callback, timeoutMs) =>
        setTimeout(
          () => {
            if (accelerateTimers && timeoutMs <= 300) currentTime += timeoutMs;
            callback();
          },
          accelerateTimers && timeoutMs <= 300 ? 1 : timeoutMs,
        ),
      clearTimeout,
      fetch: async (url, options) => {
        assert.equal(url, payload.apiUrl);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        const auth = options.headers.Authorization;
        assert.match(auth, /^Bearer [0-9a-f]{64}$/);
        const body = JSON.parse(options.body);
        edgeCalls.push(body);
        return {
          status: edgeStatus,
          ok: edgeStatus === 200,
          json: async () =>
            edgeResponse
              ? edgeResponse(body, validExpires)
              : body.action === 'heartbeat'
                ? { ok: true, externalAccountId: '123', expiresAt: validExpires }
                : {
                    ok: true,
                    counts: { profile: 1, publication: 1 },
                    observedAt: body.snapshot.observedAt,
                  },
        };
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-background.js', import.meta.url),
        'utf8',
      ),
      context,
    );
    const listener = listeners[0];
    return {
      listener,
      call: (message, from = sender) => new Promise((resolve) => listener(message, from, resolve)),
    };
  }
  return {
    startBackground,
    tabs,
    messages,
    edgeCalls,
    createdTabs,
    updatedTabs,
    validExpires,
    sender,
    get stored() {
      return stored;
    },
    setEdgeStatus: (status) => (edgeStatus = status),
  };
}

test('Chrome background adapter recovers the reserved tab and refuses non-application senders', async () => {
  const fixture = createChromeBackgroundFixture();
  const { startBackground, tabs, edgeCalls, validExpires, sender } = fixture;
  const background = startBackground();
  const prepare = { type: 'FLIPBASE_VINTED_LOCAL_PREPARE', requestId: 'prepare-tab' };
  assert.equal(
    background.listener(prepare, { ...sender, origin: 'https://evil.test' }, () => {}),
    false,
  );
  assert.equal(
    background.listener(prepare, { ...sender, frameId: 1 }, () => {}),
    false,
  );
  const prepared = await background.call(prepare);
  assert.equal(prepared.success, true);
  assert.equal(tabs.size, 1);
  const boundPayload = {
    ...payload,
    expiresAt: validExpires,
    tokenHash: prepared.result.tokenHash,
  };
  const bound = await background.call({
    type: 'FLIPBASE_VINTED_LOCAL_BIND',
    requestId: 'bind-tab',
    payload: boundPayload,
  });
  assert.equal(bound.success, true);
  const restarted = startBackground();
  const synced = await restarted.call({
    type: 'FLIPBASE_VINTED_LOCAL_SYNC',
    requestId: 'sync-tab',
    payload: scope,
  });
  assert.equal(synced.success, true);
  assert.equal(tabs.size, 1);
  const installationSecret = fixture.stored[core.storageKey].secret;
  assert.ok(!JSON.stringify([prepared, bound, synced]).includes(installationSecret));
  assert.equal(edgeCalls.at(-1).action, 'import');
  const reservedTabId = fixture.stored[core.storageKey].tabId;
  tabs.delete(reservedTabId);
  assert.equal((await restarted.call({ ...prepare, requestId: 'prepare-reopen' })).success, true);
  assert.equal(tabs.size, 1);
  assert.notEqual(fixture.stored[core.storageKey].tabId, reservedTabId);
  fixture.setEdgeStatus(503);
  assert.equal((await restarted.call({ ...prepare, requestId: 'prepare-offline' })).success, false);
  assert.equal(fixture.stored[core.storageKey].secret, installationSecret);
  fixture.setEdgeStatus(401);
  const freshPrepare = await restarted.call({ ...prepare, requestId: 'prepare-deleted' });
  assert.equal(freshPrepare.success, true);
  assert.notEqual(freshPrepare.result.tokenHash, prepared.result.tokenHash);
  assert.equal(fixture.stored[core.storageKey].binding, undefined);
  fixture.setEdgeStatus(200);
  const freshScope = { workspaceId, connectionId: anotherId };
  const freshBind = await restarted.call({
    type: 'FLIPBASE_VINTED_LOCAL_BIND',
    requestId: 'bind-new',
    payload: { ...boundPayload, ...freshScope, tokenHash: freshPrepare.result.tokenHash },
  });
  assert.equal(freshBind.success, true);
  assert.equal(freshBind.result.connectionId, anotherId);
  assert.equal(
    (
      await restarted.call({
        type: 'FLIPBASE_VINTED_LOCAL_DISCONNECT',
        requestId: 'disconnect-tab',
        payload: freshScope,
      })
    ).success,
    true,
  );
  assert.equal(fixture.stored[core.storageKey], undefined);
});

test('Closed send work tab is restored in the background once and reused after worker restart', async () => {
  let sent = false;
  const fixture = createChromeBackgroundFixture({
    receive: async (_tabId, request) => {
      if (request.type === 'VINTED_LOCAL_SEND') {
        assert.equal(sent, false);
        sent = true;
        return { success: true, result: { outcome: { outcome: 'sent', externalMessageId: '62' } } };
      }
    },
    edgeResponse: (body, validExpires) => {
      if (body.action === 'heartbeat')
        return {
          ok: true,
          externalAccountId: '123',
          expiresAt: validExpires,
          messagesSend: true,
        };
      if (body.action === 'message_claim')
        return {
          ok: true,
          command: sent
            ? null
            : {
                id: anotherId,
                claimToken: anotherId,
                externalConversationId: '51',
                text: 'Hallo',
                attachment: null,
              },
        };
      return { ok: true };
    },
  });
  const background = fixture.startBackground();
  const prepared = await background.call({
    type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
    requestId: 'prepare-send',
  });
  assert.equal(prepared.success, true);
  assert.equal(
    (
      await background.call({
        type: 'FLIPBASE_VINTED_LOCAL_BIND',
        requestId: 'bind-send',
        payload: {
          ...payload,
          expiresAt: fixture.validExpires,
          tokenHash: prepared.result.tokenHash,
        },
      })
    ).success,
    true,
  );
  const oldTabId = fixture.stored[core.storageKey].tabId;
  fixture.tabs.delete(oldTabId);
  const sendRequest = {
    type: 'FLIPBASE_VINTED_LOCAL_MESSAGES_SEND',
    requestId: 'send-closed-tab',
    payload: scope,
  };
  assert.equal((await background.call(sendRequest)).success, true);
  const newTabId = fixture.stored[core.storageKey].tabId;
  assert.notEqual(newTabId, oldTabId);
  assert.equal(fixture.createdTabs.length, 2);
  assert.ok(fixture.createdTabs.every((tab) => !tab.active && tab.pinned && tab.index === 0));
  assert.equal(
    fixture.messages.find((entry) => entry.message.type === 'VINTED_LOCAL_SEND').tabId,
    newTabId,
  );
  assert.equal(
    (await fixture.startBackground().call({ ...sendRequest, requestId: 'send-restart' })).success,
    true,
  );
  assert.equal(fixture.createdTabs.length, 2);
  assert.equal(
    fixture.messages.filter((entry) => entry.message.type === 'VINTED_LOCAL_SEND').length,
    1,
  );
});

test('Content sends with the current Next.js CSRF frame and verifies the provider reply', async () => {
  let sent = false;
  const frame = JSON.stringify([1, '{"CSRF_TOKEN":"synthetic-token"}']);
  const fixture = createReservedTabFixture(
    '<main></main><script>self.__next_f.push(' + frame + ')</script>',
    (path, options) => {
      if (path === '/api/v2/users/current') return profile;
      if (options?.method === 'POST') {
        assert.equal(path, '/api/v2/conversations/51/replies');
        assert.equal(options.headers['X-Csrf-Token'], 'synthetic-token');
        assert.equal(sent, false);
        sent = true;
        return {};
      }
      return {
        conversation: {
          id: 51,
          messages: sent ? [{ id: 62, entity: { body: 'Hallo', user_id: 123 } }] : [],
        },
      };
    },
  );
  try {
    const response = await fixture.sendMessage({
      externalConversationId: '51',
      text: 'Hallo',
      attachment: null,
    });
    assert.equal(response.success, true, response.error);
    assert.equal(response.result.outcome.outcome, 'sent');
    assert.equal(response.result.outcome.externalMessageId, '62');
    assert.equal(sent, true);
  } finally {
    fixture.dom.window.close();
  }
});

test('A reloaded extension replaces only its unreachable stored work tab before a single read', async () => {
  const fixture = createChromeBackgroundFixture({
    existingTab: { id: 90, url: 'https://www.vinted.de/', status: 'complete', incognito: false },
    accelerateTimers: true,
    receive: async (tabId) => {
      if (tabId === 90)
        throw new Error('Could not establish connection. Receiving end does not exist.');
    },
  });
  fixture.tabs.set(91, { id: 91, url: 'https://www.vinted.de/', status: 'complete' });
  const result = await fixture.startBackground().call({
    type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
    requestId: 'recover-reloaded-extension',
  });
  assert.equal(result.success, true);
  assert.equal(fixture.stored[core.storageKey].tabId, 10);
  assert.equal(fixture.tabs.size, 3);
  assert.ok(!fixture.messages.some(({ tabId }) => tabId === 91));
  assert.deepEqual(
    fixture.messages
      .filter(({ message }) => message.type === 'VINTED_LOCAL_IDENTITY')
      .map(({ tabId }) => tabId),
    [10],
  );
});

test('A completed tab waits for document-idle receiver readiness without creating another tab', async () => {
  let readyAttempts = 0;
  const fixture = createChromeBackgroundFixture({
    accelerateTimers: true,
    receive: async (_tabId, message) => {
      if (message.type === 'VINTED_LOCAL_READY' && ++readyAttempts < 3)
        throw new Error('Receiving end does not exist.');
    },
  });
  const result = await fixture.startBackground().call({
    type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
    requestId: 'wait-for-document-idle',
  });
  assert.equal(result.success, true);
  assert.equal(readyAttempts, 3);
  assert.equal(fixture.tabs.size, 1);
  assert.equal(
    fixture.messages.filter(({ message }) => message.type === 'VINTED_LOCAL_IDENTITY').length,
    1,
  );
});

test('Missing receivers stop after one recovery and perform no Vinted read or import', async () => {
  const fixture = createChromeBackgroundFixture({
    existingTab: { id: 90, url: 'https://www.vinted.de/', status: 'complete', incognito: false },
    accelerateTimers: true,
    receive: async () => {
      throw new Error('Receiving end does not exist.');
    },
  });
  const result = await fixture.startBackground().call({
    type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
    requestId: 'bounded-receiver-recovery',
  });
  assert.equal(result.success, false);
  assert.match(result.error, /zugreifen darf/);
  assert.equal(fixture.tabs.size, 2);
  assert.ok(fixture.messages.every(({ message }) => message.type === 'VINTED_LOCAL_READY'));
  assert.equal(fixture.edgeCalls.length, 0);
});

test('An unresponsive newly created receiver times out without opening more tabs', async () => {
  const fixture = createChromeBackgroundFixture({
    accelerateTimers: true,
    receive: () => new Promise(() => {}),
  });
  const result = await fixture.startBackground().call({
    type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
    requestId: 'unresponsive-receiver',
  });
  assert.equal(result.success, false);
  assert.match(result.error, /zugreifen darf/);
  assert.equal(fixture.tabs.size, 1);
  assert.ok(fixture.messages.length < 10);
  assert.ok(fixture.messages.every(({ message }) => message.type === 'VINTED_LOCAL_READY'));
  assert.equal(fixture.edgeCalls.length, 0);
});

test('A receiver transport failure during the read is not retried after the ready handshake', async () => {
  const fixture = createChromeBackgroundFixture({
    receive: async (_tabId, message) => {
      if (message.type === 'VINTED_LOCAL_IDENTITY') throw new Error('Message port closed.');
    },
  });
  const result = await fixture.startBackground().call({
    type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
    requestId: 'do-not-repeat-read',
  });
  assert.equal(result.success, false);
  assert.equal(fixture.tabs.size, 1);
  assert.equal(
    fixture.messages.filter(({ message }) => message.type === 'VINTED_LOCAL_IDENTITY').length,
    1,
  );
});

test('Provider login, SMS, CAPTCHA and block errors do not recover or repeat the read', async () => {
  for (const state of [
    'login_required',
    'verification_required',
    'interaction_required',
    'session_blocked',
  ]) {
    const fixture = createChromeBackgroundFixture({
      receive: async (_tabId, message) =>
        message.type === 'VINTED_LOCAL_IDENTITY' ? { success: false, error: state } : undefined,
    });
    const result = await fixture.startBackground().call({
      type: 'FLIPBASE_VINTED_LOCAL_PREPARE',
      requestId: `provider-${state}`,
    });
    assert.equal(result.success, false);
    assert.equal(result.error, state);
    assert.equal(fixture.tabs.size, 1);
    assert.equal(
      fixture.messages.filter(({ message }) => message.type === 'VINTED_LOCAL_IDENTITY').length,
      1,
    );
    assert.equal(fixture.edgeCalls.length, 0);
    assert.equal(fixture.createdTabs[0].active, false);
    assert.equal(fixture.createdTabs[0].pinned, true);
    assert.equal(fixture.createdTabs[0].index, 0);
    assert.ok(fixture.updatedTabs.every((tab) => tab.active !== true));
  }
});

test('The reserved tab stays pinned, is reused and never steals focus during reads', async () => {
  const fixture = createChromeBackgroundFixture({
    existingTab: {
      id: 91,
      url: 'https://www.vinted.de/',
      status: 'complete',
      pinned: false,
      index: 5,
    },
  });
  const background = fixture.startBackground();
  for (const requestId of ['first-read', 'second-read'])
    assert.equal(
      (await background.call({ type: 'FLIPBASE_VINTED_LOCAL_PREPARE', requestId })).success,
      true,
    );
  assert.equal(fixture.createdTabs.length, 0);
  assert.equal(fixture.tabs.size, 1);
  assert.equal(fixture.tabs.get(91).pinned, true);
  assert.equal(fixture.tabs.get(91).autoDiscardable, false);
  assert.equal(fixture.tabs.get(91).index, 0);
  assert.ok(fixture.updatedTabs.every((tab) => tab.active !== true));
});

test('Only the reserved page receives the Flipbase title and yellow tab icon', async () => {
  const fixture = createReservedTabFixture();
  try {
    const { document } = fixture.dom.window;
    assert.equal(document.querySelector('[data-flipbase-work-tab-icon]'), null);
    await fixture.readIdentity();
    assert.equal(document.title, 'Flipbase · Vinted-Arbeitstab');
    assert.match(
      document.querySelector('[data-flipbase-work-tab-icon]').href,
      /^data:image\/svg\+xml,/,
    );
    await fixture.readIdentity();
    assert.equal(document.querySelectorAll('[data-flipbase-work-tab-icon]').length, 1);
  } finally {
    fixture.dom.window.close();
  }
});

test('Manual reads cannot bypass a persisted provider Retry-After', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  await setup.adapter.save({
    ...setup.saved,
    schedule: { retryAfter: Date.parse(observedAt) + 120_000 },
  });
  const before = setup.edgeCalls.length;
  await assert.rejects(
    setup.runtime.run(request('INBOX_SYNC', scope), appOrigin),
    (error) => error.code === 'rate_limited',
  );
  assert.equal(setup.edgeCalls.length, before);
});

test('Scheduler persists Retry-After and backfills only once when the cursor is pending', async () => {
  let stored = {
    binding: { expiresAt: '2099-01-01T00:00:00Z' },
    schedule: { latestAt: 2_000_000, backfillAt: 1, commandsAt: 2_000_000 },
  };
  let time = 1_000_000;
  const calls = [];
  const runner = scheduler.createScheduler({
    load: async () => stored,
    save: async (next) => {
      stored = next;
    },
    now: () => time,
    run: async (action) => {
      calls.push(action);
      const error = new Error('429');
      error.code = 'rate_limited';
      error.retryAfter = 1_500_000;
      throw error;
    },
  });
  await runner.tick();
  time = 1_400_000;
  await runner.tick();
  assert.deepEqual(calls, ['INBOX_BACKFILL']);
  assert.equal(stored.schedule.retryAfter, 1_500_000);
});

test('Latest inbox always reads page one while preserving pending backfill cursor', async () => {
  const reader = inboxReader([{ ...inboxConversation, unread: true }], {}, 8);
  const batch = await core.readInbox(
    reader.read,
    '123',
    { nextPage: 3, versions: [], mode: 'latest' },
    () => observedAt,
  );
  assert.ok(reader.calls.includes('/api/v2/inbox?page=1&per_page=20'));
  assert.equal(batch.nextPage, 3);
  assert.ok(!reader.calls.some((path) => path.includes('/conversations/')));
});

test('Explicit detail uses normal GET and preserves unread and the global cursor', async () => {
  const calls = [];
  const batch = await core.readInboxDetail(
    async (path) => {
      calls.push(path);
      if (path === '/api/v2/users/current') return profile;
      if (path === '/api/v2/conversations/51')
        return {
          conversation: {
            ...inboxConversation,
            unread: true,
            messages: [inboxMessage],
            item: { id: 456, title: 'Jacke', price: { amount: '12.00', currency_code: 'EUR' } },
            opposite_user: { id: 456, login: 'Interessentin', last_loged_on_ts: 1791100800 },
          },
        };
      throw new Error('Unexpected endpoint');
    },
    '123',
    { externalConversationId: '51', nextPage: 3, versions: [] },
    () => observedAt,
  );
  assert.equal(calls.filter((path) => path === '/api/v2/conversations/51').length, 1);
  assert.ok(!calls.some((path) => path.includes('mark_as_read')));
  assert.equal(batch.nextPage, 3);
  assert.equal(batch.conversationsComplete, false);
  const entry = batch.entries.find((item) => item.kind === 'conversation');
  assert.equal(entry.body.unread, true);
  assert.equal(entry.body.itemTitle, 'Jacke');
  assert.equal(entry.body.itemPrice, 12);
  assert.equal(entry.body.partnerId, '456');
  assert.ok(entry.body.lastActiveAt);
  assert.ok(
    parseLocalExtensionRequest({
      ...scope,
      action: 'inbox_detail_import',
      conversationId: anotherId,
      batch,
    }),
  );
});

async function outboxHarness() {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  const command = {
    id: anotherId,
    claimToken: anotherId,
    externalConversationId: '51',
    text: 'Hallo',
    attachment: null,
  };
  setup.adapter.edge = async (_binding, _authorization, body) => {
    assert.ok(parseLocalExtensionRequest(body));
    setup.edgeCalls.push(body);
    if (body.action === 'heartbeat')
      return { ok: true, externalAccountId: '123', expiresAt, messagesSend: true };
    if (body.action === 'message_claim') return { ok: true, command };
    return { ok: true };
  };
  return setup;
}

async function favoriteHarness(enabled = true) {
  const setup = await outboxHarness();
  setup.adapter.edge = async (_binding, _secret, body) => {
    assert.ok(parseLocalExtensionRequest(body));
    setup.edgeCalls.push(body);
    if (body.action === 'heartbeat')
      return {
        ok: true,
        externalAccountId: '123',
        expiresAt,
        messagesRead: true,
        messagesSend: true,
      };
    if (body.action === 'favorites_state')
      return { ok: true, enabled, externalAccountId: '123', expiresAt };
    if (body.action === 'favorite_claim')
      return {
        ok: true,
        command: {
          id: anotherId,
          claimToken: anotherId,
          actorId: '456',
          itemId: '777',
          text: 'Danke für Dein Interesse!',
        },
      };
    return { ok: true };
  };
  setup.adapter.readFavorites = async () => ({
    tabId: 77,
    events: [{ externalId: anotherId, actorId: '456', itemId: '777', eventAt: observedAt }],
  });
  setup.adapter.sendFavorite = async () => ({
    tabId: 77,
    outcome: { outcome: 'sent', externalMessageId: '62' },
  });
  return setup;
}

test('Disabled favorites perform no provider reads or writes and never claim', async () => {
  const setup = await favoriteHarness(false);
  setup.adapter.readIdentity =
    setup.adapter.readFavorites =
    setup.adapter.sendFavorite =
      async () => {
        throw new Error('must not touch Vinted');
      };
  assert.deepEqual(await setup.runtime.run(request('FAVORITES_SYNC', scope), appOrigin), {
    skipped: true,
  });
  assert.deepEqual(await setup.runtime.run(request('FAVORITES_SEND', scope), appOrigin), {
    skipped: true,
  });
  assert.ok(!setup.edgeCalls.some((call) => call.action === 'favorite_claim'));
});

test('Favorite import stays scoped and sending persists the start before one provider attempt', async () => {
  const setup = await favoriteHarness();
  await setup.runtime.run(request('FAVORITES_SYNC', scope), appOrigin);
  assert.equal(setup.saved.tabId, 77);
  assert.equal(setup.edgeCalls.find((call) => call.action === 'favorites_import').events.length, 1);
  setup.adapter.sendFavorite = async () => {
    assert.equal(setup.saved.pendingFinish.favorite, true);
    assert.equal(setup.saved.pendingFinish.outcome, 'outcome_unknown');
    assert.ok(setup.edgeCalls.some((call) => call.action === 'favorite_start'));
    return { outcome: { outcome: 'skipped', errorCode: 'inactive_item' } };
  };
  assert.deepEqual(await setup.runtime.run(request('FAVORITES_SEND', scope), appOrigin), {
    outcome: 'skipped',
  });
});

test('A favorite receipt after restart is reported as favorite without another claim or send', async () => {
  const setup = await favoriteHarness();
  let sends = 0;
  let offline = true;
  const edge = setup.adapter.edge;
  setup.adapter.edge = async (...args) => {
    if (args[2].action === 'favorite_finish' && offline) throw new Error('offline');
    return edge(...args);
  };
  setup.adapter.sendFavorite = async () => {
    sends++;
    return { outcome: { outcome: 'sent', externalMessageId: '62' } };
  };
  await assert.rejects(setup.runtime.run(request('FAVORITES_SEND', scope), appOrigin), /offline/);
  offline = false;
  await core.createRuntime(setup.adapter).run(request('MESSAGES_SEND', scope), appOrigin);
  assert.equal(sends, 1);
  assert.equal(setup.edgeCalls.filter((call) => call.action === 'favorite_claim').length, 1);
  assert.equal(setup.saved.pendingFinish, undefined);
  assert.ok(!setup.edgeCalls.some((call) => call.action === 'message_finish'));
});

test('Favorite contracts reject forged targets, extra keys and unproven sent receipts', () => {
  const input = {
    ...scope,
    action: 'favorites_import',
    events: [{ externalId: anotherId, actorId: '456', itemId: '777', eventAt: observedAt }],
  };
  assert.ok(parseLocalExtensionRequest(input));
  assert.equal(
    parseLocalExtensionRequest({ ...input, events: [{ ...input.events[0], actorId: null }] }),
    null,
  );
  assert.equal(
    parseLocalExtensionRequest({ ...input, events: [{ ...input.events[0], token: 'secret' }] }),
    null,
  );
  assert.equal(
    parseLocalExtensionRequest({
      ...scope,
      action: 'favorite_finish',
      id: anotherId,
      claimToken: anotherId,
      outcome: 'sent',
    }),
    null,
  );
});

test('Message worker restores and verifies its tab before claiming, and persists the sending tab', async () => {
  const setup = await outboxHarness();
  const order = [];
  setup.adapter.readIdentity = async () => {
    order.push('identity');
    return { identity, tabId: 77 };
  };
  const edge = setup.adapter.edge;
  setup.adapter.edge = async (...args) => {
    order.push(args[2].action);
    return edge(...args);
  };
  setup.adapter.sendMessage = async (tabId) => {
    assert.equal(tabId, 77);
    order.push('send');
    return { tabId: 88, outcome: { outcome: 'sent', externalMessageId: '62' } };
  };
  await setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin);
  assert.ok(order.indexOf('identity') < order.indexOf('message_claim'));
  assert.equal(setup.saved.tabId, 88);
});

test('Message worker leaves the job unclaimed when the restored session cannot be verified', async () => {
  const setup = await outboxHarness();
  setup.adapter.readIdentity = async () => {
    const error = new Error('login');
    error.code = 'login_required';
    throw error;
  };
  setup.adapter.sendMessage = async () => {
    throw new Error('must not send');
  };
  await assert.rejects(
    setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin),
    (error) => error.code === 'login_required',
  );
  assert.equal(setup.edgeCalls.filter((call) => call.action === 'message_claim').length, 0);
  assert.equal(setup.saved.pendingFinish, undefined);
});

test('Message result retry after worker restart reports without another claim or provider write', async () => {
  const setup = await outboxHarness();
  let sends = 0;
  let rejectFinish = true;
  const edge = setup.adapter.edge;
  setup.adapter.edge = async (...args) => {
    if (args[2].action === 'message_finish' && rejectFinish) throw new Error('offline');
    return edge(...args);
  };
  setup.adapter.sendMessage = async () => {
    sends++;
    assert.equal(setup.saved.pendingFinish.outcome, 'outcome_unknown');
    assert.ok(setup.edgeCalls.some((call) => call.action === 'message_start'));
    return { outcome: { outcome: 'sent', externalMessageId: '62' } };
  };
  await assert.rejects(setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin), /offline/);
  assert.equal(setup.saved.pendingFinish.externalMessageId, '62');
  rejectFinish = false;
  await core.createRuntime(setup.adapter).run(request('MESSAGES_SEND', scope), appOrigin);
  assert.equal(sends, 1);
  assert.equal(setup.edgeCalls.filter((call) => call.action === 'message_claim').length, 1);
  assert.equal(setup.saved.pendingFinish, undefined);
});

test('Denied server start produces zero provider writes and only reports unknown after restart', async () => {
  const setup = await outboxHarness();
  let sends = 0;
  const edge = setup.adapter.edge;
  setup.adapter.edge = async (...args) =>
    args[2].action === 'message_start' ? { ok: false } : edge(...args);
  setup.adapter.sendMessage = async () => {
    sends++;
  };
  await assert.rejects(
    setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin),
    /freigegeben/,
  );
  await core.createRuntime(setup.adapter).run(request('MESSAGES_SEND', scope), appOrigin);
  assert.equal(sends, 0);
  assert.equal(setup.edgeCalls.filter((call) => call.action === 'message_claim').length, 1);
});

test('Send permission is optional and disabled by default', async () => {
  const setup = await outboxHarness();
  setup.adapter.edge = async (_binding, _secret, body) => {
    assert.equal(body.action, 'heartbeat');
    return { ok: true, externalAccountId: '123', expiresAt };
  };
  assert.deepEqual(await setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin), {
    skipped: true,
  });
});

test('Send rate limit remains persisted even when finish reporting fails', async () => {
  const setup = await outboxHarness();
  const edge = setup.adapter.edge;
  setup.adapter.edge = async (...args) => {
    if (args[2].action === 'message_finish') throw new Error('offline');
    return edge(...args);
  };
  setup.adapter.sendMessage = async () => ({
    outcome: {
      outcome: 'failed',
      errorCode: 'rate_limited',
      retryAfter: Date.parse(observedAt) + 180_000,
    },
  });
  await assert.rejects(setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin), /offline/);
  assert.equal(setup.saved.schedule.retryAfter, Date.parse(observedAt) + 180_000);
  assert.equal(setup.saved.pendingFinish.outcome, 'failed');
});

test('Image send validates binary signature and uploads and posts at most once', async () => {
  assert.throws(() =>
    messages.attachmentBytes({
      name: 'x.png',
      mimeType: 'image/png',
      base64: Buffer.from('not an image').toString('base64'),
    }),
  );
  const attachment = {
    name: 'test.png',
    mimeType: 'image/png',
    base64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64'),
  };
  const writes = [];
  const result = await messages.send(
    {
      csrf: 'synthetic-token',
      read: async (path) =>
        path.endsWith('/current') ? profile : { conversation: { id: 51, messages: [] } },
      write: async (path, options) => {
        writes.push(path);
        if (path === '/api/v2/photos') {
          assert.equal(options.body.get('photo[type]'), 'user_msg');
          return { photo_temp_uuid: anotherId };
        }
        assert.deepEqual(JSON.parse(options.body), {
          reply: {
            body: null,
            photo_temp_uuids: [anotherId],
            is_personal_data_sharing_check_skipped: false,
          },
        });
        return {};
      },
    },
    '123',
    { externalConversationId: '51', text: null, attachment },
  );
  assert.deepEqual(writes, ['/api/v2/photos', '/api/v2/conversations/51/replies']);
  assert.equal(result.outcome, 'outcome_unknown');
});

test('Background recreates missing Chrome alarm on startup and uses automatic scoped requests', async () => {
  let alarm;
  let onAlarm;
  let onStartup;
  let pump;
  let creates = 0;
  const operations = [];
  const chrome = {
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
    },
    alarms: {
      get: async () => alarm,
      create: async (name, options) => {
        creates++;
        alarm = { name, ...options };
      },
      onAlarm: {
        addListener: (handler) => {
          onAlarm = handler;
        },
      },
    },
    runtime: {
      onMessage: { addListener: () => {} },
      onStartup: {
        addListener: (handler) => {
          onStartup = handler;
        },
      },
      onInstalled: { addListener: () => {} },
    },
  };
  const fakeCore = {
    ...core,
    createRuntime: () => ({
      run: async (request, origin) => {
        operations.push({ request, origin });
      },
    }),
  };
  const fakeScheduler = {
    createScheduler: (adapter) => {
      pump = adapter.run;
      return {
        tick: async () => {
          operations.push('alarm');
        },
      };
    },
  };
  vm.runInNewContext(
    readFileSync(
      new URL('../tools/flipbase-extension/vinted-local-background.js', import.meta.url),
      'utf8',
    ),
    {
      globalThis: { FlipbaseVintedLocal: fakeCore, FlipbaseVintedScheduler: fakeScheduler },
      chrome,
      Date,
      console,
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(creates, 1);
  assert.equal(alarm.periodInMinutes, 0.5);
  alarm = undefined;
  onStartup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(creates, 2);
  onAlarm({ name: 'flipbase-vinted-sync' });
  await pump('INBOX_BACKFILL', { ...scope, appOrigin });
  assert.equal(operations[0], 'alarm');
  assert.equal(operations[1].request.action, 'INBOX_SYNC');
  assert.equal(operations[1].request.mode, 'backfill');
  assert.equal(operations[1].request.automatic, true);
  assert.equal(operations[1].origin, appOrigin);
});

test('Scheduler and manual runtime cannot execute overlapping operations', async () => {
  const setup = await outboxHarness();
  let finish;
  setup.adapter.sendMessage = async () => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    return { outcome: { outcome: 'outcome_unknown', errorCode: 'reply_unconfirmed' } };
  };
  const sending = setup.runtime.run(request('MESSAGES_SEND', scope), appOrigin);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  const calls = [];
  const runner = scheduler.createScheduler({
    ...setup.adapter,
    run: async (action) => {
      calls.push(action);
    },
  });
  await runner.tick();
  assert.deepEqual(calls, []);
  await assert.rejects(setup.runtime.run(request('INBOX_SYNC', scope), appOrigin), /Vorgang/);
  finish();
  await sending;
});

test('A scoped pending finish is reported after grant expiry without heartbeat, claim or provider write', async () => {
  const setup = await outboxHarness();
  await setup.adapter.save({
    ...setup.saved,
    pendingFinish: {
      id: anotherId,
      claimToken: anotherId,
      outcome: 'sent',
      externalMessageId: '62',
    },
  });
  setup.setTime(Date.parse(expiresAt) + 1000);
  const calls = [];
  setup.adapter.edge = async (_binding, _secret, body) => {
    calls.push(body.action);
    assert.equal(body.action, 'message_finish');
    return { ok: true };
  };
  setup.adapter.sendMessage = async () => {
    throw new Error('No provider send during reporting');
  };
  const restarted = core.createRuntime(setup.adapter);
  await assert.rejects(
    restarted.run(request('MESSAGES_SEND', { ...scope, connectionId: anotherId }), appOrigin),
    /Browserprofil/,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(await restarted.run(request('MESSAGES_SEND', scope), appOrigin), {
    reported: true,
  });
  assert.deepEqual(calls, ['message_finish']);
  assert.equal(setup.saved.pendingFinish, undefined);
});

test('Scheduler reports persisted results despite expired grant and provider pause without an inbox read', async () => {
  let stored = {
    binding: { expiresAt: '2000-01-01T00:00:00Z' },
    pendingFinish: { outcome: 'outcome_unknown' },
    schedule: { pauseReason: 'session_blocked', retryAfter: 5_000_000 },
  };
  const calls = [];
  const runner = scheduler.createScheduler({
    load: async () => stored,
    save: async (next) => {
      stored = next;
    },
    now: () => 1_000_000,
    run: async (action) => {
      calls.push(action);
      return { reported: true };
    },
  });
  await runner.tick();
  await runner.tick();
  assert.deepEqual(calls, ['MESSAGES_SEND']);
  assert.equal(stored.schedule.pauseReason, 'session_blocked');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLocalExtensionHandler,
  hashLocalExtensionSecret,
  LocalExtensionStoreError,
} from './handler.ts';
import {
  parseLocalExtensionRequest,
  parseLocalExtensionApproval,
  parseLocalExtensionInboxState,
  parseLocalExtensionStatus,
} from '../_shared/marketplace-local-extension-contracts.ts';
import { parseLocalExtensionInboxSyncResult } from '../_shared/marketplace-local-extension-bridge-contracts.ts';
import type { LocalExtensionRequest } from '../_shared/marketplace-local-extension-contracts.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const connectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secret = 'ab'.repeat(32);
test('negotiation requests reach only their separate service and reject client commands or missing evidence', async () => {
  const received: LocalExtensionRequest[] = [];
  const handler = createLocalExtensionHandler({
    ingest: async () => assert.fail('wrong importer'),
    messageClaim: async () => assert.fail('wrong outbox'),
    negotiation: async (tokenHash, input) => {
      assert.equal(tokenHash, await hashLocalExtensionSecret(secret));
      received.push(input);
      return { ok: true };
    },
  });
  const scope = {
    workspaceId,
    connectionId,
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  };
  const payloads = [
    { action: 'negotiation_claim', workspaceId, connectionId },
    { action: 'negotiation_check', ...scope },
    { action: 'negotiation_start', ...scope },
    { action: 'negotiation_finish', ...scope, outcome: 'sent', externalId: '901' },
    {
      action: 'negotiation_finish',
      ...scope,
      outcome: 'outcome_unknown',
      errorCode: 'offer_unconfirmed',
    },
  ];
  for (const payload of payloads) assert.equal((await handler(request(payload))).status, 200);
  assert.deepEqual(received, payloads);
  for (const payload of [
    { action: 'negotiation_claim', workspaceId, connectionId, command: {} },
    { action: 'negotiation_start', ...scope, outcome: 'sent' },
    { action: 'negotiation_finish', ...scope, outcome: 'sent' },
    { action: 'negotiation_finish', ...scope, outcome: 'failed', externalId: '901' },
    { action: 'negotiation_check', ...scope, id: '901' },
  ])
    assert.equal((await handler(request(payload))).status, 400);
});
test('negotiation import fields strictly validate source account, event prices and unknown fields', () => {
  const offer = {
    offerId: '44',
    transactionId: '66',
    itemId: '42',
    buyerId: '73',
    sellerId: '9',
    originalPriceCents: 10000,
    offeredPriceCents: 8000,
    currency: 'EUR',
    status: 'pending',
  };
  const conversation = {
    kind: 'conversation',
    externalId: '77',
    sortAt: '2026-10-09T10:00:00Z',
    body: {
      title: 'Chat',
      text: null,
      occurredAt: '2026-10-09T10:00:00Z',
      sourceUpdatedAt: '2026-10-09T10:00:00Z',
      detailCheckedAt: null,
      unread: false,
      imageUrl: null,
    },
  };
  const message = {
    kind: 'message',
    externalId: '11',
    parentExternalId: '77',
    sortAt: '2026-10-09T10:00:00Z',
    body: {
      title: 'Angebot',
      text: null,
      occurredAt: '2026-10-09T10:00:00Z',
      direction: 'inbound',
      messageType: 'offer_request_message',
      priceLabel: null,
      negotiationOffer: offer,
    },
  };
  const batch = {
    identity: { id: '9' },
    observedAt: '2026-10-09T11:00:00Z',
    page: 1,
    nextPage: 1,
    conversationsComplete: true,
    entries: [conversation, message],
  };
  const payload = { action: 'inbox_import', workspaceId, connectionId, batch };
  assert.ok(parseLocalExtensionRequest(payload));
  for (const changes of [
    { sellerId: '8' },
    { offeredPriceCents: 10001 },
    { currency: 'USD' },
    { status: 'accepted' },
    { unexpected: true },
  ])
    assert.equal(
      parseLocalExtensionRequest({
        ...payload,
        batch: {
          ...batch,
          entries: [
            conversation,
            { ...message, body: { ...message.body, negotiationOffer: { ...offer, ...changes } } },
          ],
        },
      }),
      null,
    );
  const { negotiationOffer: _offer, ...body } = message.body;
  const event = { id: '99', type: 'purchased', transactionId: '66', confirmed: true };
  const eventPayload = (negotiationEvent: unknown) => ({
    ...payload,
    batch: {
      ...batch,
      entries: [conversation, { ...message, body: { ...body, negotiationEvent } }],
    },
  });
  assert.ok(parseLocalExtensionRequest(eventPayload(event)));
  assert.equal(parseLocalExtensionRequest(eventPayload({ ...event, priceCents: 9500 })), null);
  assert.equal(
    parseLocalExtensionRequest(
      eventPayload({
        ...event,
        originalPriceCents: 10000,
        priceCents: 9500,
        currency: 'EUR',
        unexpected: true,
      }),
    ),
    null,
  );
});
test('favorite actions reach only favorite persistence with the scoped secret hash', async () => {
  const received: LocalExtensionRequest[] = [];
  const handler = createLocalExtensionHandler({
    ingest: async () => assert.fail('favorite actions must not use the profile importer'),
    favorites: async (tokenHash, input) => {
      assert.equal(tokenHash, await hashLocalExtensionSecret(secret));
      received.push(input);
      return { ok: true };
    },
  });
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const claimToken = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const payloads = [
    { action: 'favorites_state', workspaceId, connectionId },
    { action: 'favorite_claim', workspaceId, connectionId },
    {
      action: 'favorites_import',
      workspaceId,
      connectionId,
      events: [{ externalId: id, actorId: '789', itemId: '456', eventAt: '2026-10-05T10:00:00Z' }],
    },
    { action: 'favorite_start', workspaceId, connectionId, id, claimToken },
    {
      action: 'favorite_finish',
      workspaceId,
      connectionId,
      id,
      claimToken,
      outcome: 'sent',
      externalMessageId: '888',
    },
  ];
  for (const payload of payloads) assert.equal((await handler(request(payload))).status, 200);
  assert.deepEqual(received, payloads);
});
test('favorite actions fail closed when favorite persistence is unavailable', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => assert.fail('must not fall through'),
  });
  const scope = {
    workspaceId,
    connectionId,
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  };
  for (const payload of [
    { action: 'favorite_claim', workspaceId, connectionId },
    { action: 'favorite_claim', workspaceId, connectionId, offerSupported: true },
    { ...scope, action: 'favorite_message_sent', externalMessageId: '888', conversationId: '777' },
    { ...scope, action: 'favorite_offer_start', originalPriceCents: 4000, offerPriceCents: 3500 },
    { ...scope, action: 'favorite_offer_finish', outcome: 'sent', externalOfferId: '999' },
  ])
    assert.equal((await handler(request(payload))).status, 503);
});
test('favorite offer actions preserve checkpoints, capabilities and cents at the persistence boundary', async () => {
  const received: LocalExtensionRequest[] = [];
  const handler = createLocalExtensionHandler({
    ingest: async () => assert.fail('offer actions must not use the profile importer'),
    favorites: async (tokenHash, input) => {
      assert.equal(tokenHash, await hashLocalExtensionSecret(secret));
      received.push(input);
      return { ok: true };
    },
  });
  const scope = {
    workspaceId,
    connectionId,
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  };
  const payloads = [
    { action: 'favorite_claim', workspaceId, connectionId, offerSupported: true },
    { action: 'favorite_claim', workspaceId, connectionId, offerSupported: false },
    {
      ...scope,
      action: 'favorite_message_sent',
      externalMessageId: '888',
      conversationId: '777',
      transactionId: '666',
    },
    {
      ...scope,
      action: 'favorite_message_sent',
      externalMessageId: '888',
      conversationId: '777',
      transactionId: null,
    },
    { ...scope, action: 'favorite_message_sent', externalMessageId: '888', conversationId: '777' },
    { ...scope, action: 'favorite_offer_start', originalPriceCents: 4000, offerPriceCents: 3500 },
    { ...scope, action: 'favorite_offer_finish', outcome: 'sent', externalOfferId: '999' },
    {
      ...scope,
      action: 'favorite_offer_finish',
      outcome: 'failed',
      errorCode: 'provider_rejected',
    },
    { ...scope, action: 'favorite_offer_finish', outcome: 'outcome_unknown', errorCode: 'timeout' },
    { ...scope, action: 'favorite_offer_finish', outcome: 'skipped', errorCode: 'inactive_item' },
  ];
  for (const payload of payloads) assert.equal((await handler(request(payload))).status, 200);
  assert.deepEqual(received, payloads);
});
test('favorite offer contracts reject secrets, missing receipts and invalid cent values before persistence', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => assert.fail('invalid offer reached importer'),
    favorites: async () => assert.fail('invalid offer reached persistence'),
  });
  const scope = {
    workspaceId,
    connectionId,
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  };
  const checkpoint = {
    ...scope,
    action: 'favorite_message_sent',
    externalMessageId: '888',
    conversationId: '777',
    transactionId: '666',
  };
  const start = {
    ...scope,
    action: 'favorite_offer_start',
    originalPriceCents: 4000,
    offerPriceCents: 3500,
  };
  const finish = {
    ...scope,
    action: 'favorite_offer_finish',
    outcome: 'sent',
    externalOfferId: '999',
  };
  for (const payload of [
    { action: 'favorite_claim', workspaceId, connectionId, offerSupported: 'true' },
    { action: 'favorite_claim', workspaceId, connectionId, offerSupported: null },
    { action: 'favorite_claim', workspaceId, connectionId, cookies: 'secret' },
    { ...checkpoint, externalMessageId: null },
    { ...checkpoint, conversationId: null },
    { ...checkpoint, transactionId: 'invalid' },
    { ...checkpoint, externalMessageId: '0' },
    { ...checkpoint, outcome: 'sent' },
    { ...checkpoint, cookies: 'secret' },
    { ...start, originalPriceCents: 0 },
    { ...start, originalPriceCents: 100_000_001 },
    { ...start, originalPriceCents: 1.5 },
    { ...start, originalPriceCents: '4000' },
    { ...start, offerPriceCents: -1 },
    { ...start, offerPriceCents: 100_000_001 },
    { ...start, offerPriceCents: 1.5 },
    { ...start, externalOfferId: '999' },
    { ...finish, externalOfferId: undefined },
    { ...finish, externalOfferId: '0' },
    { ...finish, externalOfferId: null },
    { ...finish, outcome: 'failed' },
    { ...finish, outcome: 'outcome_unknown' },
    { ...finish, outcome: 'skipped' },
    { ...finish, outcome: 'retry' },
    { ...finish, errorCode: 'secret=token' },
    { ...finish, externalMessageId: '888' },
    { ...finish, session: 'secret' },
  ])
    assert.equal((await handler(request(payload))).status, 400);
});
function request(body: unknown, token = secret) {
  return new Request('https://example.test/local', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function snapshot() {
  return {
    identity: { id: '123', username: 'seller' },
    observedAt: '2026-10-04T10:00:00Z',
    publicationsComplete: false,
    entries: [
      {
        kind: 'profile',
        externalId: '123',
        sortAt: '2026-10-04T10:00:00Z',
        body: { username: 'seller', feedbackCount: null },
      },
      {
        kind: 'publication',
        externalId: '456',
        sortAt: '2026-10-04T10:00:00Z',
        body: {
          title: 'Boots',
          price: 58,
          currency: 'EUR',
          metrics: { views: null, favorites: null, observedAt: null },
        },
      },
    ],
  };
}
test('heartbeat sends only the scoped secret hash to persistence', async () => {
  let received: { tokenHash: string; input: LocalExtensionRequest } | undefined;
  const handler = createLocalExtensionHandler({
    ingest: async (tokenHash, input) => {
      received = { tokenHash, input };
      return { ok: true, externalAccountId: '123', expiresAt: '2026-10-05T10:00:00Z' };
    },
  });
  const response = await handler(request({ action: 'heartbeat', workspaceId, connectionId }));
  assert.equal(response.status, 200);
  assert.equal(received?.tokenHash, await hashLocalExtensionSecret(secret));
  assert.notEqual(received?.tokenHash, secret);
  assert.deepEqual(received?.input, { action: 'heartbeat', workspaceId, connectionId });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('imports preserve the complete flag and normalized public entries', async () => {
  let imported: LocalExtensionRequest | undefined;
  const handler = createLocalExtensionHandler({
    ingest: async (_hash, input) => {
      imported = input;
      return { ok: true };
    },
  });
  assert.equal(
    (await handler(request({ action: 'import', workspaceId, connectionId, snapshot: snapshot() })))
      .status,
    200,
  );
  assert.equal(imported?.action, 'import');
  if (imported?.action === 'import') assert.deepEqual(imported.snapshot, snapshot());
});
test('invalid secrets are rejected before persistence', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('must not persist');
    },
  });
  for (const token of ['', secret.toUpperCase(), 'supabase-user-jwt', secret.slice(1)])
    assert.equal(
      (await handler(request({ action: 'heartbeat', workspaceId, connectionId }, token))).status,
      401,
    );
});
test('writes, foreign payload fields and malformed account scopes are rejected', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('must not persist');
    },
  });
  for (const payload of [
    { action: 'send', workspaceId, connectionId },
    { action: 'heartbeat', workspaceId, connectionId, userId: 'spoof' },
    { action: 'heartbeat', workspaceId: 'bad', connectionId },
  ])
    assert.equal((await handler(request(payload))).status, 400);
});
test('account switching, duplicate entries and secret-bearing body fields never reach the store', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('must not persist');
    },
  });
  const variants = [
    { ...snapshot(), identity: { id: '999', username: 'seller' } },
    { ...snapshot(), entries: [...snapshot().entries, snapshot().entries[1]] },
    {
      ...snapshot(),
      entries: [{ ...snapshot().entries[0], body: { username: 'seller', cookies: 'private' } }],
    },
    { ...snapshot(), entries: [{ ...snapshot().entries[0], kind: 'message' }] },
    {
      ...snapshot(),
      entries: [
        { ...snapshot().entries[0], body: { username: 'seller', imageUrl: 'javascript:alert(1)' } },
      ],
    },
  ];
  for (const payload of variants)
    assert.equal(
      (await handler(request({ action: 'import', workspaceId, connectionId, snapshot: payload })))
        .status,
      400,
    );
});
test('oversized streamed payloads are bounded without content-length trust', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('must not persist');
    },
  });
  assert.equal(
    (
      await handler(
        request({
          action: 'import',
          workspaceId,
          connectionId,
          snapshot: { ...snapshot(), padding: 'x'.repeat(524288) },
        }),
      )
    ).status,
    400,
  );
});
test('revocation and expiry returned by persistence are unauthorized and leak no details', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      throw new LocalExtensionStoreError('access');
    },
  });
  const response = await handler(request({ action: 'heartbeat', workspaceId, connectionId }));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'unauthorized' });
});
test('database failures do not leak exception details', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      throw new Error('private-cookie');
    },
  });
  const response = await handler(request({ action: 'heartbeat', workspaceId, connectionId }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'unavailable' });
});
function inboxBatch() {
  return {
    identity: { id: '123' },
    observedAt: '2026-10-04T10:00:00Z',
    page: 1,
    nextPage: 2,
    conversationsComplete: false,
    entries: [
      {
        kind: 'conversation',
        externalId: '456',
        sortAt: '2026-10-04T09:00:00Z',
        body: {
          title: 'Buyer',
          text: 'Hello',
          occurredAt: '2026-10-04T09:00:00Z',
          sourceUpdatedAt: '2026-10-04T09:00:00Z',
          detailCheckedAt: '2026-10-04T10:00:00Z',
          unread: false,
          imageUrl: null,
        },
      },
      {
        kind: 'message',
        externalId: '789',
        parentExternalId: '456',
        sortAt: '2026-10-04T09:00:00Z',
        body: {
          title: 'Message',
          text: 'Hello',
          occurredAt: '2026-10-04T09:00:00Z',
          direction: 'inbound',
          messageType: 'text',
          priceLabel: null,
        },
      },
    ],
  };
}
test('inbox actions route to their own store methods with hashed secret', async () => {
  const calls: string[] = [];
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('profile import must not handle inbox');
    },
    inboxState: async (hash, input) => {
      assert.equal(hash, await hashLocalExtensionSecret(secret));
      calls.push(input.action);
      return { ok: true };
    },
    inboxImport: async (hash, input) => {
      assert.equal(hash, await hashLocalExtensionSecret(secret));
      calls.push(input.action);
      return { ok: true };
    },
  });
  assert.equal(
    (await handler(request({ action: 'inbox_state', workspaceId, connectionId }))).status,
    200,
  );
  assert.equal(
    (
      await handler(
        request({ action: 'inbox_import', workspaceId, connectionId, batch: inboxBatch() }),
      )
    ).status,
    200,
  );
  assert.deepEqual(calls, ['inbox_state', 'inbox_import']);
});
test('inbox parser refuses credentials, missing parents, duplicate ids and oversized batches', async () => {
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('must not persist');
    },
    inboxImport: async () => {
      assert.fail('must not persist');
    },
  });
  const batch = inboxBatch();
  const invalid = [
    {
      ...batch,
      entries: [{ ...batch.entries[0], body: { ...batch.entries[0].body, cookies: 'secret' } }],
    },
    { ...batch, entries: [batch.entries[1]] },
    { ...batch, entries: [batch.entries[0], batch.entries[0]] },
    {
      ...batch,
      entries: [
        batch.entries[0],
        ...Array(201)
          .fill(batch.entries[1])
          .map((entry, index) => ({ ...entry, externalId: String(index + 1) })),
      ],
    },
    {
      ...batch,
      identity: { id: '999' },
      entries: [{ ...batch.entries[0], body: { ...batch.entries[0].body, accessToken: 'secret' } }],
    },
  ];
  for (const badBatch of invalid)
    assert.equal(
      (
        await handler(
          request({ action: 'inbox_import', workspaceId, connectionId, batch: badBatch }),
        )
      ).status,
      400,
    );
});
test('binding and approval accept legacy absence but reject malformed inbox permission', () => {
  const scope = { workspaceId, connectionId };
  const approval = { ...scope, externalAccountId: '123', expiresAt: '2026-10-05T10:00:00Z' };
  const status = {
    binding: {
      externalAccountId: '123',
      expiresAt: approval.expiresAt,
      lastSeenAt: null,
      revoked: false,
    },
  };
  assert.ok(parseLocalExtensionApproval(approval, scope));
  assert.ok(parseLocalExtensionStatus(status));
  assert.equal(parseLocalExtensionApproval({ ...approval, messagesRead: 'true' }, scope), null);
  assert.equal(
    parseLocalExtensionStatus({ binding: { ...status.binding, messagesRead: 'true' } }),
    null,
  );
});
test('inbox state and sync result enforce scoped identity and bounded versions', () => {
  const scope = { workspaceId, connectionId };
  const result = {
    ...scope,
    externalAccountId: '123',
    expiresAt: '2026-10-05T10:00:00Z',
    observedAt: '2026-10-04T10:00:00Z',
    counts: { conversation: 1, message: 1 },
    conversationsComplete: false,
    nextPage: 2,
  };
  const state = {
    ok: true,
    externalAccountId: '123',
    expiresAt: result.expiresAt,
    messagesRead: true,
    nextPage: 2,
    versions: [
      {
        externalId: '456',
        sourceUpdatedAt: result.observedAt,
        detailCheckedAt: null,
        text: 'Hello',
        occurredAt: result.observedAt,
      },
    ],
  };
  assert.ok(parseLocalExtensionInboxSyncResult(result, scope, '123'));
  assert.ok(parseLocalExtensionInboxState(state));
  assert.equal(
    parseLocalExtensionInboxSyncResult({ ...result, externalAccountId: '999' }, scope, '123'),
    null,
  );
  assert.equal(
    parseLocalExtensionInboxSyncResult(
      { ...result, counts: { conversation: 21, message: 1 } },
      scope,
      '123',
    ),
    null,
  );
  assert.equal(
    parseLocalExtensionInboxState({ ...state, versions: Array(401).fill(state.versions[0]) }),
    null,
  );
  assert.equal(
    parseLocalExtensionInboxState({
      ...state,
      versions: [{ ...state.versions[0], cookies: 'secret' }],
    }),
    null,
  );
});
test('message actions route only valid scoped commands to the store', async () => {
  const calls: string[] = [];
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('message command reached ingest');
    },
    messageClaim: async () => {
      calls.push('claim');
      return { ok: true, command: null };
    },
    messageStart: async () => {
      calls.push('start');
      return { ok: true };
    },
    messageFinish: async () => {
      calls.push('finish');
      return { ok: true };
    },
  });
  for (const body of [
    { action: 'message_claim', workspaceId, connectionId },
    {
      action: 'message_start',
      workspaceId,
      connectionId,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      outcome: 'sent',
      externalMessageId: '123',
    },
  ])
    assert.equal((await handler(request(body))).status, 200);
  assert.deepEqual(calls, ['claim', 'start', 'finish']);
  assert.equal(
    (
      await handler(
        request({
          action: 'message_finish',
          workspaceId,
          connectionId,
          id: 'x',
          claimToken: 'x',
          outcome: 'sent',
        }),
      )
    ).status,
    400,
  );
});
test('detail actions keep the database conversation scope and hash without reaching ingest', async () => {
  const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const calls: LocalExtensionRequest[] = [];
  const persist = async (tokenHash: string, input: LocalExtensionRequest) => {
    assert.equal(tokenHash, await hashLocalExtensionSecret(secret));
    calls.push(input);
    return { ok: true };
  };
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('detail action reached profile persistence');
    },
    inboxDetailState: persist,
    inboxDetailImport: persist,
  });
  const state = { action: 'inbox_detail_state', workspaceId, connectionId, conversationId };
  const imported = {
    action: 'inbox_detail_import',
    workspaceId,
    connectionId,
    conversationId,
    batch: inboxBatch(),
  };
  assert.equal((await handler(request(state))).status, 200);
  assert.equal((await handler(request(imported))).status, 200);
  assert.deepEqual(calls, [state, imported]);
});
test('latest and backfill modes reach only inbox persistence unchanged', async () => {
  const calls: LocalExtensionRequest[] = [];
  const persist = async (_tokenHash: string, input: LocalExtensionRequest) => {
    calls.push(input);
    return { ok: true };
  };
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('inbox mode reached profile persistence');
    },
    inboxState: persist,
    inboxImport: persist,
  });
  for (const mode of ['latest', 'backfill']) {
    const state = { action: 'inbox_state', workspaceId, connectionId, mode };
    const imported = {
      action: 'inbox_import',
      workspaceId,
      connectionId,
      mode,
      batch: inboxBatch(),
    };
    assert.equal((await handler(request(state))).status, 200);
    assert.equal((await handler(request(imported))).status, 200);
    assert.deepEqual(calls.slice(-2), [state, imported]);
  }
});
test('missing optional action handlers return unavailable and never fall through to ingest', async () => {
  const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const claimToken = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const handler = createLocalExtensionHandler({
    ingest: async () => {
      assert.fail('unsupported action reached profile persistence');
    },
  });
  for (const body of [
    { action: 'inbox_state', workspaceId, connectionId },
    { action: 'inbox_import', workspaceId, connectionId, batch: inboxBatch() },
    { action: 'inbox_detail_state', workspaceId, connectionId, conversationId },
    {
      action: 'inbox_detail_import',
      workspaceId,
      connectionId,
      conversationId,
      batch: inboxBatch(),
    },
    { action: 'message_claim', workspaceId, connectionId },
    { action: 'message_start', workspaceId, connectionId, id: conversationId, claimToken },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'outcome_unknown',
      errorCode: 'timeout',
    },
  ]) {
    const response = await handler(request(body));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'unavailable' });
  }
});
test('malformed details, modes, message outcomes and secret-bearing commands never persist', async () => {
  const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const claimToken = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const persist = async () => {
    assert.fail('malformed action reached persistence');
  };
  const handler = createLocalExtensionHandler({
    ingest: persist,
    inboxState: persist,
    inboxImport: persist,
    inboxDetailState: persist,
    inboxDetailImport: persist,
    messageClaim: persist,
    messageStart: persist,
    messageFinish: persist,
  });
  for (const body of [
    { action: 'inbox_state', workspaceId, connectionId, mode: 'detail' },
    {
      action: 'inbox_import',
      workspaceId,
      connectionId,
      mode: 'latest',
      batch: { ...inboxBatch(), cookies: 'secret' },
    },
    { action: 'inbox_detail_state', workspaceId, connectionId, conversationId: '123' },
    {
      action: 'inbox_detail_import',
      workspaceId,
      connectionId,
      conversationId,
      batch: { ...inboxBatch(), identity: { id: '123', username: 'seller' } },
    },
    { action: 'message_claim', workspaceId, connectionId, session: 'secret' },
    {
      action: 'message_start',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'sent',
    },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'sent',
    },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'retry',
    },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'failed',
      externalMessageId: '123',
    },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'outcome_unknown',
      externalMessageId: '123',
    },
    {
      action: 'message_finish',
      workspaceId,
      connectionId,
      id: conversationId,
      claimToken,
      outcome: 'failed',
      errorCode: 'secret token=abc',
    },
    { action: 'unknown', workspaceId, connectionId },
  ])
    assert.equal((await handler(request(body))).status, 400);
});
test('message persistence failures expose only defined errors without database details', async () => {
  for (const [error, status, code] of [
    [new LocalExtensionStoreError('access'), 401, 'unauthorized'],
    [new LocalExtensionStoreError('invalid'), 400, 'invalid_request'],
    [new LocalExtensionStoreError('conflict'), 409, 'conflict'],
    [new Error('Database password=private'), 503, 'unavailable'],
  ] as const) {
    const handler = createLocalExtensionHandler({
      ingest: async () => {
        assert.fail('message failure reached profile persistence');
      },
      messageClaim: async () => {
        throw error;
      },
    });
    const response = await handler(request({ action: 'message_claim', workspaceId, connectionId }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: code });
  }
});
test(
  'edge index maps each action to its scoped RPC and separates latest from backfill',
  { skip: typeof Deno === 'undefined' },
  async () => {
    const originalServe = Deno.serve;
    const originalFetch = globalThis.fetch;
    const originalUrl = Deno.env.get('SUPABASE_URL');
    const originalKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const calls: { name: string; parameters: Record<string, unknown> }[] = [];
    Deno.serve = ((serveHandler: (request: Request) => Promise<Response>) => {
      handler = serveHandler;
    }) as typeof Deno.serve;
    Deno.env.set('SUPABASE_URL', 'https://database.example.test');
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'local-test-key');
    globalThis.fetch = async (input, init) => {
      const address = input instanceof Request ? input.url : String(input);
      assert.equal(new URL(address).hostname, 'database.example.test');
      assert.equal(typeof init?.body, 'string');
      const name = new URL(address).pathname.split('/').at(-1) ?? '';
      calls.push({ name, parameters: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return Response.json({
        ok: true,
        externalAccountId: '123',
        expiresAt: '2026-10-06T10:00:00Z',
        messagesRead: true,
        nextPage: 4,
        versions: [],
        command: null,
      });
    };
    try {
      await import('./index.ts');
      assert.ok(handler);
      const tokenHash = await hashLocalExtensionSecret(secret);
      const scopeParameters = {
        p_workspace_id: workspaceId,
        p_connection_id: connectionId,
        p_token_hash: tokenHash,
      };
      const conversationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const claimToken = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
      for (const mode of ['latest', 'backfill'] as const) {
        const response = await handler(
          request({ action: 'inbox_state', workspaceId, connectionId, mode }),
        );
        assert.equal(response.status, 200);
        assert.equal((await response.json()).nextPage, 4);
        assert.deepEqual(calls.at(-1), {
          name: 'marketplace_local_inbox_state',
          parameters: scopeParameters,
        });
        assert.equal(
          (
            await handler(
              request({
                action: 'inbox_import',
                workspaceId,
                connectionId,
                mode,
                batch: inboxBatch(),
              }),
            )
          ).status,
          200,
        );
        assert.deepEqual(calls.at(-1), {
          name: 'marketplace_import_local_inbox',
          parameters: { ...scopeParameters, p_batch: { ...inboxBatch(), mode } },
        });
      }
      assert.equal(
        (
          await handler(
            request({ action: 'inbox_import', workspaceId, connectionId, batch: inboxBatch() }),
          )
        ).status,
        200,
      );
      assert.deepEqual(calls.at(-1), {
        name: 'marketplace_import_local_inbox',
        parameters: { ...scopeParameters, p_batch: { ...inboxBatch(), mode: 'backfill' } },
      });
      for (const [body, name, parameters] of [
        [
          { action: 'negotiation_claim', workspaceId, connectionId },
          'marketplace_local_negotiation_claim',
          scopeParameters,
        ],
        [
          {
            action: 'negotiation_check',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
          },
          'marketplace_local_negotiation_check',
          { ...scopeParameters, p_job_id: conversationId, p_claim_token: claimToken },
        ],
        [
          {
            action: 'negotiation_start',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
          },
          'marketplace_local_negotiation_begin',
          { ...scopeParameters, p_job_id: conversationId, p_claim_token: claimToken },
        ],
        [
          {
            action: 'negotiation_finish',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            outcome: 'sent',
            externalId: '901',
          },
          'marketplace_local_negotiation_finish',
          {
            ...scopeParameters,
            p_job_id: conversationId,
            p_claim_token: claimToken,
            p_outcome: 'sent',
            p_external_id: '901',
            p_error_code: null,
          },
        ],
        [
          { action: 'favorites_state', workspaceId, connectionId },
          'marketplace_local_favorites_state',
          scopeParameters,
        ],
        [
          { action: 'favorites_import', workspaceId, connectionId, events: [] },
          'marketplace_import_local_favorites',
          { ...scopeParameters, p_events: [] },
        ],
        [
          { action: 'favorite_claim', workspaceId, connectionId },
          'marketplace_local_favorite_claim',
          { ...scopeParameters, p_offer_supported: false },
        ],
        [
          { action: 'favorite_claim', workspaceId, connectionId, offerSupported: true },
          'marketplace_local_favorite_claim',
          { ...scopeParameters, p_offer_supported: true },
        ],
        [
          {
            action: 'favorite_message_sent',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            externalMessageId: '888',
            conversationId: '777',
            transactionId: '666',
          },
          'marketplace_local_favorite_message_sent',
          {
            ...scopeParameters,
            p_event_id: conversationId,
            p_claim_token: claimToken,
            p_external_message_id: '888',
            p_conversation_id: '777',
            p_transaction_id: '666',
          },
        ],
        [
          {
            action: 'favorite_message_sent',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            externalMessageId: '888',
            conversationId: '777',
          },
          'marketplace_local_favorite_message_sent',
          {
            ...scopeParameters,
            p_event_id: conversationId,
            p_claim_token: claimToken,
            p_external_message_id: '888',
            p_conversation_id: '777',
            p_transaction_id: null,
          },
        ],
        [
          {
            action: 'favorite_offer_start',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            originalPriceCents: 4000,
            offerPriceCents: 3500,
          },
          'marketplace_local_favorite_offer_start',
          {
            ...scopeParameters,
            p_event_id: conversationId,
            p_claim_token: claimToken,
            p_original_price_cents: 4000,
            p_offer_price_cents: 3500,
          },
        ],
        [
          {
            action: 'favorite_offer_finish',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            outcome: 'sent',
            externalOfferId: '999',
          },
          'marketplace_local_favorite_offer_finish',
          {
            ...scopeParameters,
            p_event_id: conversationId,
            p_claim_token: claimToken,
            p_outcome: 'sent',
            p_external_offer_id: '999',
            p_error_code: null,
          },
        ],
        [
          {
            action: 'favorite_offer_finish',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            outcome: 'skipped',
            errorCode: 'inactive_item',
          },
          'marketplace_local_favorite_offer_finish',
          {
            ...scopeParameters,
            p_event_id: conversationId,
            p_claim_token: claimToken,
            p_outcome: 'skipped',
            p_external_offer_id: null,
            p_error_code: 'inactive_item',
          },
        ],
        [
          { action: 'favorite_start', workspaceId, connectionId, id: conversationId, claimToken },
          'marketplace_local_favorite_start',
          { ...scopeParameters, p_event_id: conversationId, p_claim_token: claimToken },
        ],
        [
          {
            action: 'favorite_finish',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            outcome: 'sent',
            externalMessageId: '888',
          },
          'marketplace_local_favorite_finish',
          {
            ...scopeParameters,
            p_event_id: conversationId,
            p_claim_token: claimToken,
            p_outcome: 'sent',
            p_external_message_id: '888',
            p_error_code: null,
          },
        ],
        [
          { action: 'inbox_detail_state', workspaceId, connectionId, conversationId },
          'marketplace_local_inbox_detail_state',
          { ...scopeParameters, p_conversation_id: conversationId },
        ],
        [
          {
            action: 'inbox_detail_import',
            workspaceId,
            connectionId,
            conversationId,
            batch: inboxBatch(),
          },
          'marketplace_local_inbox_detail_import',
          { ...scopeParameters, p_conversation_id: conversationId, p_batch: inboxBatch() },
        ],
        [
          { action: 'message_claim', workspaceId, connectionId },
          'marketplace_local_message_claim',
          scopeParameters,
        ],
        [
          { action: 'listing_claim', workspaceId, connectionId },
          'marketplace_local_listing_claim',
          scopeParameters,
        ],
        [
          {
            action: 'listing_check',
            workspaceId,
            connectionId,
            jobId: '9007199254740999',
            claimToken,
          },
          'marketplace_local_listing_check',
          { ...scopeParameters, p_job_id: '9007199254740999', p_claim_token: claimToken },
        ],
        [
          {
            action: 'listing_begin',
            workspaceId,
            connectionId,
            jobId: '9007199254740999',
            claimToken,
          },
          'marketplace_local_listing_begin',
          { ...scopeParameters, p_job_id: '9007199254740999', p_claim_token: claimToken },
        ],
        [
          {
            action: 'listing_finish',
            workspaceId,
            connectionId,
            jobId: '9007199254740999',
            claimToken,
            result: { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' },
          },
          'marketplace_local_listing_finish',
          {
            ...scopeParameters,
            p_job_id: '9007199254740999',
            p_claim_token: claimToken,
            p_result: { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' },
          },
        ],
        [
          { action: 'message_start', workspaceId, connectionId, id: conversationId, claimToken },
          'marketplace_local_message_start',
          { ...scopeParameters, p_message_id: conversationId, p_claim_token: claimToken },
        ],
        [
          {
            action: 'message_finish',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            outcome: 'sent',
            externalMessageId: '123',
          },
          'marketplace_local_message_finish',
          {
            ...scopeParameters,
            p_message_id: conversationId,
            p_claim_token: claimToken,
            p_outcome: 'sent',
            p_external_message_id: '123',
            p_error_code: null,
          },
        ],
        [
          {
            action: 'message_finish',
            workspaceId,
            connectionId,
            id: conversationId,
            claimToken,
            outcome: 'outcome_unknown',
            errorCode: 'timeout',
          },
          'marketplace_local_message_finish',
          {
            ...scopeParameters,
            p_message_id: conversationId,
            p_claim_token: claimToken,
            p_outcome: 'outcome_unknown',
            p_external_message_id: null,
            p_error_code: 'timeout',
          },
        ],
        [
          { action: 'heartbeat', workspaceId, connectionId },
          'marketplace_ingest_local_extension',
          { ...scopeParameters, p_snapshot: null },
        ],
        [
          { action: 'import', workspaceId, connectionId, snapshot: snapshot() },
          'marketplace_ingest_local_extension',
          { ...scopeParameters, p_snapshot: snapshot() },
        ],
      ] as const) {
        assert.equal((await handler(request(body))).status, 200);
        assert.deepEqual(calls.at(-1), { name, parameters });
      }
      for (const [code, status, error] of [
        ['40001', 409, 'conflict'],
        ['23505', 409, 'conflict'],
        ['42501', 401, 'unauthorized'],
        ['22023', 400, 'invalid_request'],
        ['XX000', 503, 'unavailable'],
      ] as const) {
        globalThis.fetch = async () =>
          Response.json({ code, message: 'private provider or database details' }, { status: 400 });
        const response = await handler(
          request({
            action: 'listing_check',
            workspaceId,
            connectionId,
            jobId: '9007199254740999',
            claimToken,
          }),
        );
        assert.equal(response.status, status);
        assert.deepEqual(await response.json(), { error });
      }
    } finally {
      Deno.serve = originalServe;
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) Deno.env.delete('SUPABASE_URL');
      else Deno.env.set('SUPABASE_URL', originalUrl);
      if (originalKey === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
      else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', originalKey);
    }
  },
);

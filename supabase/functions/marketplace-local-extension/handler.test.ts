import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLocalExtensionHandler,
  hashLocalExtensionSecret,
  LocalExtensionStoreError,
} from './handler.ts';
import {
  parseLocalExtensionApproval,
  parseLocalExtensionInboxState,
  parseLocalExtensionStatus,
} from '../_shared/marketplace-local-extension-contracts.ts';
import { parseLocalExtensionInboxSyncResult } from '../_shared/marketplace-local-extension-bridge-contracts.ts';
import type { LocalExtensionRequest } from '../_shared/marketplace-local-extension-contracts.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const connectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secret = 'ab'.repeat(32);
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

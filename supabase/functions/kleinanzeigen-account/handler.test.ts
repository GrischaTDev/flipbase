import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKleinanzeigenAccountHandler, KleinanzeigenAccountError } from './handler.ts';
const workspaceId = '49000000-0000-4000-8000-000000000011';
const input = {
  action: 'connect',
  workspaceId,
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  installationId: '49000000-0000-4000-8000-000000000031',
  tokenHash: 'a'.repeat(64),
  canPublish: false,
};
const binding = {
  workspaceId,
  connectionId: '9007199254740993',
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  status: 'needs_login',
  generation: 1,
  expiresAt: '2026-10-17T06:00:00Z',
  canPublish: false,
};
const bearer = 'Bearer valid.jwt.user-token';
function request(body: unknown = input, headers: Record<string, string> = {}) {
  return new Request('https://api.flipbase.de/functions/v1/kleinanzeigen-account', {
    method: 'POST',
    headers: {
      authorization: bearer,
      'content-type': 'application/json',
      origin: 'https://app.flipbase.de',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function store(reply: unknown = binding) {
  return { authenticate: async () => true, execute: async () => reply };
}
test('uses the authenticated user context and returns only the exact public account binding', async () => {
  let used = false;
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async (token) => {
      assert.equal(token, bearer);
      return true;
    },
    execute: async (token, parsed) => {
      assert.equal(token, bearer);
      assert.deepEqual(parsed, input);
      used = true;
      return binding;
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), binding);
  assert.equal(used, true);
});
test('rejects invalid authentication before executing user operations', async () => {
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => false,
    execute: async () => assert.fail('no database write'),
  });
  assert.equal((await handler(request())).status, 401);
});
for (const body of [
  { ...input, workspaceId: 'other' },
  { ...input, secret: 'private' },
  { ...input, canPublish: 'true' },
  { ...input, action: 'publish' },
  { action: 'disconnect', workspaceId, connectionId: 9007199254740992 },
  { action: 'disconnect', workspaceId, connectionId: '9223372036854775808' },
])
  test('rejects malformed user request ' + JSON.stringify(body), async () => {
    const handler = createKleinanzeigenAccountHandler({
      authenticate: async () => assert.fail('no user lookup'),
      execute: async () => assert.fail('no database write'),
    });
    assert.equal((await handler(request(body))).status, 400);
  });
test('blocks foreign origins and extension-installation secrets', async () => {
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => assert.fail('no user lookup'),
    execute: async () => assert.fail('no database write'),
  });
  assert.equal((await handler(request(input, { origin: 'https://evil.example' }))).status, 403);
  assert.equal(
    (await handler(request(input, { authorization: 'Bearer ' + 'a'.repeat(64) }))).status,
    401,
  );
});
test('does not expose changed scopes, changed identity, excess permissions or hidden fields', async () => {
  for (const reply of [
    { ...binding, workspaceId: '49000000-0000-4000-8000-000000000012' },
    { ...binding, externalAccountId: '124' },
    { ...binding, canPublish: true },
    { ...binding, tokenHash: input.tokenHash },
  ]) {
    const response = await createKleinanzeigenAccountHandler(store(reply))(request());
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes(input.tokenHash), false);
  }
});
test('passes huge disconnect IDs without number conversion and requires an exact acknowledgement', async () => {
  const body = { action: 'disconnect', workspaceId, connectionId: '9007199254740993' };
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => true,
    execute: async (_token, parsed) => {
      assert.deepEqual(parsed, body);
      return { ok: true };
    },
  });
  assert.equal((await handler(request(body))).status, 200);
  assert.equal(
    (await createKleinanzeigenAccountHandler(store({ ok: true, secret: 'private' }))(request(body)))
      .status,
    502,
  );
});
test('sanitizes database errors without exposing bearer or server details', async () => {
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => true,
    execute: async () => {
      throw new Error('private ' + bearer);
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'unavailable' });
});
test('maps revoked rights and concurrent profile bindings distinctly', async () => {
  for (const [code, status] of [
    ['forbidden', 403],
    ['conflict', 409],
  ] as const) {
    const handler = createKleinanzeigenAccountHandler({
      authenticate: async () => true,
      execute: async () => {
        throw new KleinanzeigenAccountError(code);
      },
    });
    assert.equal((await handler(request())).status, status);
  }
});
test('bounds streaming bodies before database or auth access', async () => {
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => assert.fail('no user lookup'),
    execute: async () => assert.fail('no database write'),
  });
  const oversized = new Request('https://api.flipbase.de', {
    method: 'POST',
    headers: { authorization: bearer, 'content-type': 'application/json' },
    body: ' '.repeat(65537),
  });
  assert.equal((await handler(oversized)).status, 400);
});

test('requests a read using user rights and returns only the scoped server run', async () => {
  const body = { action: 'request_sync', workspaceId, connectionId: '9007199254740993' };
  const run = {
    workspaceId,
    connectionId: body.connectionId,
    runId: '9007199254740995',
    generation: 1,
    state: 'queued',
  };
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => true,
    execute: async (_bearer, input) => {
      assert.deepEqual(input, body);
      return run;
    },
  });
  assert.equal((await handler(request(body))).status, 200);
  for (const reply of [
    { ...run, workspaceId: 'other' },
    { ...run, connectionId: '2' },
    { ...run, claimToken: 'private' },
  ])
    assert.equal(
      (await createKleinanzeigenAccountHandler(store(reply))(request(body))).status,
      502,
    );
});

test('reads scoped account previews without trusting a client permission flag', async () => {
  const body = { action: 'read_accounts', workspaceId };
  const reply = { workspaceId, canManage: false, accounts: [] };
  assert.equal((await createKleinanzeigenAccountHandler(store(reply))(request(body))).status, 200);
  assert.equal(
    (
      await createKleinanzeigenAccountHandler(store({ ...reply, workspaceId: 'other' }))(
        request(body),
      )
    ).status,
    502,
  );
  assert.equal(
    (await createKleinanzeigenAccountHandler(store(reply))(request({ ...body, canManage: true })))
      .status,
    400,
  );
});
test('reads filtered publication pages only through the requested account scope', async () => {
  const body = {
    action: 'read_publications',
    workspaceId,
    connectionId: '9007199254740993',
    limit: 25,
    state: 'all',
    search: '',
    afterId: null,
    snapshotAt: null,
  };
  const reply = {
    workspaceId,
    connectionId: body.connectionId,
    items: [],
    snapshotAt: null,
    total: null,
    nextId: null,
    completeness: 'unknown',
  };
  const handler = createKleinanzeigenAccountHandler({
    authenticate: async () => true,
    execute: async (_bearer, input) => {
      assert.deepEqual(input, body);
      return reply;
    },
  });
  assert.equal((await handler(request(body))).status, 200);
  assert.equal(
    (await createKleinanzeigenAccountHandler(store({ ...reply, connectionId: '2' }))(request(body)))
      .status,
    502,
  );
  for (const change of [
    { limit: 0 },
    { afterId: 12 },
    { afterId: '12', snapshotAt: null },
    { state: 'sold' },
  ])
    assert.equal((await handler(request({ ...body, ...change }))).status, 400);
});

test('Transferquelle bleibt hinter echter Nutzerprüfung und geschlossenem Antwortvertrag', async () => {
  const source = {
    platform: 'vinted',
    workspaceId,
    connectionId: '49000000-0000-4000-8000-000000000021',
    externalId: '123',
  };
  const input = {
    action: 'prepare_transfer',
    workspaceId,
    targetConnectionId: '9007199254740993',
    source,
    requestId: '49000000-0000-4000-8000-000000000041',
  };
  let called = 0;
  const reply = {
    state: 'needs_source',
    workspaceId,
    targetConnectionId: input.targetConnectionId,
    connectionId: source.connectionId,
    entryId: '49000000-0000-4000-8000-000000000031',
    externalId: '123',
    externalAccountId: '99',
    executionMode: 'cloud',
  };
  const handler = createKleinanzeigenAccountHandler({
    ...store(),
    executeTransfer: async () => {
      called++;
      return reply;
    },
  });
  assert.equal((await handler(request(input))).status, 200);
  assert.equal(called, 1);
  assert.equal(
    (await handler(request({ ...input, source: { ...source, platform: 'ebay' } }))).status,
    400,
  );
  assert.equal(called, 1);
  const denied = createKleinanzeigenAccountHandler({
    ...store(),
    authenticate: async () => false,
    executeTransfer: async () => {
      called++;
      return reply;
    },
  });
  assert.equal((await denied(request(input))).status, 401);
  assert.equal(called, 1);
  const leaking = createKleinanzeigenAccountHandler({
    ...store(),
    executeTransfer: async () => ({ ...reply, secret: 'private' }),
  });
  assert.equal((await leaking(request(input))).status, 502);
});

test('a renewed binding returns the currently confirmed contact name and rejects the stale one', async () => {
  const renamed = { ...input, displayName: 'Neuer Kontaktname' };
  const updated = { ...binding, displayName: renamed.displayName, generation: 3 };
  const good = await createKleinanzeigenAccountHandler(store(updated))(request(renamed));
  assert.equal(good.status, 200);
  assert.equal((await good.json()).displayName, renamed.displayName);
  assert.equal(
    (await createKleinanzeigenAccountHandler(store(binding))(request(renamed))).status,
    502,
  );
});

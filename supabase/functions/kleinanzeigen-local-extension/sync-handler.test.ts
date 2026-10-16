import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKleinanzeigenExtensionHandler } from './handler.ts';
const scope = {
  workspaceId: '49000000-0000-4000-8000-000000000011',
  connectionId: '9007199254740993',
  generation: 1,
  runId: '9007199254740995',
};
const secret = 'ab'.repeat(32);
const claim = 'cd'.repeat(32);
const page = {
  action: 'sync_page',
  ...scope,
  claimToken: claim,
  externalAccountId: '123',
  pageCursor: 'page:1',
  nextCursor: null,
  items: [
    {
      externalId: '101',
      title: 'Testanzeige',
      url: 'https://www.kleinanzeigen.de/s-anzeige/test/101-160-1',
      publishedAt: null,
      state: 'active',
    },
  ],
};
function request(body: unknown) {
  return new Request('https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const pageReply = { ...scope, acceptedCursor: 'page:1', nextCursor: null, complete: true };
test('installation sync pages keep exact account and run identifiers and use only the hashed installation secret', async () => {
  let used = false;
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('not heartbeat'),
    sync: async (hash, input) => {
      assert.notEqual(hash, secret);
      assert.equal(hash.length, 64);
      assert.deepEqual(input, page);
      used = true;
      return pageReply;
    },
  });
  const response = await handler(request(page));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), pageReply);
  assert.equal(used, true);
});
for (const change of [
  { runId: 9007199254740996 },
  { connectionId: '01' },
  { generation: 0 },
  { claimToken: 'bad' },
  { externalAccountId: '001' },
  { pageCursor: 'page:0' },
  { nextCursor: 'page:3' },
  { items: [{ ...page.items[0], publishedAt: '2026-10-01T00:00:00Z' }] },
  { items: [{ ...page.items[0], url: 'https://foreign.example/101' }] },
  { items: [page.items[0], page.items[0]] },
  { items: [{ ...page.items[0], secret: 'private' }] },
])
  test('rejects unverified page input ' + JSON.stringify(change), async () => {
    const handler = createKleinanzeigenExtensionHandler({
      session: async () => assert.fail('no database'),
      sync: async () => assert.fail('no database'),
    });
    assert.equal((await handler(request({ ...page, ...change }))).status, 400);
  });
test('does not leak claim data or accept altered scope in database replies', async () => {
  for (const reply of [
    { ...pageReply, runId: '2' },
    { ...pageReply, generation: 2 },
    { ...pageReply, connectionId: '2' },
    { ...pageReply, tokenHash: secret },
    { ...pageReply, complete: false },
  ]) {
    const handler = createKleinanzeigenExtensionHandler({
      session: async () => assert.fail('not heartbeat'),
      sync: async () => reply,
    });
    assert.equal((await handler(request(page))).status, 502);
  }
});
test('a claimed read has a distinct token and exact bound provider identity', async () => {
  const input = { action: 'sync_claim', ...scope };
  const reply = { ...scope, claimToken: claim, externalAccountId: '123', nextCursor: 'page:1' };
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('not heartbeat'),
    sync: async () => reply,
  });
  assert.deepEqual(await (await handler(request(input))).json(), reply);
});
test('finish only confirms a complete server result and accepts no invented quota', async () => {
  const finish = {
    action: 'sync_finish',
    ...scope,
    claimToken: claim,
    externalAccountId: '123',
    quota: null,
  };
  const reply = { ...scope, state: 'confirmed', observedAt: '2026-10-16T06:00:00Z', itemCount: 1 };
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('not heartbeat'),
    sync: async () => reply,
  });
  assert.equal((await handler(request(finish))).status, 200);
  for (const quota of [
    { used: 8 },
    {
      externalAccountId: '124',
      accountType: 'private',
      source: 'account_settings',
      used: 8,
      observedAt: '2026-10-16T06:00:00Z',
    },
    {
      externalAccountId: '123',
      accountType: 'private',
      source: 'active_listings',
      used: 8,
      observedAt: '2026-10-16T06:00:00Z',
    },
  ])
    assert.equal((await handler(request({ ...finish, quota }))).status, 400);
});
test('failed reads may stop only their claimed run with an allowed failure code', async () => {
  const input = {
    action: 'sync_fail',
    ...scope,
    claimToken: claim,
    externalAccountId: '123',
    errorCode: 'schema_changed',
  };
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('not heartbeat'),
    sync: async () => ({ ...scope, state: 'failed', errorCode: 'schema_changed' }),
  });
  assert.equal((await handler(request(input))).status, 200);
  assert.equal((await handler(request({ ...input, errorCode: 'private details' }))).status, 400);
});

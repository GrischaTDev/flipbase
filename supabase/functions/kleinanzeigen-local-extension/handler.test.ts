import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKleinanzeigenExtensionHandler } from './handler.ts';
const scope = {
  workspaceId: '49000000-0000-4000-8000-000000000011',
  connectionId: '9007199254740993',
  generation: 1,
};
const secret = 'ab'.repeat(32);
function request(body: unknown = scope, headers: Record<string, string> = {}) {
  return new Request('https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret, ...headers },
    body: JSON.stringify({ action: 'heartbeat', ...(body as object) }),
  });
}
const result = {
  ...scope,
  externalAccountId: '123',
  canPublish: false,
  expiresAt: '2026-10-17T06:00:00Z',
};
test('passes only the hash and exact string IDs to the installation store', async () => {
  let received = false;
  const handler = createKleinanzeigenExtensionHandler({
    session: async (hash, input) => {
      received = true;
      assert.equal(hash.length, 64);
      assert.notEqual(hash, secret);
      assert.equal(input.connectionId, scope.connectionId);
      return result;
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(received, true);
  assert.equal((await response.json()).connectionId, scope.connectionId);
});
for (const body of [
  { ...scope, connectionId: 9007199254740992 },
  { ...scope, connectionId: '01' },
  { ...scope, workspaceId: 'other' },
  { ...scope, generation: 0 },
  { ...scope, generation: 1.5 },
  { ...scope, action: 'messages_send' },
  { ...scope, script: 'click()' },
])
  test(
    'rejects malformed or unrelated installation requests: ' + JSON.stringify(body),
    async () => {
      const handler = createKleinanzeigenExtensionHandler({
        session: async () => assert.fail('no store access'),
      });
      assert.equal((await handler(request(body))).status, 400);
    },
  );
test('does not accept a normal webpage origin as an extension', async () => {
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('no store access'),
  });
  assert.equal((await handler(request(scope, { origin: 'https://evil.example' }))).status, 403);
});
test('rejects missing secrets before database access', async () => {
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('no store access'),
  });
  assert.equal((await handler(request(scope, { authorization: 'Bearer user-jwt' }))).status, 401);
});
test('rejects oversized bodies before store access', async () => {
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail('no store access'),
  });
  const req = new Request('https://api.flipbase.de', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + secret },
    body: ' '.repeat(1048577),
  });
  assert.equal((await handler(req)).status, 400);
});
test('scope-changing or secret-bearing database replies never reach the browser', async () => {
  for (const reply of [
    { ...result, connectionId: '2' },
    { ...result, tokenHash: secret },
  ]) {
    const handler = createKleinanzeigenExtensionHandler({ session: async () => reply });
    assert.equal((await handler(request())).status, 502);
  }
});

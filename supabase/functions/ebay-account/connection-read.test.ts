import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withEbayConnection } from './connection-read.ts';
import type { EbayAccountStore, StoredEbayConnection } from './handler.ts';
import { EbayError } from '../_shared/ebay-api.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { encryptTokens } from '../_shared/ebay-token-encryption.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};
const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'secret',
  ruName: 'runame',
  environment: 'production',
  encryptionKey: btoa('12345678901234567890123456789012'),
  appUrl: 'https://app.example.test',
  allowedOrigins: ['https://app.example.test'],
};
async function fixture() {
  const connection: StoredEbayConnection = {
    id: scope.connectionId,
    workspace_id: scope.workspaceId,
    user_id: 'user',
    environment: 'production',
    status: 'connected',
    external_account_id: 'account',
    username: 'seller',
    last_read_at: null,
    authorization_version: 1,
  };
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'first',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connection.id,
  );
  const finished: { needsLogin: boolean; observed: boolean }[] = [];
  const store: EbayAccountStore = {
    authenticate: async () => 'user',
    canConnect: async () => true,
    status: async () => connection,
    begin: async () => connection,
    consume: async () => null,
    complete: async () => true,
    claim: async () => ({ connection, encryptedTokens }),
    disconnect: async () => {},
    finish: async (_connection, _operation, _encrypted, needsLogin, observed) => {
      finished.push({ needsLogin, observed });
      return true;
    },
  };
  return { store, connection, finished };
}
test('refreshes exactly once after provider 401 and returns only after releasing the claim', async () => {
  const f = await fixture();
  const tokens: string[] = [];
  let refreshes = 0;
  const result = await withEbayConnection(
    scope,
    'Bearer valid',
    f.store,
    config,
    async (context) => {
      tokens.push(context.accessToken);
      assert.equal(context.connection.external_account_id, 'account');
      assert.match(context.operationId, /^[a-f0-9-]{36}$/);
      assert.equal(f.finished.length, 0);
      if (tokens.length === 1) throw new EbayError('needs_login');
      return 'read';
    },
    async () => {
      refreshes++;
      return Response.json({ access_token: 'second', expires_in: 7200 });
    },
  );
  assert.equal(result, 'read');
  assert.deepEqual(tokens, ['first', 'second']);
  assert.equal(refreshes, 1);
  assert.deepEqual(f.finished, [{ needsLogin: false, observed: true }]);
});
test('a repeated provider 401 is bounded and marks the connection for login', async () => {
  const f = await fixture();
  let reads = 0;
  await assert.rejects(
    withEbayConnection(
      scope,
      'Bearer valid',
      f.store,
      config,
      async () => {
        reads++;
        throw new EbayError('needs_login');
      },
      async () => Response.json({ access_token: 'second', expires_in: 7200 }),
    ),
    /needs_login/,
  );
  assert.equal(reads, 2);
  assert.deepEqual(f.finished, [{ needsLogin: true, observed: false }]);
});
test('foreign or changed claimed context is released without reaching the action', async () => {
  for (const change of [
    { user_id: 'other' },
    { workspace_id: 'other' },
    { id: 'other' },
    { environment: 'sandbox' as const },
    { status: 'disconnected' as const },
  ]) {
    const f = await fixture();
    Object.assign(f.connection, change);
    let reads = 0;
    await assert.rejects(
      withEbayConnection(scope, 'Bearer valid', f.store, config, async () => {
        reads++;
      }),
      /connection_changed/,
    );
    assert.equal(reads, 0);
    assert.deepEqual(f.finished, [{ needsLogin: false, observed: false }]);
  }
});

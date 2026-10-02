import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEbayAccountHandler } from './handler.ts';
import type { EbayAccountStore, StoredEbayConnection } from './handler.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { encryptTokens, hashState } from '../_shared/ebay-token-encryption.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const connectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'server-secret',
  ruName: 'runame',
  environment: 'production',
  encryptionKey: btoa('12345678901234567890123456789012'),
  appUrl: 'https://app.example.test',
  allowedOrigins: ['https://app.example.test'],
};
const connection: StoredEbayConnection = {
  id: connectionId,
  workspace_id: workspaceId,
  user_id: userId,
  environment: 'production',
  status: 'connected',
  username: 'seller',
  external_account_id: 'private-account',
  last_read_at: null,
  authorization_version: 1,
};
function store(overrides: Partial<EbayAccountStore> = {}): EbayAccountStore {
  return {
    authenticate: async (bearer) => (bearer === 'Bearer valid' ? userId : null),
    canConnect: async (_bearer, id) => id === workspaceId,
    status: async () => connection,
    begin: async () => connection,
    consume: async () => null,
    complete: async () => true,
    claim: async () => null,
    finish: async () => true,
    disconnect: async () => {},
    ...overrides,
  };
}
function request(action: string, extras: Record<string, unknown> = {}, bearer = 'Bearer valid') {
  return new Request('https://db.example.test/functions/v1/ebay-account', {
    method: 'POST',
    headers: { authorization: bearer, origin: config.appUrl },
    body: JSON.stringify({ action, workspaceId, ...extras }),
  });
}
test('Gefälschte Sitzungen und fremde Workspaces erreichen keinen Dienstzugriff', async () => {
  let begins = 0;
  const handler = createEbayAccountHandler(
    store({
      begin: async () => {
        begins++;
        return connection;
      },
    }),
    config,
    config.allowedOrigins,
  );
  assert.equal((await handler(request('connect', {}, 'Bearer forged'))).status, 401);
  assert.equal((await handler(request('connect', { workspaceId: connectionId }))).status, 403);
  assert.equal(begins, 0);
  const result = await handler(request('status'));
  const text = await result.text();
  assert.equal(text.includes('authorization_version'), false);
  assert.equal(text.includes('server-secret'), false);
  assert.equal(text.includes(userId), false);
});
test('Consent bindet den bestätigten Nutzer und speichert nur den Hash', async () => {
  let storedHash = '';
  const handler = createEbayAccountHandler(
    store({
      begin: async (user, workspace, environment, hash) => {
        assert.equal(user, userId);
        assert.equal(workspace, workspaceId);
        assert.equal(environment, 'production');
        storedHash = hash;
        return connection;
      },
    }),
    config,
    config.allowedOrigins,
  );
  const response = await handler(request('connect', { userId: 'forged' }));
  const body = await response.json();
  const state = new URL(body.authorizationUrl).searchParams.get('state');
  assert.equal(typeof state, 'string');
  assert.ok(state);
  assert.notEqual(state, storedHash);
  assert.equal(await hashState(state), storedHash);
});
test('Einmaliger Callback funktioniert ohne Flipbase-Bearer und lehnt Wiederholung ab', async () => {
  let consumed = false;
  let completed = 0;
  const handler = createEbayAccountHandler(
    store({
      consume: async () => {
        if (consumed) return null;
        consumed = true;
        return { ...connection, status: 'needs_login' };
      },
      complete: async (_connection, id, _username, encrypted) => {
        assert.equal(id, 'external-id');
        assert.equal(encrypted.includes('private'), false);
        completed++;
        return true;
      },
    }),
    config,
    config.allowedOrigins,
    async (input) =>
      String(input).includes('/oauth2/token')
        ? Response.json({
            access_token: 'private-access',
            refresh_token: 'private-refresh',
            expires_in: 7200,
            refresh_token_expires_in: 100000,
          })
        : Response.json({ userId: 'external-id', username: 'seller' }),
  );
  const callback = () =>
    new Request(
      `https://db.example.test/functions/v1/ebay-account/callback?state=${'a'.repeat(64)}&code=private-code`,
    );
  const response = await handler(callback());
  assert.equal(response.status, 303);
  assert.equal(
    new URL(response.headers.get('location') ?? '').searchParams.get('ebay_result'),
    'connected',
  );
  assert.equal(response.headers.get('location')?.includes('private'), false);
  assert.equal(
    new URL((await handler(callback())).headers.get('location') ?? '').searchParams.get(
      'ebay_result',
    ),
    'failed',
  );
  assert.equal(completed, 1);
});
test('Trennen während eines Abrufs verwirft auch eine erfolgreiche eBay-Antwort', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  const handler = createEbayAccountHandler(
    store({
      claim: async (user, workspace, id) => {
        assert.equal(user, userId);
        assert.equal(workspace, workspaceId);
        assert.equal(id, connectionId);
        return { connection, encryptedTokens };
      },
      finish: async () => false,
    }),
    config,
    config.allowedOrigins,
    async () =>
      Response.json({
        total: 1,
        orders: [{ orderId: 'private-order', creationDate: '2026-10-01' }],
      }),
  );
  const response = await handler(request('orders', { connectionId }));
  assert.equal(response.status, 409);
  assert.equal((await response.text()).includes('private-order'), false);
});
test('Widerruf löscht Tokenzugriff und liefert einen erneuten Anmeldestatus', async () => {
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'expired',
      refreshToken: 'revoked',
      expiresAt: 0,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  let lockedOut = false;
  const handler = createEbayAccountHandler(
    store({
      claim: async () => ({ connection, encryptedTokens }),
      finish: async (_connection, _id, _tokens, needsLogin, observed) => {
        lockedOut = needsLogin;
        assert.equal(observed, false);
        return true;
      },
    }),
    config,
    config.allowedOrigins,
    async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
  );
  const response = await handler(request('orders', { connectionId }));
  assert.equal(lockedOut, true);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'needs_login' });
});
test('Unkonfigurierte App bleibt sichtbar ausgeschaltet und Seitenparameter sind begrenzt', async () => {
  const handler = createEbayAccountHandler(store(), null, config.allowedOrigins);
  assert.equal((await (await handler(request('status'))).json()).configured, false);
  assert.equal((await handler(request('connect'))).status, 503);
  const enabled = createEbayAccountHandler(store(), config, config.allowedOrigins);
  assert.equal((await enabled(request('orders', { connectionId, page: 201 }))).status, 400);
  assert.equal((await enabled(request('listings', { connectionId, page: 0 }))).status, 400);
});

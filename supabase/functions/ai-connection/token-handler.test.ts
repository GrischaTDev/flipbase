import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiConnectionTokenHandler } from './token-handler.ts';

const clientId = '78000000-0000-4000-8000-000000000001';
function fixture(issuedGrant = 'grant-one') {
  let forwards = 0;
  const handler = createAiConnectionTokenHandler(
    'http://auth:9999/oauth/token',
    {
      grant(client, code) {
        assert.equal(client, clientId);
        if (code !== 'current') throw new Error('old code');
        return Promise.resolve('grant-one');
      },
      context(token) {
        assert.equal(token, 'issued');
        return Promise.resolve({ id: issuedGrant });
      },
    },
    () => {
      forwards++;
      return Promise.resolve(
        Response.json({
          access_token: 'issued',
          refresh_token: 'refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { private: true },
          id_token: 'native-identity-with-user-claims',
        }),
      );
    },
  );
  const send = (code: string, extra = '') =>
    handler(
      new Request('https://api.test/auth/v1/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `grant_type=authorization_code&client_id=${clientId}&code=${code}&code_verifier=private${extra}`,
      }),
    );
  return { send, forwards: () => forwards };
}
test('native token response is standard OAuth and contains no user metadata', async () => {
  const f = fixture();
  const response = await f.send('current');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    access_token: 'issued',
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
  });
  assert.equal(f.forwards(), 1);
});
test('old code and ambiguous fields never reach native auth', async () => {
  const f = fixture();
  assert.equal((await f.send('old')).status, 400);
  assert.equal((await f.send('current', '&client_id=other')).status, 400);
  assert.equal(f.forwards(), 0);
});
test('a concurrently replaced grant cannot take over the native token response', async () => {
  const f = fixture('grant-two');
  assert.equal((await f.send('current')).status, 400);
  assert.equal(f.forwards(), 1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedAccountWriter } from '../src/supabase-vinted-account-writer.ts';

const scope = {
  workspaceId: '26500000-0000-4000-8000-000000000011',
  connectionId: '26500000-0000-4000-8000-000000000021',
  userId: '26500000-0000-4000-8000-000000000001',
  userAccessToken: 'user-token',
};
const sessionId = '26500000-0000-4000-8000-000000000031';
const identity = { id: '12345', username: 'my-vinted' };

test('sends only bound identity fields through the server-only RPC', async () => {
  let calls = 0;
  const writer = new SupabaseVintedAccountWriter({
    url: 'https://supabase.example.test',
    serviceRoleKey: 'server-only-key',
    fetch: async (input, init) => {
      calls++;
      assert.equal(
        String(input),
        'https://supabase.example.test/rest/v1/rpc/marketplace_browser_confirm_account',
      );
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-only-key');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_session_id: sessionId,
        p_user_id: scope.userId,
        p_external_account_id: identity.id,
        p_username: identity.username,
      });
      return Response.json({
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        externalAccountId: identity.id,
      });
    },
  });
  await writer.confirm(scope, sessionId, identity);
  assert.equal(calls, 1);
});

test('rejects an RPC response for another account without leaking its body', async () => {
  const writer = new SupabaseVintedAccountWriter({
    url: 'https://supabase.example.test',
    serviceRoleKey: 'server-only-key',
    fetch: async () =>
      Response.json({
        workspaceId: scope.workspaceId,
        connectionId: '26500000-0000-4000-8000-000000000022',
        externalAccountId: identity.id,
        secret: 'must-stay-private',
      }),
  });
  await assert.rejects(
    writer.confirm(scope, sessionId, identity),
    /Kontobestätigung nicht verfügbar/,
  );
});

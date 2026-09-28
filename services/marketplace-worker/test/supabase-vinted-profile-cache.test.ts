import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedProfileCache } from '../src/supabase-vinted-profile-cache.ts';

test('Profilcache übergibt nur gebundenen Workspace, Konto und bestätigten Text', async () => {
  let body: Record<string, unknown> | null = null;
  const cache = new SupabaseVintedProfileCache({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/marketplace_cache_profile_about');
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json(true);
    },
  });
  const scope = {
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userAccessToken: 'private-user-token',
  };
  assert.equal(await cache.save(scope, '123', 'Über mich'), true);
  assert.deepEqual(body, {
    p_workspace_id: scope.workspaceId,
    p_connection_id: scope.connectionId,
    p_account_id: '123',
    p_about: 'Über mich',
  });
  assert.ok(!JSON.stringify(body).includes('private-user-token'));
});

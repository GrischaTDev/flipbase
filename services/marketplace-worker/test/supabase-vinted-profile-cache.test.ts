import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedProfileCache } from '../src/supabase-vinted-profile-cache.ts';

test('Profilcache erhält fremde JSON-Felder und überschreibt keinen parallelen Import', async () => {
  let reads = 0,
    writes = 0;
  const scope = {
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userAccessToken: 'private-token',
  };
  const profile = {
    about: 'Neu',
    city: 'Hamburg',
    showCity: false,
    language: 'de-DE',
    country: 'Deutschland',
    imageUrl: null,
    languages: [{ id: 'de-DE', label: 'Deutsch' }],
    canUploadPhoto: true,
  };
  const cache = new SupabaseVintedProfileCache({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('workspace_id'), 'eq.' + scope.workspaceId);
      assert.equal(url.searchParams.get('connection_id'), 'eq.' + scope.connectionId);
      assert.equal(url.searchParams.get('external_id'), 'eq.123');
      if (init?.method === 'PATCH') {
        writes++;
        const payload = JSON.parse(String(init.body));
        assert.equal(payload.body.feedbackCount, 7);
        assert.equal(payload.body.bio, 'Neu');
        assert.equal(payload.body.location, null);
        assert.equal(
          url.searchParams.get('observed_at'),
          reads === 1 ? 'eq.2026-10-27T10:00:00Z' : 'eq.2026-10-27T10:01:00Z',
        );
        return Response.json(writes === 1 ? [] : [{ external_id: '123' }]);
      }
      reads++;
      return Response.json([
        {
          body: { bio: 'Alt', feedbackCount: 7 },
          observed_at: reads === 1 ? '2026-10-27T10:00:00Z' : '2026-10-27T10:01:00Z',
        },
      ]);
    },
  });
  assert.equal(await cache.saveDetails(scope, '123', profile), true);
  assert.equal(reads, 2);
  assert.equal(writes, 2);
});

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

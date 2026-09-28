import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedListingCache } from '../src/supabase-vinted-listing-cache.ts';

test('Inseratcache übergibt nur das gebundene Konto und die bestätigten Felder', async () => {
  let body: Record<string, unknown> | null = null;
  const cache = new SupabaseVintedListingCache({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      assert.equal(new URL(String(input)).pathname, '/rest/v1/rpc/marketplace_cache_listing_text');
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json(true);
    },
  });
  const scope = {
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    userAccessToken: 'user-token',
  };
  assert.equal(
    await cache.save(
      scope,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      '41',
      { title: 'Jacke', description: 'Neu', price: '21,50' },
      true,
    ),
    true,
  );
  assert.deepEqual(body, {
    p_workspace_id: scope.workspaceId,
    p_connection_id: scope.connectionId,
    p_entry_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    p_external_id: '41',
    p_text: 'Neu',
    p_confirmed: true,
    p_title: 'Jacke',
    p_price: 21.5,
  });
  assert.ok(!JSON.stringify(body).includes('user-token'));
});

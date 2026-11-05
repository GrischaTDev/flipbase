import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedListingCache } from '../src/supabase-vinted-listing-cache.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';

test('confirmed content stores all article details using the account-bound server RPC', async () => {
  const content = listingCurrentContentFixture().content;
  let calls = 0;
  const cache = new SupabaseVintedListingCache({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      calls++;
      assert.equal(
        new URL(String(input)).pathname,
        '/rest/v1/rpc/marketplace_cache_listing_content',
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_workspace_id: 'workspace',
        p_connection_id: 'account',
        p_entry_id: 'entry',
        p_external_id: '98765',
        p_content: content,
      });
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-key');
      return Response.json(true);
    },
  });
  const scope = {
    workspaceId: 'workspace',
    connectionId: 'account',
    userId: 'user',
    userAccessToken: 'user-token',
  };
  assert.equal(await cache.saveContent(scope, 'entry', '98765', content), true);
  await assert.rejects(
    cache.saveContent(scope, 'entry', '98765', { ...content, categoryId: null }),
  );
  assert.equal(calls, 1);
});

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

test('Löschcache begrenzt alle Kontofilter und berührt weder Storage noch Originalquellen', async () => {
  let calls = 0;
  const cache = new SupabaseVintedListingCache({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      calls++;
      const url = new URL(String(input));
      assert.equal(url.pathname, '/rest/v1/marketplace_account_entries');
      assert.equal(init?.method, 'DELETE');
      assert.deepEqual(Object.fromEntries(url.searchParams), {
        workspace_id: 'eq.workspace',
        connection_id: 'eq.connection',
        id: 'eq.entry',
        external_id: 'eq.41',
        kind: 'eq.publication',
      });
      return new Response(null, { status: 204 });
    },
  });
  await cache.remove(
    {
      workspaceId: 'workspace',
      connectionId: 'connection',
      userId: 'user',
      userAccessToken: 'token',
    },
    'entry',
    '41',
  );
  assert.equal(calls, 1);
});

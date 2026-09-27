import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseBrowserSessionStore } from '../src/supabase-browser-session-store.ts';

const scope = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  userId: 'user-a',
  userAccessToken: 'user-test-token',
};

test('binds the user token, database lease, copied profile and release', async () => {
  const calls: { path: string; method: string; authorization: string; body: unknown }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(input.toString());
    const path = `${url.pathname}${url.search}`;
    const authorization = new Headers(init?.headers).get('Authorization') ?? '';
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, authorization, body });
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-a' });
    if (url.pathname.endsWith('/marketplace_browser_session_reserve'))
      return Response.json({
        id: 'lease-a',
        workspaceId: 'workspace-a',
        connectionId: 'account-a',
        state: 'active',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    if (url.pathname.endsWith('/marketplace_browser_session_check'))
      return Response.json({
        id: 'lease-a',
        workspaceId: 'workspace-a',
        connectionId: 'account-a',
        active: true,
      });
    if (method === 'PATCH') return Response.json([{ public_id: 'lease-a' }]);
    return Response.json([{ provider_profile_id: 'copied-profile-a' }]);
  };
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    fetch: request,
  });
  const lease = await store.acquire(scope);
  assert.equal(lease.scope.userId, 'user-a');
  assert.equal(await store.resolve(lease), 'copied-profile-a');
  assert.equal(await store.assertActive(lease), true);
  await store.release(lease);
  assert.equal(calls.length, 6);
  assert.ok(calls[2]!.path.includes('public_id=eq.lease-a'));
  assert.ok(calls[2]!.path.includes('started_by=eq.user-a'));
  assert.equal(calls[1]!.authorization, 'Bearer user-test-token');
  assert.equal(calls[2]!.authorization, 'Bearer server-test-key');
  assert.equal(calls[5]!.authorization, 'Bearer server-test-key');
  assert.equal((calls[5]!.body as Record<string, unknown>)['state'], 'closed');
});

test('rejects a scope with a different authenticated user before reserving', async () => {
  let requests = 0;
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    fetch: async () => {
      requests += 1;
      return Response.json({ id: 'user-b' });
    },
  });
  await assert.rejects(store.acquire(scope), /Sitzungszugriff verweigert/);
  assert.equal(requests, 1);
});

test('does not expose a provider error body through the lease adapter', async () => {
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    fetch: async () => new Response('private token and provider URL', { status: 503 }),
  });
  await assert.rejects(
    store.acquire(scope),
    (error: unknown) =>
      error instanceof Error &&
      !error.message.includes('private token') &&
      !error.message.includes('provider URL'),
  );
});

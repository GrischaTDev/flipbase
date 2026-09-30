import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseBrowserSessionStore } from '../src/supabase-browser-session-store.ts';

const scope = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  userId: 'user-a',
  userAccessToken: 'user-test-token',
};

for (const failure of [
  'binding_denied',
  'binding_lost',
  'reservation_lost',
  'invalid_reservation',
  'busy',
] as const) {
  test(`uncertain reservation triggers recovery without blind release: ${failure}`, async () => {
    let recoveries = 0;
    let binds = 0;
    const store = new SupabaseBrowserSessionStore({
      url: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      runtime: { workerId: 'worker-a', workerEpoch: 3 },
      onReservationUncertain: () => {
        recoveries++;
      },
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        assert.notEqual(init?.method, 'PATCH');
        if (path === '/auth/v1/user') return Response.json({ id: scope.userId });
        if (path.endsWith('marketplace_browser_session_reserve')) {
          if (failure === 'reservation_lost') throw new Error('network');
          if (failure === 'busy') return Response.json({ message: 'busy' }, { status: 409 });
          if (failure === 'invalid_reservation') return Response.json({});
          return Response.json({
            id: 'lease-a',
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            state: 'active',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
        }
        binds++;
        if (failure === 'binding_lost') throw new Error('network');
        return Response.json(false);
      },
    });
    await assert.rejects(store.acquire(scope));
    assert.equal(recoveries, failure === 'busy' ? 0 : 1);
    assert.equal(binds, failure.startsWith('binding') ? 1 : 0);
  });
}

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

test('uses the persisted read authorization without a user token or second reservation', async () => {
  const scheduled = {
    ...scope,
    userAccessToken: '',
    syncRead: {
      operationId: 'operation-a',
      runnerId: 'runner-a',
      workerEpoch: 2,
      sessionId: 'lease-a',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
  const calls: string[] = [];
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    fetch: async (input, init) => {
      const path = new URL(input.toString()).pathname;
      calls.push(path);
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-test-key');
      return Response.json({
        active: true,
        sessionId: 'lease-a',
        expiresAt: scheduled.syncRead.expiresAt,
        absoluteExpiresAt: scheduled.syncRead.absoluteExpiresAt,
      });
    },
  });
  const lease = await store.acquire(scheduled);
  assert.equal(lease.id, 'lease-a');
  assert.deepEqual(calls, ['/rest/v1/rpc/marketplace_sync_check']);
});

test('rejects a read lease returned for a different persisted session', async () => {
  const scheduled = {
    ...scope,
    userAccessToken: '',
    syncRead: {
      operationId: 'operation-a',
      runnerId: 'runner-a',
      workerEpoch: 2,
      sessionId: 'lease-a',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    fetch: async () =>
      Response.json({
        active: true,
        sessionId: 'lease-other',
        expiresAt: scheduled.syncRead.expiresAt,
        absoluteExpiresAt: scheduled.syncRead.absoluteExpiresAt,
      }),
  });
  await assert.rejects(store.acquire(scheduled), /Sitzungszugriff verweigert/);
});

test('binds a new interactive lease to its live worker before returning access', async () => {
  const paths: string[] = [];
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test-key',
    serviceRoleKey: 'server-test-key',
    runtime: { workerId: 'worker-a', workerEpoch: 3 },
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path === '/auth/v1/user') return Response.json({ id: scope.userId });
      if (path.endsWith('marketplace_browser_session_reserve'))
        return Response.json({
          id: 'lease-a',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          state: 'active',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-test-key');
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_session_id: 'lease-a',
        p_worker_id: 'worker-a',
        p_worker_epoch: 3,
      });
      return Response.json(true);
    },
  });
  await store.acquire(scope);
  assert.deepEqual(paths, [
    '/auth/v1/user',
    '/rest/v1/rpc/marketplace_browser_session_reserve',
    '/rest/v1/rpc/marketplace_browser_session_bind_worker',
  ]);
});

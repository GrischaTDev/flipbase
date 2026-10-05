import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseBrowserSessionStore } from '../src/supabase-browser-session-store.ts';
import { MarketplaceBrowserSessionBusyError } from '../src/marketplace-browser-session-broker.ts';
import { MarketplaceBrowserSessionBroker } from '../src/marketplace-browser-session-broker.ts';
import {
  MarketplaceBrowserRecovery,
  SupabaseBrowserRecoveryStore,
} from '../src/marketplace-browser-recovery.ts';

const scope = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  userId: 'user-a',
  userAccessToken: 'user-test-token',
};

for (const failure of ['lost', 'malformed', 'busy'] as const) {
  test(`setup reservation uses the existing uncertainty fence: ${failure}`, async () => {
    let recoveries = 0;
    const store = new SupabaseBrowserSessionStore({
      url: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      onReservationUncertain: () => {
        recoveries++;
      },
      fetch: async (input) => {
        if (new URL(String(input)).pathname === '/auth/v1/user')
          return Response.json({ id: scope.userId });
        if (failure === 'lost') throw new Error('lost ACK');
        if (failure === 'malformed') return new Response('{', { status: 200 });
        return Response.json({ code: '55P03' }, { status: 500 });
      },
    });
    await assert.rejects(
      store.acquire({ ...scope, cloudSetup: { setupId: 'setup-a' } }),
      (error: unknown) =>
        error instanceof Error &&
        (failure !== 'busy' || error instanceof MarketplaceBrowserSessionBusyError),
    );
    assert.equal(recoveries, failure === 'busy' ? 0 : 1);
  });
}

test('a lost setup reserve ACK fences the worker and restart stops the orphan before reopening', async () => {
  const events: string[] = [];
  let active = false;
  let loseReply = true;
  let authorized = true;
  let sessionId = 'orphan-session';
  const request: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: scope.userId });
    if (path.endsWith('marketplace_cloud_setup_session_reserve')) {
      assert.equal(active, false);
      active = true;
      if (loseReply) throw new Error('lost committed ACK');
      return Response.json({
        id: sessionId,
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        state: 'active',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (path.endsWith('marketplace_cloud_setup_session_check'))
      return Response.json({
        id: sessionId,
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        active,
      });
    assert.equal(path, '/rest/v1/marketplace_browser_sessions');
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      events.push(String(body['state']));
      if (body['state'] === 'closed') active = false;
    }
    return Response.json(
      active || init?.method === 'PATCH'
        ? [{ public_id: sessionId, provider_profile_id: 'profile-a' }]
        : [],
    );
  };
  const recovery = new MarketplaceBrowserRecovery(
    new SupabaseBrowserRecoveryStore({
      url: 'https://example.test',
      serviceRoleKey: 'server',
      fetch: request,
    }),
    {
      stop: async () => {
        events.push('physical-stop');
      },
    },
  );
  const leases = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public',
    serviceRoleKey: 'server',
    fetch: request,
    onReservationUncertain: () => {
      authorized = false;
      events.push('runtime-fenced');
    },
  });
  const createBroker = () =>
    new MarketplaceBrowserSessionBroker({
      leases,
      recovery,
      authorizeRuntime: async () => authorized,
      profiles: { resolve: async () => 'profile-a' },
      browsers: {
        open: async () => ({
          close: async () => undefined,
          run: async (operation) => operation({ version: () => 'test' }),
        }),
        stop: async () => undefined,
      },
    });
  const setupScope = { ...scope, cloudSetup: { setupId: 'setup-a' } };
  const first = createBroker();
  await assert.rejects(first.open(setupScope));
  assert.equal(active, true);
  assert.equal(authorized, false);
  await assert.rejects(first.open(setupScope), /Worker-Zugriff unterbrochen/);
  authorized = true;
  loseReply = false;
  const restarted = createBroker();
  await restarted.ready();
  assert.deepEqual(events, ['runtime-fenced', 'stopping', 'physical-stop', 'closed']);
  assert.equal(active, false);
  sessionId = 'new-session';
  assert.equal(await restarted.open(setupScope), sessionId);
  await restarted.close(setupScope, sessionId);
  assert.equal(active, false);
});

test('setup lease uses only setup reserve and check RPCs', async () => {
  const calls: string[] = [];
  const setupScope = { ...scope, cloudSetup: { setupId: 'setup-a' } };
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public',
    serviceRoleKey: 'server',
    runtime: { workerId: 'worker-a', workerEpoch: 3 },
    fetch: async (url, request) => {
      const name = new URL(String(url)).pathname.split('/').at(-1) ?? '';
      calls.push(name);
      if (name === 'user') return Response.json({ id: scope.userId });
      if (name === 'marketplace_browser_session_bind_worker') return Response.json(true);
      const body = JSON.parse(String(request?.body));
      assert.equal(body.p_setup_id, 'setup-a');
      if (name === 'marketplace_cloud_setup_session_reserve')
        return Response.json({
          id: 'lease-a',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
          state: 'active',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        });
      return Response.json({
        id: 'lease-a',
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
        active: true,
      });
    },
  });
  const lease = await store.acquire(setupScope);
  assert.equal(await store.assertActive(lease), true);
  assert.deepEqual(calls, [
    'user',
    'marketplace_cloud_setup_session_reserve',
    'marketplace_browser_session_bind_worker',
    'user',
    'marketplace_cloud_setup_session_check',
  ]);
});

test('known PostgreSQL busy rejection preserves the worker and returns a neutral busy error', async () => {
  let recoveries = 0;
  let reservations = 0;
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public',
    serviceRoleKey: 'server',
    runtime: { workerId: 'worker-a', workerEpoch: 3 },
    onReservationUncertain: () => {
      recoveries++;
    },
    fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/auth/v1/user') return Response.json({ id: scope.userId });
      assert.ok(path.endsWith('marketplace_browser_session_reserve'));
      reservations++;
      return Response.json(
        {
          code: '55P03',
          details: null,
          hint: null,
          message: 'private provider token in error text',
        },
        { status: 500 },
      );
    },
  });
  await assert.rejects(
    store.acquire(scope),
    (failure: unknown) =>
      failure instanceof MarketplaceBrowserSessionBusyError &&
      !failure.message.includes('private provider'),
  );
  assert.equal(recoveries, 0);
  assert.equal(reservations, 1);
});

for (const malformedResponse of [
  () => Response.json({ code: 'XX000', message: 'private token' }, { status: 500 }),
  () => Response.json({ code: '55p03' }, { status: 500 }),
  () => Response.json([{ code: '55P03' }], { status: 500 }),
  () => new Response('{', { status: 500 }),
  () => Response.json(null, { status: 500 }),
  () => Response.json({ code: '55P03' }, { status: 200 }),
]) {
  test('unknown or malformed reservation response remains uncertain', async () => {
    let recoveries = 0;
    const store = new SupabaseBrowserSessionStore({
      url: 'https://example.test',
      publishableKey: 'public',
      serviceRoleKey: 'server',
      onReservationUncertain: () => {
        recoveries++;
      },
      fetch: async (input) =>
        new URL(String(input)).pathname === '/auth/v1/user'
          ? Response.json({ id: scope.userId })
          : malformedResponse(),
    });
    await assert.rejects(
      store.acquire(scope),
      (failure: unknown) =>
        failure instanceof Error &&
        !(failure instanceof MarketplaceBrowserSessionBusyError) &&
        !failure.message.includes('private token'),
    );
    assert.equal(recoveries, 1);
  });
}

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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseMarketplaceSyncDispatchStore } from '../src/supabase-marketplace-sync-dispatch-store.ts';

const workerId = '10000000-0000-4000-8000-000000000001';
const runnerId = '10000000-0000-4000-8000-000000000002';
const now = () => Date.parse('2026-10-01T12:00:00Z');
const lease = { workerId, workerEpoch: 7, expiresAt: '2026-10-01T12:01:30Z' };
const claim = {
  operationId: '10000000-0000-4000-8000-000000000003',
  workspaceId: '10000000-0000-4000-8000-000000000004',
  connectionId: '10000000-0000-4000-8000-000000000005',
  userId: '10000000-0000-4000-8000-000000000006',
  runnerId,
  workerEpoch: 7,
  authorizationKind: 'manual_read',
  authorizationVersion: 1,
  scheduleAuthorizationVersion: null,
  sessionId: '10000000-0000-4000-8000-000000000007',
  expiresAt: '2026-10-01T12:01:30Z',
  absoluteExpiresAt: '2026-10-01T12:10:00Z',
};
function storeWith(value: unknown, inspect?: (url: URL, init?: RequestInit) => void) {
  return new SupabaseMarketplaceSyncDispatchStore({
    url: 'https://db.example.test',
    serviceRoleKey: 'private-service-key',
    now,
    fetch: async (url, init) => {
      inspect?.(new URL(String(url)), init);
      return Response.json(value);
    },
  });
}

test('beansprucht nur die angeforderte Runtime mit Serverrechten und Zeitlimit', async () => {
  let requestBody: unknown;
  const result = await storeWith(lease, (url, init) => {
    assert.equal(url.pathname, '/rest/v1/rpc/marketplace_worker_claim');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-service-key');
    assert.equal(new Headers(init?.headers).get('apikey'), 'private-service-key');
    assert.ok(init?.signal instanceof AbortSignal);
    requestBody = JSON.parse(String(init?.body));
  }).acquireWorker(workerId);
  assert.deepEqual(result, { workerId, workerEpoch: 7, expiresAt: '2026-10-01T12:01:30Z' });
  assert.deepEqual(requestBody, { p_worker_id: workerId });
});

test('belegte Runtime und leere Auftragswarteschlange bleiben ohne erfundene Freigabe', async () => {
  assert.equal(await storeWith(null).acquireWorker(workerId), null);
  assert.equal(await storeWith(null).claim(workerId, 7, runnerId), null);
});

test('fremde oder veraltete Runtimeantworten werden abgelehnt', async () => {
  for (const value of [
    { ...lease, workerId: runnerId },
    { ...lease, workerEpoch: 0 },
    { ...lease, workerEpoch: 1.5 },
    { ...lease, workerEpoch: Number.MAX_SAFE_INTEGER + 1 },
    { ...lease, expiresAt: '2026-10-01T11:59:00Z' },
    { ...lease, expiresAt: '2026-02-31T12:00:00Z' },
    { ...lease, expiresAt: 'infinity' },
    { ...lease, secret: 'untrusted' },
    [],
  ])
    await assert.rejects(storeWith(value).acquireWorker(workerId), /ungültig/);
});

test('Heartbeat, Recovery und Freigabe halten Worker und Epoch gebunden', async () => {
  const requests: { path: string; body: unknown }[] = [];
  const inspect = (url: URL, init?: RequestInit) =>
    requests.push({ path: url.pathname, body: JSON.parse(String(init?.body)) });
  assert.equal(
    await storeWith({ active: true, expiresAt: lease.expiresAt }, inspect).heartbeatWorker(
      workerId,
      7,
    ),
    true,
  );
  assert.equal(
    await storeWith({ active: false, expiresAt: null }, inspect).heartbeatWorker(workerId, 7),
    false,
  );
  assert.deepEqual(await storeWith({ interruptedOperations: 2 }, inspect).recover(workerId, 7), {
    interruptedOperations: 2,
  });
  assert.equal(await storeWith(true, inspect).releaseWorker(workerId, 7), true);
  assert.equal(await storeWith(false).releaseWorker(workerId, 7), false);
  assert.deepEqual(requests, [
    {
      path: '/rest/v1/rpc/marketplace_worker_heartbeat',
      body: { p_worker_id: workerId, p_worker_epoch: 7 },
    },
    {
      path: '/rest/v1/rpc/marketplace_worker_heartbeat',
      body: { p_worker_id: workerId, p_worker_epoch: 7 },
    },
    {
      path: '/rest/v1/rpc/marketplace_sync_recover',
      body: { p_worker_id: workerId, p_worker_epoch: 7 },
    },
    {
      path: '/rest/v1/rpc/marketplace_worker_release',
      body: { p_worker_id: workerId, p_worker_epoch: 7 },
    },
  ]);
});

test('ungültige Heartbeat- und Recoverybestätigungen werden nicht als Erfolg behandelt', async () => {
  for (const value of [
    { active: true, expiresAt: null },
    { active: false, expiresAt: lease.expiresAt },
    { active: 'true', expiresAt: lease.expiresAt },
  ])
    await assert.rejects(storeWith(value).heartbeatWorker(workerId, 7), /ungültig/);
  for (const value of [{ interruptedOperations: -1 }, { interruptedOperations: 0.5 }, {}])
    await assert.rejects(storeWith(value).recover(workerId, 7), /ungültig/);
  await assert.rejects(storeWith({ active: true }).releaseWorker(workerId, 7), /ungültig/);
});

test('manueller Claim enthält ausschließlich eingefrorenen Lesescope ohne Nutzer-JWT', async () => {
  let body: unknown;
  const scope = await storeWith(claim, (_url, init) => {
    body = JSON.parse(String(init?.body));
  }).claim(workerId, 7, runnerId);
  assert.deepEqual(body, {
    p_worker_id: workerId,
    p_worker_epoch: 7,
    p_runner_id: runnerId,
    p_include_scheduled: false,
  });
  assert.deepEqual(scope, {
    workspaceId: '10000000-0000-4000-8000-000000000004',
    connectionId: '10000000-0000-4000-8000-000000000005',
    userId: '10000000-0000-4000-8000-000000000006',
    userAccessToken: '',
    syncRead: {
      operationId: '10000000-0000-4000-8000-000000000003',
      runnerId,
      workerEpoch: 7,
      sessionId: '10000000-0000-4000-8000-000000000007',
      expiresAt: '2026-10-01T12:01:30Z',
      absoluteExpiresAt: '2026-10-01T12:10:00Z',
    },
  });
  assert.ok(Object.isFrozen(scope));
  assert.ok(Object.isFrozen(scope?.syncRead));
});

test('geplante Claims erfordern ausdrücklich erlaubte Planung und passende Freigabeversion', async () => {
  const scheduled = {
    ...claim,
    authorizationKind: 'scheduled_read',
    authorizationVersion: 1,
    scheduleAuthorizationVersion: 3,
  };
  let body: unknown;
  assert.ok(
    await storeWith(scheduled, (_url, init) => {
      body = JSON.parse(String(init?.body));
    }).claim(workerId, 7, runnerId, true),
  );
  assert.deepEqual(body, {
    p_worker_id: workerId,
    p_worker_epoch: 7,
    p_runner_id: runnerId,
    p_include_scheduled: true,
  });
  await assert.rejects(storeWith(scheduled).claim(workerId, 7, runnerId, false), /ungültig/);
  await assert.rejects(
    storeWith({ ...scheduled, scheduleAuthorizationVersion: 0 }).claim(workerId, 7, runnerId, true),
    /ungültig/,
  );
  await assert.rejects(
    storeWith({ ...scheduled, authorizationVersion: 3 }).claim(workerId, 7, runnerId, true),
    /ungültig/,
  );
});

test('Claimabweichungen erzeugen niemals einen Browserzugriff', async () => {
  for (const value of [
    { ...claim, runnerId: workerId },
    { ...claim, workerEpoch: 8 },
    { ...claim, workspaceId: 'foreign' },
    { ...claim, connectionId: null },
    { ...claim, userId: 'foreign' },
    { ...claim, operationId: '' },
    { ...claim, sessionId: 'foreign' },
    { ...claim, authorizationKind: 'interactive' },
    { ...claim, authorizationVersion: 0 },
    { ...claim, scheduleAuthorizationVersion: 1 },
    { ...claim, userAccessToken: 'hidden' },
    { ...claim, expiresAt: '2026-10-01T11:00:00Z' },
    { ...claim, absoluteExpiresAt: '2026-10-01T12:00:30Z' },
  ])
    await assert.rejects(storeWith(value).claim(workerId, 7, runnerId), /ungültig/);
});

test('Anbieterfehler verlassen den Store nur als feste neutrale Fehlermeldung', async () => {
  for (const request of [
    async () => {
      throw new Error('private-service-key provider payload');
    },
    async () => new Response('private-service-key database payload', { status: 500 }),
    async () => new Response('private-service-key invalid JSON'),
  ]) {
    const store = new SupabaseMarketplaceSyncDispatchStore({
      url: 'https://db.example.test',
      serviceRoleKey: 'private-service-key',
      now,
      fetch: request,
    });
    await assert.rejects(store.acquireWorker(workerId), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'Vinted-Auftragsdienst nicht verfügbar');
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('ungültige lokale Bindungen werden vor jedem Netzwerkaufruf verworfen', async () => {
  let calls = 0;
  const store = storeWith(null, () => {
    calls++;
  });
  await assert.rejects(store.acquireWorker('foreign'), /ungültig/);
  await assert.rejects(store.heartbeatWorker(workerId, 0), /ungültig/);
  await assert.rejects(store.claim(workerId, 7, 'foreign'), /ungültig/);
  assert.equal(calls, 0);
});

test('Postgres-Zeitstempel mit Mikrosekunden und Offset werden ohne Formatverlust gebunden', async () => {
  const result = await storeWith({
    ...claim,
    expiresAt: '2026-10-01T12:01:30.123456+00:00',
    absoluteExpiresAt: '2026-10-01T12:10:00.123456+00:00',
  }).claim(workerId, 7, runnerId);
  assert.equal(result?.syncRead?.expiresAt, '2026-10-01T12:01:30.123456+00:00');
});

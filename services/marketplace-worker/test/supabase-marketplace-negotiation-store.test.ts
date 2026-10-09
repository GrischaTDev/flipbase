import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseMarketplaceNegotiationStore } from '../src/supabase-marketplace-negotiation-store.ts';

const workspaceId = '20000000-0000-4000-8000-000000000001';
const connectionId = '20000000-0000-4000-8000-000000000002';
const userId = '20000000-0000-4000-8000-000000000003';
const jobId = '20000000-0000-4000-8000-000000000004';
const claimToken = '20000000-0000-4000-8000-000000000005';
const workerId = '20000000-0000-4000-8000-000000000006';
const runnerId = '20000000-0000-4000-8000-000000000007';
const sessionId = '20000000-0000-4000-8000-000000000008';
const response = {
  workspaceId,
  connectionId,
  userId,
  jobId,
  claimToken,
  workerId,
  workerEpoch: 4,
  runnerId,
  authorizationVersion: 1,
  externalAccountId: '123',
  sessionId,
  expiresAt: '2026-10-08T12:01:30Z',
  absoluteExpiresAt: '2026-10-08T12:10:00Z',
  command: { kind: 'message', externalConversationId: '777', text: 'Hallo' },
  sourceOffer: null,
  confirmedOffer: null,
};

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { path: string; body: unknown }[] = [];
  const store = new SupabaseMarketplaceNegotiationStore({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-only-test-key',
    now: () => Date.parse('2026-10-08T12:00:00Z'),
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-only-test-key');
      calls.push({ path, body: JSON.parse(String(init?.body)) });
      if (path.endsWith('/marketplace_cloud_negotiation_claim'))
        return Response.json({ ...response, ...overrides });
      if (path.endsWith('/marketplace_cloud_negotiation_check'))
        return Response.json({
          active: true,
          sessionId,
          expiresAt: response.expiresAt,
          absoluteExpiresAt: response.absoluteExpiresAt,
        });
      return Response.json({ ok: true });
    },
  });
  return { store, calls };
}

test('only a matching reserved worker claim becomes a tokenless write scope', async () => {
  const { store, calls } = fixture();
  const claim = await store.claim(workerId, 4, runnerId);
  assert.ok(claim);
  assert.equal(claim.scope.userAccessToken, '');
  assert.equal(claim.scope.syncRead, undefined);
  assert.deepEqual(claim.scope.negotiationWrite, {
    jobId,
    claimToken,
    workerId,
    workerEpoch: 4,
    runnerId,
    sessionId,
    expiresAt: '2026-10-08T12:01:30Z',
    absoluteExpiresAt: '2026-10-08T12:10:00Z',
  });
  assert.deepEqual(calls, [
    {
      path: '/rest/v1/rpc/marketplace_cloud_negotiation_claim',
      body: { p_worker_id: workerId, p_worker_epoch: 4, p_runner_id: runnerId },
    },
  ]);
  assert.equal(await store.check(claim), true);
  await store.begin(claim);
  await store.finish(claim, { outcome: 'sent', externalId: '999' });
  assert.deepEqual(calls.at(-1), {
    path: '/rest/v1/rpc/marketplace_cloud_negotiation_finish',
    body: {
      p_workspace_id: workspaceId,
      p_connection_id: connectionId,
      p_job_id: jobId,
      p_claim_token: claimToken,
      p_worker_id: workerId,
      p_worker_epoch: 4,
      p_outcome: 'sent',
      p_external_id: '999',
      p_error_code: null,
    },
  });
});

for (const [name, overrides] of [
  ['wrong worker', { workerId: '20000000-0000-4000-8000-000000000009' }],
  ['old epoch', { workerEpoch: 3 }],
  ['different runner', { runnerId: '20000000-0000-4000-8000-000000000009' }],
  ['expired lease', { expiresAt: '2026-10-08T11:59:00Z' }],
  ['lease beyond absolute limit', { expiresAt: '2026-10-08T12:11:00Z' }],
  ['invalid account', { externalAccountId: 'https://example.test' }],
  ['invalid request', { command: { externalConversationId: '777', text: '', attachment: null } }],
  ['invalid calendar', { expiresAt: '2026-02-31T12:01:30Z' }],
  ['injected unexpected field', { userAccessToken: 'private-test-token' }],
] as const) {
  test(`${name} is rejected before browser access`, async () => {
    const { store } = fixture(overrides);
    await assert.rejects(
      store.claim(workerId, 4, runnerId),
      /^Error: Cloud-Versandantwort ungültig$/,
    );
  });
}

test('sent cannot be reported without external evidence', async () => {
  const { store, calls } = fixture();
  const claim = await store.claim(workerId, 4, runnerId);
  assert.ok(claim);
  await assert.rejects(store.finish(claim, { outcome: 'sent' }), /Cloud-Versandantwort ungültig/);
  assert.equal(calls.length, 1);
});

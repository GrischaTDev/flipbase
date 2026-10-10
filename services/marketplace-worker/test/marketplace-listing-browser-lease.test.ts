import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseBrowserSessionStore } from '../src/supabase-browser-session-store.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';
const scope: BrowserSessionScope = {
  workspaceId: 'workspace-a',
  connectionId: 'connection-a',
  userId: 'user-a',
  userAccessToken: '',
  listingWrite: {
    jobId: '9007199254740993',
    claimToken: 'claim-a',
    workerId: 'worker-a',
    workerEpoch: 4,
    runnerId: 'runner-a',
    sessionId: 'session-a',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 600000).toISOString(),
  },
};
function fixture() {
  const calls: string[] = [];
  const store = new SupabaseBrowserSessionStore({
    url: 'https://example.test',
    publishableKey: 'public-test',
    serviceRoleKey: 'server-test',
    runtime: { workerId: 'worker-a', workerEpoch: 4 },
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      assert.equal(path, '/rest/v1/rpc/marketplace_cloud_listing_check');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-test');
      assert.equal(JSON.parse(String(init?.body)).p_job_id, '9007199254740993');
      return Response.json({
        active: true,
        sessionId: 'session-a',
        expiresAt: scope.listingWrite!.expiresAt,
        absoluteExpiresAt: scope.listingWrite!.absoluteExpiresAt,
      });
    },
  });
  return { store, calls };
}
test('listing scope uses its reserved service-only lease without user authentication', async () => {
  const f = fixture(),
    lease = await f.store.acquire(scope);
  assert.equal(lease.id, 'session-a');
  assert.equal(await f.store.assertActive(lease), true);
  assert.equal(f.calls.length, 2);
});
test('mixed permissions, user tokens and foreign worker binding never reach the RPC', async () => {
  for (const bad of [
    { ...scope, userAccessToken: 'user-token' },
    { ...scope, negotiationWrite: { ...scope.listingWrite! } },
    { ...scope, listingWrite: { ...scope.listingWrite!, workerEpoch: 5 } },
  ]) {
    const f = fixture();
    await assert.rejects(f.store.acquire(bad));
    assert.deepEqual(f.calls, []);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseMarketplaceListingStore } from '../src/supabase-marketplace-listing-store.ts';
import { listingClaimFixture as fixtureClaim } from './fixtures/marketplace-listing-claim.ts';
const binding = fixtureClaim.scope.listingWrite!;
const response = {
  jobId: fixtureClaim.jobId,
  claimToken: fixtureClaim.claimToken,
  workspaceId: fixtureClaim.scope.workspaceId,
  connectionId: fixtureClaim.scope.connectionId,
  userId: fixtureClaim.scope.userId,
  workerId: binding.workerId,
  workerEpoch: binding.workerEpoch,
  runnerId: binding.runnerId,
  authorizationVersion: 1,
  externalAccountId: fixtureClaim.accountId,
  sessionId: binding.sessionId,
  expiresAt: binding.expiresAt,
  absoluteExpiresAt: binding.absoluteExpiresAt,
  action: fixtureClaim.action,
  snapshot: fixtureClaim.snapshot,
};
function fixture(
  overrides: Record<string, unknown> = {},
  receiptOverrides: Record<string, unknown> = {},
) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const store = new SupabaseMarketplaceListingStore({
    url: 'https://example.test',
    serviceRoleKey: 'server-test',
    now: () => Date.parse('2026-10-09T12:00:00Z'),
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ path, body: JSON.parse(String(init?.body)) });
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-test');
      if (path.endsWith('_claim')) return Response.json({ ...response, ...overrides });
      if (path.endsWith('_check'))
        return Response.json({
          active: true,
          sessionId: binding.sessionId,
          expiresAt: binding.expiresAt,
          absoluteExpiresAt: binding.absoluteExpiresAt,
        });
      if (path.endsWith('_begin')) return Response.json({ ok: true });
      return Response.json({
        id: fixtureClaim.jobId,
        workspaceId: fixtureClaim.scope.workspaceId,
        draftId: '12',
        connectionId: fixtureClaim.scope.connectionId,
        externalAccountId: '123',
        action: 'publish',
        state: 'outcome_unknown',
        ...receiptOverrides,
      });
    },
  });
  return { store, calls };
}
test('only a bound cloud claim becomes a tokenless frozen listing scope', async () => {
  const f = fixture(),
    claim = await f.store.claim(binding.workerId, 4, binding.runnerId);
  assert.ok(claim);
  assert.equal(claim.jobId, '9007199254740993');
  assert.equal(claim.scope.userAccessToken, '');
  assert.ok(Object.isFrozen(claim.snapshot.content));
  assert.equal(await f.store.check(claim), true);
  await f.store.begin(claim);
  await f.store.finish(claim, { outcome: 'outcome_unknown', errorCode: 'timeout' });
  assert.equal(f.calls.at(-1)?.body.p_job_id, '9007199254740993');
  assert.deepEqual(f.calls.at(-1)?.body.p_result, {
    outcome: 'outcome_unknown',
    errorCode: 'timeout',
  });
});

test('receipt confirms the same external item, provider state and verification time', async () => {
  const result = {
    outcome: 'confirmed',
    action: 'publish',
    externalAccountId: '123',
    externalId: '999',
    providerState: 'processing',
    verifiedAt: '2026-10-09T12:00:00.000Z',
  } as const;
  for (const receipt of [
    { externalId: '998' },
    { providerState: 'active' },
    { verifiedAt: '2026-10-09T12:01:00Z' },
    { draftId: '13' },
  ]) {
    const f = fixture(
      {},
      {
        state: 'confirmed',
        externalId: '999',
        providerState: 'processing',
        verifiedAt: result.verifiedAt,
        ...receipt,
      },
    );
    const claim = await f.store.claim(binding.workerId, 4, binding.runnerId);
    assert.ok(claim);
    await assert.rejects(f.store.finish(claim, result), /ungültig/);
  }
});

test('a preparation cancelled by revocation can acknowledge failure without recovery', async () => {
  const f = fixture({}, { state: 'cancelled' }),
    claim = await f.store.claim(binding.workerId, 4, binding.runnerId);
  assert.ok(claim);
  await f.store.finish(claim, { outcome: 'failed', errorCode: 'authorization_expired' });
});
test('claim rejects rounded identifiers, foreign worker, account, connection and unsafe photos', async () => {
  const cases = [
    { jobId: Number('9007199254740993') },
    { workerEpoch: 5 },
    { externalAccountId: 123 },
    { action: 'update' },
    { snapshot: { ...response.snapshot, connectionId: 'other' } },
    { snapshot: { ...response.snapshot, bump: true } },
    {
      snapshot: {
        ...response.snapshot,
        images: [{ ...response.snapshot.images[0], storagePath: 'other-workspace/12/photo.jpg' }],
      },
    },
    {
      snapshot: { ...response.snapshot, images: [{ ...response.snapshot.images[0], byteSize: 0 }] },
    },
    {
      snapshot: {
        ...response.snapshot,
        content: { ...response.snapshot.content, categoryId: '1223' },
      },
    },
  ];
  for (const bad of cases)
    await assert.rejects(
      fixture(bad).store.claim(binding.workerId, 4, binding.runnerId),
      /ungültig/,
    );
});
test('mixed write permissions and wrong-account receipts are rejected before the RPC', async () => {
  const f = fixture(),
    claim = await f.store.claim(binding.workerId, 4, binding.runnerId);
  assert.ok(claim);
  f.calls.length = 0;
  await assert.rejects(
    f.store.begin({
      ...claim,
      scope: { ...claim.scope, messageWrite: { ...binding, messageId: 'other' } },
    }),
  );
  await assert.rejects(
    f.store.finish(claim, {
      outcome: 'confirmed',
      action: 'publish',
      externalAccountId: '124',
      externalId: '999',
      providerState: 'active',
      verifiedAt: '2026-10-09T12:00:00.000Z',
    }),
  );
  assert.deepEqual(f.calls, []);
});

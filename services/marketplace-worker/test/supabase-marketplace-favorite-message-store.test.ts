import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseMarketplaceFavoriteMessageStore } from '../src/supabase-marketplace-favorite-message-store.ts';
const uuid = (number: number) => '38500000-0000-4000-8000-' + String(number).padStart(12, '0');
const payload = {
  eventId: uuid(1),
  claimToken: uuid(2),
  workspaceId: uuid(3),
  connectionId: uuid(4),
  userId: uuid(5),
  workerId: uuid(6),
  workerEpoch: 1,
  runnerId: uuid(7),
  authorizationVersion: 1,
  settingsVersion: 2,
  externalAccountId: '123',
  sessionId: uuid(8),
  expiresAt: '2026-10-08T12:01:30Z',
  absoluteExpiresAt: '2026-10-08T12:10:00Z',
  phase: 'message',
  command: {
    recipientId: '789',
    itemId: '456',
    text: 'Hallo',
    offer: { type: 'percentage', value: 10 },
    conversationId: null,
    transactionId: null,
    externalMessageId: null,
  },
};
function fixture(overrides: Record<string, unknown> = {}) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const store = new SupabaseMarketplaceFavoriteMessageStore({
    url: 'https://db.example.test',
    serviceRoleKey: 'test-only',
    now: () => Date.parse('2026-10-08T12:00:00Z'),
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-only');
      calls.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json(
        path.endsWith('_claim')
          ? { ...payload, ...overrides }
          : path.endsWith('_check')
            ? {
                active: true,
                sessionId: payload.sessionId,
                expiresAt: payload.expiresAt,
                absoluteExpiresAt: payload.absoluteExpiresAt,
              }
            : { ok: true },
      );
    },
  });
  return { store, calls };
}
test('only exact server favorite claims become tokenless isolated scopes', async () => {
  const { store, calls } = fixture();
  const claim = await store.claim(uuid(6), 1, uuid(7));
  assert.ok(claim);
  assert.equal(claim.scope.userAccessToken, '');
  assert.equal(claim.scope.messageWrite, undefined);
  assert.equal(claim.kind, 'favorite_message');
  assert.equal(claim.scope.favoriteWrite?.phase, 'message');
  assert.equal(await store.check(claim), true);
  await store.begin(claim);
  await store.finish(claim, {
    outcome: 'sent',
    externalMessageId: '999',
    conversationId: '777',
    transactionId: '666',
  });
  assert.equal(calls.at(-1)?.body['p_external_id'], '999');
  assert.equal(calls.at(-1)?.body['p_phase'], 'message');
});
test('rejects stale scope, malformed command and incoherent offer phases', async () => {
  for (const override of [
    { workerId: uuid(99) },
    { runnerId: uuid(99) },
    { workerEpoch: 2 },
    { phase: 'other' },
    { settingsVersion: 0 },
    { expiresAt: '2026-10-08T11:59:00Z' },
    { command: { ...payload.command, recipientId: '123' } },
    { phase: 'offer' },
    { extra: 'private' },
  ])
    await assert.rejects(fixture(override).store.claim(uuid(6), 1, uuid(7)));
});
test('preserves proven conversation and price binding in an offer phase', async () => {
  const { store, calls } = fixture({
    phase: 'offer',
    command: {
      ...payload.command,
      conversationId: '777',
      transactionId: '666',
      externalMessageId: '999',
    },
  });
  const claim = await store.claim(uuid(6), 1, uuid(7));
  assert.ok(claim);
  assert.equal(claim.kind, 'favorite_offer');
  await store.begin(claim, 4000, 3600);
  assert.equal(calls.at(-1)?.body['p_original_price_cents'], 4000);
  assert.equal(calls.at(-1)?.body['p_offer_price_cents'], 3600);
  await store.finish(claim, { outcome: 'sent', externalOfferId: '555' });
  assert.equal(calls.at(-1)?.body['p_external_id'], '555');
});

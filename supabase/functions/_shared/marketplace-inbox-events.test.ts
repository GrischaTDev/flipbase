import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMarketplaceInboxEventBatch } from './marketplace-local-extension-contracts.ts';
const batch = {
  version: 1,
  observedAt: '2026-10-08T09:00:00.000Z',
  complete: true,
  coveredConversationIds: ['700'],
  events: [
    {
      externalId: 'message:502',
      externalConversationId: '700',
      occurredAt: '2026-10-08T08:01:00.000Z',
      direction: 'inbound',
      source: 'conversation_snapshot',
    },
  ],
};
test('incoming batch is versioned, bounded and carries no private text or foreign source', () => {
  assert.equal(isMarketplaceInboxEventBatch(batch), true);
  for (const invalid of [
    { ...batch, version: 2 },
    { ...batch, observedAt: '2026-02-30T09:00:00.000Z' },
    { ...batch, events: [batch.events[0], batch.events[0]] },
    { ...batch, events: [{ ...batch.events[0], body: 'private' }] },
    { ...batch, events: [{ ...batch.events[0], direction: 'outbound' }] },
    { ...batch, events: [{ ...batch.events[0], source: 'conversation_list' }] },
    { ...batch, coveredConversationIds: ['0'] },
    { ...batch, events: [{ ...batch.events[0], occurredAt: '2026-10-09T08:01:00.000Z' }] },
  ])
    assert.equal(isMarketplaceInboxEventBatch(invalid), false);
});

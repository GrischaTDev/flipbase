import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMarketplaceInboxEventBatch } from './marketplace-local-extension-contracts.ts';
import { createLocalExtensionHandler } from '../marketplace-local-extension/handler.ts';
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

function capacityBatch(eventCount = 2000, conversationCount = 10) {
  const coveredConversationIds = Array.from(
    { length: conversationCount },
    (_, index) => `9${String(index + 1).padStart(31, '0')}`,
  );
  return {
    ...batch,
    coveredConversationIds,
    events: Array.from({ length: eventCount }, (_, index) => ({
      ...batch.events[0],
      externalId: `offer_request_message:9${String(index + 1).padStart(31, '0')}`,
      externalConversationId: coveredConversationIds[Math.floor(index / 200)] ?? '700',
    })),
  };
}

test('ten complete conversation snapshots retain all two thousand maximum-size events', () => {
  const maximum = capacityBatch();
  assert.equal(new Set(maximum.events.map((event) => event.externalConversationId)).size, 10);
  assert.equal(new TextEncoder().encode(JSON.stringify(maximum)).byteLength, 454457);
  assert.equal(isMarketplaceInboxEventBatch(maximum), true);
});

test('the inbox batch rejects an eleventh conversation, a two thousand first event and oversized bytes', () => {
  assert.equal(isMarketplaceInboxEventBatch(capacityBatch(0, 11)), false);
  assert.equal(isMarketplaceInboxEventBatch(capacityBatch(2001)), false);
  const oversized = { ...batch, observedAt: 'x'.repeat(512 * 1024) };
  assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).byteLength > 512 * 1024);
  assert.equal(isMarketplaceInboxEventBatch(oversized), false);
});

test('the HTTP importer forwards every maximum batch event and enforces the exact 512 KiB body boundary', async () => {
  const maximum = capacityBatch();
  let imports = 0;
  const handler = createLocalExtensionHandler({
    ingest: async () => assert.fail('wrong importer'),
    inboxImport: async (_tokenHash, input) => {
      assert.equal(input.action, 'inbox_import');
      if (input.action !== 'inbox_import') assert.fail('wrong action');
      assert.deepEqual(input.batch.inboxEvents, maximum);
      imports += 1;
      return { ok: true };
    },
  });
  const body = JSON.stringify({
    action: 'inbox_import',
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    batch: {
      identity: { id: '90' },
      observedAt: maximum.observedAt,
      page: 1,
      nextPage: 1,
      conversationsComplete: false,
      entries: [],
      inboxEvents: maximum,
    },
  });
  const request = (raw: string) =>
    new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: `Bearer ${'ab'.repeat(32)}`, 'content-type': 'application/json' },
      body: raw,
    });
  assert.equal((await handler(request(body))).status, 200);
  const atLimit = body + ' '.repeat(512 * 1024 - new TextEncoder().encode(body).byteLength);
  assert.equal((await handler(request(atLimit))).status, 200);
  assert.equal((await handler(request(atLimit + ' '))).status, 400);
  assert.equal(imports, 2);
});

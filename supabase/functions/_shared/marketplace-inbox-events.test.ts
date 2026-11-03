import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMarketplaceInboxEventBatch } from './marketplace-local-extension-contracts.ts';
import { marketplaceInboxEventMaxBytes } from './marketplace-inbox-notification-kinds.mjs';
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

test('system event identifiers allow bounded provider ids or stable hashes only for known source kinds', () => {
  for (const kind of ['status_message', 'action_message', 'payment_message']) {
    for (const id of ['503', `event:${'ab'.repeat(32)}`])
      assert.equal(
        isMarketplaceInboxEventBatch({
          ...batch,
          events: [{ ...batch.events[0], externalId: `${kind}:${id}` }],
        }),
        true,
      );
  }
  for (const externalId of [
    'purchase:503',
    'system_message:503',
    `message:event:${'ab'.repeat(32)}`,
    `payment_message:event:${'ab'.repeat(31)}`,
    'status_message:0',
    `action_message:event:${'AB'.repeat(32)}`,
  ])
    assert.equal(
      isMarketplaceInboxEventBatch({ ...batch, events: [{ ...batch.events[0], externalId }] }),
      false,
    );
});

test('optional notification kinds preserve old batches and reject source mismatches or unknown content', () => {
  const accepts = (event: Record<string, unknown>) =>
    isMarketplaceInboxEventBatch({ ...batch, events: [event] });
  const event = batch.events[0]!;
  assert.equal(accepts(event), true);
  assert.equal(accepts({ ...event, notificationKind: 'message' }), true);
  assert.equal(
    accepts({
      ...event,
      externalId: 'offer_request_message:503',
      notificationKind: 'offer_received',
    }),
    true,
  );
  for (const notificationKind of [
    'sale_sold',
    'purchase_created',
    'order_cancelled',
    'transaction_cancelled',
    'item_relisted',
    'shipping_label_ready',
    'shipment_sent',
    'ready_for_pickup',
    'delivered',
    'order_completed',
    'order_suspended',
    'issue_reported',
    'refund_started',
    'refund_completed',
    'refund_accepted',
    'return_shipped',
    'feedback_received',
    'feedback_sent',
    'support_closed',
    'item_unavailable',
    'other_status',
  ]) {
    assert.equal(
      accepts({ ...event, externalId: 'action_message:503', notificationKind }),
      true,
      notificationKind,
    );
    assert.equal(accepts({ ...event, notificationKind }), false, notificationKind);
  }
  for (const notificationKind of [
    'unknown',
    'constructor',
    'x'.repeat(10000),
    null,
    undefined,
    {},
    'offer_received',
  ])
    assert.equal(accepts({ ...event, notificationKind }), false);
  for (const externalId of [
    'offer_request_message:503',
    'status_message:503',
    'action_message:503',
    'payment_message:503',
  ])
    assert.equal(accepts({ ...event, externalId, notificationKind: 'message' }), false);
  assert.equal(
    accepts({ ...event, externalId: 'status_message:503', notificationKind: 'offer_received' }),
    false,
  );
  assert.equal(accepts({ ...event, notificationKind: 'message', privateText: 'forbidden' }), false);
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

test('the full bounded batch also accepts stable identifiers for platform payment notices', () => {
  const maximum = capacityBatch();
  maximum.events = maximum.events.map((event, index) => ({
    ...event,
    externalId: `payment_message:event:${index.toString(16).padStart(64, '0')}`,
    notificationKind: 'transaction_cancelled',
  }));
  assert.equal(new TextEncoder().encode(JSON.stringify(maximum)).byteLength, 604457);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(maximum)).byteLength <= marketplaceInboxEventMaxBytes,
  );
  assert.equal(isMarketplaceInboxEventBatch(maximum), true);
});

test('the inbox batch rejects an eleventh conversation, a two thousand first event and oversized bytes', () => {
  assert.equal(isMarketplaceInboxEventBatch(capacityBatch(0, 11)), false);
  assert.equal(isMarketplaceInboxEventBatch(capacityBatch(2001)), false);
  const oversized = { ...batch, observedAt: 'x'.repeat(marketplaceInboxEventMaxBytes) };
  assert.ok(
    new TextEncoder().encode(JSON.stringify(oversized)).byteLength > marketplaceInboxEventMaxBytes,
  );
  assert.equal(isMarketplaceInboxEventBatch(oversized), false);
});

test('the HTTP importer forwards every maximum batch event and enforces the exact 768 KiB body boundary', async () => {
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
  const atLimit =
    body + ' '.repeat(marketplaceInboxEventMaxBytes - new TextEncoder().encode(body).byteLength);
  assert.equal((await handler(request(atLimit))).status, 200);
  assert.equal((await handler(request(atLimit + ' '))).status, 400);
  assert.equal(imports, 2);
});

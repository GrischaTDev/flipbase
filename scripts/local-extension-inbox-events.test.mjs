import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const inbox = require('../tools/flipbase-extension/vinted-local-inbox-events.js');
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../services/marketplace-worker/test/fixtures/vinted-inbox-events/unread-conversation.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
test('incoming snapshot contract needs no browser, text or unread transition', () => {
  const result = inbox.parse(fixture, '90', '2026-10-08T09:00:00.000Z');
  assert.equal(result.events.length, 2);
  assert.equal(result.complete, true);
  assert.deepEqual(result.coveredConversationIds, ['700']);
  assert.ok(result.events.every((event) => event.direction === 'inbound' && !('body' in event)));
});

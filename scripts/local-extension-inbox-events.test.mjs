import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const inbox = require('../tools/flipbase-extension/vinted-local-inbox-events.js');
const core = require('../tools/flipbase-extension/vinted-local-core.js');
const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../services/marketplace-worker/test/fixtures/vinted-inbox-events/unread-conversation.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
test('nonempty inbox without verifiable partners cannot establish a baseline', async () => {
  for (const isEmpty of [false, true]) {
    const paths = [];
    const batch = await core.readInbox(
      async (path) => {
        paths.push(path);
        if (path === '/api/v2/users/current') return { user: { id: 90, login: 'testkonto' } };
        if (path.startsWith('/api/v2/inbox'))
          return {
            conversations: isEmpty
              ? []
              : [
                  {
                    id: 700,
                    unread: true,
                    opposite_user: { id: 0 },
                    updated_at: '2026-10-08T08:01:00Z',
                  },
                ],
            pagination: { total_pages: 1 },
          };
        assert.fail('Unexpected detail request');
      },
      '90',
      { nextPage: 1, versions: [], mode: 'latest' },
      () => '2026-10-08T09:00:00.000Z',
    );
    assert.equal(batch.inboxEvents.complete, isEmpty);
    assert.deepEqual(batch.inboxEvents.coveredConversationIds, []);
    assert.equal(
      paths.some((path) => path.startsWith('/api/v2/conversations/')),
      false,
    );
  }
});
test('incoming snapshot contract needs no browser, text or unread transition', () => {
  const result = inbox.parse(fixture, '90', '2026-10-08T09:00:00.000Z');
  assert.equal(result.events.length, 2);
  assert.equal(result.complete, true);
  assert.deepEqual(result.coveredConversationIds, ['700']);
  assert.ok(result.events.every((event) => event.direction === 'inbound' && !('body' in event)));
});

test('extension imports changed unread snapshots with the same events and checks status after GET', async () => {
  const paths = [];
  const batch = await core.readInbox(
    async (path) => {
      paths.push(path);
      if (path === '/api/v2/users/current') return { user: { id: 90, login: 'testkonto' } };
      if (path.startsWith('/api/v2/inbox'))
        return {
          conversations: [
            {
              id: 700,
              unread: true,
              opposite_user: { id: 91 },
              updated_at: '2026-10-08T08:01:00Z',
            },
          ],
          pagination: { total_pages: 1 },
        };
      if (path === '/api/v2/conversations/700') return fixture;
      assert.fail('Unexpected provider request');
    },
    '90',
    { nextPage: 1, versions: [], mode: 'latest' },
    () => '2026-10-08T09:00:00.000Z',
  );
  assert.equal(batch.inboxEvents.events.length, 2);
  assert.deepEqual(batch.inboxEvents.coveredConversationIds, ['700']);
  assert.equal(paths.filter((path) => path.startsWith('/api/v2/inbox')).length, 2);
  assert.equal(batch.entries.find((entry) => entry.kind === 'conversation').body.unread, true);
});

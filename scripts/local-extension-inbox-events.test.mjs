import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
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

test('compiled worker inbox classification loads the shared extension runtime from the deployed app/dist layout', async () => {
  const docker = readFileSync(
    new URL('../services/marketplace-worker/Dockerfile', import.meta.url),
    'utf8',
  );
  const session = readFileSync(
    new URL('../services/marketplace-worker/Dockerfile.chromium-session', import.meta.url),
    'utf8',
  );
  assert.ok(
    docker.includes(
      'COPY tools/flipbase-extension/vinted-local-inbox-events.js /tools/flipbase-extension/',
    ),
  );
  assert.ok(
    docker.includes(
      'COPY supabase/functions/_shared/marketplace-inbox-notification-kinds.mjs /supabase/functions/_shared/',
    ),
  );
  assert.ok(
    session.includes(
      'COPY --from=extension vinted-local-inbox-events.js /tools/flipbase-extension/',
    ),
  );
  assert.ok(
    session.includes(
      'COPY --from=shared marketplace-inbox-notification-kinds.mjs /supabase/functions/_shared/',
    ),
  );
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'flipbase-inbox-layout-'));
  try {
    const app = join(fixtureRoot, 'runtime', 'app');
    const dist = join(app, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(app, 'package.json'), '{"type":"module"}');
    const wrapperPath = join(dist, 'vinted-inbox-events.js');
    const source = readFileSync(
      new URL('../services/marketplace-worker/src/vinted-inbox-events.ts', import.meta.url),
      'utf8',
    );
    writeFileSync(
      wrapperPath,
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    );
    const runtimePath = fileURLToPath(
      new URL(
        '../../../tools/flipbase-extension/vinted-local-inbox-events.js',
        pathToFileURL(wrapperPath),
      ),
    );
    assert.equal(
      runtimePath,
      join(fixtureRoot, 'tools', 'flipbase-extension', 'vinted-local-inbox-events.js'),
    );
    mkdirSync(dirname(runtimePath), { recursive: true });
    writeFileSync(
      runtimePath,
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-inbox-events.js', import.meta.url),
      ),
    );
    const deployed = await import(pathToFileURL(wrapperPath).href);
    const batch = deployed.parseVintedInboxEvents(fixture, '90', '2026-10-08T09:00:00.000Z');
    assert.deepEqual(
      batch.events.map((event) => event.notificationKind),
      ['offer_received', 'message'],
    );
  } finally {
    assert.ok(fixtureRoot.startsWith(join(tmpdir(), 'flipbase-inbox-layout-')));
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
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
test('incoming snapshot contract needs no browser, text or unread transition', async () => {
  const result = await inbox.parse(fixture, '90', '2026-10-08T09:00:00.000Z');
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

test('extension imports an identified platform payment notice and awaits its stable event identity', async () => {
  const snapshot = structuredClone(fixture);
  snapshot.conversation.messages.push({
    entity_type: 'payment_message',
    created_at_ts: '2026-10-08T08:02:00Z',
    entity: { title: 'Zahlung', body: 'Synthetische Postfachmeldung' },
  });
  const batch = await core.readInbox(
    async (path) => {
      if (path === '/api/v2/users/current') return { user: { id: 90, login: 'testkonto' } };
      if (path.startsWith('/api/v2/inbox'))
        return {
          conversations: [
            {
              id: 700,
              unread: true,
              opposite_user: { id: 91 },
              updated_at: '2026-10-08T08:02:00Z',
            },
          ],
          pagination: { total_pages: 1 },
        };
      if (path === '/api/v2/conversations/700') return snapshot;
      assert.fail('Unexpected provider request');
    },
    '90',
    { nextPage: 1, versions: [], mode: 'latest' },
    () => '2026-10-08T09:00:00.000Z',
  );
  assert.equal(batch.inboxEvents.complete, true);
  assert.equal(batch.inboxEvents.events.length, 3);
  assert.match(batch.inboxEvents.events[2].externalId, /^payment_message:event:[a-f0-9]{64}$/);
  assert.equal(
    batch.entries.find((entry) => entry.body.messageType === 'payment_message').body.text,
    'Synthetische Postfachmeldung',
  );
  assert.ok(!JSON.stringify(batch.inboxEvents).includes('Synthetische Postfachmeldung'));
});

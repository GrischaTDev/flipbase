import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './service-worker-test-fixture.mjs';
const payload = {
  version: 1,
  eventId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  category: 'order',
  title: 'Private customer',
  body: 'Private order contents',
  target: { kind: 'store_orders' },
};
test('push shows only generic content and a stable event tag', async () => {
  const worker = createWorker();
  for (let index = 0; index < 2; index++)
    await worker.dispatch('push', { data: { text: () => JSON.stringify(payload) } });
  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[0].options.tag, worker.messages[1].options.tag);
  assert.equal(worker.messages[0].title, 'Flipbase');
  assert.equal(worker.messages[0].options.body, 'Eine neue Bestellung ist eingegangen.');
});
test('invalid payloads remain visible but never carry an untrusted target', async () => {
  const worker = createWorker();
  for (const text of [
    'broken',
    JSON.stringify({ ...payload, version: 2 }),
    JSON.stringify({ ...payload, target: { kind: 'store_orders', url: 'https://evil.test' } }),
  ])
    await worker.dispatch('push', { data: { text: () => text } });
  assert.ok(worker.messages.every((message) => message.options.data === null));
  await worker.dispatch('notificationclick', {
    notification: { data: { ...payload, target: { url: 'https://evil.test' } }, close() {} },
  });
  assert.ok(worker.calls.includes('open:https://app.flipbase.test/auth/login'));
});
test('notification click focuses an app without changing its route directly', async () => {
  let focused = false;
  const messages = [];
  const view = {
    id: 'view',
    url: 'https://app.flipbase.test/purchases/new',
    async focus() {
      focused = true;
    },
    postMessage(message) {
      messages.push(message);
    },
  };
  const worker = createWorker({ clients: [view] });
  await worker.dispatch('notificationclick', { notification: { data: payload, close() {} } });
  assert.equal(focused, true);
  assert.equal(messages[0].type, 'PWA_PUSH_OPEN');
  assert.equal(worker.calls.length, 0);
});
test('closed app receives only same-origin structured entry context', async () => {
  const worker = createWorker();
  await worker.dispatch('notificationclick', { notification: { data: payload, close() {} } });
  const opened = new URL(worker.calls[0].slice(5));
  assert.equal(opened.origin, 'https://app.flipbase.test');
  assert.equal(opened.pathname, '/push/open');
  assert.deepEqual(JSON.parse(opened.searchParams.get('context')), payload);
});
test('favorites show generic text and preserve only the structured authorized target', async () => {
  const worker = createWorker();
  const favorite = {
    ...payload,
    category: 'favorite',
    target: { kind: 'vinted_favorites', connectionId: payload.workspaceId },
  };
  await worker.dispatch('push', { data: { text: () => JSON.stringify(favorite) } });
  assert.equal(worker.messages[0].options.body, 'Deine Inserate haben neue Favoriten.');
  assert.deepEqual(JSON.parse(JSON.stringify(worker.messages[0].options.data)), favorite);
});

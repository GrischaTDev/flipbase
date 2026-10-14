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
  assert.equal(worker.messages[0].title, 'Neue Bestellung');
  assert.equal(worker.messages[0].options.body, 'Eine neue Bestellung ist eingegangen.');
  assert.equal(worker.messages[0].options.icon, '/images/logo-mark-192.png');
  assert.equal(worker.messages[0].options.badge, '/icons/push-badge-monochrome-96.png');
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
  assert.ok(worker.messages.every((message) => message.title === 'Flipbase'));
  assert.ok(worker.messages.every((message) => message.options.actions.length === 0));
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
  assert.equal(worker.messages[0].title, 'Neue Favoriten auf Vinted');
  assert.equal(worker.messages[0].options.body, 'Deine Inserate haben neue Favoriten.');
  assert.deepEqual(JSON.parse(JSON.stringify(worker.messages[0].options.data)), favorite);
});

test('mobile notifications omit the additional logo but keep the status badge', async () => {
  for (const navigator of [
    {
      userAgent:
        'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
    },
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15' },
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15' },
    { userAgent: 'reduced agent', userAgentData: { mobile: true } },
  ]) {
    const worker = createWorker({ navigator });
    await worker.dispatch('push', { data: { text: () => JSON.stringify(payload) } });
    const notification = worker.messages[0];
    assert.equal(Object.hasOwn(notification.options, 'icon'), false);
    assert.equal(notification.options.badge, '/icons/push-badge-monochrome-96.png');
    assert.equal(notification.title, 'Neue Bestellung');
  }
});

test('validated categories have clear generic headings and opening actions', async () => {
  const cases = [
    [
      'message',
      {
        kind: 'vinted_message',
        connectionId: payload.workspaceId,
        conversationId: payload.eventId,
      },
      'Neue Marktplatznachricht',
      'Nachricht öffnen',
    ],
    [
      'order',
      { kind: 'ebay_orders', connectionId: payload.workspaceId },
      'Neue Bestellung',
      'Bestellungen öffnen',
    ],
    [
      'favorite',
      { kind: 'vinted_favorites', connectionId: payload.workspaceId },
      'Neue Favoriten auf Vinted',
      'Inserate öffnen',
    ],
    [
      'connection',
      { kind: 'connection', connectionId: payload.workspaceId },
      'Kontoverbindung prüfen',
      'Konto prüfen',
    ],
    ['test', { kind: 'settings' }, 'Flipbase: Testbenachrichtigung', 'Einstellungen öffnen'],
  ];
  for (const [category, target, title, actionTitle] of cases) {
    const worker = createWorker();
    const context = { ...payload, category, target };
    await worker.dispatch('push', { data: { text: () => JSON.stringify(context) } });
    const notification = worker.messages[0];
    assert.equal(notification.title, title);
    assert.equal(notification.options.actions.length, 1);
    assert.equal(notification.options.actions[0].title, actionTitle);
    assert.equal(notification.options.actions[0].action, 'open');
    assert.equal(notification.title.includes(payload.title), false);
    assert.equal(notification.options.body.includes(payload.body), false);
    await worker.dispatch('notificationclick', {
      action: 'open',
      notification: { data: notification.options.data, close() {} },
    });
    const opened = new URL(worker.calls[0].slice(5));
    assert.equal(opened.origin, 'https://app.flipbase.test');
    assert.equal(opened.pathname, '/push/open');
    assert.deepEqual(JSON.parse(opened.searchParams.get('context')), context);
  }
});

test('browsers without notification actions still receive a clickable notification', async () => {
  for (const maxActions of [0, null]) {
    const worker = createWorker({ maxActions });
    await worker.dispatch('push', { data: { text: () => JSON.stringify(payload) } });
    assert.equal(worker.messages[0].options.actions.length, 0);
    await worker.dispatch('notificationclick', {
      notification: { data: worker.messages[0].options.data, close() {} },
    });
    assert.equal(new URL(worker.calls[0].slice(5)).pathname, '/push/open');
  }
});

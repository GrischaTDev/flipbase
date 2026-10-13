import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './service-worker-test-fixture.mjs';

function client(id, behavior = 'safe') {
  return {
    id,
    url: 'https://app.flipbase.test/purchases',
    messages: [],
    worker: null,
    postMessage(message) {
      this.messages.push(message);
      if (!['PWA_PREPARE_UPDATE', 'PWA_COMMIT_UPDATE'].includes(message.type)) return;
      const type =
        message.type === 'PWA_PREPARE_UPDATE' ? 'PWA_UPDATE_ACK' : 'PWA_UPDATE_COMMIT_ACK';
      const data = {
        type,
        attemptId: message.attemptId,
        buildId: message.buildId,
        clientBuildId: 'b'.repeat(64),
        safe: behavior !== 'blocked',
      };
      queueMicrotask(() => {
        if (behavior === 'stale') data.attemptId = 'stale';
        void this.worker.dispatch('message', { source: this, data });
        if (behavior === 'revoke' && type === 'PWA_UPDATE_ACK')
          void this.worker.dispatch('message', {
            source: this,
            data: { ...data, type: 'PWA_UPDATE_REVOKE' },
          });
        if (behavior === 'new-client' && type === 'PWA_UPDATE_ACK')
          this.worker.clients.push({ id: 'new-tab', postMessage() {} });
      });
    },
  };
}
for (const behavior of ['blocked', 'revoke', 'stale', 'new-client']) {
  test(`update is blocked for ${behavior} client state`, async () => {
    const view = client('one', behavior);
    const worker = createWorker({ clients: [view] });
    view.worker = worker;
    await worker.dispatch('install');
    await worker.dispatch('message', {
      source: view,
      data: { type: 'ACTIVATE_UPDATE', attemptId: 'try-one', buildId: worker.inventory.buildId },
    });
    assert.equal(worker.skipCount, 0);
    assert.ok(
      view.messages.some(
        (message) => message.type === 'PWA_UPDATE_RESULT' && message.result === 'blocked',
      ),
    );
  });
}
test('all clients must confirm the same attempt twice before activation; old ACKs after restart are ignored', async () => {
  const first = client('one');
  const second = client('two');
  const worker = createWorker({ clients: [first, second] });
  first.worker = worker;
  second.worker = worker;
  await worker.dispatch('install');
  await worker.dispatch('message', {
    source: first,
    data: { type: 'ACTIVATE_UPDATE', attemptId: 'try-one', buildId: worker.inventory.buildId },
  });
  assert.equal(worker.skipCount, 1);
  assert.ok(second.messages.some((message) => message.type === 'PWA_COMMIT_UPDATE'));
  const restarted = createWorker({ clients: [first] });
  await restarted.dispatch('message', {
    source: first,
    data: {
      type: 'PWA_UPDATE_COMMIT_ACK',
      attemptId: 'try-one',
      buildId: restarted.inventory.buildId,
      safe: true,
    },
  });
  assert.equal(restarted.skipCount, 0);
});
test('a revoked update keeps every existing view bound to its acknowledged build', async () => {
  const view = client('one');
  const worker = createWorker({ clients: [view] });
  view.worker = worker;
  await worker.dispatch('install');
  const open = worker.caches.open.bind(worker.caches);
  worker.caches.open = async (name) => {
    const cache = await open(name);
    if (name !== 'flipbase-pwa-clients') return cache;
    return {
      ...cache,
      async put(request, response) {
        await cache.put(request, response);
        const commit = view.messages.find((message) => message.type === 'PWA_COMMIT_UPDATE');
        if (commit)
          await worker.dispatch('message', {
            source: view,
            data: { ...commit, type: 'PWA_UPDATE_REVOKE' },
          });
      },
    };
  };
  await worker.dispatch('message', {
    source: view,
    data: { type: 'ACTIVATE_UPDATE', attemptId: 'try-revoke', buildId: worker.inventory.buildId },
  });
  assert.equal(worker.skipCount, 0);
  assert.equal(
    await (
      await (await worker.caches.open('flipbase-pwa-clients')).match('/__pwa_clients/one')
    ).text(),
    'b'.repeat(64),
  );
});
test('a new view arriving during durable bindings blocks activation', async () => {
  const view = client('one');
  const worker = createWorker({ clients: [view] });
  view.worker = worker;
  await worker.dispatch('install');
  const open = worker.caches.open.bind(worker.caches);
  worker.caches.open = async (name) => {
    const cache = await open(name);
    return name === 'flipbase-pwa-clients'
      ? {
          ...cache,
          async put(request, response) {
            await cache.put(request, response);
            worker.clients.push({ id: 'new-during-commit', postMessage() {} });
          },
        }
      : cache;
  };
  await worker.dispatch('message', {
    source: view,
    data: { type: 'ACTIVATE_UPDATE', attemptId: 'try-new', buildId: worker.inventory.buildId },
  });
  assert.equal(worker.skipCount, 0);
});

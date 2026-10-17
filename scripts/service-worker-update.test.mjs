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
      if (behavior === 'missing-commit' && type === 'PWA_UPDATE_COMMIT_ACK') return;
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

async function pinSleepingView(worker, view) {
  const previousBuild = 'b'.repeat(64);
  const { createHash } = await import('node:crypto');
  const assets = [
    { url: '/index.html', content: '<html>previous-view</html>' },
    { url: '/chunk-PREVIOUS.js', content: 'previous-lazy-chunk' },
  ];
  const cache = await worker.caches.open(`flipbase-app-${previousBuild}`);
  for (const asset of assets) await cache.put(asset.url, new Response(asset.content));
  await cache.put(
    '/pwa-assets.json',
    Response.json({
      version: 1,
      buildId: previousBuild,
      assets: assets.map(({ url, content }) => ({
        url,
        sha256: createHash('sha256').update(content).digest('hex'),
      })),
    }),
  );
  await (
    await worker.caches.open('flipbase-pwa-clients')
  ).put(`/__pwa_clients/${view.id}`, new Response(previousBuild));
  return cache;
}

test('a pinned sleeping view keeps its old chunks while the requesting view can update', async () => {
  const requester = client('requester');
  const sleeping = {
    id: 'sleeping',
    messages: [],
    postMessage(message) {
      this.messages.push(message);
    },
  };
  const worker = createWorker({ clients: [requester, sleeping] });
  requester.worker = worker;
  await worker.dispatch('install');
  await pinSleepingView(worker, sleeping);
  await worker.dispatch('message', {
    source: requester,
    data: {
      type: 'ACTIVATE_UPDATE',
      attemptId: 'sleeping-view',
      buildId: worker.inventory.buildId,
    },
  });
  assert.equal(worker.skipCount, 1);
  assert.equal(
    await (await worker.request('/chunk-PREVIOUS.js', sleeping.id)).text(),
    'previous-lazy-chunk',
  );
});

for (const damage of ['unbound', 'missing-chunk', 'corrupt-chunk', 'changed-binding']) {
  test(`a sleeping view blocks activation when its preserved build is ${damage}`, async () => {
    const requester = client('requester');
    const sleeping = {
      id: 'sleeping',
      postMessage(message) {
        if (damage === 'changed-binding' && message.type === 'PWA_COMMIT_UPDATE')
          worker.storage
            .get('flipbase-pwa-clients')
            .set('https://app.flipbase.test/__pwa_clients/sleeping', new Response('c'.repeat(64)));
      },
    };
    const worker = createWorker({ clients: [requester, sleeping] });
    requester.worker = worker;
    await worker.dispatch('install');
    if (damage !== 'unbound') {
      const cache = await pinSleepingView(worker, sleeping);
      if (damage === 'missing-chunk') await cache.delete('/chunk-PREVIOUS.js');
      if (damage === 'corrupt-chunk')
        await cache.put('/chunk-PREVIOUS.js', new Response('wrong-chunk'));
    }
    await worker.dispatch('message', {
      source: requester,
      data: { type: 'ACTIVATE_UPDATE', attemptId: damage, buildId: worker.inventory.buildId },
    });
    assert.equal(worker.skipCount, 0);
  });
}

test('a sleeping requester never gets implicit permission even with a preserved build', async () => {
  const requester = { id: 'sleeping-requester', postMessage() {} };
  const worker = createWorker({ clients: [requester] });
  await worker.dispatch('install');
  await pinSleepingView(worker, requester);
  await worker.dispatch('message', {
    source: requester,
    data: {
      type: 'ACTIVATE_UPDATE',
      attemptId: 'missing-requester-consent',
      buildId: worker.inventory.buildId,
    },
  });
  assert.equal(worker.skipCount, 0);
});

test('a responsive dirty view still blocks activation even when its old build is cached', async () => {
  const requester = client('requester');
  const dirty = client('dirty-view', 'blocked');
  const worker = createWorker({ clients: [requester, dirty] });
  requester.worker = worker;
  dirty.worker = worker;
  await worker.dispatch('install');
  await pinSleepingView(worker, dirty);
  await worker.dispatch('message', {
    source: requester,
    data: { type: 'ACTIVATE_UPDATE', attemptId: 'dirty-view', buildId: worker.inventory.buildId },
  });
  assert.equal(worker.skipCount, 0);
});

test('the requesting view must confirm commit even when another view is preserved', async () => {
  const requester = client('requester', 'missing-commit');
  const sleeping = { id: 'sleeping', postMessage() {} };
  const worker = createWorker({ clients: [requester, sleeping] });
  requester.worker = worker;
  await worker.dispatch('install');
  await pinSleepingView(worker, sleeping);
  await worker.dispatch('message', {
    source: requester,
    data: {
      type: 'ACTIVATE_UPDATE',
      attemptId: 'missing-commit',
      buildId: worker.inventory.buildId,
    },
  });
  assert.equal(worker.skipCount, 0);
});

test('a revoke during sleeping-view cache verification still blocks activation', async () => {
  const requester = client('requester');
  const sleeping = { id: 'sleeping', postMessage() {} };
  const worker = createWorker({ clients: [requester, sleeping] });
  requester.worker = worker;
  await worker.dispatch('install');
  await pinSleepingView(worker, sleeping);
  const open = worker.caches.open.bind(worker.caches);
  worker.caches.open = async (name) => {
    const cache = await open(name);
    return name === `flipbase-app-${'b'.repeat(64)}`
      ? {
          ...cache,
          async match(request) {
            if (request === '/chunk-PREVIOUS.js')
              await worker.dispatch('message', {
                source: requester,
                data: {
                  type: 'PWA_UPDATE_REVOKE',
                  attemptId: 'revoke-during-verification',
                  buildId: worker.inventory.buildId,
                },
              });
            return cache.match(request);
          },
        }
      : cache;
  };
  await worker.dispatch('message', {
    source: requester,
    data: {
      type: 'ACTIVATE_UPDATE',
      attemptId: 'revoke-during-verification',
      buildId: worker.inventory.buildId,
    },
  });
  assert.equal(worker.skipCount, 0);
});

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

test('reports the baked release version with waiting and active build identity', async () => {
  const view = client('one');
  const worker = createWorker({ clients: [view] });
  await worker.dispatch('message', { source: view, data: { type: 'PWA_UPDATE_QUERY' } });
  await worker.dispatch('message', { source: view, data: { type: 'PWA_ACTIVE_QUERY' } });
  assert.equal(view.messages[0].version, '0.42.7');
  assert.equal(view.messages[1].version, '0.42.7');
  assert.equal(view.messages[0].buildId, worker.inventory.buildId);
});

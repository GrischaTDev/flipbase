import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from './service-worker-test-fixture.mjs';

test('installation caches the complete verified build without forcing activation', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  assert.equal(worker.skipCount, 0);
  assert.equal(await (await worker.request('/chunk-A1.js')).text(), 'lazy-a');
  worker.resources.clear();
  assert.equal(
    await (await worker.request('navigate:/purchases/new')).text(),
    '<html>build-a</html>',
  );
  assert.equal(
    await (await worker.request('navigate:/auth/register')).text(),
    '<html>build-a</html>',
  );
});
test('mismatched inventory or missing file does not activate a partial build', async () => {
  const corrupt = createWorker({ corrupt: true });
  await assert.rejects(corrupt.dispatch('install'));
  const missing = createWorker();
  missing.resources.delete('/chunk-A1.js');
  await assert.rejects(missing.dispatch('install'));
  assert.equal(missing.skipCount, 0);
  assert.equal(
    (await missing.caches.keys()).filter((name) => name.startsWith('flipbase-app-')).length,
    0,
  );
});
test('worker excludes auth, business and external requests, including misleading file extensions', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  for (const path of [
    '/auth/token.js',
    '/rest/v1/data.json',
    '/storage/private.png',
    '/functions/v1/action.js',
    '/api/session.js',
    '/marketplace-browser/image.png',
    '/orders.json',
    'https://external.test/a.js',
  ]) {
    assert.equal(await worker.request(path), undefined, path);
  }
});
test('runtime repairs only matching build bytes and refuses corrupted/new release content', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  const cache = await worker.caches.open(`flipbase-app-${worker.inventory.buildId}`);
  await cache.delete('/chunk-A1.js');
  assert.equal(await (await worker.request('/chunk-A1.js')).text(), 'lazy-a');
  await cache.put('/chunk-A1.js', new Response('damaged'));
  worker.resources.set('/chunk-A1.js', 'new release');
  assert.equal((await worker.request('/chunk-A1.js')).status, 503);
  const callsBefore = worker.calls.length;
  assert.equal((await worker.request('/chunk-A1.js')).status, 503);
  assert.equal(worker.calls.length, callsBefore, 'repair is bounded');
});
test('activation preserves unrelated browser caches', async () => {
  const worker = createWorker();
  await worker.caches.open('another-app-cache');
  await worker.dispatch('install');
  await worker.dispatch('activate');
  assert.ok((await worker.caches.keys()).includes('another-app-cache'));
});
test('old views report readiness for their own build and can retry on a new app start', async () => {
  const view = {
    id: 'old-view',
    messages: [],
    postMessage(message) {
      this.messages.push(message);
    },
  };
  const worker = createWorker({ clients: [view] });
  await worker.dispatch('install');
  const previousId = 'b'.repeat(64);
  const previous = await worker.caches.open(`flipbase-app-${previousId}`);
  await previous.put(
    '/pwa-assets.json',
    Response.json({ ...worker.inventory, buildId: previousId }),
  );
  for (const asset of worker.inventory.assets.filter((asset) => asset.url !== '/chunk-A1.js'))
    await previous.put(asset.url, new Response(worker.resources.get(asset.url)));
  const clients = await worker.caches.open('flipbase-pwa-clients');
  await clients.put('/__pwa_clients/old-view', new Response(previousId));
  worker.resources.delete('/chunk-A1.js');
  assert.equal((await worker.request('/chunk-A1.js', view.id)).status, 503);
  await worker.dispatch('message', { source: view, data: { type: 'PWA_STATUS' } });
  assert.equal(view.messages.at(-1).buildId, previousId);
  assert.equal(view.messages.at(-1).ready, false);
  worker.resources.set('/chunk-A1.js', 'lazy-a');
  assert.equal(
    (await worker.request('/chunk-A1.js', view.id)).status,
    503,
    'same start stays bounded',
  );
  await clients.put('/__pwa_clients/reopened-view', new Response(previousId));
  assert.equal(
    (await worker.request('/chunk-A1.js', 'reopened-view')).status,
    200,
    'a reopened view gets one verified repair',
  );
  await worker.dispatch('message', { source: view, data: { type: 'PWA_STATUS' } });
  assert.equal(view.messages.at(-1).ready, true);
});
test('cold navigations use the resulting document identity for repair limits', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  await (
    await worker.caches.open(`flipbase-app-${worker.inventory.buildId}`)
  ).delete('/index.html');
  worker.resources.delete('/index.html');
  assert.equal((await worker.request('navigate:/auth/login', '', 'cold-one')).status, 503);
  worker.resources.set('/index.html', '<html>build-a</html>');
  assert.equal((await worker.request('navigate:/auth/login', '', 'cold-one')).status, 503);
  assert.equal((await worker.request('navigate:/auth/login', '', 'cold-two')).status, 200);
});

test('a reloaded document receives the active build while the old document keeps its build', async () => {
  const worker = createWorker();
  await worker.dispatch('install');
  const previousId = 'b'.repeat(64);
  const previousHtml = '<html>old-build</html>';
  const { createHash } = await import('node:crypto');
  const previous = await worker.caches.open(`flipbase-app-${previousId}`);
  await previous.put('/index.html', new Response(previousHtml));
  await previous.put(
    '/pwa-assets.json',
    Response.json({
      version: 1,
      buildId: previousId,
      assets: [
        { url: '/index.html', sha256: createHash('sha256').update(previousHtml).digest('hex') },
      ],
    }),
  );
  await (
    await worker.caches.open('flipbase-pwa-clients')
  ).put('/__pwa_clients/old-document', new Response(previousId));
  assert.equal(await (await worker.request('/index.html', 'old-document')).text(), previousHtml);
  assert.equal(
    await (await worker.request('navigate:/settings/app', 'old-document', 'new-document')).text(),
    '<html>build-a</html>',
  );
});

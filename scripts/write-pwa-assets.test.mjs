import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = new URL('./write-pwa-assets.mjs', import.meta.url);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-pwa-'));
  await mkdir(join(root, 'fonts'));
  await mkdir(join(root, 'mock-data'));
  await writeFile(join(root, 'index.html'), '<html><app-root></app-root></html>');
  await writeFile(join(root, 'main-ABC123.js'), 'main');
  await writeFile(join(root, 'fonts/font.woff2'), 'font');
  await writeFile(join(root, 'mock-data/private.json'), 'private');
  await writeFile(join(root, 'deployment.json'), '{"commit":"release"}');
  await writeFile(
    join(root, 'sw.js'),
    'const BUILD_ID="__PWA_BUILD_ID__"; const INVENTORY_HASH="__PWA_INVENTORY_SHA256__";',
  );
  return root;
}
function build(root) {
  const result = spawnSync(process.execPath, [script.pathname.replace(/^\/(\w:)/, '$1'), root], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
}
test('inventory contains all app chunks, content hashes and a baked worker identity; excludes business/deployment data', async () => {
  const root = await fixture();
  try {
    build(root);
    const text = await readFile(join(root, 'pwa-assets.json'), 'utf8');
    const inventory = JSON.parse(text);
    assert.deepEqual(
      inventory.assets.map((asset) => asset.url),
      ['/fonts/font.woff2', '/index.html', '/main-ABC123.js'],
    );
    assert.match(inventory.buildId, /^[a-f0-9]{64}$/);
    assert.equal(
      inventory.assets.find((asset) => asset.url === '/main-ABC123.js').sha256,
      createHash('sha256').update('main').digest('hex'),
    );
    const worker = await readFile(join(root, 'sw.js'), 'utf8');
    assert.ok(worker.includes(inventory.buildId));
    assert.ok(worker.includes(createHash('sha256').update(text).digest('hex')));
    assert.equal(worker.includes('__PWA_'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('same input produces same identity; a new lazy chunk or worker change produces a new build', async () => {
  const roots = await Promise.all([fixture(), fixture(), fixture()]);
  try {
    build(roots[0]);
    build(roots[1]);
    const first = JSON.parse(await readFile(join(roots[0], 'pwa-assets.json'), 'utf8')).buildId;
    assert.equal(
      JSON.parse(await readFile(join(roots[1], 'pwa-assets.json'), 'utf8')).buildId,
      first,
    );
    await writeFile(join(roots[2], 'chunk-XYZ987.js'), 'lazy');
    build(roots[2]);
    assert.notEqual(
      JSON.parse(await readFile(join(roots[2], 'pwa-assets.json'), 'utf8')).buildId,
      first,
    );
  } finally {
    for (const root of roots) await rm(root, { recursive: true, force: true });
  }
});

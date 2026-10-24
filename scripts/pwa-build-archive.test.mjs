import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../deploy/archive-app-build.py', import.meta.url));
const python = process.platform === 'win32' ? 'python' : 'python3';

test('release archive verifies bytes, excludes private files, preserves recent builds and rejects changed versions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-app-archive-'));
  const source = join(root, 'source');
  const archive = join(root, 'archive');
  await mkdir(source);
  const build = 'a'.repeat(64);
  const content = '<html>previous build</html>';
  const manifest = {
    version: 1,
    buildId: build,
    assets: [{ url: '/index.html', sha256: createHash('sha256').update(content).digest('hex') }],
  };
  const run = () => spawnSync(python, [script, source, archive], { encoding: 'utf8' });
  try {
    await writeFile(join(source, 'index.html'), content);
    await writeFile(join(source, 'private.json'), 'must never be published');
    await writeFile(join(source, 'pwa-assets.json'), JSON.stringify(manifest));
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual((await readdir(join(archive, build))).sort(), [
      'index.html',
      'pwa-assets.json',
    ]);
    assert.equal(await readFile(join(archive, build, 'index.html'), 'utf8'), content);
    assert.equal(run().status, 0, 'archiving the same immutable build is idempotent');
    await writeFile(join(source, 'index.html'), 'corrupted');
    assert.notEqual(run().status, 0, 'wrong bytes must stop publication');
    assert.equal(await readFile(join(archive, build, 'index.html'), 'utf8'), content);
    await writeFile(join(source, 'index.html'), content);
    await writeFile(
      join(source, 'pwa-assets.json'),
      JSON.stringify({
        ...manifest,
        assets: [{ url: '/../private.json', sha256: manifest.assets[0].sha256 }],
      }),
    );
    assert.notEqual(run().status, 0, 'traversal must not publish private paths');
    await writeFile(join(source, 'pwa-assets.json'), JSON.stringify(manifest));
    for (const [index, days] of [50, 45, 1].entries()) {
      const directory = join(archive, String(index + 1).repeat(64));
      await mkdir(directory);
      const time = new Date(Date.now() - days * 86400_000);
      await utimes(directory, time, time);
    }
    result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal((await readdir(archive)).includes('1'.repeat(64)), false);
    assert.equal((await readdir(archive)).includes('3'.repeat(64)), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

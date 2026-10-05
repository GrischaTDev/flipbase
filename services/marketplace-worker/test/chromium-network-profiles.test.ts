import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChromiumNetworkProfiles } from '../src/chromium-network-profiles.ts';

test('live reload appends networks without changing or removing existing account routes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-network-reload-'));
  const path = join(root, 'networks.json');
  const first = {
    id: 'isp-first',
    kind: 'proxy',
    server: 'http://proxy.example.test:10000',
    username: 'first',
    password: 'original',
  };
  const second = {
    id: 'isp-second',
    kind: 'proxy',
    server: 'http://proxy.example.test:10001',
    username: 'second',
    password: 'second',
  };
  const save = (networkProfiles: unknown[]) =>
    writeFile(path, JSON.stringify({ networkProfiles }), { mode: 0o600 });
  try {
    await save([first]);
    const networks = await ChromiumNetworkProfiles.load(path);
    await save([first, second]);
    await networks.reload(path);
    assert.equal(networks.resolve('isp-second').kind, 'proxy');
    const before = networks.resolve('isp-first');
    await save([{ ...first, password: 'changed' }, second]);
    await assert.rejects(networks.reload(path));
    assert.deepEqual(networks.resolve('isp-first'), before);
    await save([first]);
    await assert.rejects(networks.reload(path));
    assert.equal(networks.resolve('isp-second').kind, 'proxy');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('direct access is deliberate and an unknown proxy never falls back to it', async () => {
  const networks = await ChromiumNetworkProfiles.load();
  assert.deepEqual(networks.resolve('direct'), { kind: 'direct' });
  assert.throws(() => networks.resolve('missing-proxy'), /Netzwerk/);
});

test('private proxy configuration preserves credentials without placing them in a URL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-network-'));
  try {
    const path = join(root, 'networks.json');
    await writeFile(
      path,
      JSON.stringify({
        networkProfiles: [
          {
            id: 'isp-pilot',
            kind: 'proxy',
            server: 'http://proxy.example.test:10000',
            username: 'test-user',
            password: 'private-test-password',
          },
        ],
      }),
      { mode: 0o600 },
    );
    const networks = await ChromiumNetworkProfiles.load(path);
    assert.deepEqual(networks.resolve('isp-pilot'), {
      kind: 'proxy',
      server: 'http://proxy.example.test:10000',
      username: 'test-user',
      password: 'private-test-password',
    });
    assert.deepEqual(networks.resolve('direct'), { kind: 'direct' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('duplicate network ids and invalid proxy targets fail with a neutral error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-network-'));
  try {
    const path = join(root, 'networks.json');
    for (const networkProfiles of [
      [{ id: 'direct', kind: 'proxy', server: 'http://proxy.test:8080' }],
      [{ id: 'isp', kind: 'proxy', server: 'http://private-test-password@proxy.test:8080' }],
      [{ id: 'isp', kind: 'proxy', server: 'http://127.0.0.1:8080' }],
      [{ id: 'isp', kind: 'proxy', server: 'http://192.168.1.1:8080' }],
      [{ id: 'isp', kind: 'proxy', server: 'http://proxy.test:8080/secret' }],
      [
        { id: 'isp', kind: 'proxy', server: 'http://proxy.test:8080' },
        { id: 'isp', kind: 'direct' },
      ],
    ]) {
      await writeFile(path, JSON.stringify({ networkProfiles }), { mode: 0o600 });
      await assert.rejects(
        ChromiumNetworkProfiles.load(path),
        (error: unknown) =>
          error instanceof Error &&
          /Netzwerk/.test(error.message) &&
          !error.message.includes('private-test-password'),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

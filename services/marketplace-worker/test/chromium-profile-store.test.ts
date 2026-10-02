import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChromiumProfileStore } from '../src/chromium-profile-store.ts';
import { CloudBrowserStopUncertainError } from '../src/gologin-cloud-browser.ts';

test(
  'removes only stale Chromium singleton links after confirming the profile is stopped',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
    const external = await mkdtemp(join(tmpdir(), 'flipbase-external-'));
    try {
      const directory = join(root, 'account-a');
      await mkdir(directory);
      await mkdir(join(directory, 'Default'));
      await writeFile(join(directory, 'Default', 'Cookies'), 'persisted-cookies');
      for (const marker of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        const target = join(external, marker);
        await writeFile(target, 'external-target');
        await symlink(target, join(directory, marker));
      }
      const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
      const lease = await store.acquire('account-a');
      for (const marker of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        await assert.rejects(lstat(join(directory, marker)), { code: 'ENOENT' });
        assert.equal(await readFile(join(external, marker), 'utf8'), 'external-target');
      }
      assert.equal(
        await readFile(join(directory, 'Default', 'Cookies'), 'utf8'),
        'persisted-cookies',
      );
      await lease.confirmStopped();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  },
);

test(
  'keeps all singleton links and the running marker when a profile process remains or cannot be inspected',
  { skip: process.platform === 'win32' },
  async () => {
    for (const inspectProfileProcesses of [
      async () => [1234],
      async (): Promise<number[]> => {
        throw new Error('private-process-data');
      },
    ]) {
      const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
      try {
        const directory = join(root, 'account-a');
        await mkdir(directory);
        for (const marker of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
          await symlink('stale-target', join(directory, marker));
        }
        const store = new ChromiumProfileStore({ root, inspectProfileProcesses });
        await assert.rejects(store.acquire('account-a'), CloudBrowserStopUncertainError);
        for (const marker of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
          assert.equal(await readlink(join(directory, marker)), 'stale-target');
        }
        assert.equal((await lstat(join(root, 'account-a.running', 'owner.json'))).isFile(), true);
        await assert.rejects(store.acquire('account-a'), /gesperrt/);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  },
);

test('rejects unexpected singleton files without removing any markers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  try {
    const directory = join(root, 'account-a');
    await mkdir(directory);
    if (process.platform !== 'win32') {
      await symlink('stale-target', join(directory, 'SingletonLock'));
    }
    await writeFile(join(directory, 'SingletonCookie'), 'unexpected-file');
    const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
    await assert.rejects(store.acquire('account-a'), CloudBrowserStopUncertainError);
    assert.equal(await readFile(join(directory, 'SingletonCookie'), 'utf8'), 'unexpected-file');
    if (process.platform !== 'win32') {
      assert.equal(await readlink(join(directory, 'SingletonLock')), 'stale-target');
    }
    assert.equal((await lstat(join(root, 'account-a.running', 'owner.json'))).isFile(), true);
    await assert.rejects(store.acquire('account-a'), /gesperrt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'recognizes a reused worker PID without deleting a live matching owner',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
    try {
      const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
      const lease = await store.acquire('account-a');
      await assert.rejects(store.recoverStopped('account-a'), CloudBrowserStopUncertainError);
      await lease.confirmStopped();
      await mkdir(join(root, 'account-a.running'));
      await writeFile(
        join(root, 'account-a.running', 'owner.json'),
        JSON.stringify({
          ownerId: 'fixture-old-process',
          workerPid: process.pid,
          workerIdentity: '00000000-0000-0000-0000-000000000000:0',
          profileId: 'account-a',
        }),
      );
      await store.recoverStopped('account-a');
      const reopened = await store.acquire('account-a');
      await reopened.confirmStopped();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('keeps exclusive persistent profile locks and rejects traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  try {
    const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
    await assert.rejects(store.acquire('../escape'), /Ungültige/);
    const lease = await store.acquire('account-a');
    await assert.rejects(store.acquire('account-a'), /gesperrt/);
    await writeFile(join(lease.directory, 'session-test'), 'persisted');
    await lease.confirmStopped();
    const reopened = await store.acquire('account-a');
    assert.equal(await readFile(join(reopened.directory, 'session-test'), 'utf8'), 'persisted');
    await reopened.confirmStopped();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not free a profile when a process remains or inspection fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  let remaining: number[] = [];
  try {
    const store = new ChromiumProfileStore({
      root,
      inspectProfileProcesses: async () => remaining,
    });
    const lease = await store.acquire('account-a');
    remaining = [1234];
    await assert.rejects(lease.confirmStopped(), CloudBrowserStopUncertainError);
    await assert.rejects(store.acquire('account-a'), /gesperrt/);
    remaining = [];
    await lease.confirmStopped();
    const failing = new ChromiumProfileStore({
      root,
      inspectProfileProcesses: async () => {
        throw new Error('private-process-data');
      },
    });
    await assert.rejects(failing.acquire('account-a'), CloudBrowserStopUncertainError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses linked profile directories', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  const external = await mkdtemp(join(tmpdir(), 'flipbase-external-'));
  try {
    await symlink(external, join(root, 'account-a'));
    const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
    await assert.rejects(store.acquire('account-a'), /Profilpfad/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test('keeps live or unknown owners locked during restart recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  try {
    const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
    const lease = await store.acquire('account-a');
    await assert.rejects(store.recoverStopped('account-a'), CloudBrowserStopUncertainError);
    await lease.confirmStopped();
    await mkdir(join(root, 'account-a.running'));
    await writeFile(join(root, 'account-a.running', 'owner.json'), '{');
    await assert.rejects(store.recoverStopped('account-a'), CloudBrowserStopUncertainError);
    assert.equal(await readFile(join(root, 'account-a.running', 'owner.json'), 'utf8'), '{');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'clears a dead owner only after confirming absence of profile processes',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
    let remaining = [99];
    try {
      await mkdir(join(root, 'account-a.running'));
      await writeFile(
        join(root, 'account-a.running', 'owner.json'),
        JSON.stringify({
          ownerId: 'fixture-owner',
          workerPid: 2147483647,
          profileId: 'account-a',
        }),
      );
      const store = new ChromiumProfileStore({
        root,
        inspectProfileProcesses: async () => remaining,
      });
      await assert.rejects(store.recoverStopped('account-a'), CloudBrowserStopUncertainError);
      remaining = [];
      await store.recoverStopped('account-a');
      const lease = await store.acquire('account-a');
      await lease.confirmStopped();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

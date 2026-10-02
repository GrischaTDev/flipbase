import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChromiumProfileStore } from '../src/chromium-profile-store.ts';
import { CloudBrowserStopUncertainError } from '../src/gologin-cloud-browser.ts';

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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChromiumStopResults } from '../src/chromium-stop-results.ts';

test('unclean stop survives a broker restart and clears only after a new confirmed session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-stop-results-'));
  try {
    const store = new ChromiumStopResults(root);
    assert.equal(await store.read('account-a'), false);
    await store.write('account-a');
    const restarted = new ChromiumStopResults(root);
    assert.equal(await restarted.read('account-a'), true);
    assert.equal(await restarted.read('account-b'), false);
    await restarted.write('account-a');
    await restarted.clear('account-a');
    assert.equal(await new ChromiumStopResults(root).read('account-a'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stop metadata rejects traversal and malformed records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-stop-results-'));
  try {
    const store = new ChromiumStopResults(root);
    await assert.rejects(store.write('../foreign'));
    await writeFile(join(root, 'account-b.stop'), 'arbitrary', { mode: 0o600 });
    await assert.rejects(store.read('account-b'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an interrupted private write does not publish a partial stop record or prevent retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-stop-interrupted-'));
  try {
    await writeFile(join(root, 'account-a.stop.interrupted.pending'), '', { mode: 0o600 });
    const restarted = new ChromiumStopResults(root);
    assert.equal(await restarted.read('account-a'), false);
    await restarted.write('account-a');
    assert.equal(await new ChromiumStopResults(root).read('account-a'), true);
    await restarted.clear('account-a');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'stop metadata never follows a symbolic link',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-stop-link-'));
    try {
      const store = new ChromiumStopResults(root);
      await writeFile(join(root, 'outside'), 'unclean-v1\n', { mode: 0o600 });
      await symlink(join(root, 'outside'), join(root, 'account-a.stop'));
      await assert.rejects(store.read('account-a'));
      await assert.rejects(store.clear('account-a'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

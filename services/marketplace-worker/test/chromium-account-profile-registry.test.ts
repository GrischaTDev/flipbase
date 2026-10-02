import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChromiumAccountProfileRegistry } from '../src/chromium-account-profile-registry.ts';

test('registry persists immutable account and host binding across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-registry-'));
  try {
    const registry = new ChromiumAccountProfileRegistry({
      root,
      hostId: 'host-a',
      networkId: 'direct',
    });
    const profile = await registry.create({
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
      previousGoLoginProfileId: 'legacy-profile',
    });
    assert.match(profile.profileId, /^chromium_[0-9a-f-]{36}$/);
    assert.deepEqual(
      await new ChromiumAccountProfileRegistry({
        root,
        hostId: 'host-a',
        networkId: 'direct',
      }).resolve(profile.profileId),
      profile,
    );
    await assert.rejects(
      new ChromiumAccountProfileRegistry({ root, hostId: 'host-b', networkId: 'direct' }).resolve(
        profile.profileId,
      ),
    );
    await assert.rejects(
      registry.create({ workspaceId: 'workspace-a', connectionId: 'account-a' }),
    );
    assert.ok(
      (await readFile(join(root, 'registry', `${profile.profileId}.json`), 'utf8')).includes(
        'legacy-profile',
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('archive preserves private profile state and refuses an outstanding runtime marker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-registry-'));
  try {
    const registry = new ChromiumAccountProfileRegistry({ root, hostId: 'host-a' });
    const profile = await registry.create({
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
    });
    const directory = join(root, 'profiles', profile.profileId);
    const running = join(root, 'profiles', `${profile.profileId}.running`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'session-test'), 'private fixture');
    await mkdir(running);
    await assert.rejects(registry.archive(profile.profileId));
    await rmdir(running);
    await registry.archive(profile.profileId);
    assert.equal(
      await readFile(join(root, 'archive', profile.profileId, 'session-test'), 'utf8'),
      'private fixture',
    );
    await assert.rejects(registry.resolve(profile.profileId));
    assert.equal(
      JSON.parse(await readFile(join(root, 'archive', `${profile.profileId}.json`), 'utf8'))
        .connectionId,
      'account-a',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing, corrupt, symlinked and malformed registry profiles fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-registry-'));
  try {
    const registry = new ChromiumAccountProfileRegistry({
      root,
      hostId: 'host-a',
      networkId: 'direct',
    });
    await assert.rejects(registry.resolve('chromium_bad'));
    const profile = await registry.create({
      workspaceId: 'workspace-a',
      connectionId: 'account-a',
    });
    const path = join(root, 'registry', `${profile.profileId}.json`);
    await writeFile(path, '{}');
    await assert.rejects(registry.resolve(profile.profileId));
    await rm(path);
    await assert.rejects(registry.resolve(profile.profileId));
    if (process.platform !== 'win32') {
      await writeFile(join(root, 'outside.json'), JSON.stringify(profile));
      await symlink(join(root, 'outside.json'), path);
      await assert.rejects(registry.resolve(profile.profileId));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

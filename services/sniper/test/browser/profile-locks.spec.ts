import { createServer } from 'node:net';
import { lstat, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { removeOrphanedProfileLocks } from '../../src/browser/profile-locks.js';

async function fixture() {
  const profile = await mkdtemp(join(tmpdir(), 'sniper-orphan-'));
  await symlink('feed-999999', join(profile, 'SingletonLock'));
  await symlink('123456789', join(profile, 'SingletonCookie'));
  await symlink('/tmp/com.google.Chrome.test/SingletonSocket', join(profile, 'SingletonSocket'));
  return profile;
}
describe.skipIf(process.platform === 'win32')('orphaned Chrome profile links', () => {
  it('removes only the three symlinks when the owner is absent and the port is free', async () => {
    const profile = await fixture();
    try {
      await writeFile(join(profile, 'Cookies'), 'preserve this file');
      await removeOrphanedProfileLocks(profile, 9228, {
        isPortFree: async () => true,
        isProcessAlive: () => false,
      });
      for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket'])
        await expect(lstat(join(profile, name))).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await lstat(join(profile, 'Cookies'))).isFile()).toBe(true);
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });
  it.each(['alive', 'permission', 'occupied', 'unknown-target', 'regular-cookie'])(
    'preserves all links when ownership cannot be excluded: %s',
    async (kind) => {
      const profile = await fixture();
      try {
        if (kind === 'unknown-target') {
          await rm(join(profile, 'SingletonLock'));
          await symlink('unknown', join(profile, 'SingletonLock'));
        }
        if (kind === 'regular-cookie') {
          await rm(join(profile, 'SingletonCookie'));
          await writeFile(join(profile, 'SingletonCookie'), 'foreign file');
        }
        await expect(
          removeOrphanedProfileLocks(profile, 9228, {
            isPortFree: async () => kind !== 'occupied',
            isProcessAlive: () => {
              if (kind === 'permission')
                throw Object.assign(new Error('denied'), { code: 'EPERM' });
              return kind === 'alive';
            },
          }),
        ).rejects.toThrow();
        expect((await lstat(join(profile, 'SingletonLock'))).isSymbolicLink()).toBe(true);
        expect(await lstat(join(profile, 'SingletonCookie'))).toBeDefined();
        expect(await lstat(join(profile, 'SingletonSocket'))).toBeDefined();
      } finally {
        await rm(profile, { recursive: true, force: true });
      }
    },
  );
  it('does not confuse an occupied non-CDP port with a free port', async () => {
    const profile = await fixture();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing test port');
      await expect(
        removeOrphanedProfileLocks(profile, address.port, { isProcessAlive: () => false }),
      ).rejects.toThrow();
      expect((await lstat(join(profile, 'SingletonLock'))).isSymbolicLink()).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(profile, { recursive: true, force: true });
    }
  });
});

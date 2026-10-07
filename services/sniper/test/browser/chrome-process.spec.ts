import { ChildProcess } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChromeProcess } from '../../src/browser/chrome-process.js';

describe('ChromeProcess', () => {
  it('refuses to reuse a profile already owned by Chrome', async () => {
    const profileDir = await mkdtemp(join(tmpdir(), 'sniper-profile-'));
    try {
      await writeFile(join(profileDir, 'SingletonLock'), 'already owned');
      let spawned = false;
      const runtime = new ChromeProcess(
        { profileDir, cdpPort: 9228 },
        {
          spawn: () => {
            spawned = true;
            return new ChildProcess();
          },
        },
      );
      await expect(runtime.start()).rejects.toThrow(/profil.*belegt/i);
      expect(spawned).toBe(false);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
  it('shares a concurrent start and refuses to restart after an unexpected child exit', async () => {
    const profileDir = await mkdtemp(join(tmpdir(), 'sniper-profile-'));
    const children: ChildProcess[] = [];
    try {
      const runtime = new ChromeProcess(
        { profileDir, cdpPort: 9228 },
        {
          spawn: () => {
            const child = new ChildProcess();
            children.push(child);
            return child;
          },
          execute: async () => Buffer.from('1280 900'),
          isCdpReady: async () => children.length === 3,
        },
      );
      await Promise.all([runtime.start(), runtime.start()]);
      expect(children).toHaveLength(3);
      children[2]?.emit('exit', 1, null);
      await expect(runtime.start()).rejects.toThrow('beendet');
      expect(children).toHaveLength(3);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
  it('does not reuse a process after its shutdown could not be confirmed', async () => {
    const profileDir = await mkdtemp(join(tmpdir(), 'sniper-profile-'));
    const children: ChildProcess[] = [];
    try {
      const runtime = new ChromeProcess(
        { profileDir, cdpPort: 9228 },
        {
          spawn: () => {
            const child = new ChildProcess();
            children.push(child);
            return child;
          },
          execute: async () => Buffer.alloc(0),
          isCdpReady: async () => children.length === 3,
        },
      );
      await runtime.start();
      await expect(runtime.stop()).rejects.toThrow('nicht bestätigt');
      await expect(runtime.start()).rejects.toThrow();
      expect(children).toHaveLength(3);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});

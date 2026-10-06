import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { BrowserContext } from 'playwright';
import { ChromiumPersistentBrowser } from '../src/chromium-persistent-browser.ts';
import { ChromiumProfileStore } from '../src/chromium-profile-store.ts';
import { CloudBrowserStopUncertainError } from '../src/gologin-cloud-browser.ts';

test('binds native desktop controls to the opened profile and blocks them after closing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  const clicks: number[][] = [];
  try {
    const provider = new ChromiumPersistentBrowser({
      profileStore: new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] }),
      launch: async () =>
        ({
          browser: () => ({ version: () => 'fixture' }),
          pages: () => [{ goto: async () => undefined }],
          close: async () => undefined,
        }) as unknown as BrowserContext,
      desktop: (profileId) => {
        assert.equal(profileId, 'account-a');
        return {
          capture: async () => Buffer.from('fixture'),
          click: async (x, y) => {
            clicks.push([x, y]);
          },
          drag: async () => undefined,
          type: async () => undefined,
          press: async () => undefined,
        };
      },
    });
    const handle = await provider.open('account-a');
    await handle.run(async (browser) => browser.click?.(0.5, 0.75));
    assert.deepEqual(clicks, [[0.5, 0.75]]);
    await handle.close();
    await assert.rejects(
      handle.run(async (browser) => browser.click?.(0.1, 0.2)),
      /beendet/,
    );
    assert.equal(clicks.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('blocks browser actions after an unconfirmed close and permits a confirmed retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  let closeFails = true;
  try {
    const provider = new ChromiumPersistentBrowser({
      profileStore: new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] }),
      launch: async () =>
        ({
          browser: () => ({ version: () => 'fixture' }),
          pages: () => [{ goto: async () => undefined }],
          close: async () => {
            if (closeFails) throw new Error('private-runtime-error');
          },
        }) as unknown as BrowserContext,
    });
    const handle = await provider.open('account-a');
    await assert.rejects(handle.close(), CloudBrowserStopUncertainError);
    await assert.rejects(
      handle.run(async () => undefined),
      /beendet/,
    );
    await assert.rejects(provider.open('account-a'), /läuft bereits/);
    closeFails = false;
    await handle.close();
    const lease = await new ChromiumProfileStore({
      root,
      inspectProfileProcesses: async () => [],
    }).acquire('account-a');
    await lease.confirmStopped();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('launches isolated persistent profiles with sandbox and no worker secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  let closed = false;
  const oldSecret = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'secret-never-forward';
  try {
    const provider = new ChromiumPersistentBrowser({
      profileStore: new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] }),
      network: { resolve: async () => ({ kind: 'direct' }) },
      launch: async (directory, options) => {
        assert.equal(directory, join(root, 'account-a'));
        assert.equal(options?.chromiumSandbox, true);
        assert.equal(options?.acceptDownloads, false);
        assert.equal(options?.env?.['SUPABASE_SERVICE_ROLE_KEY'], undefined);
        assert.equal(options?.proxy, undefined);
        return {
          browser: () => ({ version: () => 'fixture' }),
          pages: () => [
            { goto: async (url: string) => assert.equal(url, 'https://www.vinted.de/') },
          ],
          close: async () => {
            closed = true;
          },
        } as unknown as BrowserContext;
      },
    });
    const handle = await provider.open('account-a');
    assert.equal(await handle.run(async (browser) => browser.version()), 'fixture');
    await Promise.all([handle.close(), handle.close()]);
    assert.equal(closed, true);
    await assert.rejects(
      handle.run(async () => undefined),
      /beendet/,
    );
  } finally {
    if (oldSecret === undefined) delete process.env['SUPABASE_SERVICE_ROLE_KEY'];
    else process.env['SUPABASE_SERVICE_ROLE_KEY'] = oldSecret;
    await rm(root, { recursive: true, force: true });
  }
});

test('retains lease after an uncertain aborted startup and never falls back from a proxy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  let running = false;
  try {
    const provider = new ChromiumPersistentBrowser({
      profileStore: new ChromiumProfileStore({
        root,
        inspectProfileProcesses: async () => (running ? [42] : []),
      }),
      network: {
        resolve: async () => ({
          kind: 'proxy',
          server: 'http://proxy.example:8080',
          username: 'private-user',
          password: 'private-password',
        }),
      },
      launch: async (_directory, options) => {
        assert.equal(options?.proxy?.server, 'http://proxy.example:8080');
        running = true;
        throw new Error('private-password');
      },
    });
    await assert.rejects(provider.open('account-a'), CloudBrowserStopUncertainError);
    await assert.rejects(provider.open('account-a'), /läuft bereits/);
    await assert.rejects(provider.stop('account-a'), CloudBrowserStopUncertainError);
    running = false;
    await provider.stop('account-a');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('confirms stop after startup navigation failure before reopening the profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-chromium-'));
  let closes = 0;
  try {
    const provider = new ChromiumPersistentBrowser({
      profileStore: new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] }),
      launch: async () =>
        ({
          browser: () => ({ version: () => 'fixture' }),
          pages: () => [
            {
              goto: async () => {
                throw new Error('secret');
              },
            },
          ],
          close: async () => {
            closes += 1;
          },
        }) as unknown as BrowserContext,
    });
    await assert.rejects(provider.open('account-a'), /Chromium-Browser konnte nicht gestartet/);
    await assert.rejects(provider.open('account-a'), /Chromium-Browser konnte nicht gestartet/);
    assert.equal(closes, 2);
    assert.throws(
      () =>
        new ChromiumPersistentBrowser({
          profileStore: new ChromiumProfileStore({ root }),
          trustedTestStartUrl: 'https://untrusted.example/',
        }),
      /Testadresse/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

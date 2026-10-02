import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { chromium, type BrowserContext } from 'playwright';
import { ChromiumPersistentBrowser } from '../../src/chromium-persistent-browser.ts';
import { ChromiumProfileStore } from '../../src/chromium-profile-store.ts';

test('real persistent Chromium restores cookies and local storage while isolating two accounts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-persistent-fixture-'));
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body>Local browser fixture</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const startUrl = `http://127.0.0.1:${address.port}/`;
  const contexts = new Map<string, BrowserContext>();
  // Dieser lokale Test prüft Speicherdauer und Kontentrennung. Container-/Prozessnachweise
  // werden separat geprüft; das explizite Test-Backend verwendet context.close().
  const profileStore = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
  const createProvider = () =>
    new ChromiumPersistentBrowser({
      profileStore,
      headless: true,
      trustedTestStartUrl: startUrl,
      launch: async (directory, options) => {
        const context = await chromium.launchPersistentContext(directory, options);
        contexts.set(directory, context);
        return context;
      },
    });
  const provider = createProvider();
  let first: Awaited<ReturnType<typeof provider.open>> | undefined;
  let second: Awaited<ReturnType<typeof provider.open>> | undefined;
  let restarted: Awaited<ReturnType<typeof provider.open>> | undefined;
  try {
    first = await provider.open('account-a');
    const firstContext = contexts.get(profileStore.directory('account-a'));
    assert.ok(firstContext);
    await firstContext.addCookies([
      {
        name: 'fixture-account',
        value: 'account-a',
        url: startUrl,
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);
    const firstPage = firstContext.pages()[0];
    assert.ok(firstPage);
    await firstPage.evaluate(() => localStorage.setItem('fixture-account', 'account-a'));
    await assert.rejects(createProvider().open('account-a'));
    second = await provider.open('account-b');
    const secondContext = contexts.get(profileStore.directory('account-b'));
    assert.ok(secondContext);
    assert.equal(
      (await secondContext.cookies()).find((cookie) => cookie.name === 'fixture-account'),
      undefined,
    );
    const secondPage = secondContext.pages()[0];
    assert.ok(secondPage);
    assert.equal(await secondPage.evaluate(() => localStorage.getItem('fixture-account')), null);
    await first.close();
    first = undefined;
    restarted = await createProvider().open('account-a');
    const restartedContext = contexts.get(profileStore.directory('account-a'));
    assert.ok(restartedContext);
    assert.equal(
      (await restartedContext.cookies()).find((cookie) => cookie.name === 'fixture-account')?.value,
      'account-a',
    );
    const restartedPage = restartedContext.pages()[0];
    assert.ok(restartedPage);
    assert.equal(
      await restartedPage.evaluate(() => localStorage.getItem('fixture-account')),
      'account-a',
    );
  } finally {
    await first?.close();
    await second?.close();
    await restarted?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test('real Chromium navigation abort closes before the profile can be opened again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-abort-fixture-'));
  let lastContext: BrowserContext | undefined;
  const store = new ChromiumProfileStore({ root, inspectProfileProcesses: async () => [] });
  const provider = new ChromiumPersistentBrowser({
    profileStore: store,
    headless: true,
    trustedTestStartUrl: 'http://127.0.0.1:1/',
    launch: async (directory, options) => {
      lastContext = await chromium.launchPersistentContext(directory, options);
      return lastContext;
    },
  });
  try {
    await assert.rejects(provider.open('account-a'), /Chromium-Browser konnte nicht gestartet/);
    assert.equal(lastContext?.browser()?.isConnected(), false);
    const lease = await store.acquire('account-a');
    await lease.confirmStopped();
  } finally {
    await lastContext?.close();
    await rm(root, { recursive: true, force: true });
  }
});

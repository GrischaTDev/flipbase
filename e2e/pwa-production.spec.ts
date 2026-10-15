import { devices, expect, test } from '@playwright/test';
import { launchPwaLifecycleBrowser } from './support/pwa-lifecycle-browser';

test('startup works with production CSP, theme and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
  await page.route('**/main-*.js', (route) => route.abort());
  await page.goto('/auth/login');
  await expect(page.locator('#app-startup')).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('#app-startup-retry')).toBeVisible();
  expect(
    await page
      .locator('.fb-app-startup__activity')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
});

test('complete build controls the page and serves an unvisited lazy route offline @worker', async ({
  page,
  context,
}) => {
  await page.goto('/auth/login');
  await expect(page.locator('app-login form')).toBeVisible();
  await expect(page.locator('#app-startup')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const inventory = await page.evaluate(
    async () =>
      (await (await fetch('/pwa-assets.json', { cache: 'no-store' })).json()) as {
        buildId: string;
        assets: { url: string }[];
      },
  );
  const cacheCount = await page.evaluate(
    async (buildId) => (await (await caches.open(`flipbase-app-${buildId}`)).keys()).length,
    inventory.buildId,
  );
  expect(cacheCount).toBe(inventory.assets.length + 1);
  await context.setOffline(true);
  const chunk = inventory.assets.find((asset) => asset.url.startsWith('/chunk-'));
  expect(chunk).toBeDefined();
  const chunkStatus = await page.evaluate(
    async (url) => (await fetch(url)).status,
    chunk?.url ?? '',
  );
  expect(chunkStatus).toBe(200);
  await page.goto('/auth/set-password');
  await expect(page.locator('app-set-password')).toBeVisible();
  await expect(page.locator('#app-startup')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset['flipbaseBuild'])).toBe(
    inventory.buildId,
  );
});

test('corrupted chunk fails visibly and is not replaced by a mismatched file @worker', async ({
  page,
  context,
}) => {
  await page.goto('/auth/login');
  await expect(page.locator('#app-startup')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const target = await page.evaluate(async () => {
    const inventory = await (await fetch('/pwa-assets.json')).json();
    const target = inventory.assets.find((asset: { url: string }) =>
      asset.url.startsWith('/chunk-'),
    )?.url;
    const cache = await caches.open(`flipbase-app-${inventory.buildId}`);
    await cache.put(target, new Response('corrupted'));
    return target as string;
  });
  await context.setOffline(true);
  expect(await page.evaluate(async (url) => (await fetch(url)).status, target)).toBe(503);
});

test('a real second build waits for an unsaved second window before activation @worker', async ({
  page,
  context,
}, testInfo) => {
  const { mockMarketplace } = await import('./support/marketplace-account-fixture');
  const configure = (target: typeof page) =>
    mockMarketplace(
      target,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { origin: 'https://api.flipbase.de', userId: '25000000-0000-4000-8000-000000000001' },
    );
  const pressUpdate = async (target: typeof page) => {
    await target.bringToFront();
    const button = target.getByRole('button', { name: 'Jetzt aktualisieren' });
    if (testInfo.project.use.hasTouch) await button.tap();
    else await button.click();
  };
  await configure(page);
  await page.goto('/settings/notifications');
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const oldBuild = await page.evaluate(() => document.documentElement.dataset['flipbaseBuild']);
  const other = await context.newPage();
  await configure(other);
  await other.goto('/purchases/new');
  await other.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
  await other.getByLabel('Verkäuferangabe, falls bekannt').fill('Ungespeichert');
  await page.request.post('/api/__pwa_test__/build');
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.update());
    await expect(page.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible();
    await pressUpdate(page);
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toContainText(
      /offen|gespeichert|blockiert|schließe andere Flipbase/,
    );
    expect(await page.evaluate(() => document.documentElement.dataset['flipbaseBuild'])).toBe(
      oldBuild,
    );
    await expect(other.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue('Ungespeichert');
    await other.close();
    const unchanged = await context.newPage();
    await configure(unchanged);
    await unchanged.goto('/settings/notifications');
    await expect(unchanged.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await pressUpdate(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
    // Andere sichere Ansichten behalten ihre alten Chunks bis zum eigenen Neustart.
    await expect(unchanged.locator('html')).toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(unchanged.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible();
    await pressUpdate(unchanged);
    await expect(unchanged.locator('html')).not.toHaveAttribute(
      'data-flipbase-build',
      oldBuild ?? '',
    );
    await expect(unchanged.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
    await unchanged.close();
    await page.reload();
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
  } finally {
    await page.request.post('/api/__pwa_test__/build');
  }
});

test('installed app updates while a frozen background view keeps unsaved entries @worker', async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== 'chromium' || !testInfo.project.use.hasTouch);
  const browser = await launchPwaLifecycleBrowser();
  const { context } = browser;
  const origin = testInfo.project.use.baseURL!;
  const page = await context.newPage();
  let switchedBuild = false;
  let backgroundSession: Awaited<ReturnType<typeof context.newCDPSession>> | undefined;
  try {
    const appInput = await context.newCDPSession(page);
    await page.setViewportSize(devices['Pixel 7'].viewport);
    await appInput.send('Emulation.setUserAgentOverride', {
      userAgent: devices['Pixel 7'].userAgent,
      platform: 'Android',
    });
    await appInput.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const { mockMarketplace } = await import('./support/marketplace-account-fixture');
    const configure = (target: typeof page) =>
      mockMarketplace(
        target,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { origin: 'https://api.flipbase.de', userId: '25000000-0000-4000-8000-000000000001' },
      );
    // Derselbe Standalone-Zweig wie beim Start über das installierte App-Symbol.
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await configure(page);
    await page.goto(`${origin}/settings/notifications`);
    await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    const oldBuild = await page.locator('html').getAttribute('data-flipbase-build');
    expect(oldBuild).toBeTruthy();
    const background = await context.newPage();
    await configure(background);
    await background.goto(`${origin}/purchases/new`);
    await background.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
    await background.getByLabel('Verkäuferangabe, falls bekannt').fill('Nicht verlieren');
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    await expect.poll(() => background.evaluate(() => document.visibilityState)).toBe('hidden');
    const session = await context.newCDPSession(background);
    backgroundSession = session;
    await page.request.post(`${origin}/api/__pwa_test__/build`);
    switchedBuild = true;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.update());
    const update = page.getByRole('button', { name: 'Jetzt aktualisieren' });
    await expect(update).toBeVisible();
    // Erst den wartenden Worker installieren: Linux-Chromium kann sonst bereits
    // dessen update()-Aufruf bei eingefrorenen Dokumenten unbegrenzt zurückhalten.
    await session.send('Page.setWebLifecycleState', { state: 'frozen' });
    // Der echte Standardkontext hat keine Playwright-Touch-Vorgabe; Chromium erhält Touch direkt.
    const bounds = await update.boundingBox();
    if (!bounds) throw new Error('Aktualisieren-Button fehlt.');
    await appInput.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
    });
    await appInput.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('html')).not.toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
    await session.send('Page.setWebLifecycleState', { state: 'active' });
    await background.bringToFront();
    await expect(background.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue(
      'Nicht verlieren',
    );
    await expect(background.locator('html')).toHaveAttribute('data-flipbase-build', oldBuild ?? '');
  } finally {
    try {
      await backgroundSession?.send('Page.setWebLifecycleState', { state: 'active' });
      if (switchedBuild) await page.request.post(`${origin}/api/__pwa_test__/build`);
    } finally {
      await browser.close();
    }
  }
});

test('legacy network-worker handover does not repeatedly offer the already loaded mobile build @worker', async ({
  page,
  context,
}) => {
  const { mockMarketplace } = await import('./support/marketplace-account-fixture');
  await mockMarketplace(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { origin: 'https://api.flipbase.de', userId: '25000000-0000-4000-8000-000000000001' },
  );
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'PWA_UPDATE_RESULT' && event.data.result === 'blocked')
        document.documentElement.dataset['legacyHandoverBlocked'] = 'true';
    });
  });
  const legacy = await context.newPage();
  await legacy.goto('/api/__pwa_test__/legacy-page');
  await legacy.evaluate(async () => {
    await navigator.serviceWorker.register('/api/__pwa_test__/legacy-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => legacy.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.serviceWorker.getRegistration('/'))?.waiting?.state,
      ),
    )
    .toBe('installed');
  await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-legacy-handover-blocked', 'true');
  await legacy.close();
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => window.dispatchEvent(new Event('focus'))),
  ]);
  await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        return (
          !registration?.waiting && navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js')
        );
      }),
    )
    .toBe(true);
  await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
});

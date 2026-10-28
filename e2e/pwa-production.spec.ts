import { devices, expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { launchPwaLifecycleBrowser } from './support/pwa-lifecycle-browser';

/**
 * Mehrfenster-Updatefälle beginnen erst nach der vollständigen App-Initialisierung.
 * Der direkte PWA-Start wird separat geprüft; hier zählen bereits geöffnete
 * Formulare und deren ungespeicherter Zustand bei Versionswechseln.
 */
async function openPurchaseEntryInReadyWindow(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Einkauf erfassen', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await expect(page.getByRole('button', { name: 'Eigenbeleg', exact: true })).toBeVisible();
}

test('a real second build takes over at startup without exposing the old working page @worker', async ({
  page,
  context,
}) => {
  await page.goto('/auth/login');
  await expect(page.locator('#app-startup')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const oldBuild = await page.locator('html').getAttribute('data-flipbase-build');
  await page.request.post('/api/__pwa_test__/build?name=b');
  try {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.update());
    await expect(page.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible();
    const reopened = await context.newPage();
    await reopened.addInitScript((oldBuild) => {
      sessionStorage.setItem(
        'pwa_test_starts',
        String(Number(sessionStorage.getItem('pwa_test_starts') ?? 0) + 1),
      );
      let sawStartup = false;
      new MutationObserver(() => {
        if (document.getElementById('app-startup')) sawStartup = true;
        else if (sawStartup && document.documentElement.dataset['flipbaseBuild'] === oldBuild)
          sessionStorage.setItem('pwa_test_old_page_exposed', 'true');
      }).observe(document, { childList: true, subtree: true });
    }, oldBuild);
    await reopened.goto('/auth/login');
    await expect(reopened.locator('html')).not.toHaveAttribute(
      'data-flipbase-build',
      oldBuild ?? '',
    );
    await expect(reopened.locator('#app-startup')).toHaveCount(0);
    await expect(reopened.locator('app-login form')).toBeVisible();
    expect(
      await reopened.evaluate(() => sessionStorage.getItem('pwa_test_old_page_exposed')),
    ).toBeNull();
    expect(await reopened.evaluate(() => sessionStorage.getItem('pwa_test_starts'))).toBe('2');
    await reopened.screenshot({ path: test.info().outputPath('prepared-update-start.png') });
  } finally {
    await page.request.post('/api/__pwa_test__/build?name=a');
  }
});

test('a real second build replaces the previous production protocol and supports a skipped release and rollback @worker', async ({
  page,
  context,
}) => {
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
  await page.request.post('/api/__pwa_test__/build?name=legacy');
  try {
    await configure(page);
    await page.goto('/settings/notifications');
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    const initialBuild = await page.locator('html').getAttribute('data-flipbase-build');
    const other = await context.newPage();
    await configure(other);
    await openPurchaseEntryInReadyWindow(other);
    await other.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
    await other.getByLabel('Verkäuferangabe, falls bekannt').fill('Alter Entwurf bleibt erhalten');
    let previousBuild = initialBuild;
    for (const target of ['a', 'b', 'a']) {
      await page.request.post(`/api/__pwa_test__/build?name=${target}`);
      await page.bringToFront();
      await page.evaluate(async () =>
        (await navigator.serviceWorker.getRegistration('/'))?.update(),
      );
      await expect(page.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible();
      await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
      await expect(page.locator('html')).not.toHaveAttribute(
        'data-flipbase-build',
        previousBuild ?? '',
      );
      await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
      previousBuild = await page.locator('html').getAttribute('data-flipbase-build');
      await expect(other.locator('html')).toHaveAttribute(
        'data-flipbase-build',
        initialBuild ?? '',
      );
      await expect(other.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue(
        'Alter Entwurf bleibt erhalten',
      );
    }
  } finally {
    await page.request.post('/api/__pwa_test__/build?name=a');
  }
});

test('a real second build repairs an unbound first legacy window without losing its input @worker', async ({
  page,
  context,
}) => {
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
  await page.request.post('/api/__pwa_test__/build?name=legacy');
  try {
    await configure(page);
    await page.goto('/purchases/new');
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    const oldBuild = await page.locator('html').getAttribute('data-flipbase-build');
    const previous = (await (await page.request.get('/pwa-assets.json')).json()) as {
      assets: { url: string; sha256: string }[];
    };
    await page.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
    const entry = page.getByLabel('Verkäuferangabe, falls bekannt');
    await entry.fill('Erste alte Sitzung bleibt offen');
    const initiator = await context.newPage();
    await configure(initiator);
    await initiator.goto('/settings/notifications');
    await page.request.post('/api/__pwa_test__/build?name=a');
    const current = (await (await page.request.get('/pwa-assets.json')).json()) as typeof previous;
    const asset = previous.assets.find(
      (asset) =>
        /^\/chunk-.*\.js$/.test(asset.url) &&
        !current.assets.some((other) => other.url === asset.url),
    );
    expect(asset).toBeDefined();
    await initiator.evaluate(async () =>
      (await navigator.serviceWorker.getRegistration('/'))?.update(),
    );
    await initiator.getByRole('button', { name: 'Jetzt aktualisieren', exact: true }).click();
    await expect(initiator.locator('html')).not.toHaveAttribute(
      'data-flipbase-build',
      oldBuild ?? '',
    );
    await expect(entry).toHaveValue('Erste alte Sitzung bleibt offen');
    const result = await page.evaluate(
      async ({ oldBuild, asset }) => {
        const bindings = await caches.open('flipbase-pwa-clients');
        const values = await Promise.all(
          (await bindings.keys()).map(async (key) => (await bindings.match(key))?.text()),
        );
        const cache = await caches.open(`flipbase-app-${oldBuild}`);
        const removed = await cache.delete(asset.url);
        const response = await fetch(asset.url, { cache: 'no-store' });
        const bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        return {
          unassigned: values.includes('unassigned'),
          removed,
          status: response.status,
          hash,
        };
      },
      { oldBuild, asset: asset! },
    );
    expect(result.unassigned).toBe(true);
    expect(result.removed).toBe(true);
    expect(result.status).toBe(200);
    expect(result.hash).toBe(asset!.sha256);
    await expect(page.locator('html')).toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(entry).toHaveValue('Erste alte Sitzung bleibt offen');
  } finally {
    await page.request.post('/api/__pwa_test__/build?name=a');
  }
});

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

test('a real second build updates independently while other windows keep unsaved input @worker', async ({
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
  await openPurchaseEntryInReadyWindow(other);
  await other.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
  await other.getByLabel('Verkäuferangabe, falls bekannt').fill('Ungespeichert');
  const legacyForm = await context.newPage();
  await configure(legacyForm);
  await legacyForm.goto('/settings/notifications');
  await expect(legacyForm.getByRole('heading', { name: 'Benachrichtigungen' })).toBeVisible();
  await legacyForm.goto('/settings/account');
  await legacyForm
    .getByRole('textbox', { name: 'Angezeigter Name', exact: true })
    .fill('Offene Einstellung');
  const unchanged = await context.newPage();
  await configure(unchanged);
  await unchanged.goto('/settings/notifications');
  await page.request.post('/api/__pwa_test__/build');
  try {
    // Rückkehr aus einer wiederhergestellten Ansicht muss ohne manuelles update() prüfen.
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    );
    await expect(page.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible();
    const screen = page.getByRole('dialog', { name: 'App aktualisieren' });
    await expect(screen).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Später' })).toHaveCount(0);
    await page.bringToFront();
    await expect
      .poll(() => screen.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Tab');
    await expect
      .poll(() => screen.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(screen).toBeVisible();
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
        colorScheme,
      );
      await page.evaluate(async () => {
        document.body.getBoundingClientRect();
        await Promise.allSettled(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        );
      });
      // Die Updatefläche muss wie die Startfläche deckend sein; die App darf
      // auch an den Bildschirmrändern nicht durchscheinen.
      const startupBackground = await page.evaluate(() => {
        const startup = document.createElement('section');
        startup.className = 'fb-app-startup';
        document.querySelector('[data-pwa-update-screen]')!.append(startup);
        const background = getComputedStyle(startup).backgroundColor;
        startup.remove();
        return background;
      });
      expect(startupBackground).not.toBe('rgba(0, 0, 0, 0)');
      await expect(screen).toHaveCSS('background-color', startupBackground);
      expect(
        await screen.evaluate((element) => {
          const points = [
            [1, 1],
            [innerWidth - 2, 1],
            [1, innerHeight - 2],
            [innerWidth - 2, innerHeight - 2],
          ];
          return points.every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
        }),
      ).toBe(true);
      await testInfo.attach(`update-screen-${colorScheme}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      expect(
        await screen
          .getByRole('button', { name: 'Jetzt aktualisieren' })
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      ).toBe('rgb(252, 198, 1)');
      await page.evaluate(axe.source);
      expect(
        await page.evaluate(
          async () =>
            (await (window as unknown as { axe: typeof axe }).axe.run('[aria-modal="true"]'))
              .violations,
        ),
      ).toEqual([]);
    }
    const viewport = page.viewportSize()!;
    const bounds = await screen.boundingBox();
    expect(bounds?.width).toBe(viewport.width);
    expect(bounds?.height).toBe(viewport.height);
    await expect(other.getByRole('dialog', { name: 'App aktualisieren' })).toHaveCount(0);
    await expect(legacyForm.getByRole('dialog', { name: 'App aktualisieren' })).toHaveCount(0);
    await expect(
      legacyForm.getByRole('textbox', { name: 'Angezeigter Name', exact: true }),
    ).toHaveValue('Offene Einstellung');
    await expect(
      other.getByRole('status').filter({ hasText: 'Speichere oder verwerfe' }),
    ).toBeVisible();
    await pressUpdate(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
    await expect(other.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue('Ungespeichert');
    await expect(other.locator('html')).toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(
      legacyForm.getByRole('textbox', { name: 'Angezeigter Name', exact: true }),
    ).toHaveValue('Offene Einstellung');
    await expect(legacyForm.locator('html')).toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    // Die fremden Fenster bleiben während beider unabhängigen Wechsel offen.
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

test('a real second build downloads in the background without a false startup error @worker', async ({
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
  await configure(page);
  await page.goto('/settings/notifications');
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const oldBuild = await page.locator('html').getAttribute('data-flipbase-build');
  const asset = await page.evaluate(async () => {
    const inventory = await (await fetch('/pwa-assets.json')).json();
    return inventory.assets.find((item: { url: string }) => item.url === '/fonts/fonts.css')
      ?.url as string | undefined;
  });
  expect(asset).toBeDefined();
  await page.request.post(`/api/__pwa_test__/asset-delay?path=${encodeURIComponent(asset!)}`);
  await page.request.post('/api/__pwa_test__/build');
  try {
    // Ein erneuter Home-App-Start lädt zunächst das Dokument des aktiven alten
    // Workers. Ein langsamer Dateidownload ist dabei noch kein Prüffehler.
    const reopened = await context.newPage();
    await reopened.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      new MutationObserver(() => {
        if (document.querySelector('[aria-label="Updateprüfung"]'))
          document.documentElement.dataset['updateCheckFailed'] = 'true';
      }).observe(document, { childList: true, subtree: true });
    });
    await configure(reopened);
    await reopened.goto('/settings/notifications');
    await expect
      .poll(() =>
        reopened.evaluate(
          async () => (await navigator.serviceWorker.getRegistration('/'))?.installing?.state,
        ),
      )
      .toBe('installing');
    await expect(reopened.locator('[data-pwa-update-screen]')).toHaveCount(0);
    await expect(reopened.getByRole('region', { name: 'Updateprüfung' })).toHaveCount(0);
    await expect(reopened.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await testInfo.attach('slow-download-content', {
      body: await reopened.screenshot(),
      contentType: 'image/png',
    });
    await expect(reopened.getByRole('button', { name: 'Jetzt aktualisieren' })).toBeVisible({
      timeout: 20_000,
    });
    expect(await reopened.locator('html').getAttribute('data-update-check-failed')).not.toBe(
      'true',
    );
    await expect(reopened.locator('[data-pwa-update-screen]')).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await testInfo.attach('slow-update-ready', {
      body: await reopened.screenshot(),
      contentType: 'image/png',
    });
    const update = reopened.getByRole('button', { name: 'Jetzt aktualisieren' });
    if (testInfo.project.use.hasTouch) await update.tap();
    else await update.click();
    await expect(reopened.locator('html')).not.toHaveAttribute(
      'data-flipbase-build',
      oldBuild ?? '',
    );
    await expect(reopened.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
    await expect(reopened.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
  } finally {
    await page.request.post('/api/__pwa_test__/asset-delay');
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
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
      ServiceWorker.prototype.postMessage = new Proxy(ServiceWorker.prototype.postMessage, {
        apply(target, receiver, args: unknown[]) {
          const message = args[0] as { type?: string };
          if (message?.type === 'PWA_UPDATE_COMMIT_ACK') {
            setTimeout(() => Reflect.apply(target, receiver, args), 1500);
            return;
          }
          return Reflect.apply(target, receiver, args);
        },
      });
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PWA_PREPARE_UPDATE')
          document.documentElement.dataset['pwaUpdatePrepared'] = 'true';
      });
    });
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
    await expect(page.getByRole('heading', { name: 'Flipbase wird aktualisiert …' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-pwa-update-prepared', 'true');
    // Erneutes Tippen auf die gesperrte Aktion darf die laufende Prüfung anderer
    // Ansichten nicht als neuen Bearbeitungsversuch abbrechen.
    for (let tap = 0; tap < 3; tap++) {
      await appInput.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
      });
      await appInput.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    // Auch ein harmloses Tippen auf den Text der Updatefläche ist kein Edit.
    const heading = await page
      .getByRole('heading', { name: 'Flipbase wird aktualisiert …' })
      .boundingBox();
    if (!heading) throw new Error('Updateüberschrift fehlt.');
    await appInput.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: heading.x + heading.width / 2, y: heading.y + heading.height / 2 }],
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

test('legacy network-worker handover keeps the already loaded mobile build and leaves other windows open @worker', async ({
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
  const legacy = await context.newPage();
  await legacy.goto('/api/__pwa_test__/legacy-page');
  await legacy.evaluate(async () => {
    await navigator.serviceWorker.register('/api/__pwa_test__/legacy-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => legacy.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'pwa_test_document_starts',
      String(Number(sessionStorage.getItem('pwa_test_document_starts') ?? 0) + 1),
    );
  });
  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { name: 'Push-Benachrichtigungen' })).toBeVisible();
  await expect(page.locator('#app-startup')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => ({
        waiting: Boolean((await navigator.serviceWorker.getRegistration('/'))?.waiting),
        current: navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'),
      })),
    )
    .toEqual({ waiting: false, current: true });
  expect(await page.evaluate(() => sessionStorage.getItem('pwa_test_document_starts'))).toBe('1');
  await expect(legacy.locator('body')).toHaveText('Bisherige Ansicht');
  await expect(page.getByRole('region', { name: 'App aktualisieren' })).toHaveCount(0);
});

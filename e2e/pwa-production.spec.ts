import { expect, test } from '@playwright/test';

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
  await configure(page);
  await page.goto('/settings/app');
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
    await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
    await expect(page.getByRole('region', { name: 'App aktualisieren' })).toContainText(
      /offen|gespeichert|blockiert/,
    );
    expect(await page.evaluate(() => document.documentElement.dataset['flipbaseBuild'])).toBe(
      oldBuild,
    );
    await expect(other.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue('Ungespeichert');
    await other.close();
    await page.getByRole('button', { name: 'Jetzt aktualisieren' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-flipbase-build', oldBuild ?? '');
    await expect(page.getByRole('heading', { name: 'Progressive Web App (PWA)' })).toBeVisible();
  } finally {
    await page.request.post('/api/__pwa_test__/build');
  }
});

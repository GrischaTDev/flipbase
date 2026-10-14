import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

test('stops unavailable access checks without a redirect loop or protected content @pwa-layout', async ({
  page,
}) => {
  await mockMarketplace(page);
  await page.route('**/rest/v1/rpc/list_my_workspace_access', (route) =>
    route.fulfill({ status: 503, json: { message: 'Test connection unavailable' } }),
  );
  await page.goto('/dashboard');
  await expect(page.locator('#app-startup-retry')).toBeVisible();
  await expect(page.locator('#app-startup-status')).toContainText('Bitte versuche es erneut');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Verbindung fehlgeschlagen' }),
  ).toHaveCount(1);
  await expect(page.locator('app-shell')).toHaveCount(0);
  await expect(page.locator('app-offline-purchases')).toHaveCount(0);
});

test('legacy offline links lead to normal purchases without local parameters @pwa-layout', async ({
  page,
}) => {
  await mockMarketplace(page);
  await page.goto('/offline/purchases?deviceDrafts=1&localDraft=obsolete');
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(page.locator('app-purchases')).toBeVisible();
  await expect(page.locator('app-offline-purchases')).toHaveCount(0);
  await expect(page.locator('a[href="/offline/purchases"]')).toHaveCount(0);
});
test('an unauthenticated legacy link keeps normal sign-in without a local entry or access error @pwa-layout', async ({
  page,
}) => {
  await page.goto('/offline/purchases?deviceDrafts=1');
  await expect(page).toHaveURL(/\/auth\/login\?redirectTo=%2Fpurchases$/);
  await expect(page.locator('app-login')).toBeVisible();
  await expect(page.locator('a[href="/offline/purchases"]')).toHaveCount(0);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Verbindung fehlgeschlagen' }),
  ).toHaveCount(0);
});

for (const device of [
  {
    name: 'Android',
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    hasTouch: true,
    viewport: { width: 390, height: 844 },
    mobile: true,
  },
  {
    name: 'iPad desktop mode',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    viewport: { width: 1024, height: 768 },
    mobile: true,
  },
  {
    name: 'Desktop',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    hasTouch: false,
    viewport: { width: 1440, height: 900 },
    mobile: false,
  },
]) {
  test.describe(device.name, () => {
    test.use({ userAgent: device.userAgent, hasTouch: device.hasTouch, viewport: device.viewport });
    test('installation follows the device, including manual fallback @pwa-layout', async ({
      page,
    }) => {
      if (device.name === 'iPad desktop mode')
        await page.addInitScript(() =>
          Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 }),
        );
      await mockMarketplace(page);
      await page.goto('/settings/app');
      await expect(page.getByRole('heading', { name: 'Progressive Web App (PWA)' })).toBeVisible();
      if (device.viewport.width < 768)
        await page.getByRole('button', { name: 'Menü', exact: true }).click();
      const setup = page.locator('app-sidebar').getByRole('button', { name: 'App installieren' });
      if (device.mobile) {
        await expect(setup).toBeVisible();
        await setup.click();
        const dialog = page.getByRole('dialog', { name: 'Flipbase installieren' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(/Wähle im (Browser-Menü|Teilen-Menü)/)).toBeVisible();
        await page.screenshot({
          path: `.superpowers/task2-install-${device.name.replaceAll(' ', '-')}.png`,
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
      } else {
        await expect(setup).toHaveCount(0);
        await expect(page.getByText(/Wähle im (Browser-Menü|Teilen-Menü)/)).toHaveCount(0);
      }
      await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, {
          prompt: async () => undefined,
          userChoice: Promise.resolve({ outcome: 'accepted' }),
        });
        window.dispatchEvent(event);
      });
      await expect(
        page
          .locator('app-app-settings')
          .getByRole('button', { name: 'App installieren', exact: true }),
      ).toHaveCount(device.mobile ? 1 : 0);
    });
    if (device.name === 'iPad desktop mode') {
      test('keeps the tablet header in place while scrolling and resizing @pwa-layout', async ({
        page,
      }) => {
        await mockMarketplace(page);
        await page.goto('/settings/app');
        await expect(
          page.getByRole('heading', { name: 'Progressive Web App (PWA)' }),
        ).toBeVisible();
        await page.addStyleTag({ content: '[data-shell-main] { min-height: 2400px; }' });
        for (const height of [768, 860, 768]) {
          await page.setViewportSize({ width: 1024, height });
          for (const scrollTop of [0, 300, 900, 450]) {
            await page.evaluate((top) => window.scrollTo(0, top), scrollTop);
            await expect
              .poll(() =>
                page
                  .locator('app-header header')
                  .evaluate((element) => element.getBoundingClientRect().top),
              )
              .toBeGreaterThanOrEqual(-1);
            await expect
              .poll(() =>
                page
                  .locator('app-header header')
                  .evaluate((element) => element.getBoundingClientRect().top),
              )
              .toBeLessThanOrEqual(1);
          }
        }
      });
    }
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 512, height: 768 },
]) {
  test(`safe areas and navigation ${viewport.width}x${viewport.height} @pwa-layout`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockMarketplace(page);
    await page.goto('/settings/app');
    await expect(page.getByRole('heading', { name: 'Progressive Web App (PWA)' })).toBeVisible();
    await page.addStyleTag({
      content:
        ':root { --fb-safe-top: 20px; --fb-safe-bottom: 24px; --fb-safe-left: 12px; --fb-safe-right: 12px; }',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('app-header header')
        .evaluate((element) => parseFloat(getComputedStyle(element).paddingTop)),
    ).toBeGreaterThanOrEqual(20);
    if (viewport.width < 768) {
      const navigation = page.locator('app-bottom-nav nav');
      expect(
        await navigation.evaluate((element) => element.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(80);
      await navigation.getByRole('button', { name: 'Menü', exact: true }).click();
      await expect(page.locator('app-sidebar aside')).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        document.body.getBoundingClientRect();
        await Promise.allSettled(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        );
      }, theme);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(
        async () =>
          (await (window as unknown as { axe: typeof axe }).axe.run('app-app-settings')).violations,
      );
      expect(violations).toEqual([]);
    }
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const overflow = await page.evaluate(() => {
      if (document.documentElement.scrollWidth <= innerWidth) return [];
      return [...document.querySelectorAll('*')]
        .flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.right > innerWidth + 1
            ? [`${element.tagName}.${element.className}: ${bounds.right}`]
            : [];
        })
        .slice(0, 10);
    });
    expect(overflow).toEqual([]);
  });
}

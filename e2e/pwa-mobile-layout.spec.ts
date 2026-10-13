import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

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
      await page.evaluate(
        (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
        theme,
      );
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

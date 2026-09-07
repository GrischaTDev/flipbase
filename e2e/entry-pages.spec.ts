import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

test('opens sales and item creation as dedicated pages', async ({ page }) => {
  await startDemoMode(page);

  await page.goto('/sales');
  await page.getByRole('button', { name: 'Verkauf erfassen', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kennzahlen zum Verkauf' })).toBeVisible();

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Neuer Artikel', exact: true }).click();
  await expect(page).toHaveURL(/\/inventory\/new$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#itemTitle')).toBeVisible();
});

test('stacks entry cards without horizontal page overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startDemoMode(page);

  for (const path of ['/sales/new', '/inventory/new', '/purchases/new']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow, `${path} darf horizontal nicht überlaufen`).toBe(false);
  }
});

test('keeps the new entry pages free of automated WCAG AA violations', async ({ page }) => {
  await startDemoMode(page);

  for (const path of ['/sales/new', '/inventory/new', '/purchases/new']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    await page.addScriptTag({ content: axe.source });
    // Kontrast am fertig eingeblendeten Inhalt prüfen, nicht an einem Zwischenbild der Fade-Animation.
    await page.locator('main').evaluate(async (main) => {
      await Promise.all(
        main
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const accessibility = await page.evaluate(async () =>
      (window as Window & { axe: typeof axe }).axe.run(document.body, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      }),
    );
    expect(accessibility.violations, `AXE-Verstöße auf ${path}`).toEqual([]);
  }
});

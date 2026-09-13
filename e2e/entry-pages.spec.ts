import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

async function expectEntrySurface(page: Page, path: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(path + '$'));
  if (path === '/inventory/new') {
    const dialog = page.getByRole('dialog', { name: 'Produkt erstellen', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Produkt erstellen', exact: true }),
    ).toBeVisible();
  } else {
    await expect(page.locator('main h1')).toBeVisible();
  }
}

test('opens sales as a page and product creation as the shared dialog', async ({ page }) => {
  await startDemoMode(page);

  await page.goto('/sales');
  await page.getByRole('button', { name: 'Verkauf erfassen', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kennzahlen zum Verkauf' })).toBeVisible();

  await page.goto('/inventory');
  await expect(page.getByRole('link', { name: 'Einkauf erfassen', exact: true })).toBeVisible();
  await page.goto('/catalog');
  const create = page.getByRole('button', { name: 'Artikel erstellen', exact: true });
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Produkt erstellen', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();

  await page.goto('/inventory/new');
  await expectEntrySurface(page, '/inventory/new');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/inventory$/);
});

test('stacks entry cards without horizontal page overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startDemoMode(page);

  for (const path of ['/sales/new', '/inventory/new', '/purchases/new']) {
    await page.goto(path);
    await expectEntrySurface(page, path);
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow, `${path} darf horizontal nicht überlaufen`).toBe(false);
  }
});

test('keeps the new entry pages free of automated WCAG AA violations @pr-smoke', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await startDemoMode(page);

  for (const path of ['/sales/new', '/inventory/new', '/purchases/new']) {
    await page.goto(path);
    await expectEntrySurface(page, path);
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

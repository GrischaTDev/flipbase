import { type Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

async function expectEntrySurface(page: Page, path: string): Promise<void> {
  await expect(page).toHaveURL(
    new RegExp((path === '/inventory/new' ? '/catalog/new' : path) + '$'),
  );
  await expect(page.locator('main h1')).toBeVisible();
}

test('opens sales and catalog creation as pages while preserving the inventory shortcut', async ({
  page,
}) => {
  await openDashboard(page);

  await page.goto('/sales');
  // .first(): der leere Arbeitsbereich zeigt zusätzlich zum Kopfzeilenknopf denselben
  // Text als Leerstand-Aktion; geprüft wird der Knopf in der Kopfzeile.
  await page.getByRole('button', { name: 'Verkauf erfassen', exact: true }).first().click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kennzahlen zum Verkauf' })).toBeVisible();

  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/catalog\?view=stock$/);
  await expect(page.getByRole('link', { name: 'Artikel erstellen', exact: true })).toBeVisible();
  await page.goto('/catalog');
  await page.getByRole('link', { name: 'Artikel erstellen', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/new$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Zur Artikelliste', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);

  await page.goto('/inventory/new');
  await expectEntrySurface(page, '/inventory/new');
  await page.getByRole('link', { name: 'Zur Artikelliste', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
});

test('stacks entry cards without horizontal page overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);

  for (const path of ['/sales/new', '/inventory/new', '/purchases/new', '/catalog/new']) {
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
  await openDashboard(page);

  for (const path of ['/sales/new', '/inventory/new', '/purchases/new', '/catalog/new']) {
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

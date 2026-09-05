import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('zeigt den primaeren Einkaufsknopf mit lesbarer Schrift auf dem Markenakzent', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases');

  const button = page.getByRole('button', { name: 'Neuer Einkauf' });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('behält im dunklen Admin die aktive Sidebarfläche mit Hintergrund und Rahmen', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.evaluate(() => localStorage.setItem('flipbase_theme', 'dark'));
  await page.goto('/purchases');

  const activeLink = page.locator('app-sidebar a[aria-current="page"]');
  await expect(activeLink).toBeVisible();
  await expect(activeLink).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(activeLink).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)');
});

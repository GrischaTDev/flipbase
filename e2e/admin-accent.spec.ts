import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('zeigt den primaeren Einkaufsknopf in Logo-Gelb mit lesbarer Schrift', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases');

  const button = page.getByRole('button', { name: 'Neuer Einkauf' });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt primaere Admin-Aktionen auch im dunklen Design in Logo-Gelb', async ({ page }) => {
  await startDemoMode(page);
  await page.evaluate(() => localStorage.setItem('flipbase_theme', 'dark'));
  await page.goto('/purchases');

  const button = page.getByRole('button', { name: 'Neuer Einkauf' });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt Speichern und Chronik-Posten als gelbe Primaeraktionen', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');

  const saveButton = page.getByRole('button', { name: 'Entwurf speichern', exact: true });
  await expect(saveButton).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(saveButton).toHaveCSS('color', 'rgb(26, 26, 26)');

  await page.goto('/purchases');
  await page.locator('[data-purchase-row]').first().click();
  const postButton = page.getByRole('button', { name: 'Posten', exact: true });
  await expect(postButton).toBeVisible();
  await expect(postButton).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(postButton).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt Verkauf erfassen im hellen Admin in Logo-Gelb', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/sales');

  const button = page.getByRole('button', { name: 'Verkauf erfassen' }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt Verkauf erfassen im dunklen Admin in Logo-Gelb', async ({ page }) => {
  await startDemoMode(page);
  await page.evaluate(() => localStorage.setItem('flipbase_theme', 'dark'));
  await page.goto('/sales');

  const button = page.getByRole('button', { name: 'Verkauf erfassen' }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
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

test('hält umgebogene Indigo-Aktionsflächen im hellen Admin gelb und kontrastreich', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases');

  const probe = page.locator('.fb-admin').evaluate((admin) => {
    const element = document.createElement('span');
    element.dataset['accentContrastProbe'] = '';
    element.className = 'bg-indigo-600 text-white';
    admin.append(element);
  });
  await probe;

  const accent = page.locator('[data-accent-contrast-probe]');
  await expect(accent).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(accent).toHaveCSS('color', 'rgb(26, 26, 26)');
});

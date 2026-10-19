import { expect, test, type Page } from '@playwright/test';
import { mockMarketplace } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function openDashboard(page: Page) {
  await mockMarketplace(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  await expect(page.locator('main h1')).toBeVisible();
}

test('zeigt den primaeren Einkaufsknopf in Logo-Gelb mit lesbarer Schrift', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases');

  // .first(): der leere Arbeitsbereich zeigt zusätzlich zum Kopfzeilenknopf denselben
  // Text als Leerstand-Aktion; geprüft wird der Knopf in der Kopfzeile.
  const button = page.getByRole('button', { name: 'Neuer Einkauf' }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt primaere Admin-Aktionen auch im dunklen Design in Logo-Gelb', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();

  // .first(): siehe Kommentar im hellen Pendant oben.
  const button = page.getByRole('button', { name: 'Neuer Einkauf' }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt Verkauf erfassen im hellen Admin in Logo-Gelb', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/sales');

  const button = page.getByRole('button', { name: 'Verkauf erfassen' }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('zeigt Verkauf erfassen im dunklen Admin in Logo-Gelb', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/sales');
  await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();

  const button = page.getByRole('button', { name: 'Verkauf erfassen' }).first();
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

test('trennt im dunklen Admin neutrale Navigation von gelben Hauptaktionen', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();

  const activeLink = page.locator('app-sidebar a[aria-current="page"]');
  await expect(activeLink).toBeVisible();
  await expect(activeLink).toHaveCSS('background-color', 'rgb(40, 40, 43)');
  await expect(activeLink).toHaveCSS('color', 'rgb(242, 242, 247)');
});

test('hält umgebogene Indigo-Aktionsflächen im hellen Admin gelb und kontrastreich', async ({
  page,
}) => {
  await openDashboard(page);
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

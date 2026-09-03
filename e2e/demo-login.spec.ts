import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

test('öffnet den lokalen Demo-Modus über die sichtbare Anmeldung', async ({ page }) => {
  await startDemoMode(page);

  await expect(page.getByText('Demo-Modus', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible();
});

test('öffnet Rechtshinweise per Modal in der Registrierung', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('link', { name: 'Registrieren' }).click();

  await expect(page).toHaveURL(/\/auth\/register$/);

  // AGB-Modal öffnen und schließen
  await page.getByRole('button', { name: 'AGB', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Datenschutzerklärung-Modal öffnen und schließen
  await page.getByRole('button', { name: 'Datenschutzerklärung', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

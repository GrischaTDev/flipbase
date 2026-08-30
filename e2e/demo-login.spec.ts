import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

test('öffnet den lokalen Demo-Modus über die sichtbare Anmeldung', async ({ page }) => {
  await startDemoMode(page);

  await expect(page.getByText('Demo-Modus', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kennzahlen' })).toBeVisible();
});

test('zeigt Rechtshinweise ohne unechte Sprungziele in der Registrierung', async ({ page }) => {
  await page.goto('/auth/login');
  await page.getByRole('link', { name: 'Registrieren' }).click();

  await expect(page).toHaveURL(/\/auth\/register$/);
  for (const legalNotice of ['AGB', 'Datenschutzerklärung']) {
    await expect(page.getByText(legalNotice, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: legalNotice, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: legalNotice, exact: true })).toHaveCount(0);
  }
});

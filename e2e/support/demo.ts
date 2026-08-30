import { expect, type Page } from '@playwright/test';

export async function startDemoMode(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'Demo-Modus starten (ohne Anmeldung)' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Ertrag im Blick' })).toBeVisible();
}

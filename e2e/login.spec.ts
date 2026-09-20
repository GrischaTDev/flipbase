import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient } from './support/local-supabase';

// Ohne gespeicherte Sitzung: Dieser Test prüft die echte Anmeldung.
test.use({ storageState: { cookies: [], origins: [] } });

test('meldet sich mit einem echten Konto an', async ({ page }) => {
  const email = `e2e-login-${randomUUID()}@flipbase.local`;
  const password = randomUUID();
  const { error } = await createLocalAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();

  await page.goto('/auth/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Ertrag im Blick' })).toBeVisible();
});

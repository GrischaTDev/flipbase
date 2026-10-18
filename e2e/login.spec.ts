import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createLocalAdminClient } from './support/local-supabase';

// Ohne gespeicherte Sitzung: Dieser Test prüft die echte Anmeldung.
test.use({ storageState: { cookies: [], origins: [] } });

test('meldet sich mit einem echten Konto an', async ({ page }) => {
  const email = `e2e-login-${randomUUID()}@flipbase.local`;
  const password = randomUUID();
  const admin = createLocalAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  if (!created.user) throw new Error('Testkonto wurde nicht angelegt.');

  // Die Anmeldung eines eingerichteten Kontos führt direkt zur Übersicht.
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', created.user.id)
    .single();
  expect(membershipError).toBeNull();
  if (!membership) throw new Error('Initialer Test-Workspace fehlt.');
  const { data: workspace, error: setupError } = await admin
    .from('workspaces')
    .update({ setup_completed_at: new Date().toISOString() })
    .eq('id', membership.workspace_id)
    .select('id')
    .single();
  expect(setupError).toBeNull();
  expect(workspace?.id).toBe(membership.workspace_id);

  await page.goto('/auth/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible();
});

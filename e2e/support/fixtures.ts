import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createUserClient } from './local-supabase';
import { createTestAccountSessionProvider, sessionStorageState } from './test-account';

export interface TestWorkspace {
  readonly id: string;
  readonly client: SupabaseClient;
}

/** Jeder Test bekommt automatisch einen frischen, leeren Workspace im Testkonto. */
export const test = base.extend<
  { workspace: TestWorkspace; accountSession: Session; shopEnabled: boolean },
  { workerSession: () => Promise<Session> }
>({
  shopEnabled: [true, { option: true }],
  workerSession: [
    // Playwright verlangt ein Destrukturierungsmuster auch ohne Fixture-Abhängigkeiten.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(createTestAccountSessionProvider());
    },
    { scope: 'worker' },
  ],
  accountSession: async ({ workerSession }, use) => {
    await use(await workerSession());
  },
  // Vor dem Context-Aufbau. Bewusst leere/eigene test.use-Zustände bleiben vorrangig.
  storageState: async ({ accountSession }, use) => {
    await use(sessionStorageState(accountSession));
  },
  workspace: [
    async ({ page, accountSession, shopEnabled }, use) => {
      const client = createUserClient(accountSession.access_token);
      const { data, error } = await client.rpc('create_workspace', {
        p_name: `E2E ${randomUUID().slice(0, 8)}`,
      });
      if (error || typeof data !== 'string') {
        throw new Error(`Test-Workspace fehlt: ${error?.message ?? 'keine Kennung zurückgegeben'}`);
      }
      if (shopEnabled) {
        const activation = await client.rpc('set_workspace_shop_enabled', {
          p_workspace_id: data,
          p_enabled: true,
          p_expected_version: 0,
        });
        if (activation.error)
          throw new Error(`Shop-Testaufbau fehlgeschlagen: ${activation.error.message}`);
      }
      const { error: supplierError } = await client.from('suppliers').insert({
        workspace_id: data,
        name: 'E2E Verkäufer',
        seller_type: 'private',
        is_active: true,
      });
      if (supplierError) {
        throw new Error(`Test-Verkäufer fehlt: ${supplierError.message}`);
      }
      await page.addInitScript((id) => {
        localStorage.setItem('flipbase_active_workspace_id', id);
      }, data);
      await use({ id: data, client });
    },
    { auto: true },
  ],
});

export { expect };

/** Ersatz für den früheren Demo-Start: öffnet die App angemeldet im Test-Workspace. */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible();
}

export async function selectDefaultPurchaseSeller(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Verkäufer auswählen' }).click();
  await page.getByRole('option', { name: 'E2E Verkäufer', exact: true }).click();
}

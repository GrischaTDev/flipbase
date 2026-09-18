import { randomUUID } from 'node:crypto';
import { test as base, expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUserClient } from './local-supabase';
import { readAccessToken } from './test-account';

export interface TestWorkspace {
  readonly id: string;
  readonly client: SupabaseClient;
}

/** Jeder Test bekommt automatisch einen frischen, leeren Workspace im Testkonto. */
export const test = base.extend<{ workspace: TestWorkspace }>({
  workspace: [
    async ({ page }, use) => {
      const client = createUserClient(readAccessToken());
      const { data, error } = await client.rpc('create_workspace', {
        p_name: `E2E ${randomUUID().slice(0, 8)}`,
      });
      if (error || typeof data !== 'string') {
        throw new Error(`Test-Workspace fehlt: ${error?.message ?? 'keine Kennung zurückgegeben'}`);
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
  await expect(page.getByRole('heading', { name: 'Ertrag im Blick' })).toBeVisible();
}

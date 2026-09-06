import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

test('kehrt vom Einkaufsartikel zum selben Demo-Einkauf zurück', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases');

  await page.locator('[data-purchase-row="pur-demo-2"]').click();
  await expect(page).toHaveURL(/\/purchases\/pur-demo-2$/);

  const itemRow = page
    .getByRole('row')
    .filter({ hasText: 'Nintendo Game Boy Color (Lila Transparent)' });
  await itemRow
    .getByRole('link', { name: 'Artikel 1 von Nintendo Game Boy Color (Lila Transparent) öffnen' })
    .click();
  await expect(page).toHaveURL(/\/inventory\/item-demo-2\?returnTo=%2Fpurchases%2Fpur-demo-2$/);

  await page.getByRole('link', { name: 'Zurück zum Einkauf' }).click();
  await expect(page).toHaveURL(/\/purchases\/pur-demo-2$/);
  await expect(
    page.getByRole('heading', { name: 'Retro Gaming & Nintendo Konvolut (Mystery Box)' }),
  ).toBeVisible();
});

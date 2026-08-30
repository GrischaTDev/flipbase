import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

const saleItem = 'Super Nintendo SNES Original Controller';

test('verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/inventory');

  const inventory = page.getByRole('table', {
    name: 'Gemeinsame Inventartabelle mit Mengenpositionen und einzeln nachverfolgten Artikeln',
  });
  const sellButton = page.getByRole('button', { name: `${saleItem} verkaufen` });
  await expect(sellButton).toBeVisible({ timeout: 10_000 });
  await expect(inventory.getByText('Mengenposition', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(`${saleItem}.*Einzelstück`) }),
  ).toBeVisible();

  await sellButton.click();
  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeVisible();
  await page.getByLabel('Preis je Stück (€)').fill('35');
  await page.getByRole('button', { name: 'Verkauf abschließen' }).click();

  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeHidden();
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('heading', { name: 'Verkäufe' })).toBeVisible();
  const recordedSales = page.getByRole('row').filter({ hasText: saleItem });
  await expect(recordedSales).toHaveCount(1);
  await expect(recordedSales).toContainText('35,00 €');

  await page.goto('/inventory');
  const soldRow = page.getByRole('row').filter({ hasText: saleItem });
  await expect(soldRow.getByText('Verkauft', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `${saleItem} verkaufen` })).toHaveCount(0);
});

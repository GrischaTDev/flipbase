import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

const saleItem = 'Super Nintendo SNES Original Controller';

test('verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/inventory');

  const inventory = page.getByRole('table', {
    name: 'Inventartabelle mit Herkunft, Bestand, Kosten, Status und Verkaufsbezug',
  });
  const sellButton = page.getByRole('button', { name: `${saleItem} verkaufen` });
  await expect(sellButton).toBeVisible({ timeout: 10_000 });
  const inventoryRow = inventory.getByRole('row').filter({ hasText: saleItem });
  await expect(
    inventoryRow.getByRole('checkbox', { name: `Artikel ${saleItem} auswählen` }),
  ).toBeVisible();
  await expect(inventoryRow).toContainText('1 Stück insgesamt');

  await sellButton.click();
  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeVisible();
  await page.getByLabel('Preis je Stück (€)').fill('35');
  await page.getByRole('button', { name: 'Verkauf abschließen' }).click();

  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeHidden();
  await expect(page).toHaveURL(/\/inventory$/);
  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: 'Verkäufe' })).toBeVisible();
  const recordedSales = page.getByRole('row').filter({ hasText: saleItem });
  await expect(recordedSales).toHaveCount(1);
  await expect(recordedSales).toContainText('35,00 €');

  await page.goto('/inventory');
  const soldRow = page.getByRole('row').filter({ hasText: saleItem });
  await expect(soldRow.getByText('Verkauft', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `${saleItem} verkaufen` })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

const saleItem = 'Super Nintendo SNES Original Controller';

test('verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/inventory');

  const inventory = page.getByRole('table', {
    name: 'Bestand mit Artikel, auf Lager, verfügbar und reserviert',
  });
  const sellButton = page.getByRole('button', { name: `${saleItem} verkaufen` });
  await expect(sellButton).toBeVisible({ timeout: 10_000 });
  const inventoryRow = inventory.getByRole('row').filter({ hasText: saleItem });
  await expect(
    inventoryRow.getByRole('checkbox', { name: `Artikel ${saleItem} auswählen` }),
  ).toBeVisible();
  await expect(inventoryRow.getByRole('cell').nth(2)).toHaveText('1');
  await expect(inventoryRow.getByRole('cell').nth(3)).toHaveText('1');

  await sellButton.click();
  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeVisible();
  await page.getByLabel('Preis je Stück (€)').fill('35');
  await page.getByRole('button', { name: 'Verkauf abschließen' }).click();

  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeHidden();
  await expect(page).toHaveURL(/\/inventory$/);
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('heading', { name: 'Verkäufe' })).toBeVisible({ timeout: 15_000 });
  const recordedSales = page.getByRole('row').filter({ hasText: saleItem });
  await expect(recordedSales).toHaveCount(1);
  await expect(recordedSales).toContainText('35,00 €');

  await page.goto('/inventory');
  const soldRow = page.getByRole('row').filter({ hasText: saleItem });
  await expect(soldRow).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Bestandsansicht', exact: true })
    .getByRole('button', { name: 'Verkauft', exact: true })
    .click();
  await expect(soldRow).toBeVisible();
  await expect(soldRow.getByRole('cell').nth(2)).toHaveText('0');
  await expect(page.getByRole('button', { name: `${saleItem} verkaufen` })).toHaveCount(0);
});

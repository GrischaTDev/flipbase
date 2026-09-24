import { expect, openDashboard, test } from './support/fixtures';
import { createFinalizedPurchase } from './support/sample-data';

const saleItem = 'Super Nintendo SNES Original Controller';

test('verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke', async ({
  page,
  workspace,
}) => {
  await createFinalizedPurchase(workspace, {
    title: 'Retro-Zubehör',
    purchaseDate: '2026-09-01',
    items: [{ title: saleItem, price: 20 }],
  });
  await openDashboard(page);
  await page.goto('/catalog?view=stock');

  const inventory = page.getByRole('table', {
    name: 'Alle Artikel',
  });
  const sellButton = page.getByRole('button', { name: `${saleItem} verkaufen` });
  await expect(sellButton).toBeVisible({ timeout: 10_000 });
  const inventoryRow = inventory.getByRole('row').filter({ hasText: saleItem });
  await expect(inventoryRow.getByRole('cell').nth(1)).toHaveText('1 Stück');
  await expect(inventoryRow.getByRole('cell').nth(2)).toHaveText('1 Stück');

  await sellButton.click();
  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeVisible();
  await page.getByLabel('Preis je Stück (€)').fill('35');
  await page.getByRole('button', { name: 'Verkauf abschließen' }).click();

  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeHidden();
  await expect(page).toHaveURL(/\/catalog\?view=stock$/);
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('heading', { name: 'Verkäufe & Retouren' })).toBeVisible({
    timeout: 15_000,
  });
  const recordedSales = page.getByRole('row').filter({ hasText: saleItem });
  await expect(recordedSales).toHaveCount(1);
  await expect(recordedSales).toContainText('35,00 €');

  await page.goto('/catalog?view=stock');
  const soldRow = page.getByRole('row').filter({ hasText: saleItem });
  await expect(soldRow).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Artikelansicht' })
    .getByRole('button', { name: 'Ohne Bestand' })
    .click();
  await expect(soldRow).toBeVisible();
  await expect(soldRow.getByRole('cell').nth(1)).toHaveText('0 Stück');
  await expect(page.getByRole('button', { name: `${saleItem} verkaufen` })).toHaveCount(0);
});

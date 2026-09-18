import { expect, openDashboard, test } from './support/fixtures';

test('ungespeicherte Artikeländerung lässt sich beim Weggehen behalten', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/catalog');
  await page.getByRole('link', { name: 'Artikel erstellen', exact: true }).click();
  const dialog = page.locator('app-product-detail');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Unveränderte Konsole');
  await dialog.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
  const field = page
    .locator('app-product-detail')
    .getByRole('textbox', { name: 'Name', exact: true });
  await field.fill('Noch nicht gespeichert');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('navigation', { name: 'Artikelansichten' })
    .getByRole('link', { name: 'Bestand', exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalog\/[^/?]+$/);
  await expect(field).toHaveValue('Noch nicht gespeichert');
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(field).toHaveValue('Unveränderte Konsole');
});

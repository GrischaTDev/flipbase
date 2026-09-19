import { expect, openDashboard, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';

test('keeps a Vinted purchase without a saved seller identifiable after reopening', async ({
  page,
  workspace,
}) => {
  const { error } = await workspace.client.from('sources').insert({
    workspace_id: workspace.id,
    name: 'Vinted',
    type: 'online_marketplace',
    is_active: true,
    is_default: false,
  });
  expect(error).toBeNull();
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page
    .getByRole('textbox', { name: 'Bezeichnung (optional)' })
    .fill('Vinted Überraschungspaket');
  await page.getByRole('combobox', { name: 'Quelle auswählen' }).click();
  await page.getByRole('option', { name: 'Vinted', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Plattform-Benutzername (optional)' })
    .fill('vintage_lea92');
  await page
    .getByRole('textbox', { name: 'Bestellnummer der Plattform (optional)' })
    .fill('V-4711');
  await addNewPurchaseProduct(page, 'Vinted Artikel');
  await page.getByRole('spinbutton', { name: 'Stückpreis für Vinted Artikel' }).fill('100');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();

  await expect(
    page.locator('[data-purchase-description]').filter({ hasText: 'Vinted Überraschungspaket' }),
  ).toBeVisible();
  await expect(page.getByText('vintage_lea92', { exact: true })).toBeVisible();
  await page
    .locator('[data-purchase-description]')
    .filter({ hasText: 'Vinted Überraschungspaket' })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Plattform-Benutzername (optional)' }),
  ).toHaveValue('vintage_lea92');
  await expect(
    page.getByRole('textbox', { name: 'Bestellnummer der Plattform (optional)' }),
  ).toHaveValue('V-4711');
});

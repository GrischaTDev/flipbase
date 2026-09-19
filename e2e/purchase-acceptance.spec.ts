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

test('keeps open purchase prices separate from 0,00 € and blocks their receipt workflow', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Bezeichnung (optional)' }).fill('Preis noch offen');
  await addNewPurchaseProduct(page, 'Offener Einkaufsartikel');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page.locator('[data-purchase-row]').first().click();

  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  await expect(page.locator('[data-open-purchase-prices]')).toContainText('Einkaufspreise offen');
  await expect(page.locator('[data-purchase-cost-open]')).toHaveText('Kosten offen');
  await expect(page.getByRole('button', { name: 'Angekommen', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Erfassung abschließen', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Wareneingang buchen', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('spinbutton', { name: 'Stückpreis für Offener Einkaufsartikel', exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('textbox', { name: 'Bezeichnung (optional)' })
    .fill('Preis nach Wiederöffnen noch offen');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  await page.reload();
  await expect(page.locator('[data-open-purchase-prices]')).toContainText('Einkaufspreise offen');

  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Bezeichnung (optional)' }).fill('Kostenloser Einkauf');
  await addNewPurchaseProduct(page, 'Kostenloser Einkaufsartikel');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Kostenloser Einkaufsartikel', exact: true })
    .fill('0');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page.locator('[data-purchase-row]').first().click();

  await expect(page.getByText(/0,00/).first()).toBeVisible();
  await expect(page.locator('[data-open-purchase-prices]')).toHaveCount(0);
});

import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';

test('keeps a purchase identifiable by seller, source and description after reopening', async ({
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
  const { error: sellerError } = await workspace.client.from('suppliers').insert({
    workspace_id: workspace.id,
    name: 'Vintage Lea',
    seller_type: 'private',
    is_active: true,
  });
  expect(sellerError).toBeNull();
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.getByRole('combobox', { name: 'Verkäufer auswählen' }).click();
  await page.getByRole('option', { name: 'Vintage Lea', exact: true }).click();
  await page.getByRole('combobox', { name: 'Quelle auswählen' }).click();
  await page.getByRole('option', { name: 'Vinted', exact: true }).click();
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Vinted Überraschungspaket');
  await addNewPurchaseProduct(page, 'Vinted Artikel');
  await page.getByRole('spinbutton', { name: 'Stückpreis für Vinted Artikel' }).fill('100');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/(?!new$)[^/]+$/);
  await page.getByRole('button', { name: 'Zurück zur Einkaufsübersicht', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases$/);

  await expect(
    page.locator('[data-purchase-description]').filter({ hasText: 'Vinted Überraschungspaket' }),
  ).toBeVisible();
  await expect(page.getByText('Vintage Lea', { exact: true }).first()).toBeVisible();
  await page
    .locator('[data-purchase-description]')
    .filter({ hasText: 'Vinted Überraschungspaket' })
    .click();
  await expect(page.getByRole('combobox', { name: 'Verkäufer auswählen' })).toContainText(
    'Vintage Lea',
  );
  await expect(page.getByRole('combobox', { name: 'Quelle auswählen' })).toContainText('Vinted');
  await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue(
    'Vinted Überraschungspaket',
  );
});

test('keeps open line prices separate from the 0,00 € summary and blocks receipt', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Preis noch offen');
  await addNewPurchaseProduct(page, 'Offener Einkaufsartikel');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/(?!new$)[^/]+$/);

  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toContainText('0,00');
  await expect(page.locator('app-purchase-line-editor tbody tr')).toContainText('Offen');
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
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Preis nach Wiederöffnen offen');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  await page.reload();
  await expect(page.locator('app-purchase-line-editor tbody tr')).toContainText('Offen');

  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Kostenloser Einkauf');
  await addNewPurchaseProduct(page, 'Kostenloser Einkaufsartikel');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Kostenloser Einkaufsartikel', exact: true })
    .fill('0');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/(?!new$)[^/]+$/);

  await expect(page.getByText(/0,00/).first()).toBeVisible();
  await expect(page.locator('[data-open-purchase-prices]')).toHaveCount(0);
});

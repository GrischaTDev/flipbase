import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';

test('edits a saved purchase in place and retains discounted totals after reload', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Arbeitsbereich-Test');
  // #purchase-base-price gibt es nicht mehr; der Einkaufspreis kommt aus den Positionen.
  await addNewPurchaseProduct(page, 'Werkstattartikel');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Werkstattartikel', exact: true })
    .fill('100');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page
    .locator('[data-purchase-description]')
    .filter({ hasText: 'Arbeitsbereich-Test' })
    .click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  const detailUrl = page.url();

  await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue(
    'Arbeitsbereich-Test',
  );
  await expect(page.getByRole('button', { name: 'Verwerfen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Bearbeiteter Einkauf');
  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Zusatzausgaben verwalten' });
  await dialog.getByRole('combobox', { name: 'Zusatzausgabe 1', exact: true }).click();
  await page.getByRole('option', { name: 'Rabatt', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Änderungen speichern', exact: true })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toHaveValue(
    'Bearbeiteter Einkauf',
  );
  await expect(page.getByRole('region', { name: 'Kostenübersicht', exact: true })).toContainText(
    '90,00',
  );
  // Erneutes Öffnen statt Reload: prüft denselben Ladeweg wie eine normale Navigation.
  await page.getByRole('button', { name: 'Zurück zur Einkaufsübersicht', exact: true }).click();
  await page
    .locator('[data-purchase-description]')
    .filter({ hasText: 'Bearbeiteter Einkauf' })
    .click();
  await expect(page.getByRole('region', { name: 'Kostenübersicht', exact: true })).toContainText(
    '90,00',
  );
});

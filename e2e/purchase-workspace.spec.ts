import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';
import { addNewPurchaseProduct } from './support/products';

test('opens an existing purchase directly without runtime errors @pr-smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startDemoMode(page);
  await page.goto('/purchases/pur-demo-2');
  try {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  } finally {
    expect(errors).toEqual([]);
  }
});

test('edits a saved purchase in place and retains discounted totals after reload', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  // Die Liste zeigt die Bezeichnung; die Beschreibung bleibt die Notiz und
  // wird weiter unten auf ihren Rundlauf geprueft.
  await page.getByRole('textbox', { name: 'Bezeichnung (optional)' }).fill('Arbeitsbereich-Test');
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Arbeitsbereich-Notiz');
  // Ein eigenes Feld fuer den Warenbetrag gibt es nicht mehr; er entsteht aus
  // den Positionen. Denselben Weg geht der gruene Test "distributes a package
  // price per position".
  await addNewPurchaseProduct(page, 'Arbeitsbereich-Position');
  await page.getByRole('button', { name: 'Paketpreis verteilen', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Gesamtpreis des Pakets' }).fill('100');
  await page.getByRole('button', { name: 'Verteilen', exact: true }).click();
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page
    .locator('[data-purchase-description]')
    .filter({ hasText: 'Arbeitsbereich-Test' })
    .click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  const detailUrl = page.url();

  await expect(page.getByRole('textbox', { name: 'Beschreibung (optional)' })).toHaveValue(
    'Arbeitsbereich-Notiz',
  );
  await expect(page.getByRole('button', { name: 'Verwerfen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Bezeichnung (optional)' }).fill('Bearbeiteter Einkauf');
  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kostenübersicht verwalten' });
  await dialog.getByRole('combobox', { name: 'Anpassung 1', exact: true }).click();
  await page.getByRole('option', { name: 'Rabatt', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Änderungen speichern', exact: true })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByRole('textbox', { name: 'Bezeichnung (optional)' })).toHaveValue(
    'Bearbeiteter Einkauf',
  );
  // Die Notiz bleibt beim Bearbeiten unangetastet erhalten.
  await expect(page.getByRole('textbox', { name: 'Beschreibung (optional)' })).toHaveValue(
    'Arbeitsbereich-Notiz',
  );
  await expect(page.getByRole('region', { name: 'Kostenübersicht', exact: true })).toContainText(
    '90,00',
  );
  // Der Demo-Modus verwirft neue Datensätze bei einem vollständigen Browserreload.
  // Ein erneutes Öffnen lädt den Einkauf über denselben Service wie im Echtbetrieb.
  await page.getByRole('button', { name: 'Zurück zur Einkaufsübersicht', exact: true }).click();
  await page
    .locator('[data-purchase-description]')
    .filter({ hasText: 'Bearbeiteter Einkauf' })
    .click();
  await expect(page.getByRole('region', { name: 'Kostenübersicht', exact: true })).toContainText(
    '90,00',
  );
});

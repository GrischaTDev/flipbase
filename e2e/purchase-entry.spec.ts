import { expect, test, type Locator } from '@playwright/test';
import { addNewPurchaseProduct } from './support/products';
import { startDemoMode } from './support/demo';

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Das geprüfte Element besitzt keine sichtbare Größe.');
  return box;
}

test('keeps purchase search available when no rows match', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases');
  const search = page.getByRole('searchbox', { name: 'Einkäufe durchsuchen' });

  await search.fill('zzznichtvorhanden');

  await expect(search).toBeVisible();
  await expect(page.getByText('Keine passenden Einkäufe', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Suche und Filter löschen', exact: true }).click();
  await expect(page.locator('[data-purchase-row]').first()).toBeVisible();
});

test('opens purchase entry as a dedicated page', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'Neuer Einkauf', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await expect(page.getByRole('heading', { name: 'Einkauf erstellen', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toBeVisible();
});

test('aligns the purchase heading with its content and uses an edit icon action', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');

  const heading = page.getByRole('heading', { name: 'Einkauf erstellen', exact: true });
  const content = page.locator('app-purchase-entry-form form');
  const saveButton = page.getByRole('button', { name: 'Entwurf speichern', exact: true });
  const headingBox = await visibleBox(heading);
  const contentBox = await visibleBox(content);
  const saveButtonBox = await visibleBox(saveButton);

  expect(headingBox.x).toBe(contentBox.x + 44);
  expect(saveButtonBox.y).toBeLessThan(contentBox.y);
  await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kosten bearbeiten', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Kostenübersicht' }).getByText('Bearbeiten', { exact: true }),
  ).toHaveCount(0);
});

test('leaves a pristine entry page without prompting', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  let prompts = 0;
  page.on('dialog', async (dialog) => {
    prompts += 1;
    await dialog.dismiss();
  });

  await page.getByRole('button', { name: 'Zurück zu Einkäufen' }).click();

  await expect(page).toHaveURL(/\/purchases$/);
  expect(prompts).toBe(0);
});

test('keeps edits after cancelling navigation and leaves after confirmation', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  const description = page.getByRole('textbox', { name: 'Beschreibung (optional)' });
  await description.fill('Nicht verwerfen');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Zurück zu Einkäufen' }).click();
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await expect(description).toHaveValue('Nicht verwerfen');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Zurück zu Einkäufen' }).click();
  await expect(page).toHaveURL(/\/purchases$/);
});

test('distributes a package price per position', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Paket-Entwurf');
  await addNewPurchaseProduct(page, 'Paketposition A');
  await addNewPurchaseProduct(page, 'Paketposition B');

  await page.getByRole('button', { name: 'Paketpreis verteilen', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Gesamtpreis des Pakets' }).fill('100');
  await page.getByRole('button', { name: 'Verteilen', exact: true }).click();

  await expect(page.getByRole('textbox', { name: 'Beschreibung (optional)' })).toHaveValue(
    'Paket-Entwurf',
  );
  await expect(page.getByRole('button', { name: 'Entwurf speichern' })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toContainText('100,00');
});

test('applies cost adjustments only when the management dialog is saved', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Paket-Entwurf');
  await addNewPurchaseProduct(page, 'Kostenartikel');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Kostenartikel', exact: true })
    .fill('100');
  const costSummary = page.getByRole('region', { name: 'Kostenübersicht' });

  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Kostenübersicht verwalten' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Anpassung', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Betrag', { exact: true }).filter({ visible: true })).toBeVisible();
  const adjustment = dialog.getByRole('combobox', { name: 'Anpassung 1', exact: true });
  await expect(adjustment).toContainText('Auswählen');
  await adjustment.click();
  await expect(dialog.getByRole('option')).toHaveCount(10);
  await dialog.getByRole('option', { name: 'Versandkosten', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }).fill('10');

  await expect(costSummary).toContainText('100,00');
  await expect(costSummary).not.toContainText('110,00');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(costSummary).not.toContainText('110,00');

  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Kostenübersicht verwalten' });
  await dialog.getByRole('combobox', { name: 'Anpassung 1', exact: true }).click();
  await dialog.getByRole('option', { name: 'Versandkosten', exact: true }).click();
  await dialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

  await expect(page.getByRole('textbox', { name: 'Beschreibung (optional)' })).toHaveValue(
    'Paket-Entwurf',
  );
  await expect(page.getByRole('button', { name: 'Entwurf speichern' })).toBeEnabled();
  await expect(costSummary).toContainText('110,00');
});

test('keeps create, detail and inline editing in the same centered workspace', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  const createWorkspace = page.getByTestId('purchase-entry-workspace');
  const createWorkspaceBox = await visibleBox(createWorkspace);
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Dialog-Zentrierung');
  await addNewPurchaseProduct(page, 'Testartikel');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Testartikel', exact: true })
    .fill('100');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page.locator('[data-purchase-row]').first().click();

  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  const detailUrl = page.url();
  const detailWorkspace = page.getByTestId('purchase-entry-workspace');
  const detailWorkspaceBox = await visibleBox(detailWorkspace);
  expect(detailWorkspaceBox.x).toBeCloseTo(createWorkspaceBox.x, 0);
  expect(detailWorkspaceBox.width).toBeCloseTo(createWorkspaceBox.width, 0);

  const main = page.getByTestId('purchase-entry-main');
  const timeline = page.getByTestId('purchase-entry-timeline');
  await expect(main.getByTestId('purchase-entry-timeline')).toHaveCount(1);
  const mainBox = await visibleBox(main);
  const timelineBox = await visibleBox(timeline);
  const lastMainCardBox = await visibleBox(main.locator('app-card').last());
  expect(timelineBox.x).toBeCloseTo(mainBox.x, 0);
  expect(timelineBox.width).toBeCloseTo(mainBox.width, 0);
  expect(timelineBox.width).toBeLessThan(detailWorkspaceBox.width);
  expect(timelineBox.y).toBeGreaterThanOrEqual(lastMainCardBox.y + lastMainCardBox.height);

  const detailHeading = page.getByRole('heading', { level: 1 });
  const detailTitle = (await detailHeading.textContent())?.trim() ?? '';
  expect(detailTitle).toBe('Einkauf');

  await expect(page.locator('app-purchase-entry-form')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Geänderter Entwurf');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(detailUrl);
  await expect(detailHeading).toHaveText(detailTitle);
  await expect(page.getByRole('heading', { name: 'Einkauf bearbeiten', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Änderungen speichern', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(0);
  const editWorkspaceBox = await visibleBox(page.getByTestId('purchase-entry-workspace'));
  expect(editWorkspaceBox.x).toBeCloseTo(detailWorkspaceBox.x, 0);
  expect(editWorkspaceBox.width).toBeCloseTo(detailWorkspaceBox.width, 0);
});

test('creates a private seller from the purchase selector and selects it', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');

  await page.getByRole('combobox', { name: 'Verkäufer auswählen' }).click();
  await page.getByRole('button', { name: 'Verkäufer erstellen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Verkäufer erstellen' });
  await dialog.getByRole('textbox', { name: 'Vor- und Nachname' }).fill('Alex Beispiel');
  await dialog.getByRole('button', { name: 'Verkäufer erstellen', exact: true }).click();

  await expect(page.getByRole('combobox', { name: 'Verkäufer auswählen' })).toContainText(
    'Alex Beispiel',
  );
});

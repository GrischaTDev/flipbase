import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

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
  const headingBox = await heading.boundingBox();
  const contentBox = await content.boundingBox();

  expect(headingBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(headingBox?.x).toBe(contentBox?.x + 44);
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

test('allows an empty purchase with unknown contents, a price and additional costs as draft', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Paket-Entwurf');
  await page.locator('input#purchase-base-price').fill('100');
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Kosten hinzufügen', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Betrag der Zusatzkosten' }).fill('10');

  await expect(page.getByRole('textbox', { name: 'Beschreibung (optional)' })).toHaveValue(
    'Paket-Entwurf',
  );
  await expect(page.getByRole('button', { name: 'Entwurf speichern' })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toContainText('110,00');
});

test('centers the purchase editing dialog card', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Dialog-Zentrierung');
  await page.getByRole('button', { name: 'Neues Einzelstück erfassen', exact: true }).click();
  await page.getByLabel('Bezeichnung').fill('Testartikel');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page.locator('[data-purchase-row]').filter({ hasText: 'Dialog-Zentrierung' }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();

  const dialogBox = await page.getByRole('dialog').boundingBox();
  const cardBox = await page.locator('[role="dialog"] app-purchase-entry-form form').boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(
    Math.abs(cardBox!.x + cardBox!.width / 2 - (dialogBox!.x + dialogBox!.width / 2)),
  ).toBeLessThanOrEqual(2);
  expect(cardBox!.width).toBeLessThanOrEqual(1100);
});

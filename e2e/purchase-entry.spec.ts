import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('opens purchase entry as a dedicated page', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'Neuer Einkauf', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await expect(page.getByRole('heading', { name: 'Einkauf erfassen', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toBeVisible();
});

test('leaves a pristine entry page without prompting', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  let prompts = 0;
  page.on('dialog', async (dialog) => {
    prompts += 1;
    await dialog.dismiss();
  });

  await page.getByRole('link', { name: 'Zurück zu Einkäufen' }).click();

  await expect(page).toHaveURL(/\/purchases$/);
  expect(prompts).toBe(0);
});

test('keeps edits after cancelling navigation and leaves after confirmation', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.locator('#purchaseTitle').fill('Nicht verwerfen');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('link', { name: 'Zurück zu Einkäufen' }).click();
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await expect(page.locator('#purchaseTitle')).toHaveValue('Nicht verwerfen');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('link', { name: 'Zurück zu Einkäufen' }).click();
  await expect(page).toHaveURL(/\/purchases$/);
});

test('allows an empty mystery box with a price and additional costs as draft', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.locator('#purchaseTitle').fill('Mystery Entwurf');
  await page.getByRole('radio', { name: /Mystery Box/ }).click();
  await page.locator('#purchasePrice').fill('100');
  await page.getByRole('button', { name: 'Kosten hinzufügen', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Betrag der Zusatzkosten' }).fill('10');

  await expect(page.locator('#purchaseTitle')).toHaveValue('Mystery Entwurf');
  await expect(page.getByRole('button', { name: 'Als Entwurf speichern' })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toContainText('110,00');
});

test('centers the purchase editing dialog card', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.locator('#purchaseTitle').fill('Dialog-Zentrierung');
  await page.getByRole('button', { name: 'Einzelstück hinzufügen', exact: true }).click();
  await page.getByLabel('Bezeichnung').fill('Testartikel');
  await page.getByLabel('Stückpreis').fill('10');
  await page.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click();
  await page.locator('[data-purchase-row]').filter({ hasText: 'Dialog-Zentrierung' }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();

  const dialogBox = await page.getByRole('dialog').boundingBox();
  const cardBox = await page
    .locator('[role="dialog"] app-purchase-entry-form .linear-surface')
    .boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(
    Math.abs(cardBox!.x + cardBox!.width / 2 - (dialogBox!.x + dialogBox!.width / 2)),
  ).toBeLessThanOrEqual(2);
  expect(cardBox!.width).toBeLessThanOrEqual(672);
});

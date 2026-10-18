import { expect, openDashboard, test } from './support/fixtures';

test('speichert Verkaufsplattformen und übernimmt Namen und Reihenfolge in alle Auswahllisten', async ({
  page,
}) => {
  await page.goto('/master-data/platforms');
  await expect(page.getByRole('heading', { name: 'Stammdaten', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Plattform anlegen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plattform anlegen' });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Oza');
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Oza bearbeiten', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Plattform bearbeiten' });
  await editDialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Oza Shop');
  await editDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editDialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Oza Shop nach oben verschieben', exact: true }).click();
  await expect(page.getByText('Reihenfolge gespeichert.', { exact: true })).toBeVisible();
  const names = await page
    .locator('table tbody tr td:first-child app-marketplace-platform-identity')
    .allTextContents();
  const expected = names.map((name) => name.trim());
  expect(expected).toContain('StockX');
  expect(expected.indexOf('Oza Shop')).toBeLessThan(expected.indexOf('Andere'));
  await page.reload();
  await expect(
    page.locator('table tbody tr td:first-child app-marketplace-platform-identity'),
  ).toHaveText(expected);
  await openDashboard(page);
  await page.getByRole('combobox', { name: 'Plattform filtern' }).click();
  await expect(page.getByRole('option')).toHaveText(['Alle Plattformen', ...expected]);
  await page.keyboard.press('Escape');
  await page.goto('/sales/new');
  await page.getByRole('combobox', { name: 'Verkaufsplattform', exact: true }).click();
  await expect(page.getByRole('option')).toHaveText(expected);
  await expect(page.getByRole('option', { name: 'Kleinanzeigen', exact: true })).toBeVisible();
  await expect(page.getByText('0 % Gebühr')).toHaveCount(0);
});

test('zeigt fehlgeschlagene Plattformabrufe bei Verkäufen und Erfassung und erlaubt erneutes Laden', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/rest/v1/sale_platform_settings*', async (route) => {
    if (fail)
      await route.fulfill({ status: 403, json: { message: 'Plattformabruf fehlgeschlagen' } });
    else await route.continue();
  });
  for (const path of ['/sales', '/sales/new']) {
    fail = true;
    await page.goto(path);
    const message = page.getByText(
      'Die Verkaufsplattformen konnten nicht geladen werden. Bitte erneut laden.',
      { exact: true },
    );
    await expect(message).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Erneut laden', exact: true }).click();
    await expect(message).toHaveCount(0);
    await expect(
      page.getByRole('combobox', {
        name:
          path === '/sales' ? 'Verkäufe nach Plattform oder Retouren filtern' : 'Verkaufsplattform',
        exact: true,
      }),
    ).toBeEnabled();
  }
});

import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';

test('keeps a saved draft editable through discard, save and reopening @pr-smoke', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  const description = page.getByRole('textbox', { name: 'Beschreibung' });
  await description.fill('Direkt bearbeitbarer Entwurf');
  await addNewPurchaseProduct(page, 'Entwurfsartikel');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Entwurfsartikel', exact: true })
    .fill('100');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  const detailUrl = page.url();
  await expect(description).toHaveValue('Direkt bearbeitbarer Entwurf');
  await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Artikel bearbeiten', exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('app-table-column-picker')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Verwerfen', exact: true })).toHaveCount(0);
  const comment = page.getByLabel('Kommentar schreiben');
  await comment.fill('Noch nicht geposteter Kommentar');

  await description.fill('Nicht speichern');
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(description).toHaveValue('Direkt bearbeitbarer Entwurf');
  await expect(comment).toHaveValue('Noch nicht geposteter Kommentar');
  await expect(page).toHaveURL(detailUrl);

  await description.fill('Gespeicherte Änderung');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(description).toHaveValue('Gespeicherte Änderung');
  await expect(comment).toHaveValue('Noch nicht geposteter Kommentar');
  await comment.fill('');
  await expect(page.getByRole('button', { name: 'Änderungen speichern', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Zurück zur Einkaufsübersicht', exact: true }).click();
  await page.locator('[data-purchase-row]').first().click();
  await expect(description).toHaveValue('Gespeicherte Änderung');
});

test('keeps receiving accessible for saved quantity drafts and blocks it while dirty', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  const description = page.getByRole('textbox', { name: 'Beschreibung' });
  await description.fill('Mengenentwurf');
  await addNewPurchaseProduct(page, 'Test-Mengenartikel');
  await page
    .getByRole('spinbutton', { name: 'Menge für Test-Mengenartikel', exact: true })
    .fill('3');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Test-Mengenartikel', exact: true })
    .fill('10');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
  await expect(description).toHaveValue('Mengenentwurf');
  await page
    .getByRole('spinbutton', { name: 'Stückpreis für Test-Mengenartikel', exact: true })
    .fill('12');
  await expect(page.locator('app-purchase-line-editor tbody tr')).toContainText('36,00');
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Änderungen speichern', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Zurück zur Einkaufsübersicht', exact: true }).click();
  await page.locator('[data-purchase-row]').first().click();
  await expect(
    page.getByRole('spinbutton', { name: 'Menge für Test-Mengenartikel', exact: true }),
  ).toHaveValue('3');
  await expect(
    page.getByRole('spinbutton', { name: 'Stückpreis für Test-Mengenartikel', exact: true }),
  ).toHaveValue('12');
  await expect(page.locator('app-purchase-line-editor tbody tr')).toContainText('36,00');
  await page.getByRole('button', { name: 'Als bestellt markieren', exact: true }).click();
  await page.getByRole('button', { name: 'Angekommen', exact: true }).click();
  await page.getByRole('button', { name: 'Wareneingang buchen', exact: true }).click();
  await expect(
    page.getByRole('spinbutton', { name: 'Wareneingang für Test-Mengenartikel' }),
  ).toHaveValue('3');
  await description.fill('Ungespeicherte Menge');
  await expect(
    page.getByRole('button', { name: 'Erfassung abschließen', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('app-card[entry-main-extra]')).toHaveAttribute('inert', '');
});

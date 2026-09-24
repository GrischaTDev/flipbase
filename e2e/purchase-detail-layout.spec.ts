import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';

test('keeps purchase details in the right card after completion @pr-smoke', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  await page.getByRole('textbox', { name: 'Referenznummer' }).fill('E2E-REF-24');
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Layout-Testkauf');
  await addNewPurchaseProduct(page, 'Layout-Artikel');
  await page.getByRole('spinbutton', { name: 'Stückpreis für Layout-Artikel' }).fill('10');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/(?!new$)[^/]+$/);

  const draftBadge = page.locator('app-entry-page-layout header app-badge > span');
  await expect(draftBadge).toHaveCSS('background-color', 'rgb(248, 157, 19)');
  await page.getByRole('button', { name: 'Als bestellt markieren', exact: true }).click();
  await page
    .locator('app-purchase-lifecycle-actions')
    .getByRole('button', { name: 'Wareneingang erfassen', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Wareneingang erfassen' })
    .getByRole('button', {
      name: 'Eingang bestätigen',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Erfassung abschließen', exact: true }).click();
  await expect(page.locator('app-entry-page-layout header app-badge')).toHaveText('Abgeschlossen');
  await expect(page.locator('app-entry-page-layout header app-badge > span')).toHaveCSS(
    'background-color',
    'rgb(22, 163, 74)',
  );

  const main = page.getByTestId('purchase-entry-main');
  const sidebar = page.getByTestId('purchase-entry-sidebar');
  const details = sidebar.locator('app-card').filter({
    has: page.getByRole('heading', { name: 'Einkaufsdetails' }),
  });
  await expect(main.getByText('Kaufdatum', { exact: true })).toHaveCount(0);
  await expect(main.getByText('Referenznummer', { exact: true })).toHaveCount(0);
  await expect(details.locator('dt')).toHaveText(['Kaufdatum', 'Referenznummer', 'Beschreibung']);
  await expect(details.getByText('E2E-REF-24')).toHaveCount(1);
  await expect(details.getByText('Layout-Testkauf')).toHaveCount(1);
});

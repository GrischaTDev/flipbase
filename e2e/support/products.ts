import { expect, type Page } from '@playwright/test';

export async function addNewPurchaseProduct(page: Page, name: string): Promise<void> {
  const returnPath = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Artikel auswählen' })
    .getByRole('button', { name: 'Produkt erstellen', exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalog\/new\?purchaseReturn=/);
  const editor = page.locator('app-product-detail');
  await editor.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await editor.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(returnPath);
  await expect(
    page.locator('app-purchase-line-editor').getByRole('spinbutton', {
      name: `Menge für ${name}`,
      exact: true,
    }),
  ).toBeVisible();
}

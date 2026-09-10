import { expect, type Page } from '@playwright/test';

export async function addNewPurchaseProduct(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Artikel auswählen' })
    .getByRole('button', { name: 'Produkt erstellen', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Produkt erstellen', exact: true });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Produkt erstellen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

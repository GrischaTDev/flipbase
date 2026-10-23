import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';
import { createFinalizedPurchase } from './support/sample-data';

const saleItem = 'Super Nintendo SNES Original Controller';

test('verkauft ein Einzelstück genau einmal aus dem gemeinsamen Inventar @pr-smoke', async ({
  page,
  workspace,
}) => {
  await createFinalizedPurchase(workspace, {
    title: 'Retro-Zubehör',
    purchaseDate: '2026-09-01',
    items: [{ title: saleItem, price: 20 }],
  });
  await openDashboard(page);
  await page.goto('/catalog?view=stock');

  const inventory = page.getByRole('table', {
    name: 'Alle Artikel',
  });
  await page.getByRole('button', { name: `Aktionen für ${saleItem}`, exact: true }).click();
  const sellButton = page.getByRole('button', { name: `${saleItem} verkaufen` });
  await expect(sellButton).toBeVisible({ timeout: 10_000 });
  const headers = await inventory.getByRole('columnheader').allTextContents();
  const onHandColumn = headers.findIndex((header) => header.includes('Auf Lager'));
  const availableColumn = headers.findIndex((header) => header.includes('Verfügbar'));
  expect(onHandColumn).toBeGreaterThanOrEqual(0);
  expect(availableColumn).toBe(-1);
  const inventoryRow = inventory.getByRole('row').filter({ hasText: saleItem });
  await expect(inventoryRow.getByRole('cell').nth(onHandColumn)).toHaveText('1 Stück');

  await sellButton.click();
  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Verkaufsplattform', exact: true }).click();
  await page.getByRole('option', { name: 'Direktverkauf', exact: true }).click();
  await page.getByLabel('Preis je Stück (€)').fill('35');
  await page.getByRole('button', { name: 'Verkauf abschließen' }).click();

  await expect(page.getByRole('heading', { name: 'Verkauf erfassen' })).toBeHidden();
  await expect(page).toHaveURL(/\/catalog\?view=stock$/);
  await page.goto('/sales');
  await expect(page).toHaveURL(/\/sales$/);
  await expect(page.getByRole('heading', { name: 'Verkäufe & Retouren' })).toBeVisible({
    timeout: 15_000,
  });
  const recordedSales = page.getByRole('row').filter({ hasText: saleItem });
  await expect(recordedSales).toHaveCount(1);
  await expect(recordedSales).toContainText('35,00 €');

  await page.goto('/catalog?view=stock');
  const soldRow = page.getByRole('row').filter({ hasText: saleItem });
  await expect(soldRow).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Artikelansicht' }).click();
  await page
    .getByRole('listbox', { name: 'Artikelansicht' })
    .getByRole('option', { name: 'Ohne Bestand' })
    .click();
  await expect(soldRow).toBeVisible();
  await expect(soldRow.getByRole('cell').nth(onHandColumn)).toHaveText('0 Stück');
  await expect(page.getByRole('button', { name: `${saleItem} verkaufen` })).toHaveCount(0);
});

for (const width of [1440, 834, 390]) {
  for (const theme of ['light', 'dark']) {
    test.describe(`Versand nach Plattform ${width}px ${theme}`, () => {
      test.use({ viewport: { width, height: 1000 }, hasTouch: width !== 1440 });
      test('zeigt passende Felder und speichert Vinted ohne verdeckte Versandkosten oder Gebühren', async ({
        page,
        workspace,
      }) => {
        await createFinalizedPurchase(workspace, {
          title: 'Versandprüfung',
          purchaseDate: '2026-10-01',
          items: [{ title: saleItem, price: 20 }],
        });
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/sales/new');
        const entry = page.locator('app-sale-create-modal');
        const platform = entry.getByRole('combobox', { name: 'Verkaufsplattform', exact: true });
        const choosePlatform = async (name: string) => {
          await platform.click();
          await page.getByRole('option', { name, exact: true }).click();
        };
        const chooseShipping = async (name: string) => {
          await entry.getByRole('combobox', { name: 'Versandabwicklung', exact: true }).click();
          await page.getByRole('option', { name, exact: true }).click();
        };
        await expect(platform).toContainText('Plattform auswählen');
        await expect(entry.getByRole('heading', { name: 'Versand und Gebühren' })).toHaveCount(0);
        await page
          .getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true })
          .click();
        const picker = page.locator('app-article-picker');
        await picker.getByRole('button', { name: new RegExp(saleItem) }).click();
        await picker.locator('[data-product-option]').click();
        await picker.getByRole('button', { name: 'Hinzufügen (1)', exact: true }).click();
        await entry.getByRole('spinbutton', { name: 'Preis je Stück (€)', exact: true }).fill('35');

        await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
        await expect(platform).toHaveAttribute('aria-invalid', 'true');
        await expect(platform).toBeFocused();
        await expect(entry.getByText('Bitte wähle eine Plattform.', { exact: true })).toBeVisible();

        await choosePlatform('eBay');
        await chooseShipping('Eigener Versand');
        await entry.getByRole('spinbutton', { name: 'Plattformgebühr', exact: true }).fill('6');
        await entry
          .getByRole('spinbutton', { name: 'Versand vom Käufer erhalten', exact: true })
          .fill('4');
        await entry
          .getByRole('spinbutton', { name: 'Tatsächliche Versandkosten', exact: true })
          .fill('5');
        for (const name of ['Direktverkauf', 'Shop', 'Andere']) {
          await choosePlatform(name);
          await chooseShipping('Eigener Versand');
          await expect(entry.locator('#platform-fee')).toHaveCount(0);
          await expect(
            entry.getByRole('spinbutton', { name: 'Versand vom Käufer erhalten', exact: true }),
          ).toBeEnabled();
          await expect(
            entry.getByRole('spinbutton', { name: 'Tatsächliche Versandkosten', exact: true }),
          ).toBeEnabled();
          await expect(entry.locator('label[for="shipping-cost"]')).toHaveText(
            'Tatsächliche Versandkosten',
          );
          await expect(entry.locator('label[for="shipping-revenue"]')).toHaveText(
            'Versand vom Käufer erhalten',
          );
        }
        await chooseShipping('Abholung');
        await expect(entry.locator('#shipping-cost')).toHaveCount(0);
        await expect(entry.locator('#shipping-revenue')).toHaveCount(0);
        await choosePlatform('eBay');
        await chooseShipping('Eigener Versand');
        await entry.getByRole('spinbutton', { name: 'Plattformgebühr', exact: true }).fill('6');
        await entry
          .getByRole('spinbutton', { name: 'Versand vom Käufer erhalten', exact: true })
          .fill('4');
        await entry
          .getByRole('spinbutton', { name: 'Tatsächliche Versandkosten', exact: true })
          .fill('5');
        await choosePlatform('Vinted');
        await expect(
          entry.getByText(
            'Der Versand wird über Vinted abgewickelt. Hier musst Du nichts eintragen.',
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          entry.locator('#platform-fee, #shipping-revenue, #shipping-cost, #sale-shipping-mode'),
        ).toHaveCount(0);
        await expect(entry.locator('[data-sale-summary]')).toContainText('15,00');
        await page.addScriptTag({ content: axe.source });
        const violations = await entry.evaluate(
          async (element) =>
            (
              await (window as unknown as { axe: typeof axe }).axe.run(element, {
                runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'],
              })
            ).violations,
        );
        expect(violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
        await expect(page).toHaveURL(/\/sales$/);
        const { data: sale, error } = await workspace.client
          .from('sales')
          .select('platform, platform_fee, shipping_cost, shipping_revenue, shipping_mode')
          .eq('workspace_id', workspace.id)
          .single();
        expect(error).toBeNull();
        expect(sale).toMatchObject({
          platform: 'vinted',
          platform_fee: 0,
          shipping_cost: 0,
          shipping_revenue: 0,
          shipping_mode: 'platform_prepaid',
        });
      });
    });
  }
}

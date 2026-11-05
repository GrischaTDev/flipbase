import axe from 'axe-core';
import { expect, selectDefaultPurchaseSeller, test } from './support/fixtures';

for (const viewport of [
  { width: 1440, height: 1000, hasTouch: false },
  { width: 834, height: 1112, hasTouch: true },
  { width: 390, height: 844, hasTouch: true },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${viewport.width} ${colorScheme}`, () => {
      test.use({ viewport, hasTouch: viewport.hasTouch, colorScheme, shopEnabled: false });
      test('erfasst frei, ordnet den Einkauf zu und schaltet den Shop verlustfrei um', async ({
        page,
        workspace,
      }) => {
        test.setTimeout(120_000);
        await page.addInitScript(
          (theme) => localStorage.setItem('flipbase_theme', theme),
          colorScheme,
        );
        await page.goto('/purchases/new');
        await expect(page.getByRole('link', { name: 'Bestand', exact: true })).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }),
        ).toHaveCount(0);
        await selectDefaultPurchaseSeller(page);
        await page.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
        const editor = page.locator('app-purchase-line-editor');
        await editor
          .getByRole('textbox', { name: 'Artikelname', exact: true })
          .fill('10 kg Kleidung');
        await editor.getByRole('spinbutton').nth(0).fill('2');
        await editor.getByRole('spinbutton').nth(1).fill('150');
        await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
        await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]+$/);
        const purchases = await workspace.client
          .from('purchases')
          .select('id,title,record_number')
          .eq('workspace_id', workspace.id);
        expect(purchases.error).toBeNull();
        expect(purchases.data).toHaveLength(1);
        const purchase = purchases.data![0];
        await page.goto(`/purchases/${purchase.id}`);
        await page.getByRole('button', { name: 'Erfassung abschließen', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Erfassung wieder öffnen', exact: true }),
        ).toBeVisible();
        const lines = await workspace.client
          .from('purchase_lines')
          .select('*')
          .eq('purchase_id', purchase.id);
        expect(lines.data![0]).toMatchObject({
          position_kind: 'free',
          ordered_quantity: 2,
          received_quantity: 0,
          line_total: 300,
        });
        await page.goto('/sales/new');
        await page.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
        // Ohne Shop gibt es keinen Bestand zu laden; der Ladehinweis darf nicht stehen bleiben.
        await expect(page.getByText('Artikel und Bestand werden geladen…')).toHaveCount(0);
        await page
          .getByRole('textbox', { name: 'Artikelname', exact: true })
          .fill('Pullover aus Paket');
        await page.getByRole('spinbutton', { name: 'Preis je Stück (€)', exact: true }).fill('25');
        await page.getByRole('combobox', { name: 'Einkauf zuordnen', exact: true }).click();
        await page
          .getByRole('option', { name: `${purchase.record_number} · 10 kg Kleidung`, exact: true })
          .click();
        await page.getByRole('combobox', { name: 'Verkaufsplattform' }).click();
        await page.getByRole('option', { name: 'Direktverkauf', exact: true }).click();
        await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
        await expect(page).toHaveURL(/\/sales$/);
        const sale = await workspace.client
          .from('sale_lines')
          .select('purchase_id,position_kind,cost_of_goods_sold')
          .eq('workspace_id', workspace.id);
        expect(sale.error).toBeNull();
        expect(sale.data).toEqual([
          { purchase_id: purchase.id, position_kind: 'free', cost_of_goods_sold: null },
        ]);
        await page.goto('/settings/store');
        const toggle = page.getByRole('checkbox', { name: 'Shop-System aktivieren', exact: true });
        await toggle.click();
        await expect(toggle).toBeChecked();
        await expect(page.getByRole('link', { name: 'Bestand', exact: true })).toBeVisible();
        await page.goto('/purchases/new');
        await expect(
          page.getByRole('button', { name: 'Position hinzufügen', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }),
        ).toBeVisible();
        await page.goto('/settings/store');
        await toggle.click();
        await expect(toggle).not.toBeChecked();
        await page.goto('/catalog');
        await expect(page).toHaveURL(/\/purchases$/);
        const inventory = await workspace.client
          .from('inventory_items')
          .select('id')
          .eq('workspace_id', workspace.id);
        const lots = await workspace.client
          .from('stock_lots')
          .select('id')
          .eq('workspace_id', workspace.id);
        expect(inventory.data).toEqual([]);
        expect(lots.data).toEqual([]);
        const retained = await workspace.client
          .from('purchases')
          .select('entry_status,total_purchase_cost')
          .eq('id', purchase.id)
          .single();
        expect(retained.data).toMatchObject({
          entry_status: 'finalized',
          total_purchase_cost: 300,
        });
        await page.addScriptTag({ content: axe.source });
        const violations = await page.evaluate(
          async () =>
            (
              await (window as typeof window & { axe: typeof axe }).axe.run(document, {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
              })
            ).violations,
        );
        expect(violations).toEqual([]);
      });
    });
  }
}

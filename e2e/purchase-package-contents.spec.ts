import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

for (const width of [1440, 390]) {
  test(`captures two individual articles from one paid package at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await startDemoMode(page);
    await page.goto('/purchases/new');
    await page.getByRole('button', { name: 'Paket hinzufügen', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Bezeichnung', exact: true })
      .fill('Mystery Pack Schuhe');
    await page.getByRole('dialog').getByRole('button', { name: 'Fertig', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByRole('spinbutton', { name: 'Stückpreis für Mystery Pack Schuhe', exact: true })
      .fill('100');
    await expect(
      page.getByRole('spinbutton', { name: 'Stückpreis für Mystery Pack Schuhe', exact: true }),
    ).toHaveValue('100');
    await page
      .getByRole('textbox', { name: 'Beschreibung (optional)', exact: true })
      .fill('Enthält voraussichtlich zwei Paar Schuhe');
    await expect(
      page.getByRole('button', { name: 'Paketpreis verteilen', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    await page.locator('[data-purchase-row]').first().click();
    await expect(page).toHaveURL(/\/purchases\/[^/]+$/);
    const purchaseUrl = page.url();
    await page.getByRole('button', { name: 'Als bestellt markieren', exact: true }).click();
    await page.getByRole('button', { name: 'Angekommen', exact: true }).click();
    await page.getByRole('button', { name: 'Inhalt erfassen', exact: true }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Inhalt erfassen', exact: true });
    await dialog.getByRole('textbox', { name: 'Bezeichnung', exact: true }).fill('Adidas Samba 42');
    await dialog.getByRole('button', { name: 'Weiteren Artikel hinzufügen', exact: true }).click();
    await dialog
      .getByRole('textbox', { name: 'Bezeichnung', exact: true })
      .nth(1)
      .fill('Adidas Gazelle 43');
    await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run('app-package-content-dialog', {
              runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            })
          ).violations,
      ),
    ).toEqual([]);
    await dialog.getByRole('button', { name: 'Inhalt speichern', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('link', { name: 'Adidas Samba 42', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Adidas Gazelle 43', exact: true })).toBeVisible();
    await expect(page.getByText('2 Artikel erfasst · 0 verkauft', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('2 Artikel erfasst · 0 verkauft', { exact: true })).toBeVisible();
    const stored = await page.evaluate(() => {
      const purchases = JSON.parse(localStorage.getItem('flipbase_local_purchases') ?? '[]');
      const lines = JSON.parse(localStorage.getItem('flipbase_local_purchase_lines') ?? '[]');
      const inventory = JSON.parse(localStorage.getItem('flipbase_local_inventory') ?? '[]');
      const line = lines.find(
        (candidate: { title_snapshot: string }) =>
          candidate.title_snapshot === 'Mystery Pack Schuhe',
      );
      return {
        line,
        purchase: purchases.find((p: { id: string }) => p.id === line?.purchase_id),
        items: inventory.filter(
          (item: { source_package_line_id?: string }) => item.source_package_line_id === line?.id,
        ),
      };
    });
    expect(stored.line.is_package).toBe(true);
    expect(stored.line.line_total).toBe(100);
    expect(stored.purchase.purchase_price).toBe(100);
    expect(stored.items).toHaveLength(2);
    expect(
      stored.items.every(
        (item: { allocated_purchase_cost: unknown; purchase_id: string }) =>
          item.allocated_purchase_cost === null && item.purchase_id === stored.purchase.id,
      ),
    ).toBe(true);
    if (process.env['PACKAGE_QA_SCREENSHOTS'])
      await page.screenshot({
        path: `${process.env['PACKAGE_QA_SCREENSHOTS']}/package-${width}.png`,
        fullPage: true,
      });
    await page.getByRole('button', { name: 'Erfassung abschließen', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Erfassung wieder öffnen', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Erfassung abschließen', exact: true }),
    ).toBeHidden();
    await page.getByRole('link', { name: 'Adidas Samba 42', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Adidas Samba 42', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Artikelstatus', exact: true }).click();
    await page.getByRole('option', { name: 'Bereit', exact: true }).click();
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Adidas Samba 42 verkaufen', exact: true }).click();
    await page.getByLabel('Preis je Stück (€)').fill('80');
    await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Verkauf erfassen', exact: true })).toBeHidden();
    await page.goto(purchaseUrl);
    await expect(page.getByText('2 Artikel erfasst · 1 verkauft', { exact: true })).toBeVisible();
    await expect(page.getByText('Kostenanteil: Offen', { exact: true })).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}

import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { addNewPurchaseProduct } from './support/products';
import { startDemoMode } from './support/demo';

for (const width of [1440, 390]) {
  test(`preserves purchase cost origin after reopening at ${width}px${width === 1440 ? ' @pr-smoke' : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await startDemoMode(page);
    await page.goto('/purchases/new');
    await addNewPurchaseProduct(page, 'Kostenprüfung');
    await page
      .getByRole('spinbutton', { name: 'Stückpreis für Kostenprüfung', exact: true })
      .fill('100');
    await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Kostenübersicht verwalten' });
    await dialog.getByRole('combobox', { name: 'Anpassung 1', exact: true }).click();
    await dialog.getByRole('option', { name: 'Versandkosten', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }).fill('10');
    const origin = dialog.getByRole('combobox', { name: 'Kostenherkunft 1', exact: true });
    await expect(origin).toContainText('Noch prüfen');
    await origin.click();
    await dialog.getByRole('option', { name: 'Vom Verkäufer berechnet', exact: true }).click();
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            'app-purchase-cost-overview-dialog',
            { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } },
          )
        ).violations,
    );
    expect(violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toContainText(
      'Vom Verkäufer berechnet',
    );
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await page.locator('[data-purchase-row]').first().click();
    await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
    await expect(origin).toContainText('Vom Verkäufer berechnet');
    await origin.click();
    await dialog.getByRole('option', { name: 'Separat bezahlt', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
    if (process.env['TAX_QA_SCREENSHOTS'])
      await page.screenshot({
        path: `${process.env['TAX_QA_SCREENSHOTS']}/cost-origin-${width}.png`,
      });
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Speichern', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

test('keeps per-item tax visible and blocks unreviewed cost exports @pr-smoke', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await startDemoMode(page);
  await page.evaluate(() => {
    const purchases = JSON.parse(localStorage.getItem('flipbase_local_purchases') ?? '[]');
    const purchase = {
      ...purchases[0],
      id: 'tax-purchase',
      workspace_id: 'ws-1',
      purchase_price: 200,
      entry_status: 'finalized',
      finalized_at: '2026-09-13T10:00:00Z',
    };
    localStorage.setItem('flipbase_local_purchases', JSON.stringify([purchase]));
    const items = ['A', 'B'].map((name) => ({
      id: `tax-${name}`,
      workspace_id: 'ws-1',
      purchase_id: purchase.id,
      title: `Steuerstück ${name}`,
      condition: 'used',
      status: 'sold',
      allocated_purchase_cost: 100,
      tax_purchase_cost: 100,
    }));
    localStorage.setItem('flipbase_local_inventory', JSON.stringify(items));
    localStorage.setItem('flipbase_local_item_costs', '[]');
    const lines = items.map((item, index) => ({
      id: `line-${index}`,
      inventory_item_id: item.id,
      sale_id: 'tax-sale',
      quantity: 1,
      unit_sale_price: index === 0 ? 120 : 80,
      line_total: index === 0 ? 120 : 80,
      title_snapshot: item.title,
      cost_of_goods_sold: 100,
      tax_purchase_cost: 100,
      tax_cost_allocations: [{ quantity: 1, tax_purchase_cost: 100 }],
      tax_mode: 'diff_25a',
    }));
    localStorage.setItem(
      'flipbase_local_sales',
      JSON.stringify([
        {
          id: 'tax-sale',
          workspace_id: 'ws-1',
          platform: 'direct',
          sale_date: '2026-08-17',
          sale_price: 200,
          sale_price_total: 200,
          platform_fee: 0,
          shipping_cost: 0,
          packaging_cost: 0,
          other_costs: 0,
          lines,
          has_persisted_lines: true,
        },
      ]),
    );
  });
  await page.goto('/accounting');
  await expect(
    page.getByRole('heading', { name: 'Finanzen, Steuern & Bankabgleich' }),
  ).toBeVisible();
  const journal = page.getByRole('table', { name: 'Steuerjournal' });
  await expect(journal.getByRole('row').filter({ hasText: 'Steuerstück A' })).toContainText('3,19');
  await expect(journal.getByRole('row').filter({ hasText: 'Steuerstück B' })).toContainText('0,00');
  await expect(page.getByRole('button', { name: 'DATEV EXTF CSV' })).toBeEnabled();
  await page.addScriptTag({ content: axe.source });
  const journalViolations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run('app-accounting table', {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'],
        })
      ).violations,
  );
  expect(journalViolations).toEqual([]);

  await expect(
    page.getByText(
      'Vorläufige Steuerübersicht. Vorsteuer wird noch nicht automatisch berücksichtigt.',
    ),
  ).toBeVisible();
  await page.evaluate(() => {
    const sales = JSON.parse(localStorage.getItem('flipbase_local_sales') ?? '[]');
    sales[0].lines[0].tax_purchase_cost = null;
    sales[0].lines[0].tax_cost_allocations = null;
    localStorage.setItem('flipbase_local_sales', JSON.stringify(sales));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'DATEV EXTF CSV' })).toBeDisabled();
  await expect(journal.getByRole('row').filter({ hasText: 'Steuerstück A' })).toContainText(
    'Prüfen',
  );
  await expect(page.getByText('1 Position prüfen:', { exact: true })).toBeVisible();
  if (process.env['TAX_QA_SCREENSHOTS'])
    await page.screenshot({
      path: `${process.env['TAX_QA_SCREENSHOTS']}/tax-review.png`,
      fullPage: true,
    });
  expect(errors).toEqual([]);
});

import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';
import { createFinalizedPurchase, recordSale } from './support/sample-data';

for (const width of [1440, 390]) {
  test(`preserves purchase cost origin after reopening at ${width}px${width === 1440 ? ' @pr-smoke' : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDashboard(page);
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
    await expect(dialog).toBeHidden();
    const saveChanges = page.getByRole('button', { name: 'Änderungen speichern', exact: true });
    await expect(saveChanges).toBeEnabled();
    await saveChanges.click();
    await expect(saveChanges).toBeHidden();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Kostenübersicht' })).toContainText(
      'Separat bezahlt',
    );
    await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
    await expect(origin).toContainText('Separat bezahlt');
    expect(errors).toEqual([]);
  });
}

// Die Exportsperre bei ungeprüften Kosten verlangt einen Zustand, den kein Mitglied
// herstellen kann. Sie ist in accounting-tax-review.angular.spec.ts abgedeckt.
test('keeps per-item tax visible in the tax journal @pr-smoke', async ({ page, workspace }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { items } = await createFinalizedPurchase(workspace, {
    title: 'Steuerposten',
    purchaseDate: '2026-08-10',
    items: [
      { title: 'Steuerstück A', price: 100 },
      { title: 'Steuerstück B', price: 100 },
    ],
  });
  const [itemA, itemB] = [...items].sort((a, b) => a.title.localeCompare(b.title));
  await recordSale(workspace, {
    saleDate: '2026-08-17',
    lines: [
      { item: itemA, price: 120 },
      { item: itemB, price: 80 },
    ],
  });

  await openDashboard(page);
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
  if (process.env['TAX_QA_SCREENSHOTS'])
    await page.screenshot({
      path: `${process.env['TAX_QA_SCREENSHOTS']}/tax-journal.png`,
      fullPage: true,
    });
  expect(errors).toEqual([]);
});

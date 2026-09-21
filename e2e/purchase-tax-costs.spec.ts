import axe from 'axe-core';
import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';
import { addNewPurchaseProduct } from './support/products';
import { createFinalizedPurchase, recordSale } from './support/sample-data';

for (const width of [1440, 390]) {
  test(`preserves additional purchase costs after reopening at ${width}px${width === 1440 ? ' @pr-smoke' : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openDashboard(page);
    await page.goto('/purchases/new');
    await selectDefaultPurchaseSeller(page);
    await addNewPurchaseProduct(page, 'Kostenprüfung');
    await page
      .getByRole('spinbutton', { name: 'Stückpreis für Kostenprüfung', exact: true })
      .fill('100');
    await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Zusatzausgaben verwalten' });
    await dialog.getByRole('combobox', { name: 'Zusatzausgabe 1', exact: true }).click();
    await dialog.getByRole('option', { name: 'Versandkosten', exact: true }).click();
    await dialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }).fill('10');
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
    const summary = page.getByRole('region', { name: 'Kostenübersicht' });
    await expect(summary).toContainText('Versandkosten');
    await expect(summary).toContainText('110,00');
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await page.locator('[data-purchase-row]').first().click();
    await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
    const reopenedDialog = page.getByRole('dialog', { name: 'Zusatzausgaben verwalten' });
    await expect(
      reopenedDialog.getByRole('combobox', { name: 'Zusatzausgabe 1', exact: true }),
    ).toContainText('Versandkosten');
    const reopenedAmount = reopenedDialog.getByRole('spinbutton', {
      name: 'Betrag 1',
      exact: true,
    });
    await expect(reopenedAmount).toHaveValue('10');
    await reopenedAmount.fill('12');
    await expect(
      reopenedDialog.getByRole('button', { name: 'Speichern', exact: true }),
    ).toBeEnabled();
    if (process.env['TAX_QA_SCREENSHOTS'])
      await page.screenshot({
        path: `${process.env['TAX_QA_SCREENSHOTS']}/additional-costs-${width}.png`,
      });
    await reopenedDialog.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(reopenedDialog).toBeHidden();
    const saveChanges = page.getByRole('button', { name: 'Änderungen speichern', exact: true });
    await expect(saveChanges).toBeEnabled();
    await saveChanges.click();
    await expect(saveChanges).toBeHidden();
    await page.reload();
    await expect(summary).toContainText('Versandkosten');
    await expect(summary).toContainText('112,00');
    await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
    const reloadedDialog = page.getByRole('dialog', { name: 'Zusatzausgaben verwalten' });
    await expect(
      reloadedDialog.getByRole('combobox', { name: 'Zusatzausgabe 1', exact: true }),
    ).toContainText('Versandkosten');
    await expect(
      reloadedDialog.getByRole('spinbutton', { name: 'Betrag 1', exact: true }),
    ).toHaveValue('12');
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
  // Zeitraum bewusst über die Oberfläche setzen statt sich auf den Startwert der
  // Komponente zu verlassen (der ändert sich unabhängig von diesem Test).
  await page.getByRole('combobox', { name: 'Steuerjahr', exact: true }).click();
  await page.getByRole('option', { name: '2026', exact: true }).click();
  await page.getByRole('combobox', { name: 'Besteuerungszeitraum', exact: true }).click();
  await page.getByRole('option', { name: 'August (08)', exact: true }).click();
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

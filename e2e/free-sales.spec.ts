import axe from 'axe-core';
import { expect, test } from './support/fixtures';
import { AUTH_STORAGE_KEY } from './support/test-account';

for (const view of [
  { width: 1440, height: 1000, touch: false },
  { width: 834, height: 1112, touch: true },
  { width: 390, height: 844, touch: true },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${view.width} ${theme}`, () => {
      test.use({ viewport: view, hasTouch: view.touch, colorScheme: theme });
      test('erfasst, belegt, korrigiert und erstattet einen freien Verkauf', async ({
        page,
        workspace,
        accountSession,
      }) => {
        test.setTimeout(90_000);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(
          ({ key, session, design }) => {
            localStorage.setItem(key, JSON.stringify(session));
            localStorage.setItem('flipbase_theme', design);
          },
          { key: AUTH_STORAGE_KEY, session: accountSession, design: theme },
        );
        const profile = await workspace.client.rpc('update_workspace_company_settings', {
          p_workspace_id: workspace.id,
          p_profile: {
            legal_name: 'Testbetrieb',
            street: 'Testweg',
            house_number: '1',
            postal_code: '12345',
            city: 'Bonn',
            country_code: 'DE',
            tax_number: '123/456/789',
          },
          p_tax_mode: 'regular_19',
        });
        expect(profile.error).toBeNull();
        await page.goto('/sales/new');
        await page.getByRole('button', { name: 'Position hinzufügen', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Preis je Stück (€)', exact: true }).fill('25');
        await page.getByRole('combobox', { name: 'Verkaufsplattform' }).click();
        await page.getByRole('option', { name: 'Direktverkauf', exact: true }).click();
        await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
        await expect(page.getByText('Artikelname fehlt.', { exact: true })).toBeVisible();
        await page
          .getByRole('textbox', { name: 'Artikelname', exact: true })
          .fill('Freier Pullover');
        await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
        await expect(page).toHaveURL(/\/sales$/);
        await page
          .getByRole('button', { name: 'Aktionen für Freier Pullover', exact: true })
          .click();
        await page.getByRole('button', { name: 'Rechnung erstellen', exact: true }).click();
        await expect(page.locator('app-invoice-modal')).toContainText('Freier Pullover');
        await page.getByRole('button', { name: 'Beleg schließen', exact: true }).click();
        await page
          .getByRole('button', { name: 'Aktionen für Freier Pullover', exact: true })
          .click();
        await page.getByRole('button', { name: 'Verkauf korrigieren', exact: true }).click();
        await page
          .getByRole('textbox', { name: 'Artikelname', exact: true })
          .fill('Pullover korrigiert');
        await page
          .getByRole('textbox', { name: 'Korrekturgrund', exact: true })
          .fill('Preis berichtigt');
        await page.getByRole('spinbutton', { name: 'Preis je Stück (€)', exact: true }).fill('20');
        await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
        await expect(page).toHaveURL(/\/sales$/);
        const { data: sales, error } = await workspace.client
          .from('sales')
          .select('*,sale_lines!sale_lines_sale_id_fkey(*)')
          .eq('workspace_id', workspace.id);
        expect(error).toBeNull();
        expect(sales).toHaveLength(2);
        const original = sales!.find((sale) => sale.voided_at);
        const replacement = sales!.find((sale) => !sale.voided_at);
        expect(original!.sale_price).toBe(25);
        expect(replacement!.sale_price).toBe(20);
        const originalRow = page.locator(
          view.width < 768 ? `#sale-mobile-${original!.id}` : `#sale-desktop-${original!.id}`,
        );
        await expect(originalRow).toContainText('Korrigiert');
        await page
          .getByRole('button', { name: 'Aktionen für Freier Pullover', exact: true })
          .click();
        await page.getByRole('button', { name: 'Korrekturbeleg anzeigen', exact: true }).click();
        await expect(page.locator('app-invoice-modal')).toContainText('Preis berichtigt');
        await page.getByRole('button', { name: 'Beleg schließen', exact: true }).click();
        await page
          .getByRole('button', { name: 'Aktionen für Pullover korrigiert', exact: true })
          .click();
        await page.getByRole('button', { name: 'Retoure erfassen', exact: true }).click();
        await expect(
          page.getByText('Wiedereinlagerung in den Warenbestand', { exact: true }),
        ).toHaveCount(0);
        await page.getByRole('radio', { name: 'Teilerstattung', exact: true }).click();
        await page
          .getByRole('spinbutton', { name: 'Erstattungsbetrag in Euro', exact: true })
          .fill('5');
        await page
          .getByRole('button', { name: 'Gutschrift erstellen & Erstattung buchen', exact: true })
          .click();
        await expect(page.locator('app-invoice-modal')).toContainText('Pullover korrigiert');
        await page.getByRole('button', { name: 'Beleg schließen', exact: true }).click();
        await expect(
          page.getByText('Teilweise erstattet', { exact: true }).filter({ visible: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Aktionen für Pullover korrigiert', exact: true })
          .click();
        await page.getByRole('button', { name: 'Retoure erfassen', exact: true }).click();
        await expect(page.getByRole('radio', { name: /Vollerstattung/ })).toContainText('15,00');
        await page
          .getByRole('button', { name: 'Gutschrift erstellen & Erstattung buchen', exact: true })
          .click();
        await expect(page.locator('app-invoice-modal')).toContainText('Pullover korrigiert');
        await page.getByRole('button', { name: 'Beleg schließen', exact: true }).click();
        const refunded = await workspace.client
          .from('sales')
          .select('refund_amount,returned_at')
          .eq('id', replacement!.id)
          .single();
        expect(refunded.data?.refund_amount).toBe(20);
        expect(refunded.data?.returned_at).toBeTruthy();
        const notes = await workspace.client
          .from('returns')
          .select('credit_note_number,refund_amount')
          .eq('sale_id', replacement!.id);
        expect(notes.error).toBeNull();
        expect(notes.data).toHaveLength(2);
        expect(notes.data!.map((note) => note.refund_amount).sort((a, b) => a - b)).toEqual([
          5, 15,
        ]);
        await page.reload();
        for (const note of notes.data!) {
          await page
            .getByRole('button', { name: 'Aktionen für Pullover korrigiert', exact: true })
            .click();
          await page
            .getByRole('button', {
              name: `Gutschrift ${note.credit_note_number} anzeigen`,
              exact: true,
            })
            .click();
          await expect(page.locator('app-invoice-modal')).toContainText(note.credit_note_number);
          await expect(page.locator('app-invoice-modal')).toContainText(`${note.refund_amount},00`);
          await page.getByRole('button', { name: 'Beleg schließen', exact: true }).click();
        }
        for (const table of ['inventory_items', 'stock_lots', 'stock_movements']) {
          const result = await workspace.client
            .from(table)
            .select('id')
            .eq('workspace_id', workspace.id);
          expect(result.error).toBeNull();
          expect(result.data).toHaveLength(0);
        }
        await page.evaluate(axe.source);
        const accessibility = await page.evaluate(() =>
          (window as Window & { axe: typeof axe }).axe.run(document, {
            runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'],
          }),
        );
        expect(accessibility.violations).toEqual([]);
        expect(errors).toEqual([]);
        await page.screenshot({ path: test.info().outputPath('free-sales.png'), fullPage: true });
      });
    });
  }
}

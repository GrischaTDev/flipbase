import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';
import { createFinalizedPurchase, recordSale } from './support/sample-data';

test('Unternehmensdaten blockieren neue Rechnungen und bewahren alte Absender @core-smoke', async ({
  page,
  workspace,
}) => {
  const purchase = await createFinalizedPurchase(workspace, {
    title: 'Dokumenttest',
    purchaseDate: '2026-09-30',
    items: [{ title: 'Dokumenttest Jacke', price: 10 }],
  });
  await recordSale(workspace, {
    saleDate: '2026-09-30',
    lines: [{ item: purchase.items[0], price: 25 }],
  });
  await openDashboard(page);
  await page.goto('/sales');
  const row = page.getByRole('row').filter({ hasText: 'Dokumenttest Jacke' });
  await row.getByRole('button', { name: 'Rechnung anzeigen', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Unternehmensdaten vervollständigen' }),
  ).toHaveAttribute('href', '/settings/company');
  await expect(page.locator('app-invoice-modal')).toHaveCount(0);
  const before = await workspace.client
    .from('invoices')
    .select('id')
    .eq('workspace_id', workspace.id);
  expect(before.error).toBeNull();
  expect(before.data).toHaveLength(0);

  const profile = {
    legal_name: 'Alter Inhaber',
    company_name: 'Dokumentladen',
    street: 'Altweg',
    house_number: '7',
    postal_code: '12345',
    city: 'Bonn',
    country_code: 'DE',
    tax_number: '123/456/789',
  };
  const saved = await workspace.client.rpc('update_workspace_company_settings', {
    p_workspace_id: workspace.id,
    p_profile: profile,
    p_tax_mode: 'regular_19',
  });
  expect(saved.error).toBeNull();
  await page.reload();
  await row.getByRole('button', { name: 'Rechnung anzeigen', exact: true }).click();
  const modal = page.locator('app-invoice-modal');
  await expect(modal).toContainText('Alter Inhaber');
  await expect(modal).toContainText('Altweg 7');
  await modal.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(async () =>
    (window as Window & { axe: typeof axe }).axe.run(document.body, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    }),
  );
  expect(accessibility.violations).toEqual([]);
  await modal.getByRole('button', { name: 'Beleg schließen' }).click();

  const changed = await workspace.client.rpc('update_workspace_company_settings', {
    p_workspace_id: workspace.id,
    p_profile: { ...profile, legal_name: 'Neuer Inhaber', street: 'Neuweg' },
    p_tax_mode: 'kleinunternehmer_19',
  });
  expect(changed.error).toBeNull();
  await page.reload();
  await row.getByRole('button', { name: 'Rechnung anzeigen', exact: true }).click();
  await expect(modal).toContainText('Alter Inhaber');
  await expect(modal).toContainText('Altweg 7');
  await expect(modal).not.toContainText('Neuer Inhaber');
  const invoices = await workspace.client
    .from('invoices')
    .select('seller')
    .eq('workspace_id', workspace.id);
  expect(invoices.error).toBeNull();
  expect(invoices.data).toHaveLength(1);
  expect(invoices.data?.[0].seller).toMatchObject({ name: 'Alter Inhaber', street: 'Altweg 7' });
});

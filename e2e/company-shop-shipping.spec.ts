import { join } from 'node:path';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

test('Shop und Versand verwenden Unternehmensdaten und bewahren individuelle Absender @core-smoke', async ({
  page,
  workspace,
}) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const profile = {
    legal_name: 'Zentraler Inhaber',
    company_name: 'Unternehmensladen',
    street: 'Firmenweg',
    house_number: '8',
    postal_code: '12345',
    city: 'Bonn',
    country_code: 'DE',
    tax_number: '123/456/789',
    bank_account_holder: 'Zentraler Kontoinhaber',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    bank_name: 'Unternehmensbank',
  };
  const company = await workspace.client.rpc('update_workspace_company_settings', {
    p_workspace_id: workspace.id,
    p_profile: profile,
    p_tax_mode: 'regular_19',
  });
  expect(company.error).toBeNull();
  const legacy = {
    bankTransferEnabled: true,
    bankIban: 'DE12500105170648489890',
    bankAccountHolder: 'Alter Shopinhaber',
    bankBic: 'INGDDEFFXXX',
    bankName: 'Alte Bank',
    retainedField: 'unverändert',
  };
  const store = await workspace.client.from('store_settings').upsert(
    {
      workspace_id: workspace.id,
      store_name: 'Prüfladen',
      payments: legacy,
      imprint: { owner: 'Altes Shopimpressum', street: 'Altstraße' },
    },
    { onConflict: 'workspace_id' },
  );
  expect(store.error).toBeNull();
  await openDashboard(page);
  await page.goto('/settings/store');
  await expect(page.getByText('DE89 •••• 3000', { exact: true })).toBeVisible();
  await expect(page.getByText('Zentraler Kontoinhaber', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Bankdaten unter Unternehmen pflegen' }),
  ).toHaveAttribute('href', '/settings/company');
  await expect(page.getByLabel('IBAN', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Zahlungsmethoden speichern' }).click();
  await expect(
    page.getByText('Zahlungsmethoden wurden gespeichert.', { exact: true }),
  ).toBeVisible();
  const preserved = await workspace.client
    .from('store_settings')
    .select('payments,imprint')
    .eq('workspace_id', workspace.id)
    .single();
  expect(preserved.error).toBeNull();
  expect(preserved.data?.payments).toMatchObject(legacy);
  expect(preserved.data?.imprint).toMatchObject({ owner: 'Altes Shopimpressum' });

  await page.addScriptTag({ content: axe.source });
  expect(
    (
      await page.evaluate(async () =>
        (window as Window & { axe: typeof axe }).axe.run(document.body, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        }),
      )
    ).violations,
  ).toEqual([]);
  if (process.env['E2E_SCREENSHOT_DIR'])
    await page.screenshot({
      path: join(process.env['E2E_SCREENSHOT_DIR'], 'company-shop-desktop.png'),
    });

  await page.goto('/shop');
  await expect(page.getByText('Zentraler Inhaber', { exact: true })).toBeVisible();
  await expect(page.getByText('Altes Shopimpressum', { exact: true })).toHaveCount(0);

  await page.goto('/settings/shipping');
  const useCompany = page.getByRole('checkbox', {
    name: 'Unternehmensanschrift verwenden',
    exact: true,
  });
  await expect(useCompany).toBeChecked();
  await expect(page.getByText('Firmenweg 8', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Straße *', exact: true })).toHaveCount(0);
  const override = {
    workspace_id: workspace.id,
    sender_name: 'Versandlager',
    sender_company: 'Lager',
    sender_street: 'Lagerweg',
    sender_house_number: '3',
    sender_postal_code: '54321',
    sender_city: 'Köln',
    sender_country: 'DE',
  };
  const carrier = await workspace.client
    .from('carrier_configs')
    .upsert(override, { onConflict: 'workspace_id' });
  expect(carrier.error).toBeNull();
  await page.reload();
  await expect(useCompany).not.toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Straße *', exact: true })).toHaveValue(
    'Lagerweg',
  );
  await useCompany.click();
  await expect(page.getByText('Firmenweg 8', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Carrier-Einstellungen speichern' }).click();
  await expect(
    page.getByText('Versanddienstleister wurden gespeichert.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(useCompany).toBeChecked();
  await useCompany.click();
  await expect(page.getByRole('textbox', { name: 'Straße *', exact: true })).toHaveValue(
    'Lagerweg',
  );
  await page.getByRole('button', { name: 'Carrier-Einstellungen speichern' }).click();
  await expect(
    page.getByText('Versanddienstleister wurden gespeichert.', { exact: true }),
  ).toBeVisible();
  const savedCarrier = await workspace.client
    .from('carrier_configs')
    .select('*')
    .eq('workspace_id', workspace.id)
    .single();
  expect(savedCarrier.error).toBeNull();
  expect(savedCarrier.data).toMatchObject({ ...override, use_company_address: false });
  await useCompany.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBe(0);
  await page.addScriptTag({ content: axe.source });
  expect(
    (
      await page.evaluate(async () =>
        (window as Window & { axe: typeof axe }).axe.run(document.body, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        }),
      )
    ).violations,
  ).toEqual([]);
  if (process.env['E2E_SCREENSHOT_DIR'])
    await page.screenshot({
      path: join(process.env['E2E_SCREENSHOT_DIR'], 'company-shipping-mobile.png'),
    });
  await page.goto('/settings/workspace');
  await expect(page.getByRole('combobox', { name: 'Steuer-Modus' })).toHaveCount(0);
  await page.goto('/settings/company');
  await expect(page.getByRole('button', { name: 'Vorschlag ins Formular übernehmen' })).toHaveCount(
    0,
  );

  const emptyBank = await workspace.client.rpc('update_workspace_company_settings', {
    p_workspace_id: workspace.id,
    p_profile: { ...profile, bank_account_holder: '', iban: '', bic: '', bank_name: '' },
    p_tax_mode: 'regular_19',
  });
  expect(emptyBank.error).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Vorschlag ins Formular übernehmen' }).click();
  await expect(page.getByLabel('IBAN', { exact: true })).toHaveValue(legacy.bankIban);
  const unsaved = await workspace.client
    .from('workspace_company_profiles')
    .select('iban')
    .eq('workspace_id', workspace.id)
    .single();
  expect(unsaved.error).toBeNull();
  expect(unsaved.data?.iban || '').toBe('');
  expect(runtimeErrors).toEqual([]);
});

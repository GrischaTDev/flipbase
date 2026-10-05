import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

test('wählt verkaufbare Varianten im gemeinsamen Modal und zeigt Nummer vor Datum @core-smoke', async ({
  page,
  workspace,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const title = 'Variantenprüfung Sneaker';
  const { data: root, error: rootError } = await workspace.client
    .from('catalog_products')
    .insert({
      workspace_id: workspace.id,
      title,
      tracking_mode: 'quantity',
      condition: 'new',
      size: '36,5',
      color: 'Schwarz',
      sku: 'PICKER-365',
    })
    .select('id')
    .single();
  expect(rootError).toBeNull();
  expect(root).not.toBeNull();
  const rootId = root!.id as string;
  async function variant(size: string): Promise<string> {
    const { data, error } = await workspace.client.rpc('create_catalog_product_variant', {
      p_workspace_id: workspace.id,
      p_product_id: rootId,
      p_size: size,
      p_color: 'Schwarz',
      p_ean: null,
      p_sku: `PICKER-${size}`,
      p_listing_price: null,
    });
    expect(error).toBeNull();
    return data.id as string;
  }
  const secondId = await variant('38');
  const emptyId = await variant('39');
  const { data: purchase, error: purchaseError } = await workspace.client.rpc('create_purchase', {
    p_workspace_id: workspace.id,
    p_purchase: {
      type: 'lot',
      title: 'Varianten-Einkauf',
      purchase_date: '2026-09-01',
      purchase_price: 41,
      discount_amount: 0,
      content_status: 'known',
      pricing_mode: 'individual',
      shipment_status: 'arrived',
      cost_allocation_mode: 'even',
    },
    p_expenses: [],
    p_lines: [
      {
        client_ref: 'small',
        catalog_product_id: rootId,
        title_snapshot: title,
        line_kind: 'quantity',
        ordered_quantity: 1,
        price_mode: 'priced',
        unit_purchase_price: 21,
        line_total: 21,
      },
      {
        client_ref: 'large',
        catalog_product_id: secondId,
        title_snapshot: title,
        line_kind: 'quantity',
        ordered_quantity: 2,
        price_mode: 'priced',
        unit_purchase_price: 10,
        line_total: 20,
      },
    ],
  });
  expect(purchaseError).toBeNull();
  const { error: finalizeError } = await workspace.client.rpc('finalize_purchase_costing', {
    p_workspace_id: workspace.id,
    p_purchase_id: purchase.purchase.id,
  });
  expect(finalizeError).toBeNull();
  await openDashboard(page);
  // Direkter Einstieg, ohne zuvor einen Einkauf oder die Bestandsansicht zu öffnen.
  await page.goto('/sales/new');
  await page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }).click();
  const picker = page.locator('app-article-picker');
  await expect(picker.getByLabel('Artikel suchen', { exact: true })).toBeVisible();
  await picker.getByLabel('Artikel suchen', { exact: true }).fill('Sneaker');
  await picker.locator('[data-product-group]').filter({ hasText: title }).press('Enter');
  await expect(picker.locator(`[data-product-option="catalog:${rootId}"]`)).toContainText(
    'Verfügbar: 1 Stück',
  );
  await expect(picker.locator(`[data-product-option="catalog:${secondId}"]`)).toContainText(
    'Verfügbar: 2 Stück',
  );
  await expect(picker.locator(`[data-product-option="catalog:${emptyId}"]`)).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Neue Variante', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Produkt erstellen', exact: true })).toHaveCount(
    0,
  );

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await picker.evaluate(async (host) => {
      await Promise.all(
        host
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run('app-article-picker', {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          })
        ).violations,
    );
    expect(violations, `Auswahlmodal bei ${width}px`).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  for (const id of [rootId, secondId]) {
    const option = picker.locator(`[data-product-option="catalog:${id}"]`);
    await option.focus();
    await option.press('Enter');
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }
  await picker.getByRole('button', { name: 'Hinzufügen (2)', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('[data-sale-article-variant]').nth(0)).toContainText('Größe 36,5');
  await expect(page.locator('[data-sale-article-variant]').nth(1)).toContainText('Größe 38');
  await page.getByRole('spinbutton', { name: 'Preis je Stück (€)', exact: true }).nth(0).fill('40');
  await page.getByRole('spinbutton', { name: 'Preis je Stück (€)', exact: true }).nth(1).fill('25');
  const quantities = page.getByRole('spinbutton', { name: 'Menge', exact: true });
  await quantities.nth(0).fill('2');
  await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
  await expect(page).toHaveURL(/\/sales\/new$/);
  await expect(quantities.nth(0)).toHaveAttribute('aria-invalid', 'true');
  await quantities.nth(0).fill('1');
  await quantities.nth(1).fill('2');
  await page.getByRole('spinbutton', { name: 'Plattformgebühr', exact: true }).fill('6.19');
  await page.getByRole('button', { name: 'Verkauf abschließen', exact: true }).click();
  await expect(page).toHaveURL(/\/sales$/);

  const { data: sold, error: soldError } = await workspace.client
    .from('sales')
    .select(
      'id, record_number, sale_lines!sale_lines_workspace_sale_fkey(catalog_product_id, quantity, title_snapshot)',
    )
    .eq('workspace_id', workspace.id)
    .single();
  expect(soldError).toBeNull();
  expect(sold!.sale_lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        catalog_product_id: rootId,
        quantity: 1,
        title_snapshot: expect.stringContaining('36,5'),
      }),
      expect.objectContaining({
        catalog_product_id: secondId,
        quantity: 2,
        title_snapshot: expect.stringContaining('38'),
      }),
    ]),
  );
  await expect(page.locator(`#sale-mobile-${sold!.id}`)).toContainText(sold!.record_number);
  await expect(page.locator(`#sale-mobile-${sold!.id}`)).toContainText('Gewinn');
  await page.setViewportSize({ width: 1440, height: 900 });
  const table = page.locator('app-sales table');
  const headers = (await table.getByRole('columnheader').allTextContents()).map((text) =>
    text.trim(),
  );
  expect(headers.slice(0, 3)).toEqual(['Verkaufsnummer', 'Datum', 'Artikel']);
  expect(headers).toEqual(
    expect.arrayContaining(['Umsatz', 'Einkaufskosten', 'Gebühren & Versand', 'Gewinn']),
  );
  const row = page.locator(`#sale-desktop-${sold!.id}`);
  await expect(row.getByRole('cell').nth(0)).toHaveText(sold!.record_number);
  await expect(row.getByRole('cell').nth(1)).toHaveText(/\d{2}\.\d{2}\.\d{4}/);
  await expect(row.getByRole('cell').nth(2)).not.toContainText(sold!.record_number);
  await expect(row.getByRole('cell').nth(headers.indexOf('Marge'))).toHaveText(/\d+,\d+\s*%/);
  await page.reload();
  await expect(page.locator(`#sale-desktop-${sold!.id}`)).toBeVisible();

  // Derselbe Dialog bleibt im Einkauf einschließlich Variantenanlage verwendbar.
  await page.goto('/purchases/new');
  await page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }).click();
  await expect(
    picker.getByRole('dialog', { name: 'Artikel auswählen', exact: true }),
  ).toBeVisible();
  await picker.getByLabel('Artikel suchen', { exact: true }).fill(title);
  await picker.locator('[data-product-group]').filter({ hasText: title }).click();
  await expect(picker.getByRole('button', { name: 'Neue Variante', exact: true })).toBeVisible();
  await picker.locator(`[data-product-option="${emptyId}"]`).click();
  await picker.getByRole('button', { name: 'Hinzufügen (1)', exact: true }).click();
  await expect(page.locator('[data-purchase-line-variant]')).toContainText('39');
  expect(errors).toEqual([]);
});

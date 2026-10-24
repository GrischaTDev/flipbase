import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';
import { createFinalizedPurchase, recordSale } from './support/sample-data';

test.use({ hasTouch: true });

for (const scenario of [
  { width: 1440, theme: 'light', touch: false, entry: 'catalog' },
  { width: 834, theme: 'dark', touch: true, entry: 'variant' },
  { width: 390, theme: 'light', touch: true, entry: 'catalog' },
  { width: 320, theme: 'dark', touch: true, entry: 'variant' },
] as const) {
  test.describe(`Verlustbestätigung ${scenario.width}px ${scenario.theme}`, () => {
    test.use({ hasTouch: scenario.touch });
    test('bucht erst nach Bestätigung und niemals durch Enter im Mengenfeld @core-smoke', async ({
      page,
      workspace,
    }, testInfo) => {
      await page.setViewportSize({ width: scenario.width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(
        (theme) => localStorage.setItem('flipbase_theme', theme),
        scenario.theme,
      );
      const title = 'Verlustprüfung Schal';
      const { data: product, error: productError } = await workspace.client
        .from('catalog_products')
        .insert({
          workspace_id: workspace.id,
          title,
          tracking_mode: 'quantity',
          size: 'OneSize',
          color: 'Weinrot',
        })
        .select('id')
        .single();
      if (productError || !product) throw new Error(productError?.message ?? 'Artikel fehlt');
      const { data: purchase, error: purchaseError } = await workspace.client.rpc(
        'create_purchase',
        {
          p_workspace_id: workspace.id,
          p_purchase: {
            type: 'lot',
            title: 'Schaleinkauf',
            purchase_date: '2026-10-01',
            purchase_price: 26,
            discount_amount: 0,
            content_status: 'known',
            pricing_mode: 'individual',
            shipment_status: 'arrived',
            cost_allocation_mode: 'even',
          },
          p_expenses: [],
          p_lines: [
            {
              client_ref: 'scarves',
              catalog_product_id: product.id,
              title_snapshot: title,
              line_kind: 'quantity',
              ordered_quantity: 2,
              price_mode: 'priced',
              unit_purchase_price: 13,
              line_total: 26,
            },
          ],
        },
      );
      if (purchaseError || !purchase) throw new Error(purchaseError?.message ?? 'Einkauf fehlt');
      const { error: finalizeError } = await workspace.client.rpc('finalize_purchase_costing', {
        p_workspace_id: workspace.id,
        p_purchase_id: purchase.purchase.id,
      });
      expect(finalizeError).toBeNull();
      const requests: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/rest/v1/rpc/remove_article_stock'))
          requests.push(request.url());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await openDashboard(page);
      if (scenario.entry === 'catalog') {
        await page.goto('/catalog');
        await page.getByRole('button', { name: `Aktionen für ${title}`, exact: true }).click();
        await page
          .getByRole('button', { name: `Aus Bestand entfernen: ${title}`, exact: true })
          .filter({ visible: true })
          .click();
      } else {
        await page.goto(`/catalog/${product.id}`);
        await page
          .getByRole('button', { name: `Aus Bestand entfernen: ${title} OneSize`, exact: true })
          .click();
      }
      const dialog = page.getByRole('dialog', { name: 'Aus Bestand entfernen', exact: true });
      const quantity = dialog.getByRole('spinbutton', { name: 'Stückzahl entfernen' });
      await quantity.press('Enter');
      await expect(quantity).toHaveValue('1');
      await dialog.getByRole('combobox', { name: 'Grund für den Bestandsabgang' }).click();
      await page.getByRole('option', { name: 'Verloren / fehlt im Lager', exact: true }).click();
      await dialog
        .getByRole('textbox', { name: 'Notiz (optional)' })
        .fill('Fehlt nach Lagerprüfung');
      await quantity.press('Enter');
      await expect(quantity).toHaveValue('1');
      const submit = dialog.getByRole('button', { name: 'Aus Bestand entfernen', exact: true });
      await submit.click();
      const confirmation = page.getByRole('dialog', {
        name: 'Bestandsverlust bestätigen',
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toContainText(title);
      await expect(confirmation).toContainText('1 Stück');
      await expect(confirmation).toContainText('Verloren / fehlt im Lager');
      await expect(confirmation).toContainText('von 2 auf 1 Stück');
      await expect(
        confirmation.getByRole('button', { name: 'Abbrechen', exact: true }),
      ).toBeFocused();
      expect(requests).toHaveLength(0);
      await page.addScriptTag({ content: axe.source });
      expect(
        await confirmation.evaluate(
          async (element) =>
            (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
        ),
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`loss-confirmation-${scenario.width}-${scenario.theme}.png`),
      });
      await confirmation.getByRole('button', { name: 'Abbrechen', exact: true }).press('Enter');
      await expect(confirmation).toBeHidden();
      await expect(quantity).toBeEnabled();
      await expect(submit).toBeFocused();
      await expect(dialog.getByRole('textbox', { name: 'Notiz (optional)' })).toHaveValue(
        'Fehlt nach Lagerprüfung',
      );
      expect(requests).toHaveLength(0);
      await submit.click();
      await expect(confirmation).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(confirmation).toBeHidden();
      await expect(dialog).toBeVisible();
      await expect(submit).toBeFocused();
      expect(requests).toHaveLength(0);
      await submit.click();
      await confirmation
        .getByRole('button', { name: 'Verlust buchen', exact: true })
        .press('Enter');
      await expect(dialog.getByRole('status')).toContainText('1 Stück aus dem Bestand entfernt');
      expect(requests).toHaveLength(1);
      const { data: removals, error: removalError } = await workspace.client
        .from('stock_removals')
        .select('quantity,reason,notes')
        .eq('workspace_id', workspace.id)
        .eq('article_id', product.id);
      expect(removalError).toBeNull();
      expect(removals).toEqual([{ quantity: 1, reason: 'loss', notes: 'Fehlt nach Lagerprüfung' }]);
      const { data: lots, error: lotError } = await workspace.client
        .from('stock_lots')
        .select('remaining_quantity')
        .eq('workspace_id', workspace.id)
        .eq('catalog_product_id', product.id);
      expect(lotError).toBeNull();
      expect(lots).toEqual([{ remaining_quantity: 1 }]);
      const { count: salesCount, error: salesError } = await workspace.client
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id);
      expect(salesError).toBeNull();
      expect(salesCount).toBe(0);
      expect(errors).toEqual([]);
    });
  });
}

test('entfernt beschädigte Ware und behält den ursprünglichen Einkauf @core-smoke', async ({
  page,
  workspace,
}) => {
  const title = 'Beschädigter Lagerschuh';
  const purchase = await createFinalizedPurchase(workspace, {
    title: 'Schuhkauf',
    purchaseDate: '2026-10-01',
    items: [{ title, price: 20 }],
  });
  await openDashboard(page);
  await page.goto('/catalog');
  await page.getByRole('button', { name: `Aktionen für ${title}`, exact: true }).click();
  await page
    .getByRole('button', { name: `Aus Bestand entfernen: ${title}`, exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Aus Bestand entfernen' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('spinbutton', { name: 'Stückzahl entfernen' })).toHaveValue('1');
  await dialog.getByRole('textbox', { name: 'Notiz (optional)' }).fill('Sohle kaputt');
  await dialog.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  await page.addScriptTag({ content: axe.source });
  const violations = await dialog.evaluate(async (element) => {
    const runtime = window as unknown as { axe: typeof axe };
    return (await runtime.axe.run(element)).violations;
  });
  expect(violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Aus Bestand entfernen', exact: true }).click();
  await expect(dialog.getByRole('status').first()).toContainText(
    '1 Stück aus dem Bestand entfernt',
  );
  await expect(dialog.getByRole('button', { name: 'Artikel archivieren' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fertig' }).click();
  const row = page.getByRole('table').getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('0 Stück');
  await expect(row.getByRole('button', { name: `${title} verkaufen` })).toHaveCount(0);
  const { data: saved } = await workspace.client
    .from('inventory_items')
    .select('stock_removed_at, purchase_id, allocated_purchase_cost')
    .eq('id', purchase.items[0].id)
    .single();
  expect(saved?.purchase_id).toBe(purchase.purchaseId);
  expect(saved?.allocated_purchase_cost).toBe(20);
  expect(saved?.stock_removed_at).toBeTruthy();
});

test('archiviert Varianten einzeln und löscht einen unbenutzten Stammartikel ohne seine Geschwister @core-smoke', async ({
  page,
  workspace,
}) => {
  const { data: product, error } = await workspace.client
    .from('catalog_products')
    .insert({ workspace_id: workspace.id, title: 'Variantenschuh', size: '42', color: 'Schwarz' })
    .select()
    .single();
  if (error || !product) throw new Error(error?.message ?? 'Artikel fehlt');
  const { data: variant, error: variantError } = await workspace.client.rpc(
    'create_catalog_product_variant',
    {
      p_workspace_id: workspace.id,
      p_product_id: product.id,
      p_size: '43',
      p_color: 'Schwarz',
      p_ean: '',
      p_sku: '',
      p_listing_price: null,
    },
  );
  if (variantError || !variant) throw new Error(variantError?.message ?? 'Variante fehlt');
  await openDashboard(page);
  await page.goto(`/catalog/${product.id}`);
  await page.getByRole('button', { name: 'Archivieren: Variantenschuh 43', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Variante archivieren?' })
    .getByRole('button', { name: 'Archivieren', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Wiederherstellen: Variantenschuh 43' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Wiederherstellen: Variantenschuh 43' }).click();
  await page
    .getByRole('dialog', { name: 'Variante wiederherstellen?' })
    .getByRole('button', { name: 'Wiederherstellen', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Archivieren: Variantenschuh 43' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Unbenutzte Variante löschen: Variantenschuh 42' })
    .click();
  await page
    .getByRole('dialog', { name: 'Unbenutzte Variante löschen?' })
    .getByRole('button', { name: 'Variante löschen', exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalog$/);
  const { data: remaining } = await workspace.client
    .from('catalog_products')
    .select('id')
    .eq('id', variant.id)
    .single();
  expect(remaining?.id).toBe(variant.id);
});

test('zeigt wenige Verkaufsspalten und konkrete fehlende Rechnungsfelder @core-smoke', async ({
  page,
  workspace,
}) => {
  const title =
    'Verkaufter Schuh mit einem sehr langen Artikelnamen, Modellbezeichnung und weiteren Eigenschaften für die Tabellenprüfung';
  const purchase = await createFinalizedPurchase(workspace, {
    title: 'Verkaufstest',
    purchaseDate: '2026-10-01',
    items: [{ title, price: 20 }],
  });
  await recordSale(workspace, {
    saleDate: '2026-10-13',
    lines: [{ item: purchase.items[0], price: 35 }],
  });
  await openDashboard(page);
  await page.goto('/sales');
  const table = page.getByRole('table', { name: 'Verkäufe' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Verkaufsnummer',
    'Datum',
    'Artikel',
    'Menge',
    'Plattform',
    'Verkaufsbetrag',
    'Gewinn',
    'Marge',
    'Aktionen',
  ]);
  const row = table.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText('15,00');
  const article = row.getByRole('cell').nth(2);
  const fullTitle = article.locator('[title]').first();
  await expect(fullTitle).toHaveAttribute('title', title);
  const titleGeometry = await fullTitle.evaluate((element) => ({
    overflow: getComputedStyle(element).textOverflow,
    clipped: element.scrollWidth > element.clientWidth,
  }));
  expect(titleGeometry).toEqual({ overflow: 'ellipsis', clipped: true });
  expect(await article.textContent()).not.toMatch(/#V|VK-/);

  await expect(row.getByRole('link', { name: /Prüfbeleg/ })).toBeHidden();
  await row.getByRole('button', { name: /^Aktionen für / }).click();
  await expect(row.getByRole('link', { name: /Prüfbeleg/ })).toBeVisible();
  if (process.env['RESPONSIVE_SCREENSHOT_DIR']) {
    const { join } = await import('node:path');
    await page.screenshot({
      path: join(process.env['RESPONSIVE_SCREENSHOT_DIR'], 'sales-actions-desktop.png'),
    });
  }
  await row.getByRole('button', { name: 'Rechnung erstellen' }).click();
  const alert = page.locator('app-sales').getByRole('alert');
  await expect(alert).toContainText('Für den Beleg fehlen:');
  await expect(
    alert.getByRole('link', { name: 'Unternehmensdaten vervollständigen' }),
  ).toHaveAttribute('href', '/settings/company');
  for (const dismiss of await page
    .locator('app-toast-container')
    .getByRole('button', { name: /^Meldung schließen:/ })
    .all())
    await dismiss.click();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();
    for (const width of [1440, 834, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const surface =
        width >= 768 ? row : page.locator('[id^="sale-mobile-"]').filter({ hasText: title });
      const trigger = surface.getByRole('button', { name: /^Aktionen für / });
      await trigger.click();
      const menu = surface.getByRole('dialog', { name: /^Aktionen für / });
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(1000);
      expect(
        await trigger.evaluate((button) => button.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-sales')!,
              { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            )
          ).violations,
      );
      expect(violations).toEqual([]);
      if (process.env['RESPONSIVE_SCREENSHOT_DIR']) {
        const { join } = await import('node:path');
        await page.screenshot({
          path: join(
            process.env['RESPONSIVE_SCREENSHOT_DIR'],
            `sales-actions-${theme}-${width}.png`,
          ),
        });
      }
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
  }
});

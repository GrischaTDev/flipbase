import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';
import { createFinalizedPurchase, recordSale } from './support/sample-data';

test('entfernt beschädigte Ware und behält den ursprünglichen Einkauf', async ({
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

test('archiviert Varianten einzeln und löscht einen unbenutzten Stammartikel ohne seine Geschwister', async ({
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

test('zeigt wenige Verkaufsspalten und konkrete fehlende Rechnungsfelder', async ({
  page,
  workspace,
}) => {
  const purchase = await createFinalizedPurchase(workspace, {
    title: 'Verkaufstest',
    purchaseDate: '2026-10-01',
    items: [{ title: 'Verkaufter Schuh', price: 20 }],
  });
  await recordSale(workspace, {
    saleDate: '2026-10-13',
    lines: [{ item: purchase.items[0], price: 35 }],
  });
  await openDashboard(page);
  await page.goto('/sales');
  const table = page.getByRole('table', { name: 'Verkäufe' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Datum',
    'Artikel',
    'Menge',
    'Verkaufsbetrag',
    'Gewinn',
    'Marge',
    'Aktionen',
  ]);
  const row = table.getByRole('row').filter({ hasText: 'Verkaufter Schuh' });
  await expect(row).toContainText('15,00');
  await expect(row.getByRole('link', { name: /Prüfbeleg/ })).toBeHidden();
  await row.getByText('Weitere Aktionen', { exact: true }).click();
  await expect(row.getByRole('link', { name: /Prüfbeleg/ })).toBeVisible();
  await row.getByRole('button', { name: 'Rechnung erstellen' }).click();
  const alert = page.locator('app-sales').getByRole('alert');
  await expect(alert).toContainText('Für den Beleg fehlen:');
  await expect(
    alert.getByRole('link', { name: 'Unternehmensdaten vervollständigen' }),
  ).toHaveAttribute('href', '/settings/company');
});

import { expect, test, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

function columnControl(page: Page): Locator {
  return page.locator('app-table-column-picker, app-table-column-menu').first();
}

async function openColumnControl(page: Page): Promise<Locator> {
  const control = columnControl(page);
  await control.getByRole('button', { name: /Spalten/ }).click();
  await expect(control.locator('fieldset, [role="dialog"]').first()).toBeVisible();
  return control;
}

async function setColumnVisibility(
  control: Locator,
  column: string,
  visible: boolean,
): Promise<void> {
  const labels = control.locator('label');
  for (let index = 0; index < (await labels.count()); index += 1) {
    const label = labels.nth(index);
    if (!(await label.innerText()).includes(column)) continue;
    const checkbox = label.locator('input[type="checkbox"]');
    if ((await checkbox.count()) === 0) continue;
    if (visible) await checkbox.check();
    else await checkbox.uncheck();
    return;
  }

  const action = visible ? 'einblenden' : 'ausblenden';
  await control.getByRole('button', { name: `Spalte ${column} ${action}`, exact: true }).click();
}

async function assertRequiredColumn(control: Locator): Promise<void> {
  const checkbox = control.locator('input[type="checkbox"]:disabled').first();
  if ((await checkbox.count()) > 0) {
    await expect(checkbox).toBeDisabled();
    return;
  }

  await expect(control.getByLabel('Erforderliche Spalte').first()).toBeVisible();
}

test('behält die Spalten der jeweils anderen Einkaufsart bei einer Auswahländerung', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases/pur-demo-2');
  const picker = await openColumnControl(page);
  await setColumnVisibility(picker, 'Menge', false);
  await page.evaluate(() => {
    const purchases = JSON.parse(localStorage.getItem('flipbase_local_purchases')!);
    purchases.find((purchase: { id: string }) => purchase.id === 'pur-demo-2').type =
      'mystery_pack';
    localStorage.setItem('flipbase_local_purchases', JSON.stringify(purchases));
  });
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Zustand', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Menge', exact: true })).toHaveCount(0);
});

test('archiviert einen Verkauf ohne Buchungsänderung und zeigt zurückgekehrten Bestand', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.evaluate(() => {
    const item = {
      id: 'archive-demo-1',
      workspace_id: 'ws-1',
      title: 'Archiv-Testartikel',
      status: 'sold',
      condition: 'used',
      allocated_purchase_cost: 12,
    };
    const sale = {
      id: 'sale-archive-demo-1',
      workspace_id: 'ws-1',
      inventory_item_id: item.id,
      platform: 'ebay',
      sale_date: '2026-09-01',
      sale_price: 25,
      lines: [
        {
          id: 'line-archive-demo-1',
          workspace_id: 'ws-1',
          sale_id: 'sale-archive-demo-1',
          inventory_item_id: item.id,
          title_snapshot: item.title,
          quantity: 1,
          unit_sale_price: 25,
          line_total: 25,
          cost_of_goods_sold: 12,
          tax_mode: 'diff_25a',
        },
      ],
    };
    localStorage.setItem('flipbase_local_inventory', JSON.stringify([item]));
    localStorage.setItem('flipbase_local_sales', JSON.stringify([sale]));
  });
  const originalSales = await page.evaluate(() => localStorage.getItem('flipbase_local_sales'));
  await page.goto('/inventory');
  const row = page.locator('[data-individual-row]').filter({ hasText: 'Archiv-Testartikel' });
  await row.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Inventaransicht' })
    .getByRole('button', { name: 'Archiv', exact: true })
    .click();
  await expect(row.locator('[data-inventory-sale-link]')).toContainText('25,00');
  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(async () =>
    (window as Window & { axe: typeof axe }).axe.run(
      document.querySelector('main') ?? document.body,
      { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    ),
  );
  expect(accessibility.violations).toEqual([]);
  await row.getByRole('button', { name: 'Aus Archiv holen', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Aus Archiv holen', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Inventaransicht' })
    .getByRole('button', { name: 'Aktiv', exact: true })
    .click();
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('flipbase_local_sales'))).toBe(
    originalSales,
  );
  const item = await page.evaluate(
    () => JSON.parse(localStorage.getItem('flipbase_local_inventory')!)[0],
  );
  expect(item.status).toBe('sold');
  expect(item.allocated_purchase_cost).toBe(12);
  await row.getByRole('button', { name: 'Archivieren', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivieren', exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('flipbase_local_inventory')!);
    items[0].status = 'ready';
    localStorage.setItem('flipbase_local_inventory', JSON.stringify(items));
    const sales = JSON.parse(localStorage.getItem('flipbase_local_sales')!);
    sales[0].returned_at = '2026-09-05T12:00:00Z';
    localStorage.setItem('flipbase_local_sales', JSON.stringify(sales));
  });
  await page.reload();
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Archiv-Testartikel verkaufen' })).toBeVisible();
});

for (const [url, column] of [
  ['/inventory', 'Zustand'],
  ['/sales', 'Menge'],
  ['/catalog', 'EAN'],
  ['/purchases/pur-demo-2', 'Menge'],
]) {
  test(`persönliche Spalten auf ${url} bleiben nach Reload erhalten`, async ({ page }) => {
    await startDemoMode(page);
    await page.goto(url);
    const picker = await openColumnControl(page);
    await setColumnVisibility(picker, column, false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: column, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(columnControl(page).getByRole('button', { name: /Spalten/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: column, exact: true })).toHaveCount(0);
    const reloadedPicker = await openColumnControl(page);
    await assertRequiredColumn(reloadedPicker);
    await setColumnVisibility(reloadedPicker, column, true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
  });
}

test('hält das Spaltenmenü auf kleinen Bildschirmen vollständig im Viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startDemoMode(page);
  await page.goto('/sales');

  const control = await openColumnControl(page);
  const panel = control.locator('[role="dialog"]');
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();

  expect(panelBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport!.height);

  await panel.getByRole('button', { name: 'Sortierfeld' }).click();
  const sortList = panel.getByRole('listbox');
  await expect(sortList).toBeVisible();
  const sortBox = await sortList.boundingBox();
  expect(sortBox).not.toBeNull();
  expect(sortBox!.x).toBeGreaterThanOrEqual(0);
  expect(sortBox!.x + sortBox!.width).toBeLessThanOrEqual(viewport!.width);
});

test('rendert eine verschobene Verkaufsspalte in derselben Reihenfolge wie das Menü', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/sales');

  const control = await openColumnControl(page);
  await control
    .getByRole('button', { name: 'Spalte Menge nach oben verschieben', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.keyboard.press('Escape');

  const headers = await page.locator('table thead th').allTextContents();
  expect(headers[0].trim()).toBe('Menge');
  expect(headers[1].trim()).toBe('Verkaufter Artikel');
});

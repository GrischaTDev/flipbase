import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', hasTouch: true });

for (const theme of ['light', 'dark']) {
  for (const width of [320, 390, 834, 1440]) {
    test(`Einkaufsansichten wechseln bei ${width}px im ${theme}-Theme @core-smoke`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockMarketplace(page);
      await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
      const seller = { id: 'seller-1', workspace_id: workspaceId, name: 'Schuhverkäufer' };
      const purchases = ['complete', 'partial', 'open'].map((id, index) => ({
        id,
        workspace_id: workspaceId,
        record_number: `#E${index + 1}`,
        title: `Schuhe ${id}`,
        notes: `Schuhe ${id}`,
        type: 'single',
        purchase_date: '2026-10-01',
        purchase_price: id === 'open' ? null : 300,
        receiving_status: 'received',
        entry_status: 'finalized',
        cost_allocation_mode: 'even',
        supplier: seller,
        purchase_lines: [
          {
            id: `line-${id}`,
            purchase_id: id,
            workspace_id: workspaceId,
            title_snapshot: 'Schuhe',
            line_kind: 'individual',
            ordered_quantity: 2,
            received_quantity: 2,
            line_total: id === 'open' ? null : 300,
            allocated_total_cost: id === 'open' ? null : 300,
          },
        ],
      }));
      const items = purchases.flatMap((purchase) =>
        [1, 2].map((index) => ({
          id: `${purchase.id}-${index}`,
          workspace_id: workspaceId,
          purchase_id: purchase.id,
          purchase_line_id: `line-${purchase.id}`,
          title: 'Schuhe',
          condition: 'used',
          status:
            purchase.id === 'complete' || (purchase.id === 'partial' && index === 1)
              ? 'sold'
              : 'ready',
          allocated_purchase_cost: 150,
        })),
      );
      const sales = items
        .filter((item) => item.status === 'sold')
        .map((item) => ({
          id: `sale-${item.id}`,
          workspace_id: workspaceId,
          platform: 'direct',
          sale_date: '2026-10-10',
          sale_price: 200,
          sale_price_total: 200,
          platform_fee: 0,
          shipping_cost: 0,
          packaging_cost: 0,
          other_costs: 0,
          sale_lines: [
            {
              id: `sale-line-${item.id}`,
              inventory_item_id: item.id,
              inventory_item: item,
              quantity: 1,
              line_total: 200,
              unit_sale_price: 200,
              cost_of_goods_sold: 150,
              tax_mode: 'diff_25a',
            },
          ],
        }));
      await page.route('**/rest/v1/purchases?**', (route) => route.fulfill({ json: purchases }));
      await page.route('**/rest/v1/inventory_items?**', (route) => route.fulfill({ json: items }));
      await page.route('**/rest/v1/inventory_item_sale_states?**', (route) =>
        route.fulfill({
          json: items.map((item) => ({
            inventory_item_id: item.id,
            workspace_id: workspaceId,
            sale_state: item.status === 'sold' ? 'sold' : 'no_active_sale',
            active_sale_count: item.status === 'sold' ? 1 : 0,
          })),
        }),
      );
      let salesRequests = 0;
      await page.route('**/rest/v1/sales?**', (route) => {
        salesRequests++;
        return route.fulfill({
          json: sales,
          headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
        });
      });
      await page.goto('/purchases');
      await expect(page).toHaveURL(/\/purchases$/);
      await expect(page).toHaveTitle(/Flipbase/i);
      const table = page.locator('[data-purchase-table]');
      await expect(table.locator('tbody tr')).toHaveCount(3);
      await expect(table.getByRole('columnheader', { name: 'Erhalten', exact: true })).toHaveCount(
        0,
      );
      expect(salesRequests).toBe(0);
      const search = page.getByRole('searchbox', { name: 'Einkäufe durchsuchen' });
      await search.fill('Schuhe');
      await page.getByRole('combobox', { name: 'Nach Verkäufer filtern' }).click();
      await page.getByRole('option', { name: 'Schuhverkäufer', exact: true }).click();
      await page.getByRole('button', { name: 'Rentabilität', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Rentabilität', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(table.locator('thead th')).toHaveText([
        'Einkauf',
        'Verkaufsstand',
        'Gesamtkosten',
        'Verkaufserlös',
        'Ergebnis',
      ]);
      const complete = table
        .locator('tbody tr')
        .filter({ has: page.locator('[data-purchase-row="complete"]') });
      const partial = table
        .locator('tbody tr')
        .filter({ has: page.locator('[data-purchase-row="partial"]') });
      await expect(complete.locator('[data-purchase-result]')).toContainText('+100,00');
      await expect(complete.locator('[data-purchase-sales-progress]')).toContainText(
        '2 von 2 verkauft',
      );
      await expect(partial.locator('[data-purchase-result]')).toContainText('-100,00');
      await expect(partial.locator('[data-purchase-sales-progress]')).toContainText(
        'Zwischenstand',
      );
      await expect(search).toHaveValue('Schuhe');
      await expect(page.getByRole('combobox', { name: 'Nach Verkäufer filtern' })).toContainText(
        'Schuhverkäufer',
      );
      const result = complete.locator('summary');
      await result.focus();
      await page.keyboard.press('Enter');
      await expect(complete.locator('details')).toHaveAttribute('open', '');
      await expect(complete.locator('dl')).toContainText('Direkte Verkaufskosten');
      const directory = process.env['RESPONSIVE_SCREENSHOT_DIR'];
      if (directory) {
        await mkdir(directory, { recursive: true });
        await page.screenshot({
          path: join(directory, `purchase-profitability-${theme}-${width}.png`),
        });
      }
      const overflow = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        elements: [...document.querySelectorAll('body *')]
          .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 18)
          .map((element) => ({
            tag: element.tagName,
            classes: element.className,
            right: element.getBoundingClientRect().right,
            overflow: getComputedStyle(element).overflowX,
          })),
      }));
      expect(overflow.width, JSON.stringify(overflow.elements)).toBe(0);
      const buttonHeight = await page
        .getByRole('button', { name: 'Rentabilität', exact: true })
        .evaluate((element) => element.getBoundingClientRect().height);
      expect(buttonHeight).toBeGreaterThanOrEqual(44);
      await page.route('**/purchase-profitability-axe.js', (route) =>
        route.fulfill({ body: axe.source, contentType: 'application/javascript' }),
      );
      await page.addScriptTag({ url: '/purchase-profitability-axe.js' });
      expect(
        await page.evaluate(
          async () =>
            (
              await (window as unknown as { axe: typeof axe }).axe.run(
                document.querySelector('app-purchases')!,
                { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
              )
            ).violations,
        ),
      ).toEqual([]);
      if (width === 1440) {
        await table.locator('th').filter({ hasText: 'Ergebnis' }).getByRole('button').click();
        await page.getByRole('button', { name: 'Spalten und Sortierung anpassen' }).click();
        await page
          .getByRole('button', { name: 'Spalte Verkaufserlös ausblenden', exact: true })
          .click();
        await page.keyboard.press('Escape');
      }
      await page.getByRole('button', { name: 'Rentabilität', exact: true }).click();
      await expect(
        table.getByRole('columnheader', { name: 'Verkäufer', exact: true }),
      ).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Ergebnis', exact: true })).toHaveCount(
        0,
      );
      await expect(search).toHaveValue('Schuhe');
      if (width === 1440) {
        await page.reload();
        await expect(
          page.getByRole('button', { name: 'Rentabilität', exact: true }),
        ).toHaveAttribute('aria-pressed', 'false');
        await page.getByRole('button', { name: 'Rentabilität', exact: true }).click();
        await expect(table.locator('th').filter({ hasText: 'Ergebnis' })).toHaveAttribute(
          'aria-sort',
          'ascending',
        );
        await expect(
          table.getByRole('columnheader', { name: 'Verkaufserlös', exact: true }),
        ).toHaveCount(0);
        await expect(search).toHaveValue('Schuhe');
      }

      // Belege behalten ihre Papierdarstellung auch bei dunkler App und im Druck.
      const printablePurchase = purchases[0];
      await page.route('**/rest/v1/purchases?**', (route) =>
        route.fulfill({ json: printablePurchase }),
      );
      await page.route('**/rest/v1/purchase_lines?**', (route) =>
        route.fulfill({ json: printablePurchase.purchase_lines }),
      );
      await page.goto('/purchases/complete/print');
      const paperTable = page.locator('app-purchase-print table');
      await expect(paperTable).toBeVisible();
      for (const media of ['screen', 'print'] as const) {
        await page.emulateMedia({ media, colorScheme: theme as 'light' | 'dark' });
        await expect(paperTable.locator('tbody td').first()).toHaveCSS('padding-top', '12px');
        await expect(paperTable.locator('tbody td').first()).toHaveCSS('padding-left', '16px');
        await expect(paperTable.locator('thead th').first()).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)',
        );
        await expect(paperTable.locator('thead th').first()).toHaveCSS('background-image', 'none');
      }
      expect(errors).toEqual([]);
    });
  }
}

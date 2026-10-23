import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mockMarketplace,
  workspaceId,
  accountIds,
  conversationId,
} from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ hasTouch: width === 390 });
    for (const theme of ['light', 'dark'] as const) {
      test(`trennt Vinted-Paketverkauf, Stornierung und Wiederaufnahme bei ${width}px in ${theme} @core-smoke`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await mockMarketplace(page, false, false, false, false, []);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.route('**/rest/v1/marketplace_visible_account_entries?**', (route) => {
          const query = new URL(route.request().url()).searchParams;
          if (route.request().method() === 'HEAD')
            return route.fulfill({
              headers: { 'content-range': `0-0/${query.get('kind') === 'eq.sale' ? 3 : 0}` },
              body: '',
            });
          return route.fulfill({ json: null });
        });
        await page.route('**/rest/v1/rpc/marketplace_read_sync_schedule', (route) =>
          route.fulfill({
            json: {
              workspaceId,
              connectionId: route.request().postDataJSON()['p_connection_id'],
              enabled: false,
              intervalMinutes: 15,
              nextDueAt: null,
              lastAttemptAt: null,
              lastSuccessAt: null,
              pausedReason: null,
              retryAfter: null,
              authorizationVersion: 1,
            },
          }),
        );
        await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) => {
          const scope = { workspaceId, connectionId: accountIds[0] };
          const empty = { items: [], total: 0, nextCursor: null };
          return route.fulfill({
            json: {
              ...scope,
              profile: null,
              publications: empty,
              conversations: empty,
              activity: empty,
              sales: {
                items: ['sold', 'cancelled', 'relisted'].map((saleState, index) => ({
                  ...scope,
                  id: `sale-${index}`,
                  title: `Paket ${index + 1}`,
                  saleState,
                  occurredAt: '2026-10-21T10:00:00Z',
                  itemCount: 6,
                  itemIds: ['41', '42', '43', '44', '45', '46'],
                  price: 40,
                  currency: 'EUR',
                  conversationId,
                })),
                total: 3,
                nextCursor: null,
              },
            },
          });
        });
        await page.goto(`/marketplaces/vinted/sales?connectionId=${accountIds[0]}`);
        const active = page.getByRole('region', { name: 'Aktuelle Verkaufsvorgänge' });
        const history = page.getByRole('region', { name: 'Wieder eingestellte Stornierungen' });
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
        await expect(
          page.getByText('Die Kontodaten konnten nicht sicher zugeordnet werden.', {
            exact: false,
          }),
        ).toHaveCount(0);
        await expect(active.getByRole('heading', { level: 3 })).toHaveText(['Paket 1', 'Paket 2']);
        await expect(active).toContainText('Noch nicht wieder eingestellt');
        await expect(active).toContainText('Ursprünglicher Verkaufspreis');
        await expect(history).toContainText('Paket 3');
        await expect(history).toContainText('Wieder eingestellt');
        await expect(active.getByRole('link', { name: 'Chat öffnen' }).first()).toHaveAttribute(
          'href',
          new RegExp(`connectionId=${accountIds[0]}.*conversationId=${conversationId}`),
        );
        await checkSurface(page, 'app-vinted-sales');
        await expect(page.locator('app-vinted-workspace [role=alert]')).toHaveCount(0);
        await screenshot(page, `vinted-sales-${width}-${theme}`);
      });
    }
  });
}

async function checkSurface(page: Page, selector: string) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error('Geprüfte Oberfläche fehlt');
    return (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations;
  }, selector);
  expect(violations).toEqual([]);
  const overflow = await page.evaluate(() => {
    if (document.documentElement.scrollWidth <= innerWidth) return null;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > innerWidth + 0.5) {
        offenders.push(
          `${el.tagName}.${el.className} [right=${rect.right.toFixed(1)}, width=${rect.width.toFixed(1)}]`,
        );
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      offenders: offenders.slice(0, 15),
    };
  });
  expect(overflow).toBeNull();
}

async function screenshot(page: Page, name: string) {
  const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: false });
}

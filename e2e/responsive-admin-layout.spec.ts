import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

async function screenshot(page: Page, name: string) {
  const directory = process.env['RESPONSIVE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`) });
}

async function mockResponsiveWorkspace(page: Page, localAccounts = false, accountCount = 3) {
  await mockMarketplace(
    page,
    true,
    false,
    false,
    false,
    [],
    undefined,
    localAccounts,
    accountCount,
  );
  await page.route('**/rest/v1/marketplace_account_entries*', (route) =>
    route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json:
        route.request().method() === 'HEAD'
          ? undefined
          : [
              {
                body: { username: 'vintage.studio', displayName: 'Vintage Studio', imageUrl: null },
              },
            ],
    }),
  );
  await page.route('**/rest/v1/rpc/sniper_feed_search', (route) =>
    route.fulfill({ json: { items: [], covered: true, reported_at: null } }),
  );
  await page.route('**/rest/v1/rpc/sniper_favorites_page', (route) =>
    route.fulfill({ json: { items: [], next_cursor: null } }),
  );
  await page.route('**/rest/v1/rpc/get_workspace_company_settings', (route) =>
    route.fulfill({
      json: {
        can_edit: true,
        tax_mode: 'diff_25a',
        profile: {
          company_name: 'Testladen',
          legal_name: 'Anna Beispiel',
          street: 'Testweg',
          house_number: '1',
          postal_code: '12345',
          city: 'Bonn',
          country_code: 'DE',
        },
      },
    }),
  );
  await page.route('**/functions/v1/ebay-account', (route) =>
    route.fulfill({ json: { configured: true, connection: null } }),
  );
}

for (const width of [320, 390, 768, 834, 1024, 1194, 1440]) {
  test(`Vinted-Konten nutzen die verfügbare Breite bei ${width}px @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockResponsiveWorkspace(page);
    await page.goto('/marketplaces/vinted/accounts');
    const grid = page.getByLabel('Vinted-Konten', { exact: true });
    await expect(grid.locator('app-card')).toHaveCount(3);
    await screenshot(page, `accounts-${width}`);
    const geometry = await grid.evaluate((element) => ({
      grid: element.getBoundingClientRect().toJSON(),
      cards: [...element.querySelectorAll('app-card')].map((card) =>
        card.getBoundingClientRect().toJSON(),
      ),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(geometry.overflow).toBe(0);
    const firstRow = geometry.cards.filter(
      (card) => Math.abs(card.top - geometry.cards[0].top) < 1,
    );
    expect(Math.abs(firstRow.at(-1)!.right - geometry.grid.right)).toBeLessThan(1);
    if (width < 640) {
      expect(firstRow).toHaveLength(1);
      expect(Math.abs(firstRow[0].width - geometry.grid.width)).toBeLessThan(1);
      const title = await page.getByRole('heading', { name: 'Deine Vinted-Konten' }).boundingBox();
      const add = await page
        .getByRole('button', { name: 'Konto hinzufügen', exact: true })
        .boundingBox();
      expect(Math.abs(title!.y - add!.y)).toBeLessThan(10);
    }
    if (width >= 1194) expect(firstRow).toHaveLength(3);
    await page.getByRole('button', { name: 'Testkonto C einstellen', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Testkonto C');
  });
}

test.describe('Touch-Dashboard', () => {
  test.use({ hasTouch: true });
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390, 834, 1194]) {
      test(`Zeitraum und Plattform bleiben gleich hoch bei ${width}px im ${theme}-Theme @core-smoke`, async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await mockResponsiveWorkspace(page);
        await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
        await page.goto('/dashboard');
        const dashboard = page.locator('app-dashboard');
        await expect(dashboard.locator('[data-kpi]')).toHaveCount(4);
        await page.getByRole('combobox', { name: 'Zeitraum wählen' }).click();
        await page.getByRole('option', { name: 'Dieser Monat', exact: true }).click();
        await screenshot(page, `dashboard-touch-${theme}-${width}`);
        const geometry = await dashboard.evaluate((root) => ({
          periodHeight: root.querySelector('#dashboard-range')!.getBoundingClientRect().height,
          platformHeight: root.querySelector('#dashboard-platform')!.getBoundingClientRect().height,
          cards: [...root.querySelectorAll('[data-kpi]')].map((card) =>
            card.getBoundingClientRect().toJSON(),
          ),
          grid: root.querySelector('[aria-label="Kennzahlen"]')!.getBoundingClientRect().toJSON(),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        expect(geometry.overflow).toBe(0);
        expect(Math.abs(geometry.periodHeight - geometry.platformHeight)).toBeLessThanOrEqual(1);
        expect(geometry.platformHeight).toBeGreaterThanOrEqual(44);
        if (width === 1194)
          expect(new Set(geometry.cards.map((card) => Math.round(card.top))).size).toBe(1);
        expect(Math.abs(geometry.cards.at(-1)!.right - geometry.grid.right)).toBeLessThan(1);
        await page.getByRole('combobox', { name: 'Plattform filtern' }).click();
        await expect(page.getByRole('listbox')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.addScriptTag({ content: axe.source });
        expect(
          await page.evaluate(
            async () =>
              (
                await (window as unknown as { axe: typeof axe }).axe.run(
                  document.querySelector('app-dashboard')!,
                  { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
                )
              ).violations,
          ),
        ).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }
});

for (const width of [320, 390, 834, 1024, 1194, 1440]) {
  test(`Verwaltungsseiten bleiben bei ${width}px innerhalb des Inhalts @core-smoke`, async ({
    page,
  }) => {
    await mockResponsiveWorkspace(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      '/catalog',
      '/purchases',
      '/sales',
      '/expenses',
      '/listings',
      '/vinted-bot',
      '/deal-calculator',
      '/deal-calculator/ebay',
      '/image-optimizer',
      '/purchases/new',
      '/catalog/new',
      '/sellers',
      '/analytics',
      '/marketplaces/ebay/connection',
      '/marketplaces/kleinanzeigen',
      '/settings/account',
      '/settings/company',
      '/settings/marketplaces',
    ]) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            ),
          { message: `${route} bei ${width}px` },
        )
        .toBe(0);
      await screenshot(page, `${route.replaceAll('/', '-').slice(1)}-${width}`);
    }
  });
}

test.describe('Lokale Konten mit Touch', () => {
  test.use({ hasTouch: true });
  for (const width of [320, 390, 834, 1194]) {
    test(`Kartenaktionen bleiben bei ${width}px innerhalb der Karte @core-smoke`, async ({
      page,
    }) => {
      await mockResponsiveWorkspace(page, true);
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/marketplaces/vinted/accounts');
      const cards = page.locator('app-vinted-account-grid app-card');
      await expect(cards).toHaveCount(3);
      for (const card of await cards.all()) {
        const bounds = await card.boundingBox();
        for (const button of await card.locator('button').all()) {
          const action = await button.boundingBox();
          expect(action!.x).toBeGreaterThanOrEqual(bounds!.x);
          expect(action!.x + action!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
          expect(action!.height).toBeGreaterThanOrEqual(44);
          expect(
            await button.evaluate((element) => element.scrollWidth <= element.clientWidth),
          ).toBe(true);
        }
      }
      await screenshot(page, `accounts-local-touch-${width}`);
    });
  }
});

test('Auswertungen behalten lesbare Zeiträume und erreichbare Bereiche bei 320px @core-smoke', async ({
  page,
}) => {
  await mockResponsiveWorkspace(page);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto('/analytics');
  await expect(page.locator('app-analytics')).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async () =>
        (await (window as unknown as { axe: typeof axe }).axe.run('app-analytics')).violations,
    ),
  ).toEqual([]);
  await expect(page.getByRole('button', { name: '30 Tage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '7 Tage', exact: true }).click();
  await expect(page.getByRole('button', { name: '7 Tage', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('button', { name: 'Plattform-Rentabilität & Gebühren', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Plattform-Rentabilität & Gebühren', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});

test('große Bestandswerte bleiben im Dashboard vollständig lesbar @core-smoke', async ({
  page,
}) => {
  const articleTitle = `Vintage Jacke mit sehr langem Artikelnamen ${'Artikelnummer'.repeat(24)}`;
  await mockResponsiveWorkspace(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/rest/v1/sales?**', (route) =>
    route.fulfill({
      json: [
        {
          id: '25000000-0000-4000-8000-000000000051',
          workspace_id: workspaceId,
          platform: 'ebay',
          sale_date: new Date().toISOString().slice(0, 10),
          sale_price: 1234567.89,
          platform_fee: 0,
          shipping_cost: 0,
          packaging_cost: 0,
          other_costs: 0,
          lines: [],
          has_persisted_lines: false,
          inventory_item_id: '25000000-0000-4000-8000-000000000052',
          inventory_item: {
            id: '25000000-0000-4000-8000-000000000052',
            workspace_id: workspaceId,
            title: articleTitle,
            status: 'sold',
            allocated_purchase_cost: 1,
            costs: [],
          },
        },
      ],
    }),
  );
  await page.goto('/dashboard');
  const value = page.locator('[data-kpi="revenue"] .metric-value');
  await expect(value).toHaveText(/1\.234\.567,89\s*€/);
  const columnTextures = page.locator('app-revenue-chart defs pattern image');
  await expect.poll(() => columnTextures.count()).toBeGreaterThan(0);
  expect(
    await columnTextures.evaluateAll((images) =>
      images.every((image) =>
        (image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '').startsWith(
          'data:image/svg+xml,',
        ),
      ),
    ),
  ).toBe(true);
  await expect(page.locator('[data-kpi="sales"]')).not.toContainText('Stück verkauft');
  await page.setViewportSize({ width: 1440, height: 1100 });
  const lowerCards = await page
    .locator('.bottom-grid app-card')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
  expect(lowerCards).toHaveLength(2);
  expect(Math.abs(lowerCards[0].top - lowerCards[1].top)).toBeLessThanOrEqual(1);
  expect(Math.abs(lowerCards[0].height - lowerCards[1].height)).toBeLessThanOrEqual(1);
  const stockList = await page.locator('.stock-list').boundingBox();
  expect(
    Math.abs(lowerCards[1].bottom - (stockList!.y + stockList!.height) - 20),
  ).toBeLessThanOrEqual(1);
  const articleLink = page.locator('.sales-table').getByRole('link', { name: articleTitle });
  await expect(articleLink).toHaveAttribute('title', articleTitle);
  await expect(articleLink).toHaveAttribute('href', /\/sales\?saleId=/);
  const platformCell = page.locator('.sales-table tbody td:nth-child(3)');
  await expect(platformCell.locator('img')).toBeVisible();
  await expect(platformCell.getByText('eBay', { exact: true })).toHaveClass(/sr-only/);
  await expect(platformCell.locator('[title]')).toHaveAttribute('title', 'eBay');
  for (const width of [1440, 1194, 834, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const articleGeometry = await articleLink.evaluate((element) => {
      const cell = element.closest('td')!;
      const title = element.querySelector('.article-title')!;
      const cellBounds = cell.getBoundingClientRect();
      const linkBounds = element.getBoundingClientRect();
      const titleBounds = title.getBoundingClientRect();
      const contentRight =
        cellBounds.right - Number.parseFloat(getComputedStyle(cell).paddingRight);
      const platformBounds = cell.nextElementSibling!.getBoundingClientRect();
      return {
        linkFits: linkBounds.right <= contentRight + 1,
        titleFits: titleBounds.right <= contentRight + 1,
        shortened: title.scrollWidth > title.clientWidth,
        textOverflow: getComputedStyle(title).textOverflow,
        articleHasPriority: cellBounds.width >= 2 * platformBounds.width,
      };
    });
    expect(articleGeometry, `Artikelspalte bei ${width}px`).toEqual({
      linkFits: true,
      titleFits: true,
      shortened: true,
      textOverflow: 'ellipsis',
      articleHasPriority: true,
    });
    await expect
      .poll(() =>
        page.locator('app-revenue-chart [role="img"]').evaluate((element) => {
          const canvas = element.querySelector('.apexcharts-canvas');
          return !!canvas && canvas.getBoundingClientRect().width <= element.clientWidth + 1;
        }),
      )
      .toBe(true);
    expect(
      await value.evaluate((element) => ({
        overflow: element.scrollWidth > element.clientWidth,
        font: Number.parseFloat(getComputedStyle(element).fontSize),
      })),
    ).toEqual({ overflow: false, font: expect.any(Number) });
    expect(
      await value.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(20);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await screenshot(page, `dashboard-large-value-${width}`);
    const screenshotDirectory = process.env['RESPONSIVE_SCREENSHOT_DIR'];
    if (screenshotDirectory)
      await page.locator('.recent').screenshot({
        path: join(screenshotDirectory, `dashboard-sale-title-${width}.png`),
      });
  }
  await articleLink.focus();
  await expect(articleLink).toBeFocused();
});

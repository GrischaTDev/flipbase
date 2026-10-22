import { mockBankAssignment } from './support/bank-assignment-fixture';
import { mockFinanceArea } from './support/finance-design-fixture';
import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

// Der sichtbare Zuordnungszähler ist Teil des zugänglichen Namens.
const bankTabName = /^Bankabgleich(?: \d+)?$/u;

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
  const section = page.getByRole('combobox', { name: 'Auswertungsbereich', exact: true });
  await section.click();
  await page.getByRole('option', { name: 'Plattformen', exact: true }).click();
  await expect(section).toContainText('Plattformen');
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

test.describe('Finanzen behalten ihre Abläufe mit gemeinsamen Controls', () => {
  for (const width of [1440, 834, 390])
    for (const theme of ['light', 'dark'] as const) {
      test.describe(width + 'px ' + theme, () => {
        test.use({ viewport: { width, height: 1000 }, hasTouch: width !== 1440 });
        test('Ausgaben, Steuer und Auswertung bleiben bedienbar', async ({ page }) => {
          const fixture = await mockFinanceArea(page);
          await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(error.message));
          async function audit(selector: string) {
            await page.evaluate(() =>
              Promise.allSettled(
                document
                  .getAnimations()
                  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                  .map((a) => a.finished),
              ),
            );
            await page.addScriptTag({ content: axe.source });
            expect(
              await page.evaluate(
                async (selector) =>
                  (await (window as unknown as { axe: typeof axe }).axe.run(selector)).violations,
                selector,
              ),
            ).toEqual([]);
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
              ),
            ).toBe(0);
          }
          await page.goto('/expenses');
          await expect(
            page.getByRole('cell', { name: 'Versandkartons', exact: true }),
          ).toBeVisible();
          expect(
            await page.locator('app-expenses h1').evaluate((el) => getComputedStyle(el).fontSize),
          ).toBe('26px');
          const period = page.getByRole('combobox', { name: 'Ausgabenzeitraum', exact: true });
          await period.click();
          await page.getByRole('option', { name: 'Alle Zeiträume', exact: true }).click();
          await expect(period).toContainText('Alle Zeiträume');
          const filterHeights = await Promise.all(
            [
              period,
              page.getByRole('combobox', { name: 'Status filtern', exact: true }),
              page.getByRole('searchbox', {
                name: 'Ausgaben oder Anbieter durchsuchen',
                exact: true,
              }),
            ].map((field) => field.evaluate((el) => el.getBoundingClientRect().height)),
          );
          expect(new Set(filterHeights).size).toBe(1);
          const brown = await page
            .locator('app-expenses')
            .evaluate((root) =>
              [...root.querySelectorAll('*')].some(
                (el) => getComputedStyle(el).color === 'rgb(154, 87, 8)',
              ),
            );
          expect(brown).toBe(false);
          await page.getByRole('combobox', { name: 'Status filtern', exact: true }).click();
          await page.getByRole('option', { name: 'Bezahlt', exact: true }).click();
          await expect(
            page.getByRole('cell', { name: 'Versandkartons', exact: true }),
          ).toBeVisible();
          await audit('app-expenses');
          const create = page.getByRole('button', { name: 'Ausgabe hinzufügen', exact: true });
          await create.click();
          const expense = page.getByRole('dialog', { name: 'Ausgabe hinzufügen', exact: true });
          await expect(
            expense.getByRole('textbox', { name: 'Bezeichnung', exact: true }),
          ).toBeEnabled();
          await expense
            .getByRole('textbox', { name: 'Bezeichnung', exact: true })
            .fill('Etiketten');
          await expect(expense.getByLabel('Menge', { exact: true })).toBeEnabled();
          await expect(expense.getByLabel('Gesamtbetrag', { exact: true })).toBeEnabled();
          const date = expense.getByLabel('Ausgabedatum', { exact: true });
          await expect(date).toBeEnabled();
          const weights = await expense
            .locator('label')
            .filter({ hasText: /^\s*(Menge|Gesamtbetrag|Kategorie|Ausgabedatum)\s*$/ })
            .evaluateAll((labels) => labels.map((label) => getComputedStyle(label).fontWeight));
          expect([...new Set(weights)]).toEqual(['500']);
          await expense
            .locator('app-date-picker')
            .first()
            .getByRole('button', { name: 'Kalender öffnen', exact: true })
            .click();
          await expect(
            page.getByRole('dialog', { name: 'Datum wählen', exact: true }),
          ).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(expense).toBeVisible();
          await audit('app-expense-dialog');
          await expense.getByRole('button', { name: 'Abbrechen', exact: true }).click();
          await expect(create).toBeFocused();
          await page.getByRole('button', { name: 'Wiederkehrend', exact: true }).click();
          await expect(
            page.getByRole('cell', { name: 'Shop-Abonnement', exact: true }),
          ).toBeVisible();
          await page
            .getByRole('button', { name: 'Wiederkehrende Ausgabe hinzufügen', exact: true })
            .click();
          const recurring = page.getByRole('dialog', {
            name: 'Wiederkehrende Ausgabe hinzufügen',
            exact: true,
          });
          await expect(recurring.getByLabel('Startdatum', { exact: true })).toBeEnabled();
          await expect(
            recurring.getByRole('combobox', { name: 'Wiederholungsrhythmus', exact: true }),
          ).toBeEnabled();
          await audit('app-recurring-expense-dialog');
          await recurring.getByRole('button', { name: 'Abbrechen', exact: true }).click();
          await page.getByRole('button', { name: 'Kategorien verwalten', exact: true }).click();
          await expect(
            page.getByRole('dialog').getByRole('textbox', { name: 'Neue Kategorie', exact: true }),
          ).toBeVisible();
          await page.keyboard.press('Escape');
          await page.goto('/accounting');
          await expect(
            page.getByRole('heading', { name: 'Steuer & DATEV', exact: true }),
          ).toBeVisible();
          await page.getByRole('combobox', { name: 'Besteuerungszeitraum', exact: true }).click();
          await page.getByRole('option', { name: 'Ganzes Jahr', exact: true }).click();
          for (const name of ['Steuerjahr', 'Besteuerungszeitraum']) {
            const clipped = await page
              .getByRole('combobox', { name, exact: true })
              .evaluate((button) => {
                const label = button.querySelector('span.truncate')!;
                return label.scrollWidth > label.clientWidth;
              });
            expect(clipped, name + ' bleibt vollständig lesbar').toBe(false);
          }
          await expect(page.getByRole('cell', { name: /Leinenhemd · Salbeigrün/ })).toBeVisible();
          await audit('app-accounting');
          await page
            .getByRole('button', { name: 'Berichtspaket vorbereiten', exact: true })
            .click();
          const report = page.getByRole('dialog', {
            name: 'Monatsabschluss für die Steuerberatung vorbereiten',
            exact: true,
          });
          await expect(
            report.getByRole('combobox', { name: 'Kontenrahmen', exact: true }),
          ).toBeVisible();
          expect(
            await report
              .getByRole('combobox', { name: 'Kontenrahmen', exact: true })
              .evaluate((button) => {
                const label = button.querySelector('span.truncate')!;
                return label.scrollWidth > label.clientWidth;
              }),
          ).toBe(false);
          await audit('app-accounting');
          await report.getByRole('button', { name: 'Abbrechen', exact: true }).click();
          await page.getByRole('button', { name: bankTabName }).click();
          await expect(
            page.getByRole('button', { name: 'Datei auswählen', exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole('cell', { name: 'Vinted Auszahlung', exact: true }),
          ).toBeVisible();
          const bankSearch = page.getByRole('searchbox', {
            name: 'Banktransaktionen durchsuchen',
            exact: true,
          });
          await bankSearch.fill('Vinted');
          await expect(
            page.getByRole('cell', { name: 'Vinted Auszahlung', exact: true }),
          ).toBeVisible();
          await expect(page.getByRole('cell', { name: 'Papier & Paket', exact: true })).toHaveCount(
            0,
          );
          await bankSearch.fill('');
          await page.getByRole('button', { name: 'Bereits gebucht (0)', exact: true }).click();
          await expect(
            page.getByText('Keine passenden Banktransaktionen', { exact: true }),
          ).toBeVisible();
          await page.getByRole('button', { name: 'Offen / Ungeklärt (2)', exact: true }).click();
          await expect(
            page.getByRole('cell', { name: 'Vinted Auszahlung', exact: true }),
          ).toBeVisible();
          await audit('app-accounting');
          await page
            .locator('app-accounting')
            .getByRole('button', { name: 'Datei auswählen', exact: true })
            .evaluate((button) => {
              const wrapper =
                button.closest('app-accounting')!.querySelector('[data-bank-drop-target]') ??
                button.closest('app-accounting')!;
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(
                new File(['keine gültigen Bankdaten'], 'defekt.csv', { type: 'text/csv' }),
              );
              wrapper.dispatchEvent(
                new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
              );
            });
          await expect(
            page.getByText('Kontoauszug konnte nicht importiert werden.', { exact: true }),
          ).toBeVisible();
          fixture.sales[0].inventory_item.title =
            'Leinenhemd · Salbeigrün – ' + 'Designerartikel'.repeat(6);
          fixture.sales[0].sale_price = 1234567.89;
          await page.goto('/analytics');
          await expect(page.getByText('1.234.567,89 €', { exact: true }).first()).toBeVisible();
          expect(
            await page
              .locator('app-analytics [data-finance-metric]')
              .evaluateAll((metrics) =>
                metrics.every((metric) => metric.scrollWidth <= metric.clientWidth),
              ),
          ).toBe(true);

          await expect(
            page.getByRole('heading', { name: 'Auswertung', exact: true }),
          ).toBeVisible();
          await page.getByRole('button', { name: 'Gesamt', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Gesamt', exact: true })).toHaveAttribute(
            'aria-pressed',
            'true',
          );
          const sectionLabels = [
            'Übersicht',
            'Alle Workspaces',
            'Plattformen',
            'Bestand & Kapital',
            'Einkaufsgruppen',
            'Wochentage',
            'Kategorien',
          ];
          for (const label of sectionLabels) {
            if (width >= 1280) {
              const button = page
                .getByRole('group', { name: 'Auswertungsbereich wählen', exact: true })
                .getByRole('button', { name: label, exact: true });
              await button.click();
              await expect(button).toHaveAttribute('aria-pressed', 'true');
            } else {
              const select = page.getByRole('combobox', {
                name: 'Auswertungsbereich',
                exact: true,
              });
              await select.click();
              await page.getByRole('option', { name: label, exact: true }).click();
              await expect(select).toContainText(label);
            }
            if (label === 'Übersicht') {
              const geometry = await page
                .locator('app-card')
                .filter({
                  has: page.getByRole('heading', {
                    name: 'Top-Gewinnbringer im Zeitraum',
                    exact: true,
                  }),
                })
                .evaluate((card) => ({
                  right: card.getBoundingClientRect().right - 20,
                  values: [...card.querySelectorAll('strong,span')].map((el) => ({
                    right: el.getBoundingClientRect().right,
                    overflow: el.scrollWidth > el.clientWidth,
                  })),
                }));
              expect(
                geometry.values.every(
                  (value) => value.right <= geometry.right + 1 && !value.overflow,
                ),
              ).toBe(true);
            }
            await audit('app-analytics');
          }
          expect(errors).toEqual([]);
        });
      });
    }
});

test.describe('Gemeinsame Warnfarben erhalten lesbare Versandfilter', () => {
  for (const theme of ['light', 'dark'] as const) {
    test('Aktiver Verpackungsfilter bleibt lesbar in ' + theme, async ({ page }) => {
      await mockFinanceArea(page);
      await page.route('**/rest/v1/shipping_orders?**', (route) => route.fulfill({ json: [] }));
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/fulfillment');
      const active = page.getByRole('button', { name: /^Zu verpacken \(/ });
      await expect(active).toBeVisible();
      await active.evaluate((el) => el.setAttribute('data-palette-regression-target', ''));
      await page.addScriptTag({ content: axe.source });
      const violations = await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              '[data-palette-regression-target]',
              { runOnly: ['color-contrast'] },
            )
          ).violations,
      );
      expect(violations).toEqual([]);
    });
  }
});

test.describe('Manuelle Bankzuordnung mit Auswahlfenster', () => {
  for (const width of [1440, 834, 390])
    for (const theme of ['light', 'dark'] as const) {
      test.describe(width + 'px ' + theme, () => {
        test.use({ viewport: { width, height: 1000 }, hasTouch: width !== 1440 });
        test('ordnet Einnahmen und Ausgänge zu, erlaubt Änderungen und bucht erst getrennt', async ({
          page,
        }) => {
          const fixture = await mockBankAssignment(page);
          await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
          await page.goto('/accounting');
          await page.getByRole('button', { name: bankTabName }).click();
          const incoming = page
            .getByRole('row')
            .filter({ has: page.getByRole('cell', { name: 'Vinted Auszahlung', exact: true }) });
          const outgoing = page
            .getByRole('row')
            .filter({ has: page.getByRole('cell', { name: 'Papier & Paket', exact: true }) });
          const opener = incoming.getByRole('button', {
            name: 'Transaktion zuweisen',
            exact: true,
          });
          await opener.click();
          const dialog = page.getByRole('dialog', { name: 'Bankbewegung zuordnen', exact: true });
          await expect(dialog).toBeVisible();
          const save = dialog.getByRole('button', { name: 'Zuordnung speichern', exact: true });
          await expect(save).toBeDisabled();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).fill('Leinenhemd');
          await page.getByRole('option', { name: /Leinenhemd/ }).click();
          await expect(save).toBeEnabled();
          await page.evaluate(() =>
            Promise.allSettled(
              document
                .getAnimations()
                .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                .map((a) => a.finished),
            ),
          );
          await page.addScriptTag({ content: axe.source });
          expect(
            await page.evaluate(
              async () =>
                (
                  await (window as unknown as { axe: typeof axe }).axe.run(
                    'app-bank-assignment-dialog',
                  )
                ).violations,
            ),
          ).toEqual([]);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            ),
          ).toBe(0);
          await screenshot(page, 'bank-assignment-' + width + '-' + theme);
          await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
          await expect(opener).toBeFocused();
          expect(fixture.writes).toHaveLength(0);
          await opener.click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).fill('Leinenhemd');
          await page.getByRole('option', { name: /Leinenhemd/ }).click();
          await save.click();
          await expect(dialog).toHaveCount(0);
          await expect(incoming.getByText('Bereit', { exact: true })).toBeVisible();
          expect(fixture.transactions[0].match_json?.['targetType']).toBe('sale');
          expect(fixture.state.bookingCalls).toBe(0);
          await incoming.getByRole('button', { name: 'Zuordnung ändern', exact: true }).click();
          await expect(dialog.getByRole('combobox', { name: 'Eintrag', exact: true })).toHaveValue(
            /Leinenhemd/,
          );
          await dialog.getByRole('combobox', { name: 'Zuordnen zu', exact: true }).click();
          await page.getByRole('option', { name: 'Shopbestellung', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).fill('ORD-42');
          await page.getByRole('option', { name: /ORD-42/ }).click();
          await save.click();
          await expect(dialog).toHaveCount(0);
          expect(fixture.transactions[0].match_json?.['targetType']).toBe('store_order');
          await incoming.getByRole('button', { name: 'Transaktion buchen', exact: true }).click();
          await expect(incoming.getByText('Gebucht', { exact: true })).toBeVisible();
          expect(fixture.state.bookingCalls).toBe(1);
          await expect(
            incoming.getByRole('button', { name: 'Zuordnung ändern', exact: true }),
          ).toHaveCount(0);
          await outgoing.getByRole('button', { name: 'Transaktion zuweisen', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).click();
          await dialog
            .getByRole('combobox', { name: 'Eintrag', exact: true })
            .fill('Versandkartons');
          await page.getByRole('option', { name: /Versandkartons/ }).click();
          await save.click();
          await expect(dialog).toHaveCount(0);
          expect(fixture.transactions[1].match_json?.['targetAmount']).toBe(47.6);
          await outgoing.getByRole('button', { name: 'Zuordnung ändern', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Zuordnen zu', exact: true }).click();
          await page.getByRole('option', { name: 'Einkauf', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).click();
          await dialog.getByRole('combobox', { name: 'Eintrag', exact: true }).fill('Kleiderpaket');
          await page.getByRole('option', { name: /Kleiderpaket/ }).click();
          await expect(save).toBeDisabled();
          await expect(dialog.getByText('-2,40 €', { exact: true })).toBeVisible();
          expect(
            await page.evaluate(
              async () =>
                (
                  await (window as unknown as { axe: typeof axe }).axe.run(
                    'app-bank-assignment-dialog',
                  )
                ).violations,
            ),
          ).toEqual([]);
          await screenshot(page, 'bank-assignment-difference-' + width + '-' + theme);
          await dialog
            .getByRole('checkbox', { name: 'Abweichenden Betrag bestätigen', exact: true })
            .click();
          await expect(
            dialog.getByRole('checkbox', { name: 'Abweichenden Betrag bestätigen', exact: true }),
          ).toBeChecked();
          await save.click();
          await expect(dialog).toHaveCount(0);
          expect(fixture.transactions[1].match_json?.['targetType']).toBe('purchase');
          await page.reload();
          await page.getByRole('button', { name: bankTabName }).click();
          await expect(outgoing.getByText('Kleiderpaket', { exact: false }).first()).toBeVisible();
        });
      });
    }
});

test.describe('Manuelle Bankzuordnung bei Fehlern', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(
      'behält die Auswahl bei Speicherfehlern und bietet Laden erneut an in ' + theme,
      async ({ page }) => {
        const fixture = await mockBankAssignment(page);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/accounting');
        await page.getByRole('button', { name: bankTabName }).click();
        const incoming = page
          .getByRole('row')
          .filter({ has: page.getByRole('cell', { name: 'Vinted Auszahlung', exact: true }) });
        await expect(incoming).toBeVisible();
        fixture.state.failSalesLoad = true;
        await incoming.getByRole('button', { name: 'Transaktion zuweisen', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Bankbewegung zuordnen', exact: true });
        await expect(dialog.getByRole('alert')).toContainText(
          'Verkäufe konnten nicht geladen werden.',
        );
        await expect(
          dialog.getByRole('button', { name: 'Zuordnung speichern', exact: true }),
        ).toBeDisabled();
        fixture.state.failSalesLoad = false;
        await dialog.getByRole('button', { name: 'Auswahl aktualisieren', exact: true }).click();
        const entry = dialog.getByRole('combobox', { name: 'Eintrag', exact: true });
        await entry.click();
        await entry.fill('Leinenhemd');
        await page.getByRole('option', { name: /Leinenhemd/ }).click();
        fixture.state.failNextSave = true;
        const save = dialog.getByRole('button', { name: 'Zuordnung speichern', exact: true });
        await save.click();
        await expect(dialog.getByRole('alert')).toBeVisible();
        await expect(entry).toHaveValue(/Leinenhemd/);
        expect(fixture.transactions[0].status).toBe('pending');
        await page.addScriptTag({ content: axe.source });
        expect(
          await page.evaluate(
            async () =>
              (
                await (window as unknown as { axe: typeof axe }).axe.run(
                  'app-bank-assignment-dialog',
                )
              ).violations,
          ),
        ).toEqual([]);
        await screenshot(page, 'bank-assignment-error-' + theme);
        await expect(save).toBeEnabled();
        await save.click();
        await expect(dialog).toHaveCount(0);
        expect(fixture.transactions[0].status).toBe('matched');
        expect(fixture.writes).toHaveLength(2);
        fixture.state.emptySales = true;
        await incoming.getByRole('button', { name: 'Zuordnung ändern', exact: true }).click();
        await expect(dialog.getByRole('status')).toHaveText(
          'Keine verfügbaren Einträge in diesem Bereich.',
        );
        await expect(save).toBeDisabled();
        await page.addScriptTag({ content: axe.source });
        expect(
          await page.evaluate(
            async () =>
              (
                await (window as unknown as { axe: typeof axe }).axe.run(
                  'app-bank-assignment-dialog',
                )
              ).violations,
          ),
        ).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      },
    );
  }
});

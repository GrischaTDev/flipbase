import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

async function startDashboard(page: Page) {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startDemoMode(page);
  await page.getByRole('button', { name: 'Dieser Monat' }).click();
  await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();
  await expect(page.locator('app-revenue-chart [role="img"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}

async function checkAxe(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-dashboard') as HTMLElement,
        )
      ).violations,
  );
  expect(violations).toEqual([]);
}

async function seedReport(page: Page) {
  await page.evaluate(() => {
    const sale = (id: string, date: string, cost: number | null) => ({
      id,
      workspace_id: 'ws-1',
      platform: 'PlattformMitEinemSehrLangenUngetrenntenNamenFürDenMobilenBericht',
      sale_date: date,
      sale_price: 20,
      platform_fee: 1,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      has_persisted_lines: true,
      lines: [
        {
          id: `${id}-line`,
          workspace_id: 'ws-1',
          sale_id: id,
          title_snapshot:
            'SehrLangerArtikelnameOhneTrennzeichenFürDieResponsiveDarstellungImVerkaufsjournal',
          quantity: 1,
          unit_sale_price: 20,
          line_total: 20,
          cost_of_goods_sold: cost,
          inventory_item_id: `${id}-item`,
          inventory_item: {
            id: `${id}-item`,
            workspace_id: 'ws-1',
            allocated_purchase_cost: cost,
            purchase: {
              id: `${id}-purchase`,
              workspace_id: 'ws-1',
              purchase_price: cost,
              entry_status: 'finalized',
            },
          },
          tax_mode: 'diff_25a',
        },
      ],
    });
    localStorage.setItem(
      'flipbase_local_sales',
      JSON.stringify([
        sale('design-negative', '2026-08-30', 35),
        sale('design-unknown', '2026-08-28', null),
      ]),
    );
  });
  await page.reload();
  await expect(page.locator('app-revenue-chart [role="img"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`zeigt Dashboard und Journal im ${theme}-Theme mit lesbarer Typografie und AXE`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await startDashboard(page);
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Zu dunklem Design wechseln' }).click();
    await expect(page.locator('app-revenue-chart .apexcharts-line')).toHaveCount(4);
    for (const heading of await page.locator('app-dashboard h2, app-dashboard thead th').all()) {
      await expect(heading).toHaveCSS('text-transform', 'none');
      const typography = await heading.evaluate((element) => ({
        font: parseFloat(getComputedStyle(element).fontSize),
        spacing: getComputedStyle(element).letterSpacing,
      }));
      expect(typography.font).toBeGreaterThanOrEqual(13);
      expect(['normal', '0px']).toContain(typography.spacing);
    }
    const legend = page.getByRole('button', { name: 'Wareneinsatz', exact: true });
    await legend.click();
    await expect(legend).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('app-revenue-chart [role="img"]')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(errors).toEqual([]);
    await expect(page.locator('app-revenue-chart .apexcharts-line[d]:not([d=""])')).toHaveCount(3);
    await legend.click();
    await expect(page.locator('app-revenue-chart .apexcharts-line[d]:not([d=""])')).toHaveCount(4);
    await checkAxe(page);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${theme}-desktop.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test('erhält negative und unbekannte Kosten auf Mobilgeräten und begrenzt Touchdetails', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Europe/Berlin',
  });
  const page = await context.newPage();
  await startDashboard(page);
  await seedReport(page);
  const journal = page.getByRole('region', { name: 'Verkaufsjournal' });
  await expect(journal.locator('article').first()).toContainText('35,00');
  await expect(journal.locator('article').first()).toContainText('-16,00');
  await expect(journal.locator('article').first()).toContainText('-80 %');
  await expect(journal.locator('article').nth(1)).toContainText('Kosten noch offen');
  const summary = page.locator('#revenue-chart-summary');
  await expect(summary.locator('tr').filter({ hasText: '30.08.' })).toContainText('35,00');
  await expect(summary.locator('tr').filter({ hasText: '28.08.' })).toContainText('unbekannt');
  const chart = page.locator('app-revenue-chart [role="img"]');
  await chart.scrollIntoViewIfNeeded();
  const bounds = await chart.boundingBox();
  if (!bounds) throw Error('Diagrammfläche fehlt');
  await page.touchscreen.tap(bounds.x + bounds.width - 3, bounds.y + bounds.height / 2);
  const tooltip = page.getByRole('status').filter({ hasText: 'Verkaufserlös:' });
  await expect(tooltip).toContainText('30.08.');
  await expect(tooltip).toContainText('Wareneinsatz: 35,00');
  const tooltipBounds = await tooltip.boundingBox();
  if (!tooltipBounds) throw Error('Touchdetails fehlen');
  expect(tooltipBounds.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBounds.x + tooltipBounds.width).toBeLessThanOrEqual(390);
  expect(tooltipBounds.y + tooltipBounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: testInfo.outputPath('dashboard-mobile-touch.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Heute', exact: true }).click();
  await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuemax', '1');
  await expect(page.locator('#revenue-chart-summary tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await checkAxe(page);
  await page.screenshot({
    path: testInfo.outputPath('dashboard-mobile-one-point.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Zu dunklem Design wechseln' }).click();
  await checkAxe(page);
  await page.screenshot({
    path: testInfo.outputPath('dashboard-dark-mobile-one-point.png'),
    fullPage: true,
  });
  await context.close();
});

test('zeigt nach einem Importfehler die Daten und ermöglicht einen erfolgreichen erneuten Ladevorgang', async ({
  page,
}) => {
  let blocked = true;
  await page.route(/apexcharts_(core|line)\.js/, (route) =>
    blocked ? route.abort() : route.continue(),
  );
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await startDemoMode(page);
  await expect(page.getByRole('alert')).toContainText('Diagramm konnte nicht geladen');
  await expect(page.locator('#revenue-chart-summary')).toBeVisible();
  blocked = false;
  await page.getByRole('button', { name: 'Erneut laden' }).click();
  await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();
});

import { type Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

async function startDashboard(page: Page) {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
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
    const visibleSeries = page.locator(
      'app-revenue-chart .apexcharts-series:has(.apexcharts-bar-area[d]:not([d=""]))',
    );
    await expect(visibleSeries).toHaveCount(3);
    for (const heading of await page.locator('app-dashboard h2, app-dashboard thead th').all()) {
      await expect(heading).toHaveCSS('text-transform', 'none');
      const typography = await heading.evaluate((element) => ({
        font: parseFloat(getComputedStyle(element).fontSize),
        spacing: getComputedStyle(element).letterSpacing,
      }));
      expect(typography.font).toBeGreaterThanOrEqual(13);
      expect(['normal', '0px']).toContain(typography.spacing);
    }
    const legend = page.getByRole('button', { name: 'Ausgaben gesamt', exact: true });
    await legend.click();
    await expect(legend).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('app-revenue-chart [role="img"]')).toHaveAttribute(
      'aria-busy',
      'false',
    );
    expect(errors).toEqual([]);
    await expect(visibleSeries).toHaveCount(2);
    await legend.click();
    await expect(visibleSeries).toHaveCount(3);
    await checkAxe(page);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${theme}-desktop.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test('zeigt nach einem Importfehler die Daten und ermöglicht einen erfolgreichen erneuten Ladevorgang', async ({
  page,
}) => {
  let blocked = true;
  let blockedImports = 0;
  // Ohne Angular-Paketcache trägt auch der Apex-Import einen generierten Chunknamen.
  await page.route(/(?:chunk-[^/]+|apexcharts_core)\.js(?:\?|$)/, async (route) => {
    if (!blocked) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const source = await response.text();
    if (/class _ApexCharts\d*\b/.test(source)) {
      blockedImports += 1;
      await route.abort();
      return;
    }
    await route.fulfill({ response });
  });
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await openDashboard(page);
  await expect(page.getByRole('alert')).toContainText('Diagramm konnte nicht geladen');
  expect(blockedImports).toBe(1);
  await expect(page.locator('#revenue-chart-summary')).toBeVisible();
  blocked = false;
  await page.getByRole('button', { name: 'Erneut laden' }).click();
  await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();
});

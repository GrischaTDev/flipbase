import axe from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { mockMarketplace } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function openDashboard(page: Page) {
  await mockMarketplace(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  await expect(page.locator('main h1')).toBeVisible();
}

test('hält die Sidebar kompakt und hebt den aktiven Bereich neutral hervor @pr-smoke', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/sales');

  const sidebar = page.locator('app-sidebar > aside[aria-label="Hauptnavigation"]');
  const activeLink = sidebar.locator('a[aria-current="page"]');
  const activeIcon = activeLink.locator('svg').first();

  await expect(sidebar).toBeVisible();
  await expect(activeLink).toHaveText(/Verkäufe/);
  await expect(activeLink).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(activeLink).toHaveCSS('color', 'rgb(29, 29, 31)');
  await expect(activeIcon).toHaveCSS('color', 'rgb(29, 29, 31)');

  const demoBadge = sidebar.locator('span', { hasText: 'Demo' });
  await expect(demoBadge).toHaveCount(1);
  for (const badge of await demoBadge.all()) {
    await expect(badge).toHaveCSS('background-color', 'rgb(252, 198, 1)');
    await expect(badge).toHaveCSS('color', 'rgb(26, 26, 26)');
  }

  const sidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  expect(sidebarWidth).toBe(224);

  const overflowingLinks = await sidebar
    .locator('nav a')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => element.textContent?.trim()),
    );
  expect(overflowingLinks).toEqual([]);

  const firstLinkHeight = await sidebar
    .locator('nav a')
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(firstLinkHeight).toBe(36);

  const firstLink = sidebar.locator('nav a').first();
  await firstLink.focus();
  await expect(firstLink).toBeFocused();
  await expect(firstLink).toHaveCSS('outline-style', 'solid');

  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(async () =>
    (window as Window & { axe: typeof axe }).axe.run(
      document.querySelector('app-sidebar > aside') ?? document.body,
      { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    ),
  );
  expect(accessibility.violations).toEqual([]);
});

test('verwendet im dunklen Design eine neutrale aktive Auswahlfläche', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/sales');
  await page.getByRole('button', { name: 'Dunkles Design aktivieren', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  const activeLink = page.locator('app-sidebar a[aria-current="page"]');
  const activeIcon = activeLink.locator('svg').first();
  await expect(activeLink).toHaveCSS('background-color', 'rgb(40, 40, 43)');
  await expect(activeLink).toHaveCSS('color', 'rgb(242, 242, 247)');
  await expect(activeIcon).toHaveCSS('color', 'rgb(242, 242, 247)');

  const demoBadge = page.locator('app-sidebar span', { hasText: 'Demo' });
  await expect(demoBadge).toHaveCount(1);
  for (const badge of await demoBadge.all()) {
    await expect(badge).toHaveCSS('background-color', 'rgb(252, 198, 1)');
    await expect(badge).toHaveCSS('color', 'rgb(26, 26, 26)');
  }
});

test.describe('Mobile Navigation mit Touch', () => {
  test.use({ hasTouch: true });
  test('übernimmt den gelben aktiven Zustand auch in der mobilen Navigation', async ({ page }) => {
    await openDashboard(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/sales');

    const activeLink = page.locator('app-bottom-nav a[aria-current="page"]');
    await expect(activeLink).toHaveText('Verkauf');
    await expect(activeLink).toHaveCSS('background-color', 'rgb(252, 198, 1)');
    await expect(activeLink).toHaveCSS('color', 'rgb(26, 26, 26)');

    const sidebar = page.locator('app-sidebar > aside[aria-label="Hauptnavigation"]');
    const sidebarLinkHeight = await sidebar
      .locator('nav a')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(sidebarLinkHeight).toBeGreaterThanOrEqual(44);
  });
});

test('bindet die Desktop-Sidebar an den Viewport und lässt die Navigation intern scrollen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await openDashboard(page);
  await page.goto('/sales');

  const sidebar = page.locator('app-sidebar > aside[aria-label="Hauptnavigation"]');
  const metrics = await sidebar.evaluate((element) => {
    const navigation = element.querySelector('nav');
    return {
      height: element.getBoundingClientRect().height,
      navigationClientHeight: navigation?.clientHeight ?? 0,
      navigationScrollHeight: navigation?.scrollHeight ?? 0,
    };
  });

  expect(metrics.height).toBe(480);
  expect(metrics.navigationScrollHeight).toBeGreaterThan(metrics.navigationClientHeight);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const scrolledMetrics = await sidebar.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom };
  });
  expect(scrolledMetrics.top).toBe(0);
  expect(scrolledMetrics.bottom).toBe(480);
});

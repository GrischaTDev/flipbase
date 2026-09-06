import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

test('hält die Sidebar kompakt und hebt den aktiven Bereich in Logo-Gelb hervor', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/sales');

  const sidebar = page.locator('app-sidebar > aside[aria-label="Hauptnavigation"]');
  const activeLink = sidebar.locator('a[aria-current="page"]');
  const activeIcon = activeLink.locator('svg').first();

  await expect(sidebar).toBeVisible();
  await expect(activeLink).toHaveText(/Verkäufe/);
  await expect(activeLink).toHaveCSS('background-color', 'rgba(252, 198, 1, 0.14)');
  await expect(activeIcon).toHaveCSS('color', 'rgb(161, 98, 7)');

  const demoBadge = sidebar.locator('span', { hasText: 'Demo' });
  await expect(demoBadge).toHaveCount(1);
  for (const badge of await demoBadge.all()) {
    await expect(badge).toHaveCSS('background-color', 'rgba(252, 198, 1, 0.14)');
    await expect(badge).toHaveCSS('color', 'rgb(113, 63, 18)');
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
  expect(firstLinkHeight).toBeLessThanOrEqual(34);

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

test('verwendet im dunklen Design das helle Logo-Gelb für den aktiven Menüpunkt', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.evaluate(() => localStorage.setItem('flipbase_theme', 'dark'));
  await page.goto('/sales');

  const activeIcon = page.locator('app-sidebar a[aria-current="page"] svg').first();
  await expect(activeIcon).toHaveCSS('color', 'rgb(252, 198, 1)');

  const demoBadge = page.locator('app-sidebar span', { hasText: 'Demo' });
  await expect(demoBadge).toHaveCount(1);
  for (const badge of await demoBadge.all()) {
    await expect(badge).toHaveCSS('background-color', 'rgba(252, 198, 1, 0.14)');
    await expect(badge).toHaveCSS('color', 'rgb(252, 198, 1)');
  }
});

test('übernimmt den gelben aktiven Zustand auch in der mobilen Navigation', async ({ page }) => {
  await startDemoMode(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/sales');

  const activeLink = page.locator('app-bottom-nav a[aria-current="page"]');
  await expect(activeLink).toHaveText('Verkauf');
  await expect(activeLink).toHaveCSS('color', 'rgb(161, 98, 7)');

  const sidebar = page.locator('app-sidebar > aside[aria-label="Hauptnavigation"]');
  const sidebarLinkHeight = await sidebar
    .locator('nav a')
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(sidebarLinkHeight).toBeGreaterThanOrEqual(44);
});

test('bindet die Desktop-Sidebar an den Viewport und lässt die Navigation intern scrollen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await startDemoMode(page);
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
});

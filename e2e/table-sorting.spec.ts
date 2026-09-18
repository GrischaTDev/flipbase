import { expect, openDashboard, test } from './support/fixtures';

test('hält beide Tabellen-Popover auf schmalen Bildschirmen im Viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await page.goto('/sales');

  const menu = page.locator('app-table-column-menu').first();
  await menu.getByRole('button', { name: /Spalten/ }).click();
  const panel = menu.getByRole('dialog', { name: 'Spalten', exact: true });
  await expect(panel).toBeVisible();
  await panel.locator('[data-sort-trigger]').click();
  const sortMenu = menu.locator('[data-sort-menu]');
  await expect(sortMenu).toBeVisible();

  const viewport = page.viewportSize();
  const panelBox = await panel.boundingBox();
  const sortBox = await sortMenu.boundingBox();
  expect(viewport).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(sortBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport!.height);
  expect(sortBox!.x).toBeGreaterThanOrEqual(0);
  expect(sortBox!.x + sortBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(sortBox!.y).toBeGreaterThanOrEqual(0);
  expect(sortBox!.y + sortBox!.height).toBeLessThanOrEqual(viewport!.height);
});

test('zeigt Reset nur bei einer veränderten Ansicht', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/sales');

  // Exakter Name: der leere Arbeitsbereich zeigt zusätzlich eine Leerstand-Überschrift
  // ("Keine passenden Verkäufe gefunden"), die den lockeren Regex sonst doppelt trifft.
  await expect(
    page.getByRole('heading', { name: 'Verkäufe & Retouren', exact: true }),
  ).toBeVisible();
  const menu = page.locator('app-table-column-menu').first();
  await page.getByRole('searchbox', { name: 'Suche' }).fill('Tasse');
  const reset = menu.getByRole('button', { name: 'Ansicht zurücksetzen', exact: true });
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(page.getByRole('searchbox', { name: 'Suche' })).toHaveValue('');
  await expect(reset).toBeHidden();
});

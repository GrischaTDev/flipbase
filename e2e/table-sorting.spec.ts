import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('zeigt die Sortierung inline und sortiert Sales über den Tabellenkopf', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/sales');

  const menu = page.locator('app-table-column-menu').first();
  await menu.getByRole('button', { name: /Spalten/ }).click();
  const panel = menu.getByRole('dialog', { name: 'Spalten', exact: true });

  await expect(panel.getByText('Sortieren nach', { exact: true })).toBeVisible();
  await expect(panel.locator('[data-sort-trigger]')).toBeVisible();
  await expect(panel.locator('.linear-input')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Aufsteigend|Absteigend/ })).toHaveCount(0);

  await panel.locator('[data-sort-trigger]').click();
  const sortMenu = menu.locator('[data-sort-menu]');
  await expect(sortMenu).toBeVisible();
  await expect(sortMenu.getByRole('option', { name: 'Artikelname' })).toBeVisible();
  await expect(sortMenu.getByRole('option', { name: 'Älteste zuerst' })).toBeVisible();
  await expect(sortMenu.getByRole('option', { name: 'Neueste zuerst' })).toBeVisible();

  await sortMenu.getByRole('option', { name: 'Artikelname' }).click();
  await panel.locator('[data-sort-trigger]').click();
  await expect(sortMenu.getByRole('option', { name: 'A–Z' })).toBeVisible();
  await expect(sortMenu.getByRole('option', { name: 'Z–A' })).toBeVisible();
  await page.keyboard.press('Escape');

  const titleHeader = page.locator('th:has([data-table-sort-field="title"])');
  await titleHeader.locator('button').click();
  await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
  await titleHeader.locator('button').click();
  await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
});

test('hält beide Tabellen-Popover auf schmalen Bildschirmen im Viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startDemoMode(page);
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
  await startDemoMode(page);
  await page.goto('/sales');

  await expect(page.getByRole('heading', { name: /Verkäufe/ })).toBeVisible();
  const menu = page.locator('app-table-column-menu').first();
  await page.getByRole('searchbox', { name: 'Suche' }).fill('Tasse');
  const reset = menu.getByRole('button', { name: 'Ansicht zurücksetzen', exact: true });
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(page.getByRole('searchbox', { name: 'Suche' })).toHaveValue('');
  await expect(reset).toBeHidden();
});

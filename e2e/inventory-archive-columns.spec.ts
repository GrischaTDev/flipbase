import { type Locator, type Page } from '@playwright/test';
import { expect, openDashboard, test } from './support/fixtures';

function columnControl(page: Page): Locator {
  return page.locator('app-table-column-picker, app-table-column-menu').first();
}

async function openColumnControl(page: Page): Promise<Locator> {
  const control = columnControl(page);
  await control.getByRole('button', { name: /Spalten/ }).click();
  await expect(control.locator('fieldset, [role="dialog"]').first()).toBeVisible();
  return control;
}

test('hält das Spaltenmenü auf kleinen Bildschirmen vollständig im Viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await page.goto('/sales');

  const control = await openColumnControl(page);
  const panel = control.getByRole('dialog', { name: 'Spalten', exact: true });
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();

  expect(panelBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport!.height);

  await panel.getByRole('button', { name: 'Sortierfeld' }).click();
  const sortList = control.locator('[data-sort-menu]');
  await expect(sortList).toBeVisible();
  const sortBox = await sortList.boundingBox();
  expect(sortBox).not.toBeNull();
  expect(sortBox!.x).toBeGreaterThanOrEqual(0);
  expect(sortBox!.x + sortBox!.width).toBeLessThanOrEqual(viewport!.width);
});

import { type Locator } from '@playwright/test';
import { expect, openDashboard, test } from './support/fixtures';

async function height(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => element.getBoundingClientRect().height);
}

test('renders shared desktop actions at the measured compact admin size', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  const save = page.getByRole('button', { name: 'Entwurf speichern', exact: true });
  expect(await height(save)).toBe(28);
  await expect(save).toHaveCSS('font-size', '13px');
  await expect(save).toHaveCSS('line-height', '16px');
  const editCosts = page.getByRole('button', { name: 'Kosten bearbeiten', exact: true });
  expect(await height(editCosts)).toBe(28);
  expect(await editCosts.evaluate((element) => element.getBoundingClientRect().width)).toBe(28);
});

test('retains generous shared-button targets on touch devices', async ({ browser, workspace }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    storageState: 'e2e/.auth/session.json',
  });
  const page = await context.newPage();
  await page.addInitScript((id) => {
    localStorage.setItem('flipbase_active_workspace_id', id);
  }, workspace.id);
  try {
    await openDashboard(page);
    await page.goto('/purchases/new');
    expect(
      await height(page.getByRole('button', { name: 'Entwurf speichern', exact: true })),
    ).toBeGreaterThanOrEqual(44);
    const editCosts = page.getByRole('button', { name: 'Kosten bearbeiten', exact: true });
    expect(await height(editCosts)).toBeGreaterThanOrEqual(44);
    expect(
      await editCosts.evaluate((element) => element.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(44);
  } finally {
    await context.close();
  }
});

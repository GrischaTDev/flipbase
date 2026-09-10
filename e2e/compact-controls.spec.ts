import { expect, test, type Locator } from '@playwright/test';
import { startDemoMode } from './support/demo';

async function height(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => element.getBoundingClientRect().height);
}

test('renders shared desktop actions at the measured compact admin size', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/new');
  const save = page.getByRole('button', { name: 'Entwurf speichern', exact: true });
  expect(await height(save)).toBe(28);
  await expect(save).toHaveCSS('font-size', '13px');
  await expect(save).toHaveCSS('line-height', '16px');
  const editCosts = page.getByRole('button', { name: 'Kosten bearbeiten', exact: true });
  expect(await height(editCosts)).toBe(28);
  expect(await editCosts.evaluate((element) => element.getBoundingClientRect().width)).toBe(28);
});

test('keeps the timeline composer compact while allowing multiline drafts', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases/pur-demo-2');
  const timeline = page.getByRole('region', { name: 'Chronik', exact: true });
  const composer = timeline.getByLabel('Kommentar schreiben');
  expect(await height(composer)).toBe(32);
  expect(await height(composer.locator('..').locator('..'))).toBeLessThanOrEqual(104);
  const post = timeline.getByRole('button', { name: 'Posten', exact: true });
  expect(await height(post)).toBe(28);
  await expect(post).toBeDisabled();
  await composer.fill('Erste Zeile\nZweite Zeile');
  await expect(post).toBeEnabled();
  await expect(post).toHaveCSS('background-color', 'rgb(252, 198, 1)');
  await expect(composer).toHaveValue('Erste Zeile\nZweite Zeile');
});

test('retains generous shared-button targets on touch devices', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await startDemoMode(page);
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

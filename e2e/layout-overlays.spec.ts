import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('hält den Warenkorbinhalt innerhalb des bedienbaren Dialogs', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/shop');
  await page.getByRole('button', { name: 'Warenkorb', exact: true }).click();
  const cart = page.getByRole('dialog', { name: 'Warenkorb' });
  await expect(cart.getByRole('heading', { name: 'Dein Warenkorb', exact: true })).toBeVisible();
  await cart.locator('button').first().click();
  await expect(cart).toBeHidden();
});

test('sperrt den Header auch bei der Flohmarkt-Schnellerfassung', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/purchases');
  await page.getByRole('button', { name: 'Flohmarkt-Schnellerfassung' }).click();
  const dialog = page.getByRole('dialog', { name: 'Flohmarkt-Schnellerfassung' });
  await expect(dialog).toBeVisible();
  expect(await page.locator('app-header').evaluate((el) => !!el.closest('[inert]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('hält die Kopfzeile auch auf schmalen Bildschirmen im sichtbaren Bereich', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await startDemoMode(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const controls = page.locator('app-header header button:visible');
    for (const control of await controls.all()) {
      const bounds = await control.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
  }
});

test('deckt beim Verkauf den Header ab und sperrt den Hintergrund bis zum Schließen', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/inventory');
  await page
    .getByRole('button', { name: 'Super Nintendo SNES Original Controller verkaufen' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Verkauf erfassen' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => !!document.elementFromPoint(500, 20)?.closest('[appModalDialog]')),
    )
    .toBe(true);
  const header = page.locator('app-header');
  expect(await header.evaluate((el) => !!el.closest('[inert]'))).toBe(true);
  await page
    .locator('app-header button')
    .last()
    .evaluate((el) => el.focus());
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await header.evaluate((el) => !!el.closest('[inert]'))).toBe(false);
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveClass(
    /text-fb-text-primary/,
  );
});

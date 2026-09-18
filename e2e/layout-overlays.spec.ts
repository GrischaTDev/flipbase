import { expect, openDashboard, test } from './support/fixtures';

test('hält den Warenkorbinhalt innerhalb des bedienbaren Dialogs', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/shop');
  await page.getByRole('button', { name: 'Warenkorb', exact: true }).click();
  const cart = page.getByRole('dialog', { name: 'Warenkorb' });
  await expect(cart.getByRole('heading', { name: 'Dein Warenkorb', exact: true })).toBeVisible();
  await cart.locator('button').first().click();
  await expect(cart).toBeHidden();
});

test('zeigt den regulären Einkaufseinstieg ohne Schnellerfassung', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases');
  await expect(page.getByRole('button', { name: 'Flohmarkt-Schnellerfassung' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Neuer Einkauf', exact: true }).first(),
  ).toBeVisible();
});

test('hält die Kopfzeile auch auf schmalen Bildschirmen im sichtbaren Bereich', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openDashboard(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    // Gegen den verfügbaren Platz gemessen, nicht gegen die Fensterbreite:
    // WebKit nimmt sich für die Bildlaufleiste sechs Pixel, was sonst wie ein
    // seitlicher Überlauf aussieht.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
    const controls = page.locator(
      'app-header header button:visible, [aria-label="Zeitraum wählen"] button, #dashboard-platform',
    );
    for (const control of await controls.all()) {
      const bounds = await control.boundingBox();
      expect(bounds).not.toBeNull();
      if (!bounds) throw new Error('Sichtbares Steuerelement ohne messbare Fläche.');
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    if (width === 320 || width === 768) {
      await page.locator('app-sidebar').evaluate(async (sidebar) => {
        await Promise.all(
          sidebar
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      await page.screenshot({ path: testInfo.outputPath(`dashboard-controls-${width}.png`) });
    }
  }
});

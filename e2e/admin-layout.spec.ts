import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('nutzt breite Bildschirme für Datenansichten ohne seitlichen Seitenüberlauf', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1080 });
  await startDemoMode(page);
  for (const route of ['/dashboard', '/purchases', '/inventory', '/sales']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const bounds = await page.locator('#hauptinhalt').boundingBox();
    expect(bounds!.width).toBeGreaterThan(2200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(2560);
  }
});

// Eine Prüfung je Breite statt aller fünf in einem Test: Zwanzig Seitenaufrufe
// hintereinander sprengen in Firefox das 30-Sekunden-Limit eines Tests, und
// beim Abbruch war nicht erkennbar, welche Breite klemmt. Getrennt läuft jede
// Breite in ihrem eigenen Zeitfenster und benennt sich im Fehlerfall selbst.
for (const width of [390, 768, 1024, 1100, 1280]) {
  test(`hält Datenansichten bei ${width}px im Fenster`, async ({ page }) => {
    await startDemoMode(page);
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/dashboard', '/purchases', '/inventory', '/sales']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `${route}: ${width}px`,
        })
        .toBe(width);
    }
  });
}

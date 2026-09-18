import { expect, openDashboard, test } from './support/fixtures';

/**
 * Wie viele Pixel die Seite breiter ist als der Platz, den sie hat. Null heißt:
 * kein seitlicher Überlauf.
 *
 * Bewusst gegen `clientWidth` und nicht gegen die eingestellte Fensterbreite:
 * WebKit blendet auf diesen Seiten eine klassische Bildlaufleiste ein und
 * nimmt damit sechs Pixel weg. Gegen die Fensterbreite gemessen sähe das wie
 * ein Layoutfehler aus, obwohl nichts seitlich hinausragt.
 */
const horizontalOverflow = () =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth;

test('nutzt breite Bildschirme für Datenansichten ohne seitlichen Seitenüberlauf', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1080 });
  await openDashboard(page);
  for (const route of ['/dashboard', '/purchases', '/inventory', '/sales']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    const bounds = await page.locator('#hauptinhalt').boundingBox();
    expect(bounds!.width).toBeGreaterThan(2200);
    expect(await page.evaluate(horizontalOverflow)).toBe(0);
  }
});

// Eine Prüfung je Breite statt aller fünf in einem Test: Zwanzig Seitenaufrufe
// hintereinander sprengen in Firefox das 30-Sekunden-Limit eines Tests, und
// beim Abbruch war nicht erkennbar, welche Breite klemmt. Getrennt läuft jede
// Breite in ihrem eigenen Zeitfenster und benennt sich im Fehlerfall selbst.
for (const width of [390, 768, 1024, 1100, 1280]) {
  test(`hält Datenansichten bei ${width}px im Fenster`, async ({ page }) => {
    await openDashboard(page);
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/dashboard', '/purchases', '/inventory', '/sales']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await expect
        .poll(() => page.evaluate(horizontalOverflow), {
          message: `${route}: ${width}px`,
        })
        .toBe(0);
    }
  });
}

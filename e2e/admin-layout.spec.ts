import { test as previewTest } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace } from './support/marketplace-account-fixture';
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

previewTest.describe('Einheitliche Seitenbreite', () => {
  previewTest.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

  for (const theme of ['light', 'dark'] as const) {
    previewTest(
      `wendet Layoutwahl, Seitenwechsel und gespeicherte Breite an ${theme} @core-smoke`,
      async ({ page }) => {
        await page.setViewportSize({ width: 2560, height: 1080 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await mockMarketplace(page);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.goto('/marketplaces/overview');
        const content = page.locator('[data-page-content]');
        await expect(page.locator('main h1')).toBeVisible();
        await expect(content).toHaveCSS('max-width', '1280px');
        expect((await content.boundingBox())!.width).toBe(1280);
        await page.getByRole('button', { name: 'Benutzermenü öffnen' }).click();
        const layout = page.getByRole('group', { name: 'Layout', exact: true });
        await expect(layout.getByRole('button', { name: 'Mittel', exact: true })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        await page.evaluate(axe.source);
        expect(
          await page.evaluate(
            async () =>
              (await (window as unknown as { axe: typeof axe }).axe.run('#header-user-menu'))
                .violations,
          ),
        ).toEqual([]);
        await layout.getByRole('button', { name: 'Schmal', exact: true }).click();
        await expect(content).toHaveCSS('max-width', '1024px');
        expect((await content.boundingBox())!.width).toBe(1024);
        await page.keyboard.press('Escape');
        await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
        await expect(page).toHaveURL(/\/dashboard$/);
        await expect(content).toHaveCSS('max-width', '1024px');
        await page.reload();
        await expect(content).toHaveCSS('max-width', '1024px');
        await page.getByRole('button', { name: 'Benutzermenü öffnen' }).click();
        await layout.getByRole('button', { name: 'Mittel', exact: true }).click();
        await expect(content).toHaveCSS('max-width', 'none');
        expect((await content.boundingBox())!.width).toBeGreaterThan(2200);
        await page.keyboard.press('Escape');
        await page.goto('/marketplaces/overview');
        await expect(content).toHaveCSS('max-width', '1280px');
        await page.getByRole('button', { name: 'Benutzermenü öffnen' }).click();
        await layout.getByRole('button', { name: 'Volle Breite', exact: true }).click();
        await expect(content).toHaveCSS('max-width', 'none');
        expect((await content.boundingBox())!.width).toBeGreaterThan(2200);
        const overview = content.locator('app-marketplace-overview > div');
        expect((await overview.boundingBox())!.width).toBeGreaterThan(2200);
        await page.keyboard.press('Escape');
        expect(await page.evaluate(horizontalOverflow)).toBe(0);
      },
    );
  }

  previewTest(
    'hält alle Vinted-Seiten sowie Ausgaben, Steuern und Auswertungen im gemeinsamen Rahmen @core-smoke',
    async ({ page }) => {
      await page.setViewportSize({ width: 2560, height: 1080 });
      await mockMarketplace(page);
      for (const route of [
        '/marketplaces/vinted/accounts',
        '/vinted-bot',
        '/vinted-bot/filters',
        '/vinted-bot/favorites',
        '/marketplaces/ebay/listings',
        '/expenses',
        '/accounting',
        '/analytics',
      ]) {
        await page.goto(route);
        await expect(page).toHaveURL(new RegExp(route.replaceAll('/', '\\/') + '$'));
        await expect(page.locator('main h1').first()).toBeVisible();
        const content = page.locator('[data-page-content]');
        await expect(content).toHaveCSS('max-width', '1280px');
        expect((await content.boundingBox())!.width).toBe(1280);
        expect(await page.evaluate(horizontalOverflow)).toBe(0);
      }
      for (const route of ['/dashboard', '/purchases', '/catalog?view=stock', '/sales']) {
        await page.goto(route);
        await expect(page.locator('main h1').first()).toBeVisible();
        const content = page.locator('[data-page-content]');
        await expect(content).toHaveCSS('max-width', 'none');
        expect((await content.boundingBox())!.width).toBeGreaterThan(2200);
        expect(await page.evaluate(horizontalOverflow)).toBe(0);
      }
    },
  );

  for (const width of [320, 390, 768]) {
    previewTest(
      `bleibt bei ${width}px per Touch bedienbar und ohne Überlauf @core-smoke`,
      async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width, height: width === 768 ? 390 : 900 },
          hasTouch: true,
          storageState: { cookies: [], origins: [] },
          serviceWorkers: 'block',
        });
        const page = await context.newPage();
        try {
          await mockMarketplace(page);
          await page.goto('/marketplaces/overview');
          await expect(page.locator('main h1')).toBeVisible();
          await page.getByRole('button', { name: 'Benutzermenü öffnen' }).tap();
          const layout = page.getByRole('group', { name: 'Layout', exact: true });
          for (const name of ['Schmal', 'Volle Breite', 'Mittel']) {
            const button = layout.getByRole('button', { name, exact: true });
            await expect
              .poll(async () => (await button.boundingBox())!.height)
              .toBeGreaterThanOrEqual(44);
            await button.tap();
            await expect(button).toHaveAttribute('aria-pressed', 'true');
            expect(await page.evaluate(horizontalOverflow)).toBe(0);
          }
        } finally {
          await context.close();
        }
      },
    );
  }
});

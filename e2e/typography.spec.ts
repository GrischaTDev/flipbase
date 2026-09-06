import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('lädt Inter lokal auch für Bedienelemente und Kennzahlen', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontRequests.push(request.url());
  });
  await startDemoMode(page);
  const loaded = await page.evaluate(async () => {
    const faces = await document.fonts.load('450 13px Inter', 'ÄÖÜäöüß €');
    return faces.length;
  });
  expect(loaded).toBeGreaterThan(0);
  // Dieselbe Schriftliste, unterschiedlich geschrieben: Jede Engine setzt die
  // Anführungszeichen um Schriftnamen nach eigener Regel. Firefox meldet
  // `"Inter", …`, Chromium und WebKit `Inter, …`; bei `JetBrains Mono` quotet
  // Chromium, WebKit nicht. Das sagt nichts über die Seite aus, deshalb sind
  // die Anführungszeichen unten überall freigestellt.
  await expect(page.locator('body')).toHaveCSS('font-family', /^"?Inter"?,/);
  await expect(page.getByRole('combobox', { name: 'Plattform filtern' })).toHaveCSS(
    'font-family',
    /^"?Inter"?,/,
  );
  await expect(page.locator('.font-mono').first()).toHaveCSS('font-family', /^"?JetBrains Mono"?,/);
  expect(fontRequests.some((url) => url.endsWith('/fonts/inter-variable-4.1.woff2'))).toBe(true);
  expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(
    true,
  );
});

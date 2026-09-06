import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('setzt Inter als globale Anwendungsschrift', async ({ page }) => {
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
  await expect(page.locator('.font-mono').first()).toHaveCSS('font-family', /^"?Inter"?,/);

  for (const route of [
    '/dashboard',
    '/sales',
    '/purchases',
    '/inventory',
    '/catalog',
    '/accounting',
  ]) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    const nonInterElements = await page.evaluate(() => {
      const isVisible = (element: HTMLElement): boolean => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      return Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((element) => element.textContent?.trim() && isVisible(element))
        .map((element) => ({
          element: element.tagName.toLowerCase(),
          fontFamily: getComputedStyle(element).fontFamily,
        }))
        .filter(({ fontFamily }) => !/^"?Inter"?,/.test(fontFamily));
    });
    expect(nonInterElements, `Nicht-Inter-Elemente auf ${route}`).toEqual([]);
  }

  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.dataset.typographyFixture = 'true';
    fixture.innerHTML = '<code>code</code><pre>pre</pre><kbd>kbd</kbd><samp>samp</samp>';
    document.body.append(fixture);
  });
  const nativeTextElements = page.locator('[data-typography-fixture] :is(code, pre, kbd, samp)');
  await expect(nativeTextElements).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(nativeTextElements.nth(index)).toHaveCSS('font-family', /^"?Inter"?,/);
  }
  expect(fontRequests.some((url) => url.endsWith('/fonts/inter-variable-4.1.woff2'))).toBe(true);
  expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(
    true,
  );
});

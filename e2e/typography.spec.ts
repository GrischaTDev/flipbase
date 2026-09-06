import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('verwendet Inter lokal in allen sichtbaren Anwendungselementen', async ({ page }) => {
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
  await expect(page.locator('body')).toHaveCSS('font-family', /^Inter,/);
  await expect(page.getByRole('combobox', { name: 'Plattform filtern' })).toHaveCSS(
    'font-family',
    /^Inter,/,
  );
  await expect(page.locator('.font-mono').first()).toHaveCSS('font-family', /^Inter,/);

  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.dataset.typographyFixture = 'true';
    fixture.innerHTML = '<code>code</code><pre>pre</pre><kbd>kbd</kbd><samp>samp</samp>';
    document.body.append(fixture);
  });
  const nativeTextElements = page.locator('[data-typography-fixture] :is(code, pre, kbd, samp)');
  await expect(nativeTextElements).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(nativeTextElements.nth(index)).toHaveCSS('font-family', /^Inter,/);
  }
  expect(fontRequests.some((url) => url.endsWith('/fonts/inter-variable-4.1.woff2'))).toBe(true);
  expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(
    true,
  );
});

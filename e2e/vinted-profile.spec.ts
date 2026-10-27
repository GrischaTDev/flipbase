import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockMarketplace } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
for (const width of [1440, 390, 320]) {
  const profileTest = test.extend({ hasTouch: width < 768, isMobile: width < 768 });
  for (const theme of ['light', 'dark']) {
    profileTest(
      `bearbeitet Vinted-Profil mit echter Stadtauswahl ${width}px ${theme} @marketplace-preview @core-smoke`,
      async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await mockMarketplace(page, true, false, false, false, []);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        const original = {
          about: 'Mein Vintage-Shop',
          city: 'Berlin',
          showCity: true,
          language: 'de-DE',
          country: 'Deutschland',
          imageUrl: null,
          languages: [
            { id: 'de-DE', label: 'Deutsch (German)' },
            { id: 'en-DE', label: 'English (English)' },
          ],
          canUploadPhoto: true,
        };
        const withPhoto = width === 1440 && theme === 'light';
        let writes = 0;
        await page.route('**/marketplace-browser/profile/details/read', (route) =>
          route.fulfill({ json: { profile: original } }),
        );
        await page.route('**/marketplace-browser/profile/cities/read', (route) =>
          route.fulfill({ json: { cities: [{ id: '796', label: 'Hamburg' }] } }),
        );
        await page.route('**/marketplace-browser/profile/details/save', async (route) => {
          const body = route.request().postDataJSON();
          expect(body.expected).toEqual(original);
          expect(body.changes).toMatchObject({
            about: 'Vintage aus Hamburg',
            city: 'Hamburg',
            cityId: '796',
            showCity: false,
            language: withPhoto ? 'en-DE' : 'de-DE',
          });
          if (withPhoto) {
            expect(body.changes.photo.mimeType).toBe('image/jpeg');
            expect(Buffer.from(body.changes.photo.base64, 'base64').length).toBeLessThanOrEqual(
              256 * 1024,
            );
          }
          writes++;
          await route.fulfill({
            json: {
              status: 'confirmed',
              profile: {
                ...original,
                about: body.changes.about,
                city: 'Hamburg',
                showCity: false,
                language: body.changes.language,
                imageUrl: withPhoto
                  ? 'https://images1.vinted.net/t/fixture/50x50/profile.jpg'
                  : null,
              },
            },
          });
        });
        await page.goto('/marketplaces/vinted/profile');
        await expect(page.locator('app-vinted-profile app-vinted-rating')).toHaveCount(0);
        await expect(page.locator('app-vinted-profile app-summary-metric')).toHaveCount(3);
        await page.getByRole('button', { name: 'Profil bearbeiten', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Profil bearbeiten', exact: true });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole('textbox', { name: 'Über dieses Konto', exact: true }),
        ).toHaveValue(original.about);
        await checkSurface(page, 'app-vinted-profile-editor');
        await screenshot(page, `vinted-profile-editor-${width}-${theme}`);
        if (withPhoto) {
          const image = await page.screenshot({
            type: 'jpeg',
            clip: { x: 0, y: 0, width: 40, height: 40 },
          });
          await dialog
            .locator('input[type="file"]')
            .setInputFiles({ name: 'profile.jpg', mimeType: 'image/jpeg', buffer: image });
          await expect(dialog.locator('img[src^="data:image/jpeg;base64,"]')).toBeVisible();
          await dialog.getByRole('combobox', { name: 'Vinted-Sprache', exact: true }).click();
          await dialog.getByRole('option', { name: 'English (English)', exact: true }).click();
        }
        await dialog
          .getByRole('textbox', { name: 'Über dieses Konto', exact: true })
          .fill('Vintage aus Hamburg');
        await dialog
          .getByRole('textbox', { name: 'Andere Stadt suchen', exact: true })
          .fill('Hamburg');
        await dialog.getByRole('button', { name: 'Suchen', exact: true }).click();
        await dialog.getByRole('combobox', { name: 'Neue Stadt', exact: true }).click();
        await dialog.getByRole('option', { name: 'Hamburg', exact: true }).click();
        const visibility = dialog.getByRole('checkbox', {
          name: 'Stadt im Profil anzeigen',
          exact: true,
        });
        if (width < 768) await visibility.tap();
        else await visibility.click();
        await expect(visibility).toHaveAttribute('aria-checked', 'false');
        await dialog.getByRole('button', { name: 'Profil speichern', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByText('Dein Profil wurde bei Vinted gespeichert.', { exact: true }),
        ).toBeVisible();
        await expect(page.locator('app-vinted-profile')).toContainText('Vintage aus Hamburg');
        expect(writes).toBe(1);
      },
    );
  }
}

async function checkSurface(page: Page, selector: string) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error('Geprüfte Oberfläche fehlt');
    return (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations;
  }, selector);
  expect(violations).toEqual([]);
  const overflow = await page.evaluate(() => {
    if (document.documentElement.scrollWidth <= innerWidth) return null;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > innerWidth + 0.5) {
        offenders.push(
          `${el.tagName}.${el.className} [right=${rect.right.toFixed(1)}, width=${rect.width.toFixed(1)}]`,
        );
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      offenders: offenders.slice(0, 15),
    };
  });
  expect(overflow).toBeNull();
}

async function screenshot(page: Page, name: string) {
  const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page
    .getByRole('dialog', { name: 'Profil bearbeiten', exact: true })
    .screenshot({ path: join(directory, `${name}.png`) });
}

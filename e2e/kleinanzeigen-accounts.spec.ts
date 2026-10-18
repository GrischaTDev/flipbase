import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mockKleinanzeigen } from './support/kleinanzeigen-fixture';
test.use({ hasTouch: true, storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
for (const theme of ['light', 'dark'] as const)
  for (const width of [320, 390, 834, 1440])
    test(
      'Kleinanzeigen-Konten bleiben bei ' +
        width +
        'px im ' +
        theme +
        '-Theme bedienbar @core-smoke',
      async ({ page }, testInfo) => {
        await mockKleinanzeigen(page);
        const runtimeErrors: string[] = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') runtimeErrors.push(message.text());
        });
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/marketplaces/kleinanzeigen');
        await page.evaluate(
          (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
          theme,
        );
        await expect(
          page.getByRole('heading', { name: 'Deine Kleinanzeigen-Konten', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Konto hinzufügen', exact: true }),
        ).toBeVisible();
        await expect(page.getByText('Browserprofil verbinden', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Gespeicherte Inserate', { exact: true })).toHaveCount(0);
        const listings = page.locator('app-marketplace-listing-section').filter({
          has: page.getByRole('heading', { name: 'Kleinanzeigen Testkonto A', exact: true }),
        });
        await expect(listings.getByText('26 Inserate', { exact: true })).toBeVisible();
        const settings = listings.getByRole('button', {
          name: 'Konto Kleinanzeigen Testkonto A verwalten',
          exact: true,
        });
        await settings.tap();
        const accountDialog = page.getByRole('dialog', {
          name: 'Konto Kleinanzeigen Testkonto A verwalten',
          exact: true,
        });
        await expect(
          accountDialog.getByText('8 von 100 Anzeigen in 30 Tagen beobachtet', { exact: true }),
        ).toBeVisible();
        await expect(
          accountDialog.getByRole('button', { name: 'Konto entfernen', exact: true }),
        ).toBeVisible();
        await page.evaluate(axe.source);
        expect(
          await accountDialog.evaluate(
            async (element) =>
              (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
          ),
        ).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(accountDialog).toHaveCount(0);
        await expect(settings).toBeFocused();
        await listings
          .getByRole('button', { name: 'Inserate von Kleinanzeigen Testkonto A anzeigen' })
          .tap();
        const checkbox = listings.getByRole('checkbox', {
          name: 'KA Jacke 01 auswählen',
          exact: true,
        });
        await expect(checkbox).toBeVisible();
        await checkbox.focus();
        await page.keyboard.press('Space');
        await expect(listings.getByText('1 ausgewählt', { exact: true })).toBeVisible();
        await expect(
          listings.getByRole('link', {
            name: 'KA Jacke 01 auf Kleinanzeigen ansehen',
            exact: true,
          }),
        ).toHaveAttribute('href', 'https://www.kleinanzeigen.de/s-anzeige/test/101-160-1');
        await listings.getByRole('button', { name: 'Weiter', exact: true }).tap();
        await expect(
          listings.getByRole('checkbox', { name: 'KA Jacke 26 auswählen', exact: true }),
        ).toBeVisible();
        await expect(listings.getByText('0 ausgewählt', { exact: true })).toBeVisible();
        await listings
          .getByRole('searchbox', { name: 'Inserate von Kleinanzeigen Testkonto A durchsuchen' })
          .fill('Jacke 17');
        await expect(
          listings.getByRole('checkbox', { name: 'KA Jacke 17 auswählen', exact: true }),
        ).toBeVisible();
        await expect(listings.getByText(/1 von 1/)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(axe.source);
        expect(
          await page
            .locator('app-kleinanzeigen-workspace')
            .evaluate(
              async (element) =>
                (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
            ),
        ).toEqual([]);
        expect(runtimeErrors).toEqual([]);
        if ((width === 1440 || width === 390) && theme === 'light')
          await page.screenshot({
            path: testInfo.outputPath('kleinanzeigen-accounts.png'),
            fullPage: true,
            animations: 'disabled',
          });
      },
    );
test('Ein unterbrochener Kleinanzeigen-Abgleich erhält den bestätigten Bestand @core-smoke', async ({
  page,
}) => {
  await mockKleinanzeigen(page, { syncFailure: true });
  await page.goto('/marketplaces/kleinanzeigen');
  await page
    .getByRole('button', { name: 'Konto Kleinanzeigen Testkonto A verwalten', exact: true })
    .click();
  const account = page.getByRole('dialog', {
    name: 'Konto Kleinanzeigen Testkonto A verwalten',
    exact: true,
  });
  await account.getByRole('button', { name: 'Inserate abgleichen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Der Abgleich wurde unterbrochen.');
  await expect(account.getByText('26 Inserate', { exact: true })).toBeVisible();
});
test('Kleinanzeigen-Konto entfernen gibt das Profil frei und bleibt nach Neuladen entfernt @core-smoke', async ({
  page,
}) => {
  const fixture = await mockKleinanzeigen(page);
  await page.goto('/marketplaces/kleinanzeigen');
  await page
    .getByRole('button', { name: 'Konto Kleinanzeigen Testkonto A verwalten', exact: true })
    .click();
  const management = page.getByRole('dialog', {
    name: 'Konto Kleinanzeigen Testkonto A verwalten',
    exact: true,
  });
  await management.getByRole('button', { name: 'Konto entfernen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Konto entfernen', exact: true });
  await expect(dialog).toContainText(
    'Deine Anzeigen und dein Konto auf Kleinanzeigen bleiben erhalten.',
  );
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.requests.filter((body) => body['action'] === 'disconnect')).toEqual([]);
  await management.getByRole('button', { name: 'Konto entfernen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Konto entfernen', exact: true }).click();
  await expect(management).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Kleinanzeigen Testkonto A', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Kleinanzeigen Testkonto B', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Kleinanzeigen-Konto hinzufügen', exact: true });
  await expect(
    setup.getByRole('button', { name: 'Angemeldetes Konto verbinden', exact: true }),
  ).toBeEnabled();
  await setup.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Deine Kleinanzeigen-Konten', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Kleinanzeigen Testkonto A', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
  const reopenedSetup = page.getByRole('dialog', {
    name: 'Kleinanzeigen-Konto hinzufügen',
    exact: true,
  });
  await reopenedSetup.getByRole('button', { name: 'Konto entfernen', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Konto entfernen', exact: true })
    .getByRole('button', { name: 'Konto entfernen', exact: true })
    .click();
  await expect(
    reopenedSetup.getByRole('button', { name: 'Angemeldetes Konto verbinden', exact: true }),
  ).toBeEnabled();
  expect(
    fixture.requests
      .filter((body) => body['action'] === 'disconnect')
      .map((body) => body['connectionId']),
  ).toEqual([fixture.connectionId, fixture.connectionId]);
});

test('Kleinanzeigen ohne passende Erweiterung bietet keinen Abgleich an @core-smoke', async ({
  page,
}) => {
  await mockKleinanzeigen(page, { available: false });
  await page.goto('/marketplaces/kleinanzeigen');
  await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Kleinanzeigen-Konto hinzufügen', exact: true });
  await expect(
    setup.getByRole('button', { name: 'Angemeldetes Konto verbinden', exact: true }),
  ).toBeDisabled();
  await setup.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page
    .getByRole('button', { name: 'Konto Kleinanzeigen Testkonto A verwalten', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog', { name: 'Konto Kleinanzeigen Testkonto A verwalten', exact: true })
      .getByRole('button', { name: 'Inserate abgleichen', exact: true }),
  ).toBeDisabled();
});

test('Desktop- und Touch-Buttons bleiben bei gleicher Breite getrennt @core-smoke', async ({
  browser,
}, testInfo) => {
  for (const width of [834, 1440]) {
    for (const hasTouch of [false, true]) {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width, height: 1000 },
        hasTouch,
        storageState: { cookies: [], origins: [] },
        serviceWorkers: 'block',
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        await mockKleinanzeigen(page);
        await page.goto('/marketplaces/kleinanzeigen');
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(hasTouch);
        const add = page.getByRole('button', { name: 'Konto hinzufügen', exact: true });
        const list = page.getByRole('button', {
          name: 'Inserate von Kleinanzeigen Testkonto A anzeigen',
          exact: true,
        });
        const settings = page.getByRole('button', {
          name: 'Konto Kleinanzeigen Testkonto A verwalten',
          exact: true,
        });
        for (const button of [add, list, settings]) {
          await expect(button).toBeVisible();
          const height = await button.evaluate((element) => element.getBoundingClientRect().height);
          expect(height).toBe(hasTouch ? 44 : 28);
          await expect(button).toHaveCSS('font-size', '13px');
        }
        expect(await settings.evaluate((element) => element.getBoundingClientRect().width)).toBe(
          hasTouch ? 44 : 28,
        );
        if (width === 1440)
          await page.screenshot({
            path: testInfo.outputPath(
              hasTouch ? 'kleinanzeigen-touch-1440.png' : 'kleinanzeigen-mouse-1440.png',
            ),
            animations: 'disabled',
          });
      } finally {
        await context.close();
      }
    }
  }
});

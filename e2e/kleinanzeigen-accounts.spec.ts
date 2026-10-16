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
        const account = page.getByRole('article', {
          name: 'Kleinanzeigen-Konto Kleinanzeigen Testkonto A',
          exact: true,
        });
        await expect(account.getByText('26 gespeicherte Inserate', { exact: true })).toBeVisible();
        await expect(
          account.getByText('8 von 100 Anzeigen in 30 Tagen beobachtet', { exact: true }),
        ).toBeVisible();
        const listings = page.locator('app-marketplace-listing-section').filter({
          has: page.getByRole('heading', { name: 'Kleinanzeigen Testkonto A', exact: true }),
        });
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
        if (width === 1440 && theme === 'light')
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
  const account = page.getByRole('article', {
    name: 'Kleinanzeigen-Konto Kleinanzeigen Testkonto A',
    exact: true,
  });
  await account.getByRole('button', { name: 'Inserate abgleichen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Der Abgleich wurde unterbrochen.');
  await expect(account.getByText('26 gespeicherte Inserate', { exact: true })).toBeVisible();
});
test('Kleinanzeigen-Verbindung wird gezielt widerrufen und behält gespeicherte Inserate @core-smoke', async ({
  page,
}) => {
  const fixture = await mockKleinanzeigen(page);
  await page.goto('/marketplaces/kleinanzeigen');
  const account = page.getByRole('article', {
    name: 'Kleinanzeigen-Konto Kleinanzeigen Testkonto A',
    exact: true,
  });
  await account.getByRole('button', { name: 'Verbindung trennen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kontoverbindung trennen' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Verbindung trennen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(account.getByText('Nicht verbunden', { exact: true })).toBeVisible();
  await expect(account.getByText('26 gespeicherte Inserate', { exact: true })).toBeVisible();
  expect(
    fixture.requests
      .filter((body) => body['action'] === 'disconnect')
      .map((body) => body['connectionId']),
  ).toEqual([fixture.connectionId]);
});
test('Kleinanzeigen ohne passende Erweiterung bietet keinen Abgleich an @core-smoke', async ({
  page,
}) => {
  await mockKleinanzeigen(page, { available: false });
  await page.goto('/marketplaces/kleinanzeigen');
  await expect(
    page.getByRole('button', { name: 'Angemeldetes Konto verbinden', exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole('article', { name: 'Kleinanzeigen-Konto Kleinanzeigen Testkonto A', exact: true })
      .getByRole('button', { name: 'Inserate abgleichen', exact: true }),
  ).toBeDisabled();
});

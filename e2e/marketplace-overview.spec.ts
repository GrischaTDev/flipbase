import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplaceOverview } from './support/marketplace-overview-fixture';

test.use({ hasTouch: true, storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const theme of ['light', 'dark'] as const)
  for (const width of [320, 390, 834, 1440]) {
    test(
      'Marktplatzübersicht bleibt bei ' + width + 'px im ' + theme + '-Theme bedienbar @core-smoke',
      async ({ page }, testInfo) => {
        await mockMarketplaceOverview(page);
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/marketplaces/overview');
        await page.evaluate(
          (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
          theme,
        );
        await expect(
          page.getByRole('heading', { name: 'Marktplatzübersicht', exact: true }),
        ).toBeVisible();
        const vinted = page
          .locator('app-marketplace-listing-section')
          .filter({ has: page.getByRole('heading', { name: 'Testkonto A', exact: true }) });
        await vinted.getByRole('button', { name: 'Inserate von Testkonto A anzeigen' }).tap();
        await expect(
          vinted.getByRole('checkbox', { name: 'A Jacke 01 auswählen', exact: true }),
        ).toBeVisible();
        await expect(vinted.locator('app-vinted-listing-age:visible').first()).toContainText('2 T');
        const checkbox = vinted.getByRole('checkbox', {
          name: 'A Jacke 01 auswählen',
          exact: true,
        });
        await checkbox.focus();
        await page.keyboard.press('Space');
        await expect(vinted.getByText('1 ausgewählt', { exact: true })).toBeVisible();
        await vinted.getByRole('button', { name: 'Weiter', exact: true }).click();
        await expect(
          vinted.getByRole('checkbox', { name: 'A Jacke 26 auswählen', exact: true }),
        ).toBeVisible();
        await expect(vinted.getByText('0 ausgewählt', { exact: true })).toBeVisible();
        await vinted.getByRole('button', { name: 'Zurück', exact: true }).click();
        await expect(
          vinted.getByRole('checkbox', { name: 'A Jacke 01 auswählen', exact: true }),
        ).not.toBeChecked();
        await vinted
          .getByRole('searchbox', { name: 'Inserate von Testkonto A durchsuchen' })
          .fill('Jacke 59');
        await expect(
          vinted.getByRole('checkbox', { name: 'A Jacke 59 auswählen', exact: true }),
        ).toBeVisible();
        await expect(vinted.getByText(/1 von 1/)).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.evaluate(axe.source);
        expect(
          await page
            .locator('app-marketplace-overview')
            .evaluate(
              async (element) =>
                (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
            ),
        ).toEqual([]);
        if (width === 1440 && theme === 'light') {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: testInfo.outputPath('overview.png'),
            fullPage: true,
            animations: 'disabled',
          });
        }
      },
    );
  }

test('Sichtbarkeit bleibt nach Neuladen erhalten und Accountauswahl trennt Listen @core-smoke', async ({
  page,
}) => {
  const { requests } = await mockMarketplaceOverview(page);
  await page.goto('/marketplaces/overview');
  await page.getByRole('button', { name: 'Inserate von Testkonto A anzeigen' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'A Jacke 01 auswählen', exact: true }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: 'A Jacke 01 auswählen', exact: true }).click();
  await page.getByRole('combobox', { name: 'Vinted-Account auswählen' }).click();
  await page.getByRole('option', { name: 'Testkonto B', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Testkonto A', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inserate von Testkonto B anzeigen' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'B Jacke 01 auswählen', exact: true }),
  ).not.toBeChecked();
  expect(requests.length).toBe(2);
  await page.getByRole('button', { name: 'Marktplätze verwalten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Marktplätze verwalten' });
  await dialog.getByRole('checkbox', { name: /Kleinanzeigen/ }).click();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Kleinanzeigen', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vinted', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kleinanzeigen', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Inserat erstellen', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Auf Vinted inserieren' })).toHaveAttribute(
    'href',
    '/marketplaces/vinted/listings/new',
  );
  await expect(page.getByRole('link', { name: 'Kleinanzeigen-Entwurf erstellen' })).toHaveCount(0);
});

test('Ein Vinted-Ausfall erhält die eBay-Inserate und bietet keine fremden Filter an @core-smoke', async ({
  page,
}) => {
  await mockMarketplaceOverview(page, { vintedFailure: true });
  await page.goto('/marketplaces/overview');
  await expect(
    page.getByRole('region', { name: 'Vinted', exact: true }).getByRole('alert'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inserate von eBay-Testkonto anzeigen' }).click();
  await expect(
    page.getByRole('checkbox', { name: 'eBay Hemd 01 auswählen', exact: true }),
  ).toBeVisible();
  const account = page.locator('app-marketplace-listing-section');
  await expect(account.getByRole('searchbox')).toHaveCount(0);
  await expect(account.getByRole('combobox')).toHaveCount(0);
  await expect(account.getByText('30 aktive Inserate', { exact: true })).toBeVisible();
  await expect(
    account.getByRole('link', { name: 'eBay Hemd 01 auf eBay ansehen' }),
  ).toHaveAttribute('href', 'https://www.ebay.de/itm/2000');
  const checkbox = account.getByRole('checkbox', { name: 'eBay Hemd 01 auswählen', exact: true });
  await checkbox.click();
  await expect(account.getByText('1 ausgewählt', { exact: true })).toBeVisible();
  const retryResponse = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/marketplace_list_connections'),
  );
  await page
    .getByRole('region', { name: 'Vinted', exact: true })
    .getByRole('button', { name: 'Erneut versuchen', exact: true })
    .click();
  await retryResponse;
  await expect(checkbox).toBeChecked();
  await expect(account.getByText('1 ausgewählt', { exact: true })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const)
  for (const width of [320, 390, 834, 1440]) {
    test(
      'Workspacewechsel trennt Sichtbarkeit und Auswahl bei ' +
        width +
        'px im ' +
        theme +
        '-Theme @core-smoke',
      async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await mockMarketplaceOverview(page, { multipleWorkspaces: true });
        await page.goto('/marketplaces/overview');
        await page.evaluate(
          (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
          theme,
        );
        await page.getByRole('button', { name: 'Inserate von Testkonto A anzeigen' }).click();
        await expect(
          page.getByRole('checkbox', { name: 'A Jacke 01 auswählen', exact: true }),
        ).toBeVisible();
        await page.getByRole('checkbox', { name: 'A Jacke 01 auswählen', exact: true }).click();
        await expect(page.getByText('1 ausgewählt', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Marktplätze verwalten', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Marktplätze verwalten' });
        await page.evaluate(axe.source);
        expect(
          await dialog.evaluate(
            async (element) =>
              (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
          ),
        ).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await dialog.getByRole('checkbox', { name: /Kleinanzeigen/ }).tap();
        await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
        await expect(page.getByRole('heading', { name: 'Kleinanzeigen', exact: true })).toHaveCount(
          0,
        );
        await page
          .locator('app-header')
          .getByRole('button', { name: /Test-Workspace 1/ })
          .click();
        await page.getByRole('button', { name: 'Test-Workspace 2', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Kleinanzeigen', exact: true }),
        ).toBeVisible();
        await expect(page.getByText('1 ausgewählt', { exact: true })).toHaveCount(0);
        await page
          .locator('app-header')
          .getByRole('button', { name: /Test-Workspace 2/ })
          .click();
        await page.getByRole('button', { name: 'Test-Workspace 1', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Kleinanzeigen', exact: true })).toHaveCount(
          0,
        );
        await expect(
          page.getByRole('button', { name: 'Inserate von Testkonto A anzeigen' }),
        ).toBeVisible();
      },
    );
  }

test('Kontextnavigation führt aus Vinted und eBay zur Übersicht zurück @core-smoke', async ({
  page,
}) => {
  await mockMarketplaceOverview(page);
  for (const path of ['/marketplaces/vinted/accounts', '/marketplaces/ebay/connection']) {
    await page.goto(path);
    await page
      .locator('app-sidebar')
      .getByRole('link', { name: 'Alle Marktplätze', exact: true })
      .click();
    await expect(page).toHaveURL(/marketplaces\/overview$/);
    await expect(
      page.getByRole('heading', { name: 'Marktplatzübersicht', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Inserate von Testkonto A anzeigen' }),
    ).toBeVisible();
  }
});

test('Fehlende Vinted-Freigabe bietet keinen Erstellungseinstieg an @core-smoke', async ({
  page,
}) => {
  await mockMarketplaceOverview(page, { deniedVinted: true });
  await page.goto('/marketplaces/overview');
  await expect(
    page
      .getByRole('region', { name: 'Vinted', exact: true })
      .getByRole('heading', { name: 'Noch kein Account verbunden', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inserat erstellen', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Auf Vinted inserieren' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Kleinanzeigen-Entwurf erstellen' })).toBeVisible();
});

test('Marktplatzeinstellungen können einen fehlgeschlagenen Abruf erneut laden @core-smoke', async ({
  page,
}) => {
  await mockMarketplaceOverview(page);
  let reads = 0,
    unavailable = true;
  await page.route('**/rest/v1/marketplace_user_settings?**', (route) => {
    reads++;
    return unavailable
      ? route.fulfill({ status: 503, json: { message: 'offline' } })
      : route.fallback();
  });
  await page.goto('/settings/marketplaces');
  const settings = page.locator('app-marketplaces-settings');
  await expect(settings.getByRole('alert')).toBeVisible();
  await expect(settings.getByRole('checkbox', { name: /Kleinanzeigen/ })).toBeDisabled();
  unavailable = false;
  await settings.getByRole('button', { name: 'Erneut versuchen', exact: true }).click();
  await expect(settings.getByRole('checkbox', { name: /Kleinanzeigen/ })).toBeEnabled();
  await expect(settings.getByRole('alert')).toHaveCount(0);
  expect(reads).toBeGreaterThan(1);
});

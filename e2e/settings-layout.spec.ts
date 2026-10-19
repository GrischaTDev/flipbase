import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';
import { defaultNumberSeries } from '../src/app/features/settings/models/numbering.models';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

async function settingsBackend(page: Page) {
  await mockMarketplace(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      origin: process.env['PWA_TEST_BACKEND_ORIGIN'] ?? 'http://127.0.0.1:54351',
      userId: '25000000-0000-4000-8000-000000000001',
    },
  );
  await page.route('**/rest/v1/rpc/get_workspace_company_settings', (route) =>
    route.fulfill({
      json: {
        can_edit: true,
        tax_mode: 'diff_25a',
        profile: {
          workspace_id: workspaceId,
          company_name: 'Testladen',
          legal_name: 'Anna Beispiel',
          street: 'Testweg',
          house_number: '1',
          postal_code: '12345',
          city: 'Bonn',
          country_code: 'DE',
          created_at: '2026-10-01T12:00:00Z',
          updated_at: '2026-10-01T12:00:00Z',
        },
      },
    }),
  );
  await page.route('**/rest/v1/rpc/get_number_settings', (route) =>
    route.fulfill({
      json: {
        can_edit: true,
        timezone: 'Europe/Berlin',
        series: [defaultNumberSeries('purchase'), defaultNumberSeries('sale')],
      },
    }),
  );
  await page.route('**/functions/v1/push-settings', (route) =>
    route.fulfill({
      json: {
        enabled: false,
        publicKey: Buffer.alloc(65, 4).toString('base64url'),
        keyId: 'key1',
        binding: null,
        preferences: [],
        allowedCategories: ['message', 'order', 'favorite', 'connection'],
      },
    }),
  );
}

for (const width of [1280, 390, 1024]) {
  test(`settings use clear sections and accessible controls at ${width}px @pwa-layout`, async ({
    page,
  }, testInfo) => {
    await settingsBackend(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    for (const [path, heading, selector] of [
      ['account', 'Konto', 'app-account-settings'],
      ['company', 'Unternehmen', 'app-company-settings'],
      ['workspace', 'Workspace', 'app-workspace-settings'],
      ['numbering', 'Nummernkreise', 'app-numbering-settings'],
      ['team', 'Team & Rollen', 'app-team-settings'],
      ['marketplaces', 'Marktplätze', 'app-marketplaces-settings'],
      ['notifications', 'Benachrichtigungen', 'app-notification-settings'],
      ['store', 'Shop & Zahlungen', 'app-store-settings'],
      ['shipping', 'Versand', 'app-shipping-settings'],
    ]) {
      await page.goto(`/settings/${path}`);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      const feature = page.locator(selector);
      await expect(feature.locator('app-card').first()).toBeVisible();
      if (path === 'marketplaces') {
        await expect(
          feature.getByRole('link', { name: 'Konten und Inserate verwalten', exact: true }),
        ).toHaveAttribute('href', '/marketplaces/overview');
        await expect(feature.getByRole('link')).toHaveCount(1);
        for (const platform of ['Vinted', 'eBay', 'Kleinanzeigen']) {
          await expect(
            feature.getByRole('button', { name: platform, exact: true }),
          ).toHaveAttribute('aria-pressed', 'true');
        }
      }
      for (const theme of ['light', 'dark']) {
        await page.evaluate(
          (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
          theme,
        );
        await page.evaluate(async () =>
          Promise.allSettled(
            document
              .getAnimations()
              .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
              .map((animation) => animation.finished),
          ),
        );
        await page.evaluate(axe.source);
        const violations = await feature.evaluate(
          async (element) =>
            (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
        );
        expect(violations, `${path}, ${theme}, ${width}px`).toEqual([]);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          path,
        ).toBe(true);
      }
      if (width === 1280 && ['marketplaces', 'numbering', 'team'].includes(path))
        await page.screenshot({ path: testInfo.outputPath(`${path}.png`), animations: 'disabled' });
    }
    await page.goto('/settings/app');
    await expect(page).toHaveURL(/\/settings\/marketplaces$/);
    await expect(page.getByRole('link', { name: 'App & Geräte' })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

test('eBay uses compact account cards and opens connection management in a dialog @pwa-layout', async ({
  page,
}, testInfo) => {
  await settingsBackend(page);
  let connected = false;
  let connectRequests = 0;
  await page.route('**/functions/v1/ebay-account', (route) => {
    const action = route.request().postDataJSON().action as string;
    if (action === 'connect') {
      connectRequests++;
      return route.fulfill({
        json: { authorizationUrl: 'https://auth.ebay.com/oauth2/authorize?client_id=fixture' },
      });
    }
    return route.fulfill({
      json: {
        configured: true,
        connection: connected
          ? {
              workspaceId,
              connectionId: '65000000-0000-4000-8000-000000000001',
              status: 'connected',
              environment: 'production',
              username: 'Testkonto',
              lastReadAt: null,
            }
          : null,
      },
    });
  });
  await page.route('https://auth.ebay.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html lang="de"><title>eBay-Testanmeldung</title><body>eBay-Testanmeldung</body></html>',
    }),
  );
  await page.goto('/marketplaces/ebay/connection');
  await expect(page).toHaveURL(/\/marketplaces\/ebay\/connection$/);
  await expect(page.getByRole('heading', { name: 'Noch kein eBay-Konto verbunden' })).toBeVisible();
  await page.evaluate(axe.source);
  expect(
    await page.evaluate(
      async () =>
        (await (window as unknown as { axe: typeof axe }).axe.run('app-ebay-account')).violations,
    ),
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('ebay-connect.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
  const connectDialog = page.getByRole('dialog', { name: 'eBay-Konto hinzufügen', exact: true });
  await expect(connectDialog).toBeVisible();
  await expect(
    connectDialog.getByText('Melde Dich bei eBay an und verbinde Dein Konto mit Flipbase.'),
  ).toBeVisible();
  await connectDialog.getByRole('button', { name: 'Mit eBay verbinden', exact: true }).click();
  await expect(page).toHaveURL(/auth\.ebay\.com\/oauth2\/authorize/);
  expect(connectRequests).toBe(1);
  connected = true;
  await page.goto(`/marketplaces/ebay/connection?ebay_result=connected&workspace=${workspaceId}`);
  await expect(page.getByRole('heading', { name: 'eBay-Konten', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Konto hinzufügen', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Erneut mit eBay verbinden', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Testkonto', { exact: true })).toBeVisible();
  for (const width of [1280, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`ebay-connected-${width}.png`),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Testkonto einstellen', exact: true }).click();
    const settingsDialog = page.getByRole('dialog', {
      name: 'eBay-Konto – Einstellungen',
      exact: true,
    });
    await expect(
      settingsDialog.getByRole('button', { name: 'Verbindung trennen', exact: true }),
    ).toBeVisible();
    await settingsDialog.evaluate(async (element) => {
      await Promise.allSettled(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    await page.evaluate(axe.source);
    expect(
      await page.evaluate(
        async () =>
          (await (window as unknown as { axe: typeof axe }).axe.run('app-ebay-account')).violations,
      ),
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(settingsDialog).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Testkonto einstellen', exact: true }),
    ).toBeFocused();
  }
});

import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accountIds, mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const width of [1440, 320]) {
  test(`zehn Konten bleiben kompakt und erreichbar bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockMarketplace(page, false, false, false, false, [], undefined, true, 10);
    await page.goto('/marketplaces/vinted/accounts');
    const grid = page.locator('app-vinted-account-grid');
    await expect(grid.locator('app-card')).toHaveCount(10);
    await expect(grid).toContainText('0 von 10 Plätzen frei');
    await expect(
      page.getByRole('button', { name: 'Konto hinzufügen', exact: true }),
    ).toBeDisabled();
    const positions = await grid.locator('app-card').evaluateAll((cards) =>
      cards.map((card) => {
        const bounds = card.getBoundingClientRect();
        return { top: bounds.top, left: bounds.left, right: bounds.right, width: bounds.width };
      }),
    );
    expect(positions.every((position) => position.left >= 0 && position.right <= width)).toBe(true);
    expect(positions.every((position) => position.width <= 369)).toBe(true);
    if (width === 1440) expect(positions.every((position) => position.width >= 352)).toBe(true);
    const firstRow = positions.filter((position) => Math.abs(position.top - positions[0].top) <= 1);
    expect(firstRow.length).toBe(width === 320 ? 1 : 3);
    await grid.getByRole('button', { name: 'Testkonto J einstellen', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Testkonto J');
  });
}

for (const width of [1440, 390, 320]) {
  test(`wechselt dasselbe lokale Konto über die Kachel zur Cloud bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await mockMarketplace(page, true, false, false, false, [], undefined, true);
    await page.goto('/marketplaces/vinted/accounts');
    const actions = page
      .locator('app-vinted-account-grid app-card')
      .first()
      .locator('button')
      .filter({ hasNot: page.locator('svg.lucide-settings') });
    await expect(actions).toHaveCount(2);
    if (width > 320) {
      const positions = await actions.evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().top),
      );
      expect(Math.abs(positions[0] - positions[1])).toBeLessThanOrEqual(1);
    }
    await page
      .locator('app-vinted-account-grid app-card')
      .first()
      .getByRole('button', { name: 'Auf Cloud wechseln', exact: true })
      .click();
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/accounts$/);
    await expect(page.getByRole('dialog', { name: 'Vinted-Anmeldung', exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail' })
      .fill('synthetic-user');
    await page.getByLabel('Vinted-Passwort').fill('synthetic-password');
    await page.getByRole('button', { name: 'Anmelden und Konto verbinden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cloud aktivieren', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Cloud aktivieren', exact: true }).click();
    await expect(
      page.getByText('Cloud aktiv. Dein Konto ist verbunden.', { exact: true }),
    ).toBeVisible();
    expect(
      calls.filter((call) => call.name === 'browser_cloud_setup_complete').map((call) => call.body),
    ).toEqual([{ workspaceId, connectionId: accountIds[0] }]);
    expect(calls.filter((call) => call.name === 'marketplace_create_connection')).toHaveLength(0);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('[role="dialog"]') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`öffnet Vinted-Kontokacheln und behält die Auswahl nach Neuladen bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    const workerRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/marketplace-browser\/(sessions|connections\/sync)/.test(request.url()))
        workerRequests.push(request.url());
    });
    await mockMarketplace(page, true, false, false, false, []);
    await page.route('**/account-avatar.svg', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#e5eeee"/><circle cx="40" cy="29" r="15" fill="#39696c"/><path d="M13 80v-10a27 27 0 0154 0v10" fill="#39696c"/></svg>',
      }),
    );
    await page.route('**/rest/v1/marketplace_account_entries*', async (route) => {
      const url = new URL(route.request().url());
      const accountB = url.searchParams.get('connection_id') === `eq.${accountIds[1]}`;
      const kind = url.searchParams.get('kind');
      if (kind === 'eq.profile')
        return route.fulfill({
          json: [
            {
              body: {
                username: accountB ? 'vintage.studio' : 'maike.vintage',
                feedbackCount: accountB ? 54 : 128,
                feedbackReputation: accountB ? 0.96 : 1,
                itemCount: accountB ? 18 : 32,
                imageUrl: 'https://images1.vinted.net/account-avatar.svg',
              },
            },
          ],
        });
      const count = kind === 'eq.publication' ? (accountB ? 18 : 32) : accountB ? 23 : 87;
      return route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-${count - 1}/${count}`,
          'access-control-expose-headers': 'content-range',
        },
        body: '',
      });
    });
    await page.goto('/marketplaces/vinted');
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/accounts$/);
    const grid = page.locator('app-vinted-account-grid');
    await expect(grid.locator('app-card')).toHaveCount(2);
    await expect(grid).toContainText('@maike.vintage');
    await expect(grid).toContainText('@vintage.studio');
    await expect(grid.getByRole('img', { name: '4,8 von 5 Sternen' })).toBeVisible();
    await expect(grid.locator('app-card dd')).toHaveCount(0);
    await expect(grid.locator('app-card').last()).not.toContainText('Inserate');
    await expect(grid.locator('app-card').last()).not.toContainText('Verkäufe');
    const firstCard = grid.locator('app-card').first();
    const rating = await firstCard.locator('app-vinted-rating').boundingBox();
    const action = await firstCard
      .getByRole('button', { name: 'Synchronisieren', exact: true })
      .boundingBox();
    if (!rating || !action) throw new Error('Bewertung oder Kartenaktion fehlt');
    expect(action.y).toBeGreaterThanOrEqual(rating.y + rating.height + 8);
    await expect(page.getByRole('navigation', { name: 'Vinted-Bereiche' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Vinted-Konto auswählen' })).toHaveCount(0);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-workspace')!,
              { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            )
          ).violations,
      ),
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
    if (directory) {
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `vinted-account-grid-${width}.png`) });
    }
    const accountLink = grid.getByRole('link', { name: 'Testkonto B öffnen', exact: true });
    await accountLink.focus();
    await expect(accountLink).toBeFocused();
    expect(
      await accountLink.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    ).toBeGreaterThan(0);
    await accountLink.press('Enter');
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/overview$/);
    const select = page.getByRole('combobox', { name: 'Vinted-Konto auswählen', exact: true });
    await expect(select).toContainText('Testkonto B');
    await page.reload();
    await expect(select).toContainText('Testkonto B');
    if (width < 768)
      await page
        .locator('app-bottom-nav')
        .getByRole('button', { name: 'Menü', exact: true })
        .click();
    await page.locator('app-sidebar').getByRole('link', { name: 'Profil', exact: true }).click();
    await expect(page.locator('app-vinted-profile')).toContainText('Profil Testkonto B');
    await page.reload();
    await expect(select).toContainText('Testkonto B');
    await select.click();
    await page.getByRole('option', { name: /Testkonto A/ }).click();
    await expect(page.locator('app-vinted-profile')).toContainText('Profil Testkonto A');
    await page.reload();
    await expect(select).toContainText('Testkonto A');
    await page.getByRole('link', { name: 'Alle Konten', exact: true }).click();
    await expect(grid).toBeVisible();
    await page.reload();
    await expect(grid).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Vinted-Bereiche' })).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(workerRequests).toEqual([]);
  });
}

for (const width of [390, 320]) {
  test(`langer lokaler Profilstatus bleibt im Kontenbadge bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockMarketplace(page, false, false, false, false, [], undefined, true);
    await page.addInitScript(
      ({ workspaceId, connectionId }) => {
        window.addEventListener('message', (event) => {
          if (event.source !== window || event.origin !== location.origin) return;
          if (event.data?.type === 'FLIPBASE_CHECK_EXTENSION') {
            window.postMessage(
              {
                type: 'FLIPBASE_EXTENSION_STATUS',
                installed: true,
                vintedLocal: true,
                localAccount: null,
              },
              location.origin,
            );
          }
          if (
            event.data?.type === 'FLIPBASE_VINTED_LOCAL_READINESS' ||
            event.data?.type === 'FLIPBASE_VINTED_LOCAL_RECHECK'
          ) {
            window.postMessage(
              {
                type: 'FLIPBASE_VINTED_LOCAL_RESULT',
                requestId: event.data.requestId,
                success: true,
                result: {
                  state: 'ready',
                  workspaceId,
                  connectionId,
                  externalAccountId: '101',
                  checkedAt: new Date().toISOString(),
                  version: '1.6.0',
                },
              },
              location.origin,
            );
          }
        });
      },
      { workspaceId, connectionId: accountIds[1] },
    );
    await page.goto('/marketplaces/vinted/accounts');
    const status = page
      .locator('app-vinted-account-grid app-card')
      .first()
      .locator('app-badge')
      .last()
      .locator('span');
    await expect(status).toHaveText('In anderem Browserprofil verknüpft');
    const bounds = await status.evaluate((element) => {
      const badge = element.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(element);
      const label = text.getBoundingClientRect();
      return {
        top: label.top - badge.top,
        bottom: badge.bottom - label.bottom,
        height: badge.height,
      };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeGreaterThanOrEqual(0);
    expect(bounds.height).toBeGreaterThanOrEqual(20);
    await page.getByRole('button', { name: 'Browserprofil prüfen', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Öffne das Browserprofil dieses Kontos');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

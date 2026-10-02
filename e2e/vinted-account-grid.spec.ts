import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accountIds, mockMarketplace } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const width of [1440, 1024, 768, 390]) {
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
    await expect(grid.locator('app-card').last().locator('dd')).toHaveText(['18', '23']);
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
    await page
      .getByRole('navigation', { name: 'Vinted-Bereiche' })
      .getByRole('link', { name: 'Profil', exact: true })
      .click();
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

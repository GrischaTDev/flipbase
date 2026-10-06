import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace, accountIds, workspaceId } from './support/marketplace-account-fixture';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
for (const width of [1440, 1024, 390, 320]) {
  test(`Favoritennachrichten bleiben vor Freigabe aus und speichern Regeln bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockMarketplace(page, false, false, false, false, [], undefined, true);
    let settings = {
      workspaceId,
      connectionId: accountIds[0],
      enabled: false,
      active: false,
      config: null as unknown,
      version: 0,
      lastCheckedAt: null,
      events: [],
    };
    const saves: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/rpc/marketplace_read_favorite_messages', (route) =>
      route.fulfill({ json: settings }),
    );
    await page.route('**/rest/v1/rpc/marketplace_save_favorite_messages', (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      saves.push(body);
      settings = {
        ...settings,
        enabled: Boolean(body['p_enabled']),
        config: body['p_config'],
        version: settings.version + 1,
      };
      return route.fulfill({ json: settings });
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/marketplaces/vinted/favorite-messages');
    const view = page.locator('app-vinted-favorite-messages');
    await expect(view.getByText('Ausgeschaltet', { exact: true })).toBeVisible();
    await expect(view.getByRole('textbox', { name: 'Textvariante 1' })).toBeVisible();
    const offerToggle = view.getByRole('checkbox', { name: 'Angebot mitschicken', exact: true });
    await expect(offerToggle).toHaveAttribute('aria-checked', 'false');
    await offerToggle.click();
    await expect(
      view.getByText('Beispiel: Artikelpreis 40,00 € → Angebot 35,00 €.', { exact: true }),
    ).toBeVisible();
    await view.getByRole('button', { name: 'Regel hinzufügen', exact: true }).click();
    await view.getByRole('textbox', { name: 'Regelname' }).fill('Nacht');
    await view.getByLabel('Ab Stunde', { exact: true }).fill('22');
    await view.getByLabel('Bis Stunde (ausschließlich)', { exact: true }).fill('8');
    await view
      .getByRole('textbox', { name: 'Regeltext 1' })
      .fill('Guten Abend! Danke für Dein Interesse.');
    const monday = view.getByRole('checkbox', { name: 'Mo', exact: true });
    await monday.click();
    await expect(monday).toHaveAttribute('aria-checked', 'true');
    await view.getByRole('button', { name: 'Einstellungen speichern' }).click();
    await expect(view.getByRole('status').filter({ hasText: 'gespeichert' })).toBeVisible();
    expect(saves).toHaveLength(1);
    expect(saves[0]['p_enabled']).toBe(false);
    expect(saves[0]['p_config']).toMatchObject({
      timezone: 'Europe/Berlin',
      offer: { type: 'amount', value: 5 },
      rules: [{ startHour: 22, endHour: 8, days: [1] }],
    });
    const activation = view.getByRole('checkbox', {
      name: 'Favoritennachrichten für dieses Konto aktivieren',
    });
    await activation.click();
    await expect(activation).toHaveAttribute('aria-checked', 'true');
    await view.getByRole('button', { name: 'Einstellungen speichern' }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toContainText('Frühere Favorisierungen werden ausgelassen');
    await confirmation.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    expect(saves).toHaveLength(1);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-favorite-messages') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll('app-vinted-favorite-messages *')).flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > innerWidth + 1 ? [element.tagName + ': ' + element.className] : [];
      }),
    );
    expect(overflow).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results/vinted-favorite-messages-${width}.png`,
      fullPage: true,
    });
  });
}

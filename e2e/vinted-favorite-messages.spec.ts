import { expect, test } from '@playwright/test';
import axe from 'axe-core';
import { mockMarketplace, accountIds, workspaceId } from './support/marketplace-account-fixture';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

test('Kleiderschrank zeigt den Artikelrabatt mit Preisvorschau nur bei aktiven Favoritennachrichten @marketplace-preview @core-smoke', async ({
  page,
}) => {
  const itemId = '91842';
  let enabled = true;
  let discountPercent: number | null = null;
  await mockMarketplace(page, true, false, false, false, [], {
    publicationsTotal: 1,
    publicationExternalId: itemId,
  });
  await page.route('**/rest/v1/rpc/marketplace_read_listing_favorite_discount', (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        enabled,
        defaultOffer: { type: 'percentage', value: 10 },
        discountPercent: body.p_item_id === itemId ? discountPercent : null,
      },
    });
  });
  await page.route('**/rest/v1/rpc/marketplace_save_listing_favorite_discount', (route) => {
    const body = route.request().postDataJSON();
    expect(body.p_item_id).toBe(itemId);
    discountPercent = body.p_discount_percent ?? null;
    return route.fulfill({ status: 204 });
  });

  await page.goto('/marketplaces/vinted/listings');
  const action = page.getByRole('button', {
    name: 'Rabatt anpassen für Vintage-Schal · Testartikel',
  });
  await action.click();
  const dialog = page.getByRole('dialog', { name: 'Rabatt anpassen' });
  const input = dialog.getByRole('spinbutton', { name: 'Individueller Rabatt' });
  const save = dialog.getByRole('button', { name: 'Rabatt speichern' });
  await expect(dialog).toContainText(/29,90\s€ − 2,99\s€ Rabatt \(10 %\) = 26,91\s€/);
  await input.fill('20');
  await expect(dialog).toContainText(/29,90\s€ − 5,98\s€ Rabatt \(20 %\) = 23,92\s€/);
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(discountPercent).toBe(20);

  await action.click();
  await expect(input).toHaveValue('20');
  await page.addScriptTag({ content: axe.source });
  const violations = await dialog.evaluate(
    async (element) =>
      (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
  );
  expect(violations).toEqual([]);
  await input.fill('abc');
  await expect(save).toBeDisabled();
  await input.fill('');
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(discountPercent).toBeNull();

  enabled = false;
  const disabledSettings = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/marketplace_read_listing_favorite_discount'),
  );
  await page.reload();
  await disabledSettings;
  await expect(page.getByText('Vintage-Schal · Testartikel').first()).toBeVisible();
  await expect(action).toHaveCount(0);
});
for (const { width, cloud } of [1440, 1024, 390, 320].flatMap((width) => [
  { width, cloud: false },
  { width, cloud: true },
])) {
  test(`Favoritennachrichten (${cloud ? 'Cloud' : 'Extension'}) bleiben bis zum Speichern aus und aktivieren ohne Zusatzdialog bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await mockMarketplace(page, false, false, false, false, [], undefined, !cloud);
    await page.route('**/rest/v1/rpc/marketplace_read_message_permission', (route) =>
      route.fulfill({
        json: { executionMode: cloud ? 'cloud' : 'local', allowed: false, authorizationVersion: 0 },
      }),
    );
    const approvals: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/rpc/marketplace_approve_cloud_messages', (route) => {
      approvals.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({
        json: { executionMode: 'cloud', allowed: true, authorizationVersion: 1 },
      });
    });
    await page.route('**/rest/v1/rpc/marketplace_read_local_extension', (route) =>
      route.fulfill({
        json: {
          binding: cloud
            ? null
            : {
                externalAccountId: '100',
                expiresAt: new Date(Date.now() + 3600000).toISOString(),
                lastSeenAt: null,
                revoked: false,
                messagesRead: true,
                messagesSend: true,
              },
        },
      }),
    );
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
        active: Boolean(body['p_enabled']),
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
    expect(approvals).toHaveLength(0);
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
    expect(saves).toHaveLength(1);
    expect(approvals).toHaveLength(0);
    await view.getByRole('button', { name: 'Einstellungen speichern' }).click();
    await expect(view.getByText('Aktiv', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(saves).toHaveLength(2);
    expect(saves[1]['p_enabled']).toBe(true);
    expect(approvals).toHaveLength(cloud ? 1 : 0);
    if (cloud)
      expect(approvals[0]).toMatchObject({
        p_workspace_id: workspaceId,
        p_connection_id: accountIds[0],
        p_expected_external_account_id: '100',
      });
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
      path: `test-results/vinted-favorite-messages-${cloud ? 'cloud' : 'local'}-${width}.png`,
      fullPage: true,
    });
  });
}

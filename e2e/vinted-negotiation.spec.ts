import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { createDefaultNegotiationConfig } from '../supabase/functions/_shared/negotiation-config';
import {
  mockMarketplace,
  workspaceId,
  accountIds,
  conversationId,
  emptyPage,
} from './support/marketplace-account-fixture';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
const scope = { workspaceId, connectionId: accountIds[0] };
async function fixture(page: Page) {
  await mockMarketplace(page, false, false, false, false, []);
  await page.route('**/rest/v1/rpc/marketplace_read_sync_schedule', (route) =>
    route.fulfill({
      json: {
        ...scope,
        enabled: false,
        intervalMinutes: 15,
        nextDueAt: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        pausedReason: null,
        retryAfter: null,
        authorizationVersion: 0,
      },
    }),
  );
  let writes = 0;
  await page.route(/https:\/\/(?:www\.)?vinted\./, (route) => {
    writes++;
    return route.abort();
  });
  let settings = {
    ok: true,
    enabled: false,
    active: false,
    version: 0,
    config: createDefaultNegotiationConfig(),
    events: [] as Record<string, unknown>[],
  };
  const saves: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/marketplace_read_negotiation', (route) =>
    route.fulfill({ json: settings }),
  );
  await page.route('**/rest/v1/rpc/marketplace_save_negotiation', (route) => {
    const body = route.request().postDataJSON();
    saves.push(body);
    settings = {
      ...settings,
      enabled: body.p_enabled,
      config: body.p_config,
      version: settings.version + 1,
    };
    return route.fulfill({ json: settings });
  });
  await page.route('**/rest/v1/rpc/marketplace_list_connections', (route) =>
    route.fulfill({
      json: {
        canManage: true,
        connections: [
          {
            ...scope,
            marketplace: 'vinted',
            executionMode: 'cloud',
            displayName: 'Testkonto A',
            externalAccountId: '22',
            status: 'connected',
            capabilities: {},
            allowedActions: [],
            lastSyncedAt: null,
          },
        ],
      },
    }),
  );
  const conversation = {
    ...scope,
    id: conversationId,
    externalId: '99',
    title: 'Anna',
    text: 'Preisangebot',
    itemId: '789',
    itemTitle: 'Testartikel',
    itemPrice: 50,
    itemCurrency: 'EUR',
    partnerId: '11',
    occurredAt: '2026-10-08T10:00:00Z',
    unread: false,
    detailCheckedAt: null,
  };
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) =>
    route.fulfill({
      json: {
        ...scope,
        profile: null,
        publications: emptyPage(),
        sales: emptyPage(),
        activity: emptyPage(),
        conversations: { items: [conversation], total: 1, nextCursor: null },
      },
    }),
  );
  const offer = {
    offerId: '123',
    transactionId: '456',
    itemId: '789',
    buyerId: '11',
    sellerId: '22',
    originalPriceCents: 5000,
    offeredPriceCents: 2000,
    currency: 'EUR',
    status: 'pending',
  };
  let messages: Record<string, unknown>[] = [
    {
      ...scope,
      id: '25000000-0000-4000-8000-000000000041',
      externalId: '321',
      conversationId,
      title: 'Angebot',
      direction: 'inbound',
      occurredAt: '2026-10-08T10:00:00Z',
      messageType: 'offer_request_message',
      priceLabel: '20,00 € statt 50,00 €',
      offerStatus: 'pending',
      negotiationOffer: offer,
    },
  ];
  await page.route('**/rest/v1/rpc/marketplace_read_page', (route) =>
    route.fulfill({ json: { items: messages, total: messages.length, nextCursor: null } }),
  );
  let permission = true;
  await page.route('**/rest/v1/rpc/marketplace_read_message_permission', (route) =>
    route.fulfill({
      json: {
        executionMode: 'cloud',
        allowed: permission,
        authorizationVersion: permission ? 1 : 0,
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_messages', (route) =>
    route.fulfill({ json: { ok: true, ...scope, messages: [] } }),
  );
  await page.route('**/marketplace-browser/conversations/read', (route) =>
    route.fulfill({ json: { conversationId, observedAt: new Date().toISOString() } }),
  );
  const enqueues: Record<string, unknown>[] = [];
  let unknown = false;
  await page.route('**/rest/v1/rpc/marketplace_enqueue_negotiation', (route) => {
    enqueues.push(route.request().postDataJSON());
    if (unknown) {
      unknown = false;
      return route.abort();
    }
    return route.fulfill({ json: { ok: true, id: 'job', state: 'queued' } });
  });
  return {
    saves,
    enqueues,
    writes: () => writes,
    changeSettings: () => {
      settings = { ...settings, version: 8, config: { ...settings.config, discountValue: 5 } };
    },
    unknown: () => {
      unknown = true;
    },
    permission: (allowed: boolean) => {
      permission = allowed;
    },
    messages: (entries: Record<string, unknown>[]) => {
      messages = entries;
    },
    confirm: () => {
      settings.events = [
        {
          id: 'job',
          action: 'counter',
          state: 'sent',
          errorCode: null,
          createdAt: '2026-10-09T10:00:00Z',
        },
      ];
    },
  };
}
async function accessibility(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async (selector) =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector(selector) as HTMLElement,
          )
        ).violations,
      selector,
    ),
  ).toEqual([]);
}
for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`Verhandlungseinstellungen mit Alternativen und Folgen ${width}px ${theme} @marketplace-preview`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const mocked = await fixture(page);
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/marketplaces/vinted/automatic-negotiation');
      const view = page.locator('app-vinted-negotiation');
      await expect(view.getByRole('button', { name: 'Einstellungen speichern' })).toBeEnabled();
      await view.getByRole('combobox', { name: 'Art des Nachlasses' }).click();
      await page.getByRole('option', { name: 'Euro', exact: true }).click();
      await view.getByLabel('Maximaler Nachlass').fill('10');
      await view.getByRole('combobox', { name: 'Zeitpunkt auswählen' }).click();
      await page.getByRole('option', { name: '1 Minute', exact: true }).click();
      await expect(view.getByLabel('Wartezeit nach dem Ereignis')).toHaveValue('60');
      await view.getByRole('combobox', { name: 'Zeitpunkt auswählen' }).click();
      await page.getByRole('option', { name: 'Individuelle Wartezeit', exact: true }).click();
      await view.getByRole('combobox', { name: 'Zeiteinheit', exact: true }).click();
      await page.getByRole('option', { name: 'Minuten', exact: true }).click();
      await view.getByLabel('Wartezeit nach dem Ereignis').fill('7');
      await expect(view).toContainText('45,00');
      await expect(view).toContainText('42,00');
      await expect(view).toContainText('40,00');
      const purchase = view
        .locator('app-card')
        .filter({ has: page.getByText('Bestätigter Kauf', { exact: true }) });
      await purchase
        .getByRole('button', { name: 'Erste Nachricht hinzufügen', exact: true })
        .click();
      await purchase.getByRole('textbox').fill('Danke für Deinen Kauf.');
      await purchase.getByRole('button', { name: 'Textalternative hinzufügen' }).click();
      await purchase.getByRole('textbox').nth(1).fill('Vielen Dank!');
      await purchase
        .getByRole('button', { name: 'Folgenachricht hinzufügen', exact: true })
        .click();
      await purchase.getByRole('textbox').nth(2).fill('Dein Paket folgt.');
      await purchase
        .getByRole('combobox', {
          name: 'Bestätigter Kauf: Zeiteinheit für Nachricht 2',
          exact: true,
        })
        .click();
      await page.getByRole('option', { name: 'Minuten', exact: true }).click();
      await purchase.getByLabel('Wartezeit für diese Folgenachricht').fill('3');
      mocked.changeSettings();
      await view.getByRole('button', { name: 'Verlauf aktualisieren' }).click();
      await expect(view.getByRole('button', { name: 'Einstellungen speichern' })).toBeEnabled();
      await expect(view.getByLabel('Maximaler Nachlass')).toHaveValue('10');
      await expect(purchase.getByRole('textbox').nth(2)).toHaveValue('Dein Paket folgt.');
      await expect(view.getByLabel('Wartezeit nach dem Ereignis')).toHaveValue('7');
      await view.getByRole('button', { name: 'Einstellungen speichern' }).click();
      await expect(view.getByRole('status')).toContainText('gespeichert');
      expect(mocked.saves).toHaveLength(1);
      expect(mocked.saves[0].p_enabled).toBe(false);
      expect(mocked.saves[0].p_expected_version).toBe(0);
      expect(mocked.saves[0].p_config).toMatchObject({
        purchaseEnabled: false,
        delaySeconds: 420,
        messages: {
          purchased: [
            { templates: ['Danke für Deinen Kauf.', 'Vielen Dank!'], delaySeconds: 0 },
            { templates: ['Dein Paket folgt.'], delaySeconds: 180 },
          ],
        },
      });
      await expect(view.getByLabel('Wartezeit nach dem Ereignis')).toHaveValue('7');
      await expect(purchase.getByLabel('Wartezeit für diese Folgenachricht')).toHaveValue('3');
      await expect(
        purchase.getByRole('textbox', {
          name: 'Bestätigter Kauf: Alternative 2 für Nachricht 1',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          'Die Kontodaten konnten nicht sicher zugeordnet werden. Bitte lade die Ansicht erneut.',
          { exact: true },
        ),
      ).toHaveCount(0);
      await expect(view).toContainText('Derzeit nicht verfügbar');
      await accessibility(page, 'app-vinted-negotiation');
      expect(await view.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(
        false,
      );
      expect(errors).toEqual([]);
      expect(mocked.writes()).toBe(0);
      await page.screenshot({
        path: `.superpowers/sdd/2026-10-09-vinted-negotiation/task-3-settings-${width}-${theme}.png`,
        fullPage: true,
      });
    });
    test(`Manuelles Gegenangebot mit Validierung und vorgemerktem Status ${width}px ${theme} @marketplace-preview`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const mocked = await fixture(page);
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      await page.goto(
        `/marketplaces/vinted/messages?connectionId=${scope.connectionId}&conversationId=${conversationId}`,
      );
      const actions = page.locator('[data-offer-actions]');
      await expect(actions.getByRole('button', { name: 'Annehmen', exact: true })).toBeVisible();
      expect(
        await actions
          .getByRole('button', { name: 'Gegenangebot', exact: true })
          .locator('span')
          .evaluate((label) => label.scrollWidth > label.clientWidth + 1),
      ).toBe(false);
      await page.screenshot({
        path:
          '.superpowers/sdd/2026-10-09-vinted-negotiation/task-3-chat-actions-' +
          width +
          '-' +
          theme +
          '.png',
        fullPage: true,
      });
      await actions.getByRole('button', { name: 'Gegenangebot', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Dein Gegenpreis').fill('20');
      await expect(dialog.locator('[data-counter-preview]')).toContainText('gültigen Gegenpreis');
      await dialog.getByRole('button', { name: 'Gegenangebot vormerken' }).click();
      await expect(dialog.getByRole('alert')).toContainText('centgenauen');
      expect(mocked.enqueues).toHaveLength(0);
      await dialog.getByLabel('Dein Gegenpreis').fill('35');
      await expect(dialog).toContainText('Artikelpreis: 50,00');
      await expect(dialog).toContainText('Käuferangebot: 20,00');
      await expect(dialog).toContainText('mindestens 25,00');
      await expect(dialog.locator('[data-counter-preview]')).toContainText(
        'Dein Gegenangebot: 35,00',
      );
      await expect(dialog.locator('[data-counter-preview]')).toContainText(
        'Nachlass zum Artikelpreis: 15,00',
      );
      expect(mocked.enqueues).toHaveLength(0);
      await accessibility(page, '[role="dialog"]');
      await page.screenshot({
        path: `.superpowers/sdd/2026-10-09-vinted-negotiation/task-3-counter-preview-${width}-${theme}.png`,
        fullPage: true,
      });
      await dialog.getByRole('button', { name: 'Gegenangebot vormerken' }).click();
      await expect(actions).toContainText('Vorgemerkt');
      expect(mocked.enqueues).toHaveLength(1);
      expect(mocked.enqueues[0]).toMatchObject({
        p_action: 'counter',
        p_price_cents: 3500,
        p_message_id: '25000000-0000-4000-8000-000000000041',
      });
      mocked.confirm();
      await actions.getByRole('button', { name: 'Aktionsstatus aktualisieren' }).click();
      await expect(actions).toContainText('Gegenangebot gesendet');
      await accessibility(page, 'app-vinted-messages');
      expect(mocked.writes()).toBe(0);
      await page.screenshot({
        path: `.superpowers/sdd/2026-10-09-vinted-negotiation/task-3-chat-${width}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
test('Unklare Anfrage verwendet dieselbe Request-ID und darf keine alternative Aktion auslösen @marketplace-preview', async ({
  page,
}) => {
  const mocked = await fixture(page);
  await page.goto(
    `/marketplaces/vinted/messages?connectionId=${scope.connectionId}&conversationId=${conversationId}`,
  );
  const actions = page.locator('[data-offer-actions]');
  mocked.unknown();
  await actions.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(actions.getByRole('alert')).toBeVisible();
  await actions.getByRole('button', { name: 'Ablehnen', exact: true }).click();
  expect(mocked.enqueues).toHaveLength(1);
  await actions.getByRole('button', { name: 'Annehmen', exact: true }).click();
  await expect(actions).toContainText('Vorgemerkt');
  expect(mocked.enqueues[0].p_request_id).toBe(mocked.enqueues[1].p_request_id);
  expect(mocked.writes()).toBe(0);
});
test('Fehlende Versandfreigabe zeigt keine Angebotsaktionen @marketplace-preview', async ({
  page,
}) => {
  const mocked = await fixture(page);
  mocked.permission(false);
  await page.goto(
    `/marketplaces/vinted/messages?connectionId=${scope.connectionId}&conversationId=${conversationId}`,
  );
  await expect(page.locator('[data-message-kind="offer"]')).toBeVisible();
  await expect(page.locator('[data-offer-actions]')).toHaveCount(0);
  expect(mocked.enqueues).toHaveLength(0);
});

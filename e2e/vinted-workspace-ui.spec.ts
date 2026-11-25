import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mockMarketplace,
  workspaceId,
  accountIds,
  conversationId,
} from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

async function openVintedSection(page: Page, label: string, width: number): Promise<void> {
  const target = label === 'Inserate' ? 'Kleiderschrank' : label;
  if (width < 768)
    await page.locator('app-bottom-nav').getByRole('button', { name: 'Menü', exact: true }).click();
  await page.locator('app-sidebar').getByRole('link', { name: target, exact: true }).click();
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
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: false });
}

async function measureMessageText(page: Page) {
  return page.getByRole('log').evaluate((log) => {
    const color = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number);
      if (!channels || channels.length < 3) throw new Error(`Unbekannte Textfarbe: ${value}`);
      return [channels[0], channels[1], channels[2], channels[3] ?? 1];
    };
    const blend = (foreground: number[], background: number[]) =>
      foreground
        .slice(0, 3)
        .map((channel, index) => channel * foreground[3] + background[index] * (1 - foreground[3]));
    const luminance = (channels: number[]) => {
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    return [...log.querySelectorAll('article > span, article time')].map((paragraph) => {
      const layers: number[][] = [];
      for (let ancestor: Element | null = paragraph; ancestor; ancestor = ancestor.parentElement)
        layers.push(color(getComputedStyle(ancestor).backgroundColor));
      const background = layers
        .reverse()
        .reduce((background, layer) => blend(layer, background), [255, 255, 255]);
      const style = getComputedStyle(paragraph);
      const foreground = blend(color(style.color), background);
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      return {
        text: paragraph.textContent?.trim() ?? '',
        isTimestamp: paragraph.tagName === 'TIME',
        fontSize: parseFloat(style.fontSize),
        contrast:
          (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
          (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
      };
    });
  });
}

for (const width of [1440, 390, 320]) {
  for (const theme of ['light', 'dark']) {
    test(`kompakte Vinted-Ansicht, Kennzahlen und Favoritenglocke ${width}px ${theme} @marketplace-preview @core-smoke`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const imported = {
        conversationId,
        publicationsTotal: 1,
        publicationAge: { value: 2, unit: 'day' as const, observedAt: new Date().toISOString() },
        views: 5,
        favorites: 2,
        observedAt: '2026-10-01T12:00:00Z',
        text: 'Gespeicherte Beschreibung des Testschals.',
        textState: 'loaded' as const,
        imageUrl: 'https://images.example.test/scarf.svg',
        imageUrls: [
          'https://images.example.test/scarf.svg',
          'https://images.example.test/scarf2.svg',
        ],
      };
      const calls = await mockMarketplace(page, true, false, false, false, [], imported);
      const comparison = {
        entryId: 'publication-1',
        observedAt: imported.observedAt,
        baselineAt: null as string | null,
        views: null as number | null,
        favorites: null as number | null,
      };
      await page.route('**/rest/v1/rpc/marketplace_read_listing_metric_changes', (route) => {
        const body = route.request().postDataJSON();
        expect(body['p_workspace_id']).toBe(workspaceId);
        return route.fulfill({
          json: {
            workspaceId,
            connectionId: body['p_connection_id'],
            periodMinutes: body['p_period_minutes'],
            items: [comparison],
          },
        });
      });
      await page.route('**/rest/v1/rpc/marketplace_read_listing_statistics_overview', (route) => {
        const body = route.request().postDataJSON();
        expect(body['p_workspace_id']).toBe(workspaceId);
        const days = body['p_period'] === '24h' ? 24 : body['p_period'] === '7d' ? 7 : 30;
        const step = body['p_period'] === '24h' ? 3_600_000 : 86_400_000;
        const end = Date.parse('2026-10-01T22:00:00Z');
        return route.fulfill({
          json: {
            workspaceId,
            connectionId: body['p_connection_id'] ?? null,
            period: body['p_period'],
            historyStartsAt: '2026-08-01T10:00:00Z',
            activeCount: 2,
            totals: { views: 1234, favorites: 56 },
            previousTotals: { views: 1000, favorites: 50 },
            buckets: Array.from({ length: days }, (_, index) => ({
              start: new Date(end - (days - 1 - index) * step).toISOString(),
              views: index * 3,
              favorites: index % 4,
            })),
            topItems: [
              {
                id: '1',
                connectionId: body['p_connection_id'] ?? 'removed-account',
                accountName: 'Testkonto A',
                entryId: null,
                title: 'Sehr langer Titel eines nicht mehr vorhandenen Testartikels '.repeat(4),
                imageUrl: null,
                price: null,
                currency: null,
                removedAt: '2026-09-30T08:00:00Z',
                views: 500,
                favorites: 20,
                totalViews: 900,
                totalFavorites: null,
              },
            ],
          },
        });
      });
      const longUrl = `https://example.test/${'measurements'.repeat(70)}`;
      const messages = [
        {
          id: 'incoming',
          text: 'Welche Maße hat der Schal?',
          direction: 'inbound',
          messageType: 'text',
        },
        {
          id: 'outgoing',
          text: 'Testantwort: 180 × 30 cm.',
          direction: 'outbound',
          messageType: 'text',
        },
        {
          id: 'system',
          text: 'System: Der Versandstatus wurde aktualisiert.',
          direction: 'unknown',
          messageType: 'status_message',
        },
        {
          id: 'offer',
          text: 'Gespeichertes Angebot',
          title: 'Preisangebot zum Schal',
          priceLabel: '12,00 €',
          direction: 'inbound',
          messageType: 'offer_request_message',
        },
        {
          id: 'unknown',
          text: 'Unbekannte Richtung bleibt neutral.',
          direction: 'unrecognized',
          messageType: 'text',
        },
        { id: 'long-url', text: longUrl, direction: 'inbound', messageType: 'text' },
      ]
        .map((message, index) => ({ ...message, occurredAt: `2026-09-26T12:0${index}:00Z` }))
        .reverse();
      await page.route('**/rest/v1/rpc/marketplace_read_page', (route) => {
        const body = route.request().postDataJSON();
        if (body['p_kind'] !== 'message') return route.fallback();
        expect(body['p_workspace_id']).toBe(workspaceId);
        expect(body['p_parent_id']).toBe(conversationId);
        return route.fulfill({
          json: {
            items: messages.map((message) => ({
              ...message,
              workspaceId,
              connectionId: body['p_connection_id'],
              conversationId: body['p_parent_id'],
            })),
            total: messages.length,
            nextCursor: null,
          },
        });
      });
      await page.route('**/marketplace-browser/healthz', (route) =>
        route.fulfill({
          json: {
            ok: true,
            readOnly: false,
            apiVersion: 2,
            accountActionsEnabled: true,
            scheduledSync: {
              enabled: true,
              authorizationVersion: 2,
              allowedIntervals: [3, 5, 10, 15, 30, 60],
            },
          },
        }),
      );
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      // UI-Prüfung ohne Service Worker, damit die abgefangenen Antworten ausschließlich zur Seite gehören.
      await page.addInitScript(() =>
        Reflect.deleteProperty(Object.getPrototypeOf(navigator), 'serviceWorker'),
      );
      await page.clock.install();
      const errors: string[] = [];
      const warnings: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('WebSocket'))
          errors.push(message.text());
        if (
          message.type() === 'warning' &&
          message.text() !== 'Service Worker registration blocked by Playwright'
        )
          warnings.push(message.text());
      });
      await page.route('https://images.example.test/**', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#344b46"/><path d="M150 30h100v540H150z" fill="#fcc601"/></svg>',
        }),
      );
      const schedule = {
        workspaceId,
        connectionId: accountIds[0],
        enabled: true,
        intervalMinutes: 15,
        nextDueAt: '2026-10-01T12:15:00Z',
        lastAttemptAt: null,
        lastSuccessAt: null as string | null,
        pausedReason: null,
        retryAfter: null,
        authorizationVersion: 1,
      };
      await page.route('**/rest/v1/rpc/marketplace_read_sync_schedule', (route) =>
        route.fulfill({
          json: { ...schedule, connectionId: route.request().postDataJSON()['p_connection_id'] },
        }),
      );
      const settings = new Map(
        accountIds.map((connectionId) => [
          connectionId,
          { workspaceId, connectionId, enabled: true, version: 1 },
        ]),
      );
      await page.route('**/rest/v1/rpc/marketplace_read_favorite_notification_settings', (route) =>
        route.fulfill({ json: settings.get(route.request().postDataJSON()['p_connection_id']) }),
      );
      await page.route('**/rest/v1/rpc/marketplace_set_favorite_notification_settings', (route) => {
        const body = route.request().postDataJSON();
        expect(body['p_workspace_id']).toBe(workspaceId);
        const setting = settings.get(body['p_connection_id'])!;
        expect(body['p_expected_version']).toBe(setting.version);
        setting.enabled = body['p_enabled'];
        setting.version++;
        return route.fulfill({ json: setting });
      });
      const messageSettings = new Map(
        accountIds.map((connectionId) => [
          connectionId,
          {
            workspaceId,
            connectionId,
            enabled: true,
            version: 0,
            categories: {
              messages: true,
              offers: true,
              orders: true,
              shipping: true,
              payments: true,
              feedback: true,
              other: true,
            },
          },
        ]),
      );
      await page.route('**/rest/v1/rpc/marketplace_read_message_notification_settings', (route) =>
        route.fulfill({
          json: messageSettings.get(route.request().postDataJSON()['p_connection_id']),
        }),
      );
      await page.route('**/rest/v1/rpc/marketplace_set_notification_category_settings', (route) => {
        const body = route.request().postDataJSON();
        expect(body['p_workspace_id']).toBe(workspaceId);
        const setting = messageSettings.get(body['p_connection_id'])!;
        expect(body['p_expected_version']).toBe(setting.version);
        const category = body['p_category'] as keyof typeof setting.categories;
        expect(Object.keys(setting.categories)).toContain(category);
        setting.categories[category] = body['p_enabled'];
        setting.enabled = setting.categories.messages;
        setting.version++;
        return route.fulfill({ json: setting });
      });
      const listing = {
        entryId: 'publication-1',
        title: 'Vintage-Schal · Testartikel',
        previousFavorites: 2,
        favorites: 4,
      };
      const notifications = [
        {
          id: '7',
          connectionId: accountIds[0],
          accountName: 'Testkonto A',
          observedAt: '2026-10-01T12:10:00Z',
          read: false,
          listings: [listing],
        },
        {
          id: '8',
          connectionId: accountIds[1],
          accountName: 'Testkonto B',
          observedAt: '2026-10-01T12:15:00Z',
          read: false,
          listings: [listing, { ...listing, entryId: 'second', title: 'Zweiter Testartikel' }],
        },
      ];
      await page.route('**/rest/v1/rpc/marketplace_read_favorite_notifications', (route) => {
        expect(route.request().postDataJSON()['p_workspace_id']).toBe(workspaceId);
        return route.fulfill({
          json: {
            workspaceId,
            items: notifications,
            unreadCount: notifications.filter((item) => !item.read).length,
          },
        });
      });
      await page.route('**/rest/v1/rpc/marketplace_mark_favorite_notifications', (route) => {
        const body = route.request().postDataJSON();
        expect(body['p_workspace_id']).toBe(workspaceId);
        if (body['p_clear']) notifications.splice(0);
        else
          for (const item of notifications)
            if (!body['p_notification_id'] || item.id === body['p_notification_id'])
              item.read = true;
        return route.fulfill({ json: { ok: true } });
      });

      // Der globale Header lädt Favoritenmeldungen auch in der Kontoverwaltung.
      await page.goto('/marketplaces/vinted/accounts');
      const bell = page.getByRole('button', { name: 'Benachrichtigungen', exact: true });
      await expect(bell).toContainText('2');
      await bell.click();
      const inbox = page.locator('#header-notification-menu');
      await expect(inbox).toContainText('2 Artikel wurden favorisiert · Testkonto B');
      const bounds = await inbox.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await checkSurface(page, '#header-notification-menu');
      await screenshot(page, `vinted-inbox-${width}-${theme}`);
      await inbox.getByRole('link', { name: /2 Artikel wurden favorisiert · Testkonto B/ }).click();
      const account = page.getByRole('combobox', { name: 'Vinted-Konto auswählen' });
      await expect(account).toContainText('Testkonto B');
      await expect(page).toHaveURL(/\/marketplaces\/vinted\/listings$/);
      await account.click();
      await page.getByRole('option', { name: /Testkonto A/ }).click();
      await expect(account).toContainText('Testkonto A');
      await expect(page).toHaveTitle(/Flipbase/);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);

      if (width < 768)
        await page
          .locator('app-bottom-nav')
          .getByRole('button', { name: 'Menü', exact: true })
          .click();
      const nav = page.locator('app-sidebar nav');
      await expect(nav.locator('a[href^="/marketplaces/vinted/"]')).toHaveText([
        'Konten',
        'Einstellungen',
        'Übersicht',
        'Postfach',
        'Kleiderschrank',
        'Verkäufe',
        'Versandscheine',
        'Inserat erstellen',
        'Entwürfe',
        'Statistik',
        'Verlauf',
        'Profil',
        'Verhandlung',
        'Favoritennachrichten',
      ]);
      await expect(nav.getByRole('link', { name: 'Alle Marktplätze', exact: true })).toHaveCount(0);
      await expect(nav.locator('[data-sidebar-lower]')).toHaveCount(1);
      await expect(nav.getByRole('link', { name: 'Allgemeine Einstellungen' })).toBeVisible();
      await expect(nav.getByText('Konto', { exact: true })).toBeVisible();
      await expect(nav.getByText('Automatisierungen', { exact: true })).toBeVisible();
      await nav.getByRole('link', { name: 'Vinted-Einstellungen', exact: true }).click();
      const vintedSettings = page.locator('app-vinted-settings');
      const settingsAccount = vintedSettings.getByRole('combobox', {
        name: 'Vinted-Konto für Benachrichtigungen',
      });
      await settingsAccount.click();
      await page.getByRole('option', { name: /Testkonto B/ }).click();
      const settingsMessageSwitch = vintedSettings.getByRole('switch', {
        name: 'Neue Nachrichten',
        exact: true,
      });
      await expect(settingsMessageSwitch).toBeChecked();
      await settingsMessageSwitch.click();
      await expect(settingsMessageSwitch).not.toBeChecked();
      await expect.poll(() => messageSettings.get(accountIds[1])?.categories.messages).toBe(false);
      expect(messageSettings.get(accountIds[0])?.categories.messages).toBe(true);
      await settingsMessageSwitch.click();
      await expect.poll(() => messageSettings.get(accountIds[1])?.categories.messages).toBe(true);
      await checkSurface(page, 'app-vinted-settings');
      await openVintedSection(page, 'Übersicht', width);
      await expect(page.locator('app-vinted-overview')).toContainText('Frage zum Schal');
      const controlBounds = await Promise.all([
        account.boundingBox(),
        page.getByRole('button', { name: 'Kontodaten aktualisieren', exact: true }).boundingBox(),
        page.getByRole('button', { name: 'Vinted-Kontoeinstellungen', exact: true }).boundingBox(),
      ]);
      const accountCenter = controlBounds[0]!.y + controlBounds[0]!.height / 2;
      for (const bounds of controlBounds.slice(1))
        expect(Math.abs(bounds!.y + bounds!.height / 2 - accountCenter)).toBeLessThanOrEqual(2);
      await expect(
        page.getByRole('link', { name: 'Vinted-Anmeldung öffnen', exact: true }),
      ).toHaveCount(0);
      await checkSurface(page, 'app-vinted-workspace');
      await screenshot(page, `vinted-overview-${width}-${theme}`);

      const settingsButton = page.getByRole('button', {
        name: 'Vinted-Kontoeinstellungen',
        exact: true,
      });
      await settingsButton.click();
      const dialog = page.getByRole('dialog', { name: 'Vinted-Kontoeinstellungen', exact: true });
      const checkbox = dialog.getByRole('switch', {
        name: 'Neue Favoriten',
      });
      const messageSwitch = dialog.getByRole('switch', { name: 'Neue Nachrichten', exact: true });
      for (const label of [
        'Preisvorschläge',
        'Bestellungen und Verkäufe',
        'Versand und Zustellung',
        'Zahlungen und Rückerstattungen',
        'Neue Bewertungen',
        'Weitere Statusmeldungen',
      ])
        await expect(dialog.getByRole('switch', { name: label, exact: true })).toBeChecked();
      await expect(messageSwitch).toBeChecked();
      await messageSwitch.click();
      await expect(messageSwitch).not.toBeChecked();
      const paymentSwitch = dialog.getByRole('switch', {
        name: 'Zahlungen und Rückerstattungen',
        exact: true,
      });
      await expect(paymentSwitch).toBeEnabled();
      await expect(paymentSwitch).toBeChecked();
      await paymentSwitch.click();
      await expect(paymentSwitch).not.toBeChecked();
      await expect(
        dialog.getByRole('switch', { name: 'Bestellungen und Verkäufe', exact: true }),
      ).toBeChecked();
      await expect(dialog).not.toContainText('Ohne Ton');
      await expect(dialog).not.toContainText('Gespeichert:');
      await expect(dialog).not.toContainText('Abrufdetails');
      await expect(dialog).not.toContainText('Nachrichtenversand');
      const pauseButton = dialog.getByRole('button', { name: 'Pausieren', exact: true });
      const interval = dialog.getByRole('combobox', { name: 'Abrufabstand', exact: true });
      const [intervalBounds, pauseBounds] = await Promise.all([
        interval.boundingBox(),
        pauseButton.boundingBox(),
      ]);
      expect(Math.abs(intervalBounds!.y - pauseBounds!.y)).toBeLessThanOrEqual(2);
      const login = dialog.getByRole('link', { name: 'Vinted-Anmeldung öffnen', exact: true });
      const accounts = dialog.getByRole('link', { name: 'Kontenübersicht', exact: true });
      const [loginBounds, accountsBounds] = await Promise.all([
        login.boundingBox(),
        accounts.boundingBox(),
      ]);
      const actionBounds = await login.evaluate((element) => {
        const bounds = element.closest('app-button')!.parentElement!.getBoundingClientRect();
        return { x: bounds.x, right: bounds.right, width: bounds.width };
      });
      expect(Math.abs(loginBounds!.x - actionBounds.x)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(accountsBounds!.x + accountsBounds!.width - actionBounds.right),
      ).toBeLessThanOrEqual(1);
      if (width < 640) {
        expect(Math.abs(loginBounds!.width - actionBounds.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(accountsBounds!.width - actionBounds.width)).toBeLessThanOrEqual(1);
        expect(accountsBounds!.y).toBeGreaterThan(loginBounds!.y);
      } else {
        expect(Math.abs(loginBounds!.y - accountsBounds!.y)).toBeLessThanOrEqual(1);
      }
      await screenshot(page, `vinted-settings-${width}-${theme}`);
      await expect(checkbox).toBeChecked();
      await checkbox.click();
      await expect(checkbox).not.toBeChecked();
      await checkSurface(page, 'app-modal-shell');
      await dialog.press('Escape');
      await expect(settingsButton).toBeFocused();
      await settingsButton.click();
      await expect(checkbox).not.toBeChecked();
      await expect(messageSwitch).not.toBeChecked();
      await expect(paymentSwitch).not.toBeChecked();
      await dialog.press('Escape');
      await account.click();
      await page.getByRole('option', { name: /Testkonto B/ }).click();
      await settingsButton.click();
      await expect(checkbox).toBeChecked();
      await expect(messageSwitch).toBeChecked();
      await expect(paymentSwitch).toBeChecked();
      await dialog.press('Escape');
      await account.click();
      await page.getByRole('option', { name: /Testkonto A/ }).click();

      await openVintedSection(page, 'Statistik', width);
      const statisticsPage = page.locator('app-vinted-statistics');
      await expect(statisticsPage).toContainText('1.234');
      await expect(statisticsPage).toContainText('+23 % gegenüber den 7 Tagen davor');
      await expect(statisticsPage).toContainText('Nicht mehr online');
      await expect(statisticsPage.locator('.apexcharts-canvas')).toBeVisible();
      await statisticsPage.getByRole('button', { name: '30 Tage', exact: true }).click();
      await expect(
        statisticsPage.getByRole('button', { name: '30 Tage', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await checkSurface(page, 'app-vinted-statistics');
      await screenshot(page, `vinted-statistics-${width}-${theme}`);
      await openVintedSection(page, 'Kleiderschrank', width);
      await expect(page.locator('[data-metric-increase]')).toHaveCount(0);
      imported.views = 7;
      imported.favorites = 4;
      imported.observedAt = '2026-10-01T12:20:00Z';
      Object.assign(comparison, {
        observedAt: imported.observedAt,
        baselineAt: '2026-10-01T12:00:00Z',
        views: 2,
        favorites: 2,
      });
      schedule.lastSuccessAt = imported.observedAt;
      await page.clock.runFor(30_000);
      await expect(page.locator('[data-views]')).toHaveText('7');
      await expect(page.locator('[data-metric-increase="views"]')).toContainText('+2');
      await expect(page.locator('[data-metric-increase="favorites"]')).toContainText('+2');
      expect(
        await page
          .locator('[data-metric-increase="views"]')
          .evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
      ).toBeLessThanOrEqual(0.001);
      await checkSurface(page, 'app-vinted-listings');
      await screenshot(page, `vinted-listings-${width}-${theme}`);
      await expect(page.locator('app-vinted-listing-age:visible').first()).toContainText('2 T');
      await page.getByRole('link', { name: 'Inserat Vintage-Schal · Testartikel öffnen' }).click();
      await expect(page.locator('app-vinted-listing-age:visible').first()).toContainText(
        '2 Tage online',
      );
      const detail = page.locator('app-vinted-listing-detail');
      await expect(detail).toContainText('Gespeicherte Beschreibung des Testschals.');
      await expect(detail).not.toContainText('Beschreibung wird');
      await expect(
        nav.getByRole('link', { name: 'Kleiderschrank', exact: true, includeHidden: true }),
      ).toHaveAttribute('aria-current', 'page');
      const secondPhoto = detail.getByRole('button', { name: 'Foto 2 von 2 öffnen' });
      await secondPhoto.click();
      await expect(page.getByRole('dialog', { name: 'Artikelfotos' })).toBeVisible();
      await expect(page.getByRole('dialog').getByRole('img')).toHaveAttribute(
        'src',
        imported.imageUrls[1],
      );
      await page.keyboard.press('Escape');
      await expect(secondPhoto).toBeFocused();
      await checkSurface(page, 'app-vinted-listing-detail');
      await screenshot(page, `vinted-detail-${width}-${theme}`);
      await page.getByRole('link', { name: 'Zurück zu Inseraten' }).click();
      // Die Änderung gehört zum letzten Abruf und bleibt beim erneuten Öffnen sichtbar.
      await expect(page.locator('[data-metric-increase="views"]')).toContainText('+2');
      imported.observedAt = '2026-10-01T12:25:00Z';
      schedule.lastSuccessAt = imported.observedAt;
      Object.assign(comparison, {
        observedAt: imported.observedAt,
        baselineAt: '2026-10-01T12:20:00Z',
        views: 0,
        favorites: 0,
      });
      await page.clock.runFor(30_000);
      await expect(page.locator('[data-metric-increase]')).toHaveCount(0);

      await openVintedSection(page, 'Postfach', width);
      const conversationButton = page.getByRole('button', { name: /Frage zum Schal/ });
      await conversationButton.focus();
      await conversationButton.press('Enter');
      await expect(page.getByRole('log')).toContainText('Welche Maße hat der Schal?');
      const messageLog = page.getByRole('log');
      await expect(messageLog.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
      expect(calls.filter((call) => call.name === 'browser_read_conversation')).toEqual([
        {
          name: 'browser_read_conversation',
          body: {
            workspaceId,
            connectionId: accountIds[0],
            conversationId,
            requestId: expect.stringMatching(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i),
          },
        },
      ]);
      await expect(messageLog.locator('article')).toHaveCount(6);
      await expect(messageLog.locator('[data-message-direction="outbound"]')).toContainText(
        'Testantwort: 180 × 30 cm.',
      );
      await expect(messageLog.locator('[data-message-kind="system"]')).toContainText(
        'System: Der Versandstatus wurde aktualisiert.',
      );
      await expect(messageLog.locator('[data-message-kind="offer"]')).toContainText(
        'Preisangebot zum Schal',
      );
      await expect(messageLog.locator('[data-message-kind="offer"]')).toContainText('12,00 €');
      const unknownMessage = messageLog
        .locator('article')
        .filter({ hasText: 'Unbekannte Richtung bleibt neutral.' });
      await expect(unknownMessage).toHaveAttribute('data-message-direction', 'unknown');
      await expect(messageLog).toContainText(longUrl);
      await expect(messageLog.locator('input, textarea, button, a')).toHaveCount(0);
      expect(await messageLog.evaluate((log) => log.scrollWidth <= log.clientWidth)).toBe(true);
      const positions = await messageLog.evaluate((log) => {
        const bounds = log.getBoundingClientRect();
        const outboundRow = log
          .querySelector('[data-message-direction="outbound"]')
          ?.closest('[data-message-row]');
        if (!outboundRow) throw new Error('The outbound message row is missing.');
        const outbound = outboundRow.getBoundingClientRect();
        const centered = [
          ...log.querySelectorAll(
            '[data-message-kind="system"], [data-message-direction="unknown"]',
          ),
        ].map((message) => message.getBoundingClientRect());
        return {
          rightGap: bounds.right - outbound.right,
          centerOffsets: centered.map((message) =>
            Math.abs(message.x + message.width / 2 - (bounds.x + bounds.width / 2)),
          ),
        };
      });
      expect(positions.rightGap).toBeLessThanOrEqual(24);
      for (const offset of positions.centerOffsets) expect(offset).toBeLessThanOrEqual(1);
      const textMeasurements = await measureMessageText(page);
      const timestamps = textMeasurements.filter((measurement) => measurement.isTimestamp);
      const expectedTimestamps = await page.evaluate(() => {
        const formatter = new Intl.DateTimeFormat('de-DE', {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
        return Array.from(
          { length: 6 },
          (_, index) => `${formatter.format(new Date(`2026-09-26T12:0${index}:00Z`))} Uhr`,
        );
      });
      expect(timestamps.map((measurement) => measurement.text)).toEqual(expectedTimestamps);
      await expect(messageLog.locator('article time')).toHaveCount(6);
      for (let index = 0; index < 6; index++) {
        await expect(messageLog.locator('article time').nth(index)).toHaveAttribute(
          'datetime',
          `2026-09-26T12:0${index}:00Z`,
        );
      }
      for (const measurement of textMeasurements) {
        expect(measurement.contrast, `${theme}: ${measurement.text}`).toBeGreaterThanOrEqual(4.5);
        expect(measurement.fontSize).toBeGreaterThanOrEqual(measurement.isTimestamp ? 12 : 13);
      }
      const evidenceDirectory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
      if (evidenceDirectory) {
        await mkdir(evidenceDirectory, { recursive: true });
        await writeFile(
          join(evidenceDirectory, `vinted-message-contrast-${width}-${theme}.json`),
          JSON.stringify({ width, theme, measurements: textMeasurements }, null, 2),
        );
      }
      await expect(page.locator('[data-conversation-heading]')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(messageLog).toBeFocused();
      expect(await messageLog.evaluate((log) => log.scrollHeight > log.clientHeight)).toBe(true);
      expect(await messageLog.evaluate((log) => getComputedStyle(log).boxShadow)).not.toBe('none');
      await page.keyboard.press('Home');
      await expect.poll(() => messageLog.evaluate((log) => log.scrollTop)).toBe(0);
      await page.keyboard.press('End');
      await expect.poll(() => messageLog.evaluate((log) => log.scrollTop)).toBeGreaterThan(0);
      await checkSurface(page, 'app-vinted-messages');
      await screenshot(page, `vinted-messages-${width}-${theme}`);
      await openVintedSection(page, 'Verlauf', width);
      await expect(page.locator('app-vinted-account-content')).toContainText(
        'Noch keine gespeicherten Vinted-Aktivitäten',
      );
      await page.goto('/marketplaces/vinted/feedback');
      await expect(page).toHaveURL(/\/profile#reviews$/);
      await expect(page.locator('#reviews')).toBeFocused();
      await checkSurface(page, 'app-vinted-profile');
      if (width === 1440 && theme === 'light') {
        const secondPage = await page.context().newPage();
        await mockMarketplace(secondPage, true, false, false, false, []);
        await secondPage.clock.install();
        await secondPage.route('**/rest/v1/rpc/marketplace_read_favorite_notifications', (route) =>
          route.fulfill({
            json: {
              workspaceId,
              items: notifications,
              unreadCount: notifications.filter((item) => !item.read).length,
            },
          }),
        );
        await secondPage.goto('/marketplaces/vinted/accounts');
        const secondBell = secondPage.getByRole('button', {
          name: 'Benachrichtigungen',
          exact: true,
        });
        await expect(secondBell).toContainText('1');
        await bell.click();
        await inbox.getByRole('button', { name: 'Gelesen', exact: true }).click();
        await expect(bell.locator('span')).toHaveCount(0);
        await secondPage.clock.runFor(30_000);
        await expect(secondBell.locator('span')).toHaveCount(0);
        await inbox.getByRole('button', { name: 'Benachrichtigungsverlauf leeren' }).click();
        await expect(inbox).toContainText('Keine neuen Meldungen vorhanden.');
        await secondPage.close();
        await bell.click();
      }
      if (width === 1440) {
        await page.evaluate(() => {
          document.documentElement.style.zoom = '2';
        });
        await openVintedSection(page, 'Postfach', width);
        await page.getByRole('button', { name: /Frage zum Schal/ }).click();
        await expect(page.getByRole('log')).toContainText('Welche Maße hat der Schal?');
        await checkSurface(page, 'app-vinted-messages');
        await settingsButton.click();
        await expect(dialog).toBeVisible();
        await checkSurface(page, 'app-modal-shell');
        await screenshot(page, `vinted-settings-200-percent-${theme}`);
        await dialog.press('Escape');
      }
      expect(
        calls.filter(
          (call) => call.name.startsWith('browser_') && call.name !== 'browser_read_conversation',
        ),
      ).toEqual([]);
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });
  }
}

test.describe('Gemeinsame Vinted-Kontoansicht auf Mobilgeräten', () => {
  test.use({ viewport: { width: 390, height: 650 }, hasTouch: true, colorScheme: 'dark' });

  test('behält Alle Konten beim Wechsel zwischen Listen, Details und Neuladen @marketplace-preview', async ({
    page,
  }) => {
    await mockMarketplace(page, false, false, false, false, []);
    await page.addInitScript(() => localStorage.setItem('flipbase_theme', 'dark'));
    const accountEntries = accountIds.map((connectionId, index) => {
      const scope = { workspaceId, connectionId };
      return {
        scope,
        publication: {
          ...scope,
          id: `25000000-0000-4000-8000-00000000004${index + 1}`,
          externalId: '123',
          title: 'Vintage-Pullover',
          publicationState: 'active',
          text: `Gespeicherte Beschreibung aus Konto ${index + 1}.`,
          textState: 'loaded',
          price: 30,
          currency: 'EUR',
        },
        conversation: {
          ...scope,
          id: `25000000-0000-4000-8000-00000000003${index + 1}`,
          title: 'Ist der Pullover noch da?',
          text: 'Hallo!',
          unread: true,
        },
        sale: {
          ...scope,
          id: `25000000-0000-4000-8000-00000000005${index + 1}`,
          externalId: '456',
          title: 'Verkaufter Pullover',
          saleState: 'sold',
          price: 30,
          currency: 'EUR',
        },
      };
    });
    const pageOf = (items: readonly object[]) => ({ items, total: items.length, nextCursor: null });
    await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) => {
      const account = accountEntries.find(
        ({ scope }) => scope.connectionId === route.request().postDataJSON()['p_connection_id'],
      );
      if (!account) return route.fulfill({ status: 404 });
      return route.fulfill({
        json: {
          ...account.scope,
          profile: null,
          publications: pageOf([account.publication]),
          conversations: pageOf([account.conversation]),
          sales: pageOf([account.sale]),
          activity: pageOf([]),
        },
      });
    });
    await page.route('**/rest/v1/marketplace_account_entries?*', (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.get('kind') !== 'eq.publication' || !params.has('id')) return route.fallback();
      expect(params.get('workspace_id')).toBe(`eq.${workspaceId}`);
      const publication = accountEntries.find(
        ({ scope, publication }) =>
          params.get('connection_id') === `eq.${scope.connectionId}` &&
          params.get('id') === `eq.${publication.id}`,
      )?.publication;
      return route.fulfill({
        json: publication ? [{ id: publication.id, body: publication }] : [],
      });
    });
    const combinedReads = new Set<string>();
    await page.route('**/rest/v1/rpc/marketplace_read_vinted_list', (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body['p_workspace_id']).toBe(workspaceId);
      const kind = body['p_kind'];
      if (kind !== 'publication' && kind !== 'conversation' && kind !== 'sale')
        return route.fulfill({ json: { ...pageOf([]), filterCounts: {} } });
      if (body['p_connection_id'] == null) combinedReads.add(kind);
      const items = accountEntries
        .filter(
          ({ scope }) =>
            body['p_connection_id'] == null || scope.connectionId === body['p_connection_id'],
        )
        .map((account) => account[kind])
        .filter(({ id }) => body['p_entry_id'] == null || id === body['p_entry_id']);
      return route.fulfill({ json: { ...pageOf(items), filterCounts: {} } });
    });

    await page.goto('/marketplaces/vinted/listings');
    const view = page.getByRole('combobox', { name: 'Vinted-Konto auswählen', exact: true });
    await expect(view).toHaveText('Testkonto A');
    await view.click();
    await page.getByRole('option', { name: 'Alle Konten', exact: true }).click();
    await expect(view).toHaveText('Alle Konten');
    const listings = page.locator('app-vinted-listings [data-listing-row]');
    await expect(listings).toHaveCount(2);
    const listingA = listings.filter({ hasText: 'Testkonto A' });
    await expect(listingA.getByText('Testkonto A', { exact: true })).toBeVisible();
    await expect(listingA).toContainText('Vintage-Pullover');
    const listingB = listings.filter({ hasText: 'Testkonto B' });
    await expect(listingB.getByText('Testkonto B', { exact: true })).toBeVisible();
    await expect(listingB).toContainText('Vintage-Pullover');
    const listingBLink = listingB.getByRole('link', { name: /Vintage-Pullover/ });
    await expect(listingBLink).toHaveAttribute(
      'href',
      `/marketplaces/vinted/listings/${accountIds[1]}/${accountEntries[1].publication.id}`,
    );
    await checkSurface(page, 'app-vinted-listings');
    await listingBLink.click();
    await expect(page.locator('app-vinted-listing-detail')).toContainText(
      'Gespeicherte Beschreibung aus Konto 2.',
    );
    await page.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
    await expect(view).toHaveText('Alle Konten');
    await expect(listings).toHaveCount(2);

    await page.locator('app-bottom-nav').getByRole('button', { name: 'Menü', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Bereiche' });
    const generalSettings = nav.getByRole('link', { name: 'Allgemeine Einstellungen' });
    await generalSettings.scrollIntoViewIfNeeded();
    await expect(generalSettings).toBeInViewport();
    await expect(nav.getByRole('link', { name: 'Vinted-Einstellungen', exact: true })).toHaveCount(
      1,
    );
    await nav.getByRole('link', { name: 'Postfach', exact: true }).click();

    await expect(view).toHaveText('Alle Konten');
    const conversations = page.locator('app-vinted-messages [data-conversation-row]');
    await expect(conversations).toHaveCount(2);
    for (const accountName of ['Testkonto A', 'Testkonto B']) {
      const conversation = conversations.filter({ hasText: accountName });
      await expect(conversation.getByText(accountName, { exact: true })).toBeVisible();
      await expect(conversation).toContainText('Ist der Pullover noch da?');
    }

    await openVintedSection(page, 'Verkäufe', 390);
    const sales = page.locator('app-vinted-sales article');
    await expect(view).toHaveText('Alle Konten');
    await expect(sales).toHaveCount(2);
    for (const accountName of ['Testkonto A', 'Testkonto B']) {
      const sale = sales.filter({ hasText: accountName });
      await expect(sale.getByText(accountName, { exact: true })).toBeVisible();
      await expect(sale).toContainText('Verkaufter Pullover');
    }
    await page.reload();
    await expect(view).toHaveText('Alle Konten');
    await expect(sales).toHaveCount(2);
    expect(combinedReads).toEqual(new Set(['publication', 'conversation', 'sale']));
  });
});

for (const [width, theme, hasTouch] of [
  [1440, 'light', false],
  [390, 'dark', true],
] as const) {
  test.describe(`Versandscheine bei ${width}px ${theme}`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch, colorScheme: theme });

    test('verlinkt aus Chat und Verkäufen zum passenden QR-Code @marketplace-preview', async ({
      page,
    }) => {
      await mockMarketplace(page, false, false, false, false, []);
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      const sale = {
        id: '25000000-0000-4000-8000-000000000061',
        title: 'Verkaufter Schal',
        saleState: 'sold',
        shipmentId: '201',
        shippingLabelAction: 'available',
        shippingDeadline: '24 Nov. 20:18',
        itemIds: ['123'],
        conversationId,
      };
      await page.route('**/rest/v1/rpc/marketplace_read_snapshot', async (route) => {
        const scope = {
          workspaceId,
          connectionId: String(route.request().postDataJSON()['p_connection_id']),
        };
        const empty = { items: [], total: 0, nextCursor: null };
        await route.fulfill({
          json: {
            ...scope,
            profile: null,
            publications: empty,
            conversations: {
              ...empty,
              total: 1,
              items: [{ ...scope, id: conversationId, title: 'Verkaufter Schal' }],
            },
            sales: {
              ...empty,
              total: 2,
              items: [
                { ...scope, ...sale },
                {
                  ...scope,
                  ...sale,
                  id: '25000000-0000-4000-8000-000000000062',
                  title: 'Verkauftes Hemd',
                  shipmentId: '203',
                  shippingLabelAction: null,
                  shippingDeadline: null,
                },
              ],
            },
            activity: empty,
          },
        });
      });
      const storedLabels = [
        {
          id: 22,
          workspace_id: workspaceId,
          connection_id: accountIds[1],
          external_transaction_id: '102',
          external_shipment_id: '202',
          title: 'Andere Bestellung',
          carrier_name: 'DPD Classic',
          label_type: 'printable',
          storage_path: 'other.pdf',
          mime_type: 'application/pdf',
          fetched_at: '2026-11-18T16:00:00Z',
        },
        {
          id: 21,
          workspace_id: workspaceId,
          connection_id: accountIds[0],
          external_transaction_id: '101',
          external_shipment_id: '201',
          title: sale.title,
          carrier_name: 'DHL',
          storage_path: 'shipping.png',
          mime_type: 'image/png',
          fetched_at: '2026-11-18T15:00:00Z',
        },
      ];
      await page.route('**/rest/v1/marketplace_shipping_labels?*', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        expect(params.get('workspace_id')).toBe('eq.' + workspaceId);
        const account = params.get('connection_id');
        await route.fulfill({
          json: storedLabels.filter((label) => !account || account === 'eq.' + label.connection_id),
        });
      });
      const photo = 'https://images.example.test/versand-schal.svg';
      await page.route(photo, (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="48"><rect width="24" height="48" fill="#935653"/></svg>',
        }),
      );
      await page.route('**/rest/v1/marketplace_account_entries?*', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        if (params.get('select') !== 'connection_id,external_id,image_url:body->>imageUrl')
          return route.fallback();
        expect(params.get('workspace_id')).toBe('eq.' + workspaceId);
        await route.fulfill({
          json: [{ connection_id: accountIds[0], external_id: '101', image_url: photo }],
        });
      });
      await page.goto(
        `/marketplaces/vinted/messages?connectionId=${accountIds[0]}&conversationId=${conversationId}`,
      );
      const jump = page.getByRole('link', { name: 'Zum Versandschein' });
      await expect(jump).toBeVisible();
      await expect(page.getByRole('button', { name: 'Versandschein abholen' })).toHaveCount(0);
      await (hasTouch ? jump.tap() : jump.click());
      await expect(page).toHaveURL(/shipping-labels\?labelId=21$/);
      const target = page.getByRole('row', { name: /Verkaufter Schal/ });
      await expect(target).toHaveAttribute('aria-current', 'true');
      await expect(target).toBeFocused();
      const openQr = target.getByRole('button', { name: 'QR-Code öffnen' });
      await expect(openQr).toBeVisible();
      await expect(target.getByRole('button', { name: 'QR-Code herunterladen' })).toBeAttached();
      const other = page.getByRole('row', { name: /Andere Bestellung/ });
      const accountView = page.getByRole('combobox', { name: 'Vinted-Konto auswählen' });
      await expect(accountView).toHaveText('Testkonto A');
      await expect(other).toHaveCount(0);
      await expect(target).toContainText('Testkonto A');
      const thumbnail = target.locator('img');
      await expect(thumbnail).toHaveAttribute('src', photo);
      await expect(thumbnail).toHaveCSS('object-fit', 'cover');
      await expect
        .poll(() => thumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth))
        .toBe(24);
      const markedColor = () => target.evaluate((row) => getComputedStyle(row).backgroundColor);
      const brandColor = /^rgba?\(252, 198, 1, /;
      await expect.poll(markedColor).toMatch(brandColor);
      await expect(target).toHaveCSS('box-shadow', 'none');
      await expect(target).toHaveCSS('outline-style', 'none');
      await checkSurface(page, 'app-vinted-shipping-labels');
      await expect(target).not.toHaveAttribute('aria-current', 'true');
      await expect.poll(markedColor).not.toMatch(brandColor);
      await expect(target).toBeFocused();

      await accountView.click();
      await page.getByRole('option', { name: 'Alle Konten', exact: true }).click();
      await expect(other).toContainText('Testkonto B');
      await expect(other).not.toHaveAttribute('aria-current', 'true');
      await expect(other.locator('[data-product-placeholder]')).toBeVisible();
      const openPdf = other.getByRole('button', { name: 'Druck-PDF öffnen' });
      await expect(openPdf).toBeVisible();
      const buttonWidth = (button: HTMLElement) => button.getBoundingClientRect().width;
      expect(await openQr.evaluate(buttonWidth)).toBe(await openPdf.evaluate(buttonWidth));
      await accountView.click();
      await page.getByRole('option', { name: 'Testkonto A', exact: true }).click();
      await expect(other).toHaveCount(0);

      await openVintedSection(page, 'Verkäufe', width);
      if (hasTouch) await page.setViewportSize({ width: 320, height: 900 });
      const card = page.locator('article').filter({
        has: page.getByRole('heading', { name: sale.title, exact: true }),
      });
      const footer = card.locator('[data-sale-footer]');
      const controls = footer.getByRole('link');
      await expect(controls).toHaveCount(3);
      expect(
        await controls.evaluateAll((links) => links.map((link) => link.getAttribute('aria-label'))),
      ).toEqual([
        'Zum Versandschein',
        'Verkaufter Schal neu einstellen',
        'Chat zu Verkaufter Schal öffnen',
      ]);
      await expect(jump).toHaveCSS('background-color', /^rgb\(252, 198, 1\)$/);
      const centers = await controls.evaluateAll((links) =>
        links.map((link) => {
          const { top, height } = link.getBoundingClientRect();
          return Math.round(top + height / 2);
        }),
      );
      expect(new Set(centers).size).toBe(1);
      const footerWithoutLabel = page
        .locator('article')
        .filter({
          has: page.getByRole('heading', { name: 'Verkauftes Hemd', exact: true }),
        })
        .locator('[data-sale-footer]');
      expect((await footer.boundingBox())!.height).toBe(
        (await footerWithoutLabel.boundingBox())!.height,
      );
      await expect(jump).toHaveAttribute('href', /shipping-labels\?labelId=21$/);
      await expect(page.getByRole('button', { name: 'Versandschein abholen' })).toHaveCount(0);
      await (hasTouch ? jump.tap() : jump.click());
      await expect(target).toHaveAttribute('aria-current', 'true');
    });
  });
}

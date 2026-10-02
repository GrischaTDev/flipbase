import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mockMarketplace, workspaceId, accountIds } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

async function checkSurface(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error('Geprüfte Oberfläche fehlt');
    return (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations;
  }, selector);
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
    return [...log.querySelectorAll('article p')].map((paragraph) => {
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
        isTimestamp: paragraph === paragraph.closest('article')?.lastElementChild,
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
        publicationsTotal: 1,
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
        expect(body['p_parent_id']).toBe('conversation-1');
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
            scheduledSync: {
              enabled: true,
              authorizationVersion: 2,
              allowedIntervals: [3, 5, 10, 15, 30, 60],
            },
          },
        }),
      );
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      await page.clock.install();
      const errors: string[] = [];
      const warnings: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('WebSocket'))
          errors.push(message.text());
        if (message.type() === 'warning') warnings.push(message.text());
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

      // Der globale Header lädt Favoritenmeldungen auch außerhalb der Vinted-Seite.
      await page.goto('/settings/marketplaces');
      const bell = page.getByRole('button', { name: 'Benachrichtigungen', exact: true });
      await expect(bell).toContainText('2');
      await bell.click();
      const inbox = page.locator('#header-notification-menu');
      await expect(inbox).toContainText('Mehr Favoriten · Testkonto B');
      const bounds = await inbox.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await checkSurface(page, '#header-notification-menu');
      await screenshot(page, `vinted-inbox-${width}-${theme}`);
      await inbox.getByRole('link', { name: /Mehr Favoriten · Testkonto B/ }).click();
      const account = page.getByRole('combobox', { name: 'Vinted-Konto auswählen' });
      await expect(account).toContainText('Testkonto B');
      await expect(page).toHaveURL(/\/marketplaces\/vinted\/listings$/);
      await account.click();
      await page.getByRole('option', { name: /Testkonto A/ }).click();
      await expect(account).toContainText('Testkonto A');
      await expect(page).toHaveTitle(/Flipbase/);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);

      const nav = page.getByRole('navigation', { name: 'Vinted-Bereiche' });
      await expect(nav.getByRole('link')).toHaveText([
        'Übersicht',
        'Nachrichten',
        'Inserate',
        'Verkäufe',
        'Aktivitäten',
        'Profil',
      ]);
      await nav.getByRole('link', { name: 'Übersicht', exact: true }).click();
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
      const checkbox = dialog.getByRole('checkbox', {
        name: 'Neue Favoriten in der Glocke anzeigen',
      });
      await expect(checkbox).toBeChecked();
      await checkbox.click();
      await expect(checkbox).not.toBeChecked();
      await checkSurface(page, 'app-modal-shell');
      await dialog.press('Escape');
      await expect(settingsButton).toBeFocused();
      await settingsButton.click();
      await expect(checkbox).not.toBeChecked();
      await dialog.press('Escape');
      await account.click();
      await page.getByRole('option', { name: /Testkonto B/ }).click();
      await settingsButton.click();
      await expect(checkbox).toBeChecked();
      await dialog.press('Escape');
      await account.click();
      await page.getByRole('option', { name: /Testkonto A/ }).click();

      await nav.getByRole('link', { name: 'Inserate', exact: true }).click();
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
      await page.getByRole('link', { name: 'Inserat Vintage-Schal · Testartikel öffnen' }).click();
      const detail = page.locator('app-vinted-listing-detail');
      await expect(detail).toContainText('Gespeicherte Beschreibung des Testschals.');
      await expect(detail).not.toContainText('Beschreibung wird');
      await expect(nav.getByRole('link', { name: 'Inserate', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const image = detail.locator('app-product-thumbnail').first();
      const imageBounds = await image.boundingBox();
      expect(imageBounds!.height).toBeLessThanOrEqual(width < 768 ? 260 : 420);
      expect(imageBounds!.width).toBeLessThanOrEqual(360);
      await expect(detail.getByRole('button', { name: 'Foto 2 anzeigen' })).toBeVisible();
      await detail.getByRole('button', { name: 'Foto 2 anzeigen' }).click();
      await expect(detail.getByRole('button', { name: 'Foto 2 anzeigen' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
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

      await nav.getByRole('link', { name: 'Nachrichten', exact: true }).click();
      await page.getByRole('button', { name: /Frage zum Schal/ }).click();
      await expect(page.getByRole('log')).toContainText('Welche Maße hat der Schal?');
      const messageLog = page.getByRole('log');
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
        const outbound = log
          .querySelector('[data-message-direction="outbound"]')!
          .getBoundingClientRect();
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
      expect(positions.rightGap).toBeLessThanOrEqual(13);
      for (const offset of positions.centerOffsets) expect(offset).toBeLessThanOrEqual(1);
      const textMeasurements = await measureMessageText(page);
      const timestamps = textMeasurements.filter((measurement) => measurement.isTimestamp);
      const expectedTimestamps = await page.evaluate(() => {
        const formatter = new Intl.DateTimeFormat('de-DE', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
        return Array.from({ length: 6 }, (_, index) =>
          formatter.format(new Date(`2026-09-26T12:0${index}:00Z`)),
        );
      });
      expect(timestamps.map((measurement) => measurement.text)).toEqual(expectedTimestamps);
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
      await nav.getByRole('link', { name: 'Aktivitäten', exact: true }).click();
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
        await secondPage.goto('/settings/marketplaces');
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
        await nav.getByRole('link', { name: 'Nachrichten', exact: true }).click();
        await page.getByRole('button', { name: /Frage zum Schal/ }).click();
        await expect(page.getByRole('log')).toContainText('Welche Maße hat der Schal?');
        await checkSurface(page, 'app-vinted-messages');
        await settingsButton.click();
        await expect(dialog).toBeVisible();
        await checkSurface(page, 'app-modal-shell');
        await screenshot(page, `vinted-settings-200-percent-${theme}`);
        await dialog.press('Escape');
      }
      expect(calls.some((call) => call.name.startsWith('browser_'))).toBe(false);
      expect(errors).toEqual([]);
      expect(warnings).toEqual([]);
    });
  }
}

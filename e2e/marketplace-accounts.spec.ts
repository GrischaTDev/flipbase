import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accountIds, mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

for (const width of [1440, 390]) {
  test(`Kontenkacheln sortieren und lokale Einstellungen öffnen bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await mockMarketplace(page, false, false, false, false, [], undefined, true);
    await page.goto('/marketplaces/vinted/accounts');
    await expect(page.getByText('8 von 10 Plätzen frei')).toBeVisible();
    await expect(page.getByText('Lokal verbunden', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Konten verwalten', exact: true })).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Testkonto A nach hinten verschieben', exact: true })
      .click();
    const names = page.locator('app-vinted-account-grid h3');
    await expect(names).toHaveText(['Testkonto B', 'Testkonto A']);
    await page.reload();
    await expect(names).toHaveText(['Testkonto B', 'Testkonto A']);
    const handle = page.getByRole('button', { name: 'Testkonto A ziehen', exact: true });
    const first = page.locator('app-vinted-account-grid [cdkDrag]').first();
    await expect(handle).toBeEnabled();
    await handle.scrollIntoViewIfNeeded();
    await first.scrollIntoViewIfNeeded();
    const start = await handle.boundingBox();
    const end = await first.boundingBox();
    if (!start || !end) throw new Error('Konten-Griff fehlt');
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 8, start.y + start.height / 2 + 8, {
      steps: 5,
    });
    await page.mouse.move(end.x + end.width / 2, end.y + 50, { steps: 16 });
    await page.mouse.up();
    await expect
      .poll(() => calls.filter((call) => call.name === 'marketplace_reorder_connections').length)
      .toBe(2);
    await expect(page.getByText('Kontenreihenfolge gespeichert.', { exact: true })).toBeVisible();
    await expect(names).toHaveText(['Testkonto A', 'Testkonto B']);
    await page.getByRole('button', { name: 'Testkonto A einstellen', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Neue Favoriten in der Glocke anzeigen');
    await expect(page.getByRole('button', { name: 'Konto entfernen', exact: true })).toBeVisible();
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
    await evidence(page, `vinted-account-settings-${width}`);
    await page.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Browserprofil');
    await expect(page.getByRole('dialog')).toContainText('Chrome');
    await expect(page.locator('a[href*="chromewebstore"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await evidence(page, `vinted-account-add-${width}`);
  });
}

async function chooseCloudConnection(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Verbindung', exact: true }).click();
  await page.getByRole('option', { name: 'Cloudbrowser', exact: true }).click();
  await page.getByRole('button', { name: 'Weiter zur Cloud-Anmeldung', exact: true }).click();
}

async function openVintedSection(page: Page, label: string, width: number): Promise<void> {
  if (width < 768)
    await page.locator('app-bottom-nav').getByRole('button', { name: 'Menü', exact: true }).click();
  await page.locator('app-sidebar').getByRole('link', { name: label, exact: true }).click();
}

for (const width of [1440, 390]) {
  test(`Cloud-Einrichtung ohne freie IP bleibt lokal nutzbar bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await mockMarketplace(page, true);
    await page.route('**/marketplace-browser/cloud-setups/begin', (route) =>
      route.fulfill({ json: { status: 'no_capacity' } }),
    );
    await page.goto('/marketplaces/vinted/manage');
    await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
    await page.getByRole('textbox', { name: 'Interner Name in Flipbase' }).fill('Cloudtest');
    await chooseCloudConnection(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Aktuell sind keine freien Cloud-IPs vorhanden.');
    await expect(page.locator('app-marketplace-browser-test')).toHaveCount(0);
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
    await evidence(page, `vinted-cloud-no-capacity-${width}`);
    await page.getByRole('combobox', { name: 'Verbindung', exact: true }).click();
    await page.getByRole('option', { name: 'Lokale Erweiterung', exact: true }).click();
    await page.getByRole('button', { name: 'Weiter zur lokalen Verbindung', exact: true }).click();
    await expect(page).toHaveURL(/\/local-connect\//);
  });

  test(`Vinted-Bereich führt lokal durch die Einrichtung bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await mockMarketplace(page);
    const errors: string[] = [];
    const browserCalls: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/marketplace-browser\/(sessions|cloud-setups\/(?!availability))/.test(request.url()))
        browserCalls.push(request.url());
    });
    await page.goto('/marketplaces/vinted');
    await expect(
      page
        .locator('app-vinted-account-grid')
        .getByText('Gespeicherte Kontodaten', { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.locator('app-vinted-account-grid').getByRole('link', { name: 'Konten verwalten' }),
    ).toHaveCount(0);
    await expect(page.locator('app-sidebar a[href="/purchases"]')).toHaveCount(0);
    await openVintedSection(page, 'Einrichtung', width);
    await expect(page.getByRole('heading', { name: '2. Erweiterung installieren' })).toBeVisible();
    await expect(page.locator('app-vinted-setup a[href*="chromewebstore"]')).toHaveCount(0);
    await expect(
      page
        .locator('app-vinted-setup')
        .locator('app-button[link="/marketplaces/vinted/accounts"] a'),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByText(
        'Keine Antwort. Prüfe die Erweiterung in diesem Browserprofil und lade die Seite neu.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Verbindung prüfen', exact: true }).click();
    await expect(page.getByText('Verbindung wird geprüft …', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      setInterval(
        () =>
          window.postMessage(
            { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal: true },
            location.origin,
          ),
        100,
      );
    });
    await expect(page.getByText('Erweiterung erreichbar', { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        'Die Erweiterung ist in diesem Browserprofil installiert. Ein anderes Profil benötigt seine eigene Installation.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('app-vinted-setup')).toContainText('Nachrichtenzugriff freigeben');
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-setup') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    await evidence(page, `vinted-setup-${width}`);
    await page
      .locator('app-vinted-setup')
      .getByRole('link', { name: 'Konto hinzufügen', exact: true })
      .click();
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/accounts(?:\?.*)?$/);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Lokales Testkonto');
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
    await expect(page.getByRole('combobox', { name: 'Verbindung', exact: true })).toContainText(
      'Lokale Erweiterung',
    );
    await page.getByRole('button', { name: 'Weiter zur lokalen Verbindung', exact: true }).click();
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/local-connect\//);
    await expect(page.locator('app-vinted-local-connect')).toContainText(
      'Kontoverbindung: Lokales Testkonto',
    );
    await expect(
      page
        .locator('app-vinted-local-connect')
        .getByRole('button', { name: 'Angemeldetes Vinted-Konto prüfen' }),
    ).toBeEnabled();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    expect(calls.filter((call) => call.name === 'marketplace_create_connection')).toHaveLength(1);
    expect(browserCalls).toEqual([]);
    expect(errors).toEqual([]);
    await evidence(page, `vinted-local-connect-${width}`);
  });
}

for (const width of [1440, 390]) {
  test(`Aktualisiert ein lokal verbundenes Konto direkt bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockMarketplace(page);
    const account = {
      workspaceId,
      connectionId: accountIds[0],
      marketplace: 'vinted',
      executionMode: 'local',
      displayName: 'Lokales Testkonto',
      externalAccountId: '100',
      status: 'connected',
      capabilities: {},
      allowedActions: [],
      lastSyncedAt: '2026-10-04T19:00:00Z',
    };
    const binding = {
      externalAccountId: '100',
      expiresAt: '2099-01-01T00:00:00Z',
      lastSeenAt: null,
      revoked: false,
    };
    await page.route('**/rpc/marketplace_list_connections', (route) =>
      route.fulfill({ json: { canManage: true, connections: [account] } }),
    );
    await page.route('**/rpc/marketplace_read_local_extension', (route) =>
      route.fulfill({ json: { binding } }),
    );
    await page.addInitScript(
      ({ account, binding }) => {
        window.addEventListener('message', (event) => {
          if (event.source !== window || event.origin !== location.origin) return;
          const request = event.data;
          if (request?.type === 'FLIPBASE_CHECK_EXTENSION') {
            window.postMessage(
              { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal: true },
              location.origin,
            );
          }
          if (request?.type === 'FLIPBASE_VINTED_LOCAL_SYNC') {
            window.postMessage(
              {
                type: 'FLIPBASE_VINTED_LOCAL_RESULT',
                requestId: request.requestId,
                success: true,
                result: {
                  workspaceId: account.workspaceId,
                  connectionId: account.connectionId,
                  externalAccountId: account.externalAccountId,
                  expiresAt: binding.expiresAt,
                  counts: { profile: 1, publication: 11 },
                  observedAt: account.lastSyncedAt,
                  publicationsComplete: true,
                },
              },
              location.origin,
            );
          }
        });
      },
      { account, binding },
    );
    await page.goto(`/marketplaces/vinted/local-connect/${account.connectionId}`);
    const connection = page.locator('app-vinted-local-connect');
    await expect(
      connection.getByRole('button', { name: 'Jetzt synchronisieren', exact: true }),
    ).toBeEnabled();
    await expect(connection.getByRole('heading', { name: '2. Bei Vinted anmelden' })).toHaveCount(
      0,
    );
    await expect(connection).toContainText(
      'Die Erweiterung öffnet ihren reservierten Vinted-Arbeitstab automatisch',
    );
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-local-connect') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    await evidence(page, `vinted-local-connected-${width}`);
    await openVintedSection(page, 'Übersicht', width);
    await page.getByRole('button', { name: 'Kontodaten aktualisieren', exact: true }).click();
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/overview$/);
    await expect(
      page.getByText('Profil und Inserate wurden übernommen und die lokale Verbindung bestätigt.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('app-vinted-local-connect')).toHaveCount(0);
    await evidence(page, `vinted-local-updated-${width}`);
  });
}

for (const width of [1440, 390]) {
  test(`Gibt das lokale Postfach frei und erhält das Gespräch bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockMarketplace(page);
    const observedAt = '2026-10-04T19:30:00Z';
    const account = {
      workspaceId,
      connectionId: accountIds[0],
      marketplace: 'vinted',
      executionMode: 'local',
      displayName: 'Lokales Testkonto',
      externalAccountId: '100',
      status: 'connected',
      capabilities: {},
      allowedActions: [],
      lastSyncedAt: '2026-10-04T19:00:00Z',
    };
    const binding = {
      externalAccountId: '100',
      expiresAt: '2099-01-01T00:00:00Z',
      lastSeenAt: null,
      revoked: false,
      messagesRead: false,
    };
    let imported = false;
    const errors: string[] = [];
    const bridgeCalls: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/rpc/marketplace_list_connections', (route) =>
      route.fulfill({
        json: {
          canManage: true,
          connections: [
            {
              ...account,
              capabilities: imported ? { 'conversations.read': 'verified' } : {},
              allowedActions: imported ? ['conversations.read'] : [],
              lastSyncedAt: imported ? observedAt : account.lastSyncedAt,
            },
          ],
        },
      }),
    );
    await page.route('**/rpc/marketplace_read_local_extension', (route) =>
      route.fulfill({ json: { binding } }),
    );
    await page.route('**/rpc/marketplace_approve_local_inbox', (route) => {
      expect(route.request().postDataJSON()).toEqual({
        p_workspace_id: workspaceId,
        p_connection_id: accountIds[0],
        p_token_hash: 'a'.repeat(64),
        p_expected_external_account_id: '100',
      });
      binding.messagesRead = true;
      return route.fulfill({
        json: {
          workspaceId,
          connectionId: accountIds[0],
          externalAccountId: '100',
          expiresAt: binding.expiresAt,
          messagesRead: true,
        },
      });
    });
    await page.exposeFunction('recordLocalInboxFixture', (type: string) => {
      bridgeCalls.push(type);
      if (type === 'FLIPBASE_VINTED_LOCAL_INBOX_SYNC') imported = true;
    });
    await page.addInitScript(
      ({ account, binding, observedAt }) => {
        window.addEventListener('message', async (event) => {
          if (event.source !== window || event.origin !== location.origin) return;
          const request = event.data;
          if (request?.type === 'FLIPBASE_CHECK_EXTENSION')
            window.postMessage(
              { type: 'FLIPBASE_EXTENSION_STATUS', installed: true, vintedLocal: true },
              location.origin,
            );
          if (
            !['FLIPBASE_VINTED_LOCAL_PREPARE', 'FLIPBASE_VINTED_LOCAL_INBOX_SYNC'].includes(
              request?.type,
            )
          )
            return;
          await (
            window as unknown as { recordLocalInboxFixture: (type: string) => Promise<void> }
          ).recordLocalInboxFixture(request.type);
          const result =
            request.type === 'FLIPBASE_VINTED_LOCAL_PREPARE'
              ? { tokenHash: 'a'.repeat(64), identity: { id: '100', username: 'testkonto' } }
              : {
                  workspaceId: account.workspaceId,
                  connectionId: account.connectionId,
                  externalAccountId: '100',
                  expiresAt: binding.expiresAt,
                  observedAt,
                  counts: { conversation: 1, message: 1 },
                  conversationsComplete: true,
                  nextPage: 1,
                };
          window.postMessage(
            {
              type: 'FLIPBASE_VINTED_LOCAL_RESULT',
              requestId: request.requestId,
              success: true,
              result,
            },
            location.origin,
          );
        });
      },
      { account, binding, observedAt },
    );
    await page.goto('/marketplaces/vinted/messages');
    const inbox = page.locator('app-vinted-messages');
    await expect(
      inbox.getByRole('button', { name: 'Nachrichtenzugriff erlauben', exact: true }),
    ).toBeEnabled();
    await inbox.getByRole('button', { name: 'Nachrichtenzugriff erlauben', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Automatische Abrufe öffnen keine ungelesenen Verläufe');
    await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    expect(binding.messagesRead).toBe(false);
    expect(bridgeCalls).toEqual([]);
    await inbox.getByRole('button', { name: 'Nachrichtenzugriff erlauben', exact: true }).click();
    await dialog.getByRole('button', { name: 'Nachrichtenzugriff erlauben', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Nachrichten aktualisieren', exact: true }),
    ).toBeEnabled();
    await inbox.locator('[data-conversation-row] button').first().click();
    await expect(inbox.getByRole('log')).toBeVisible();
    const heading = await inbox.locator('[data-conversation-heading]').textContent();
    await page.getByRole('button', { name: 'Nachrichten aktualisieren', exact: true }).click();
    await expect(
      page.locator('app-vinted-account-controls time[datetime="' + observedAt + '"]'),
    ).toBeAttached();
    await expect(
      page.locator('app-vinted-account-controls').getByText('Synchronisiert', { exact: true }),
    ).toBeVisible();
    await expect(inbox.locator('[data-conversation-heading]')).toHaveText(heading ?? '');
    await expect(
      page.getByText('1 Gespräch und 1 Nachricht übernommen.', { exact: false }),
    ).not.toBeVisible();
    expect(bridgeCalls).toEqual([
      'FLIPBASE_VINTED_LOCAL_PREPARE',
      'FLIPBASE_VINTED_LOCAL_INBOX_SYNC',
    ]);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-messages') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    expect(await page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await evidence(page, `vinted-local-inbox-${width}`);
  });
}

for (const challengeStage of ['login', 'identify', 'verify'] as const) {
  test(`öffnet eine Mensch-Prüfung bei ${challengeStage} automatisch @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await mockMarketplace(page, true);
    const jpeg = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 800;
        return canvas.toDataURL('image/jpeg').split(',')[1];
      }),
      'base64',
    );
    await page.route('**/marketplace-browser/healthz', (route) =>
      route.fulfill({ json: { ok: true, readOnly: false, apiVersion: 2, dragSupported: true } }),
    );
    const calls: string[] = [];
    await page.route('**/marketplace-browser/sessions**', (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body['workspaceId']).toBe(workspaceId);
      expect(body['connectionId']).toBe(accountIds[0]);
      const action = path.split('/').at(-1) ?? '';
      calls.push(action);
      if (action === 'sessions')
        return route.fulfill({ status: 201, json: { id: '25000000-0000-4000-8000-000000000031' } });
      if (action === 'login')
        return route.fulfill({
          json: {
            status:
              challengeStage === 'login'
                ? 'interaction_required'
                : challengeStage === 'verify'
                  ? 'verification_required'
                  : 'submitted',
          },
        });
      if (action === 'identify')
        return route.fulfill({ status: 422, json: { code: 'vinted_interaction_required' } });
      if (action === 'verify') return route.fulfill({ json: { status: 'interaction_required' } });
      if (action === 'frame') return route.fulfill({ contentType: 'image/jpeg', body: jpeg });
      if (action === 'close') return route.fulfill({ status: 204 });
      throw new Error(`Unerwarteter Browseraufruf: ${path}`);
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/settings/marketplaces');
    await page
      .locator('app-vinted-account-grid [cdkDrag]')
      .first()
      .getByRole('button', { name: 'Cloud-Anmeldung', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail' }).fill('synthetic');
    await page.getByLabel('Vinted-Passwort').fill('synthetic');
    await page.getByRole('button', { name: 'Anmelden und Konto verbinden' }).click();
    if (challengeStage === 'verify') {
      await page.getByLabel('Vinted-Bestätigungscode').fill('123456');
      await page.getByRole('button', { name: 'Code bestätigen', exact: true }).click();
    }
    const preview = page.locator('[aria-label="Vinted-Browseransicht"]');
    await expect(preview).toBeVisible();
    await expect(preview).toBeFocused();
    await expect(
      page.getByText('Vinted braucht Deine Bestätigung.', { exact: false }),
    ).toBeVisible();
    await expect(page.locator('app-marketplace-browser-test .animate-spin')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Browserbild anklicken oder mit Maus oder Finger ziehen' }),
    ).toBeEnabled();
    await expect(
      page.getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail' }),
    ).toHaveCount(0);
    const count = calls.length;
    await page.clock.install();
    await page.clock.fastForward(120_000);
    expect(calls).toHaveLength(count);
    expect(calls.filter((action) => action === 'login')).toHaveLength(1);
    expect(calls).not.toContain('close');
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-marketplace-browser-test') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('überträgt manuelles Ziehen im Browserbild mit Maus und Touch genau einmal @marketplace-preview @core-smoke', async ({
  page,
}) => {
  await mockMarketplace(page, true);
  const jpeg = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 800;
      return canvas.toDataURL('image/jpeg').split(',')[1];
    }),
    'base64',
  );
  await page.route('**/marketplace-browser/healthz', (route) =>
    route.fulfill({
      json: {
        ok: true,
        readOnly: false,
        apiVersion: 2,
        dragSupported: true,
      },
    }),
  );
  const inputs: { kind: string; points?: { x: number; y: number; elapsedMs: number }[] }[] = [];
  let frames = 0;
  let identityChecks = 0;
  await page.route('**/marketplace-browser/sessions**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body['workspaceId']).toBe(workspaceId);
    expect(body['connectionId']).toBe(accountIds[0]);
    if (path.endsWith('/sessions'))
      return route.fulfill({ status: 201, json: { id: '25000000-0000-4000-8000-000000000031' } });
    if (path.endsWith('/frame')) {
      frames++;
      return route.fulfill({ contentType: 'image/jpeg', body: jpeg });
    }
    if (path.endsWith('/input')) {
      inputs.push(body['input'] as (typeof inputs)[number]);
      return route.fulfill({ json: { accepted: true } });
    }
    if (path.endsWith('/identify')) {
      identityChecks++;
      return route.fulfill({
        status: 422,
        json: {
          code: identityChecks === 1 ? 'vinted_login_pending' : 'vinted_verification_required',
        },
      });
    }
    if (path.endsWith('/close')) return route.fulfill({ status: 204 });
    throw new Error(`Unerwarteter Browseraufruf: ${path}`);
  });
  await page.goto('/settings/marketplaces');
  await page
    .locator('app-vinted-account-grid [cdkDrag]')
    .first()
    .getByRole('button', { name: 'Cloud-Anmeldung', exact: true })
    .click();
  await page.getByRole('button', { name: 'Direkt im Browser anmelden' }).click();
  await expect(page.locator('[aria-label="Vinted-Browseransicht"]')).toBeFocused();
  const preview = page.getByRole('button', {
    name: 'Browserbild anklicken oder mit Maus oder Finger ziehen',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const touch of [false, true]) {
    if (touch) await page.setViewportSize({ width: 390, height: 1000 });
    await preview.scrollIntoViewIfNeeded();
    const rectangle = await preview.boundingBox();
    if (!rectangle) throw new Error('Browserbild fehlt');
    const start = {
      x: rectangle.x + rectangle.width * 0.1,
      y: rectangle.y + rectangle.height * 0.3,
    };
    const end = { x: rectangle.x + rectangle.width * 0.8, y: rectangle.y + rectangle.height * 0.3 };
    const count = inputs.length;
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
      expect(inputs).toHaveLength(count);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 8 });
      expect(inputs).toHaveLength(count);
      await page.mouse.up();
    }
    await expect.poll(() => inputs.length).toBe(count + 1);
    const input = inputs[count];
    expect(input.kind).toBe('drag');
    expect(input.points?.[0]?.x).toBeCloseTo(0.1, 2);
    expect(input.points?.at(-1)?.x).toBeCloseTo(0.8, 2);
    await expect.poll(() => frames).toBe(count + 2);
    await expect(preview).toBeEnabled();
  }
  const frameBeforeClick = await preview.locator('img').getAttribute('src');
  if (!frameBeforeClick) throw new Error('Browserbild fehlt');
  await preview.click({ position: { x: 10, y: 10 } });
  await expect.poll(() => inputs.length).toBe(3);
  expect(inputs[2].kind).toBe('click');
  await expect(preview.locator('img')).not.toHaveAttribute('src', frameBeforeClick);
  await expect(preview).toBeEnabled();
  await preview.focus();
  await expect(preview).toBeFocused();
  await preview.press('Enter');
  await expect.poll(() => inputs.length).toBe(4);
  expect(inputs[3]).toEqual({ kind: 'click', x: 0.5, y: 0.5 });
  await expect(preview).toBeEnabled();
  await page.clock.install();
  await expect(page.getByLabel('Vinted-Mitgliedsname oder E-Mail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Anmelden und Konto verbinden' })).toHaveCount(0);
  const manualText = page.getByLabel('Text in aktives Feld senden', { exact: true });
  await expect(manualText).toHaveAttribute('type', 'password');
  await manualText.fill('synthetic');
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(manualText).toHaveValue('');
  await expect.poll(() => inputs.length).toBe(5);
  expect(inputs[4]).toEqual({ kind: 'type', value: 'synthetic' });
  await expect(preview).toBeEnabled();
  await page.clock.fastForward(120_000);
  expect(identityChecks).toBe(0);
  const confirmAccount = page.getByRole('button', { name: 'Anmeldung prüfen & verbinden' });
  await confirmAccount.click();
  await expect(
    page.getByText('Die Anmeldung ist noch nicht abgeschlossen.', { exact: false }),
  ).toBeVisible();
  await expect(preview).toBeEnabled();
  await confirmAccount.click();
  await expect(
    page.getByText('Vinted benötigt noch Deinen Bestätigungscode.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Vinted-Bestätigungscode')).toHaveCount(0);
  await page.clock.fastForward(120_000);
  expect(identityChecks).toBe(2);
  await expect(preview).toBeEnabled();
  await expect(page.locator('app-marketplace-browser-test .animate-spin')).toHaveCount(0);
  expect(await preview.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
  await expect(preview.locator('img')).toHaveAttribute('draggable', 'false');
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-marketplace-browser-test') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
test('aktiviert und pausiert automatische Vinted-Abrufe je Konto zugänglich @marketplace-preview @core-smoke', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const importedOverview = { publicationsTotal: 1 };
  const calls = await mockMarketplace(page, true, false, false, false, [], importedOverview);
  await page.clock.install();
  let scheduledSyncAvailable = true;
  const schedules = new Map(
    accountIds.map((connectionId) => [
      connectionId,
      {
        workspaceId,
        connectionId,
        enabled: false,
        intervalMinutes: 15,
        nextDueAt: null as string | null,
        lastAttemptAt: null,
        lastSuccessAt: null as string | null,
        pausedReason: null,
        retryAfter: null,
        authorizationVersion: 0,
      },
    ]),
  );
  // Spezifische Antworten werden nach dem allgemeinen Mock registriert (Playwright LIFO).
  await page.route('**/marketplace-browser/healthz', (route) =>
    route.fulfill({
      json: {
        ok: true,
        readOnly: false,
        apiVersion: 2,
        ...(scheduledSyncAvailable
          ? {
              scheduledSync: {
                enabled: true,
                authorizationVersion: 2,
                allowedIntervals: [3, 5, 10, 15, 30, 60],
              },
            }
          : {}),
      },
    }),
  );
  for (const name of ['marketplace_read_sync_schedule', 'marketplace_set_sync_schedule']) {
    await page.route(`**/rest/v1/rpc/${name}`, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      expect(body['p_workspace_id']).toBe(workspaceId);
      const schedule = schedules.get(String(body['p_connection_id']));
      expect(schedule, 'Jede Antwort und Änderung bleibt beim angefragten Konto').toBeDefined();
      if (!schedule) return route.fulfill({ status: 403 });
      if (name === 'marketplace_set_sync_schedule') {
        expect(body).toEqual({
          p_workspace_id: workspaceId,
          p_connection_id: schedule.connectionId,
          p_enabled: expect.any(Boolean),
          p_interval_minutes: expect.any(Number),
          p_authorization_version: schedule.authorizationVersion,
        });
        schedule.enabled = body['p_enabled'] === true;
        expect([3, 5, 10, 15, 30, 60]).toContain(body['p_interval_minutes']);
        schedule.intervalMinutes = Number(body['p_interval_minutes']);
        schedule.authorizationVersion++;
        schedule.nextDueAt = schedule.enabled ? '2026-10-01T12:15:00Z' : null;
      }
      return route.fulfill({ json: schedule });
    });
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const writes = () => calls.filter((call) => call.name === 'marketplace_set_sync_schedule');
  for (const width of [1440, 390]) {
    for (const schedule of schedules.values()) {
      schedule.enabled = false;
      schedule.nextDueAt = null;
      schedule.lastSuccessAt = null;
      schedule.intervalMinutes = 15;
      schedule.authorizationVersion = schedule.connectionId === accountIds[0] ? 0 : 1;
    }
    scheduledSyncAvailable = true;
    importedOverview.publicationsTotal = 1;
    const previousWrites = writes().length;
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/marketplaces/vinted/overview');
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/overview$/);
    await expect(page.getByRole('heading', { name: 'Vinted', exact: true })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Automatische Vinted-Aktualisierung' }),
    ).toHaveCount(0);
    const accountSelect = page.getByRole('combobox', {
      name: 'Vinted-Konto auswählen',
      exact: true,
    });
    const settings = page.getByRole('button', { name: 'Vinted-Kontoeinstellungen', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Vinted-Kontoeinstellungen', exact: true });
    const activate = dialog.getByRole('button', {
      name: 'Automatik fortsetzen',
      exact: true,
    });
    await expect(accountSelect).toContainText('Testkonto A');
    await settings.focus();
    await settings.press('Enter');
    await expect(dialog).toBeVisible();
    const pause = dialog.getByRole('button', {
      name: 'Automatik pausieren',
      exact: true,
    });
    await expect(pause).toBeEnabled();
    const interval = dialog.getByRole('combobox', { name: 'Abrufabstand', exact: true });
    await expect(interval).toContainText('Alle 15 Minuten');
    await dialog.locator('summary').click();
    await expect(dialog.getByText('Aktiv', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Keiner geplant', { exact: true })).toHaveCount(0);
    expect(writes()).toHaveLength(previousWrites + 1);
    expect(writes().at(-1)?.body).toMatchObject({ p_enabled: true, p_interval_minutes: 15 });
    await interval.press('Enter');
    await page.getByRole('option', { name: 'Alle 3 Minuten', exact: true }).click();
    await expect(interval).toContainText('Alle 3 Minuten');
    await expect(dialog.getByText('Gespeichert: alle 3 Minuten.', { exact: true })).toBeVisible();
    expect(writes()).toHaveLength(previousWrites + 2);
    expect(writes().at(-1)?.body['p_enabled']).toBe(true);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-modal-shell') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await evidence(page, `vinted-schedule-settings-${width}`);
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Automatik pausieren', exact: true }),
    ).toHaveCount(0);
    await evidence(page, `vinted-schedule-active-${width}`);

    importedOverview.publicationsTotal = 2;
    schedules.get(accountIds[0])!.lastSuccessAt = '2026-10-01T12:15:00Z';
    await page.clock.runFor(30_000);
    const publicationsCard = page.locator('app-card').filter({
      has: page.getByRole('heading', { name: 'Inserate', exact: true }),
    });
    await expect(publicationsCard.getByText('2', { exact: true })).toBeVisible();
    await expect(accountSelect).toContainText('Testkonto A');
    expect(writes()).toHaveLength(previousWrites + 2);

    await page.reload();
    await expect(accountSelect).toContainText('Testkonto A');
    await settings.click();
    await expect(dialog).toBeVisible();
    await expect(pause).toBeEnabled();
    await expect(interval).toContainText('Alle 3 Minuten');
    await dialog.locator('summary').click();
    await expect(dialog.getByText('Aktiv', { exact: true })).toBeVisible();
    expect(writes()).toHaveLength(previousWrites + 2);
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();
    await accountSelect.press('Enter');
    await page.getByRole('option', { name: /Testkonto B/ }).click();
    await expect(accountSelect).toContainText('Testkonto B');
    await settings.click();
    await expect(dialog).toBeVisible();
    await expect(activate).toBeEnabled();
    await dialog.locator('summary').click();
    await expect(dialog.getByText('Pausiert', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Keiner geplant', { exact: true })).toBeVisible();
    expect(schedules.get(accountIds[0])?.enabled).toBe(true);
    expect(schedules.get(accountIds[1])?.enabled).toBe(false);
    expect(writes()).toHaveLength(previousWrites + 2);
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeFocused();

    scheduledSyncAvailable = false;
    await accountSelect.press('Enter');
    await expect(page.getByRole('option', { name: /Testkonto A/ })).toBeVisible();
    await page.getByRole('option', { name: /Testkonto A/ }).click();
    await expect(accountSelect).toContainText('Testkonto A');
    await settings.click();
    await expect(dialog).toBeVisible();
    await dialog.locator('summary').click();
    await expect(dialog.getByText('Dienst nicht verfügbar', { exact: true })).toBeVisible();
    await expect(pause).toBeEnabled();
    await pause.focus();
    await expect(pause).toBeFocused();
    await pause.press('Enter');
    await expect(dialog.getByText('Pausiert', { exact: true })).toBeVisible();
    await expect(activate).toBeDisabled();
    await expect(dialog.getByText('Keiner geplant', { exact: true })).toBeVisible();
    expect(
      writes()
        .slice(previousWrites)
        .map((call) => call.body['p_connection_id']),
    ).toEqual([accountIds[0], accountIds[0], accountIds[0]]);
    expect(schedules.get(accountIds[1])?.authorizationVersion).toBe(1);
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-modal-shell') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Kein horizontaler Überlauf bei ${width}px`,
    ).toBe(true);
    await evidence(page, `vinted-schedule-paused-${width}`);
  }
  expect(errors).toEqual([]);
  expect(calls.some((call) => call.name.startsWith('browser_'))).toBe(false);
});

test('zeigt unbekannte Bewertungen und gespeicherte Teilfehler zugänglich @marketplace-preview @core-smoke', async ({
  page,
}) => {
  await mockMarketplace(page, true, false, false, false, [
    {
      id: 'feedback-unknown',
      authorName: null,
      rating: null,
      isAutomatic: null,
      text: 'Danke',
    },
  ]);
  const operationId = '25000000-0000-4000-8000-000000000041';
  await page.route('**/marketplace-browser/connections/sync/start', (route) =>
    route.fulfill({
      status: 202,
      json: { id: operationId },
    }),
  );
  await page.route('**/marketplace-browser/connections/sync/status', (route) =>
    route.fulfill({
      json: {
        id: operationId,
        state: 'succeeded',
        stage: 'cleanup',
        errorCode: null,
        sourceResults: {
          profile: { status: 'complete' },
          publications: { status: 'complete' },
          conversations: { status: 'complete' },
          messages: { status: 'partial' },
          sales: { status: 'partial' },
          feedback: { status: 'failed', failure: 'network' },
        },
      },
    }),
  );
  await page.goto('/marketplaces/vinted/feedback');
  await expect(page).toHaveURL(/\/marketplaces\/vinted\/profile#reviews$/);
  await expect(page.locator('#reviews')).toBeFocused();
  const feedback = page.locator('app-vinted-feedback-list');
  await expect(feedback.getByText('Autor unbekannt', { exact: true })).toBeVisible();
  await expect(feedback.getByText('Herkunft unbekannt', { exact: true })).toBeVisible();
  await expect(feedback.getByText('Sternebewertung unbekannt', { exact: true })).toBeVisible();
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-vinted-profile') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Kontodaten aktualisieren', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kontodaten aktualisieren' });
  await expect(dialog.getByText('Bewertungen', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('Die erfolgreichen Bereiche wurden gespeichert.', { exact: false }),
  ).toBeVisible();
  // Die bisherige Schließfrist ist verstrichen: Teilfehler müssen weiterhin sichtbar sein.
  await page.waitForTimeout(1_600);
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-marketplace-sync-progress') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
});

test('erklärt eine volle GoLogin-Profilliste ohne Vinted-Anmeldeversuch @marketplace-preview', async ({
  page,
}) => {
  const calls = await mockMarketplace(page, true, false, false, true);
  await page.goto('/settings/marketplaces');
  await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Interner Name in Flipbase' }).fill('Neuer Zugang');
  await chooseCloudConnection(page);
  await page.getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail' }).fill('synthetic');
  await page.getByLabel('Vinted-Passwort').fill('synthetic');
  await page.getByRole('button', { name: 'Anmelden und Konto verbinden' }).click();
  await expect(page.getByText(/maximale Zahl Deiner GoLogin-Profile/)).toBeVisible();
  expect(calls.filter((call) => call.name === 'browser_login')).toHaveLength(0);
});

test('sperrt die Anmeldung bei einem veralteten Browserdienst @marketplace-preview', async ({
  page,
}) => {
  await mockMarketplace(page, true);
  await page.route('**/marketplace-browser/healthz', (route) =>
    route.fulfill({ json: { ok: true, readOnly: false } }),
  );
  await page.goto('/settings/marketplaces');
  await page
    .locator('app-vinted-account-grid [cdkDrag]')
    .first()
    .getByRole('button', { name: 'Cloud-Anmeldung', exact: true })
    .click();
  await expect(page.getByText(/Browserdienst.*aktualisiert/)).toBeVisible();
  await expect(page.getByLabel('Vinted-Passwort')).toHaveCount(0);
});

test('eigene Sitzungstestseite sperrt einen Browserabbruch @marketplace-preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const calls = await mockMarketplace(page);
  await page.goto('/marketplaces/vinted/session-test');
  await expect(page.getByText('Simulation:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Testsitzung starten' }).click();
  const sessionStatus = page.getByRole('status').filter({ hasText: 'Testaktionen:' });
  await expect(sessionStatus).toContainText('Aktiv');
  await page.getByRole('button', { name: 'Testaktion ausführen' }).click();
  await expect(sessionStatus).toContainText('Testaktionen: 1');
  await page.getByRole('button', { name: 'Browserabbruch simulieren' }).click();
  await expect(sessionStatus).toContainText('Browserabbruch');
  await expect(page.getByRole('button', { name: 'Testaktion ausführen' })).toBeDisabled();

  expect(
    calls
      .filter((call) => call.name === 'marketplace_test_session_start')
      .map((call) => call.body['p_connection_id']),
  ).toEqual([accountIds[0]]);
  expect(
    calls
      .filter((call) => call.name.startsWith('marketplace_test_session_'))
      .every((call) => call.body['p_workspace_id'] === workspaceId),
  ).toBe(true);
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-marketplace-session-test') as HTMLElement,
        )
      ).violations,
  );
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('zeigt unbestätigte Konten getrennt von verbundenen Konten @marketplace-preview', async ({
  page,
}) => {
  await mockMarketplace(page);
  await page.goto('/settings/marketplaces');
  await expect(
    page.locator('app-vinted-account-grid').getByText('Anmeldung ausstehend', { exact: true }),
  ).toHaveCount(2);
  await expect(page.locator('app-data-table').getByText('Testkonto A')).toHaveCount(0);
  await expect(page.getByText('Testkonto A')).toBeVisible();
});

async function evidence(page: Page, name: string) {
  const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
}
for (const width of [1440, 390]) {
  test(`Vinted-Konten wechseln, anlegen, umbenennen und pausieren bei ${width}px @marketplace-preview`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const calls = await mockMarketplace(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/marketplaces/vinted/overview');
    await expect(page.getByRole('heading', { name: 'Vinted', exact: true })).toBeVisible();
    await expect(page.locator('app-sidebar a[href="/dashboard"]')).toContainText(
      'Zurück zu Flipbase',
    );
    const select = page.getByRole('combobox', { name: 'Vinted-Konto auswählen', exact: true });
    await expect(select).toContainText('Testkonto A');
    await select.focus();
    await select.press('Enter');
    await page.getByRole('option', { name: /Testkonto B/ }).click();
    await openVintedSection(page, 'Profil', width);
    await expect(page.locator('app-vinted-profile')).toContainText('Profil Testkonto B');
    await page.addScriptTag({ content: axe.source });
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-profile') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    await evidence(page, `vinted-profile-${width}`);
    await openVintedSection(page, 'Verkäufe', width);
    await expect(page.locator('app-vinted-account-content')).toContainText('Verkauftes Hemd');
    await expect(page.locator('app-vinted-account-content')).not.toContainText(
      'Hier erscheinen Bestellungen',
    );
    expect(
      await page.evaluate(
        async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('app-vinted-account-content') as HTMLElement,
            )
          ).violations,
      ),
    ).toEqual([]);
    await evidence(page, `vinted-sales-${width}`);
    await openVintedSection(page, 'Inserate', width);
    await expect(page.locator('[data-views]')).toHaveText('0');
    await expect(page.locator('[data-favorites]')).toHaveText('—');
    await evidence(page, `vinted-listings-${width}`);
    await openVintedSection(page, 'Postfach', width);
    await page.getByRole('button', { name: /Frage zum Schal/ }).click();
    await expect(page.getByRole('log')).toContainText('Welche Maße hat der Schal?');
    await evidence(page, `vinted-messages-${width}`);
    await page.getByRole('button', { name: 'Vinted-Kontoeinstellungen', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Vinted-Kontoeinstellungen', exact: true })
      .getByRole('link', { name: 'Kontenübersicht', exact: true })
      .click();
    const accountsHeading = page.getByRole('heading', { name: 'Deine Vinted-Konten', exact: true });
    await expect(accountsHeading).toBeVisible();
    expect(
      await accountsHeading.evaluate((element) => element.scrollWidth <= element.clientWidth),
      'Die Kontenüberschrift darf auf kleinen Bildschirmen nicht von den Aktionen verdrängt werden.',
    ).toBe(true);
    await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Neues Testkonto');
    await chooseCloudConnection(page);
    const accounts = page.locator('app-vinted-account-grid');
    await expect(page.getByRole('textbox', { name: 'Interner Name in Flipbase' })).toHaveValue(
      'Neues Testkonto',
    );
    await expect(page.getByRole('dialog')).toContainText(
      'Aktuell sind keine freien Cloud-IPs vorhanden.',
    );
    await page.getByRole('button', { name: 'Dialog schließen' }).click();
    await expect(accounts.getByText('Neues Testkonto')).toHaveCount(0);
    expect(calls.filter((call) => call.name === 'marketplace_create_connection')).toHaveLength(0);
    await page.getByRole('button', { name: 'Testkonto A einstellen', exact: true }).click();
    await page.getByRole('button', { name: 'Umbenennen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Umbenanntes Testkonto');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(accounts.getByText('Umbenanntes Testkonto')).toBeVisible();
    await page
      .getByRole('button', { name: 'Umbenanntes Testkonto einstellen', exact: true })
      .click();
    await page.getByRole('button', { name: 'Pausieren', exact: true }).click();
    await expect(accounts.getByText('Pausiert', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Fortsetzen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pausieren', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Konto entfernen', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Flipbase');
    await page.getByRole('button', { name: 'Verknüpfung entfernen', exact: true }).click();
    await expect(accounts.getByText('Umbenanntes Testkonto')).toHaveCount(0);
    await evidence(page, `vinted-accounts-${width}`);
    expect(
      calls
        .filter((call) =>
          [
            'marketplace_create_connection',
            'marketplace_set_paused',
            'marketplace_rename_connection',
          ].includes(call.name),
        )
        .every((call) => call.body['p_workspace_id'] === workspaceId),
    ).toBe(true);
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-vinted-account-grid') as HTMLElement,
          )
        ).violations,
    );
    expect(violations).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

for (const width of [1440, 390]) {
  test(`Konto hinzufügen reserviert eine IP und aktiviert Cloud ausdrücklich bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await mockMarketplace(page, true);
    await page.goto('/settings/marketplaces');
    await page.getByRole('button', { name: 'Konto hinzufügen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Mein Testkonto');
    await chooseCloudConnection(page);
    await expect(page).toHaveURL(/\/marketplaces\/vinted\/accounts$/);
    await expect(page.getByRole('dialog')).toContainText('Anmeldung');
    expect(calls.filter((call) => call.name === 'marketplace_create_connection')).toHaveLength(0);
    await expect(page.locator('app-data-table').getByText('Mein Testkonto')).toHaveCount(0);
    const loginForm = page.locator('app-marketplace-browser-test form').first();
    const passwordInput = page.getByLabel('Vinted-Passwort');
    await expect(loginForm).toHaveAttribute('autocomplete', 'off');
    await expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    await expect(passwordInput).toHaveValue('');
    await page
      .getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail', exact: true })
      .fill('synthetic-user');
    await passwordInput.fill('synthetic-password');
    await page.getByRole('button', { name: 'Passwort anzeigen' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Passwort verbergen' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
    await evidence(page, `vinted-login-form-${width}`);
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('[role="dialog"]') as HTMLElement,
          )
        ).violations,
    );
    expect(violations).toEqual([]);
    await page.getByRole('button', { name: 'Anmelden und Konto verbinden', exact: true }).click();
    await expect(page.getByText(/Anmeldung wird geprüft/)).toBeVisible();
    await expect(page.locator('app-marketplace-browser-test img')).toHaveCount(0);
    await expect(page.getByText('Andere Anmeldemöglichkeit')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bild aktualisieren' })).toHaveCount(0);
    await evidence(page, `vinted-background-login-${width}`);
    // Die Anmeldung prüft die Bestätigung alle drei Sekunden; die Fixture wartet einmal bewusst.
    await expect(page.getByRole('button', { name: 'Cloud aktivieren', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Cloud aktivieren', exact: true }).click();
    await expect(
      page.getByText('Cloud aktiv. Dein Konto ist verbunden.', { exact: true }),
    ).toBeVisible();
    expect(calls.filter((call) => call.name === 'unexpected_frame')).toHaveLength(0);
    const logins = calls.filter((call) => call.name === 'browser_login');
    expect(logins).toHaveLength(1);
    expect(logins[0].body).toEqual({
      workspaceId,
      connectionId: '25000000-0000-4000-8000-000000000024',
      credentials: { username: 'synthetic-user', password: 'synthetic-password' },
    });
    await expect(page.getByLabel('Vinted-Passwort')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'synthetic-password',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await evidence(page, `vinted-connected-${width}`);
  });
}

for (const width of [1440, 390]) {
  test(`Abgelehnte Zugangsdaten direkt korrigieren bei ${width}px @marketplace-preview`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await mockMarketplace(page, true, true);
    await page.goto(`/marketplaces/vinted/connect/${accountIds[0]}`);
    await expect(
      page.getByRole('button', { name: 'Browser für manuelle Anmeldung öffnen', exact: true }),
    ).not.toBeVisible();
    await page
      .getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail', exact: true })
      .fill('synthetic-user');
    await page.getByLabel('Vinted-Passwort').fill('synthetic-invalid');
    await page.getByRole('button', { name: 'Anmelden und Konto verbinden', exact: true }).click();
    await expect(page.getByText(/Vinted hat die Zugangsdaten abgelehnt/)).toBeVisible();
    await expect(page.getByText(/Anmeldung wird geprüft/)).toHaveCount(0);
    await expect(page.getByLabel('Vinted-Passwort')).toHaveValue('');
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-marketplace-connect') as HTMLElement,
          )
        ).violations,
    );
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await evidence(page, `vinted-login-rejected-${width}`);
    await page
      .getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail', exact: true })
      .fill('synthetic-user');
    await page.getByLabel('Vinted-Passwort').fill('synthetic-corrected');
    await page.getByRole('button', { name: 'Anmelden und Konto verbinden', exact: true }).click();
    await expect(page.getByText('Dein Vinted-Konto ist verbunden.', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(calls.filter((call) => call.name === 'browser_login')).toHaveLength(2);
  });
}

test('zeigt den SMS-Code im Kontodialog und bindet ihn an das gewählte Konto @marketplace-preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const calls = await mockMarketplace(page, true, false, true);
  await page.goto('/settings/marketplaces');
  await page
    .locator('app-vinted-account-grid [cdkDrag]')
    .first()
    .getByRole('button', { name: 'Cloud-Anmeldung', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Testkonto A');
  await dialog
    .getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail' })
    .fill('synthetic-user');
  await dialog.getByLabel('Vinted-Passwort').fill('synthetic-password');
  await dialog.getByRole('button', { name: 'Anmelden und Konto verbinden' }).click();
  await expect(dialog.getByRole('heading', { name: 'Bestätigungscode eingeben' })).toBeVisible();
  await expect(dialog.getByLabel('Vinted-Bestätigungscode')).toBeVisible();
  await evidence(page, 'vinted-code-390');
  await dialog.getByLabel('Vinted-Bestätigungscode').fill('123456');
  await dialog.getByRole('button', { name: 'Code bestätigen' }).click();
  await expect(dialog.getByText('Dein Vinted-Konto ist verbunden.')).toBeVisible({
    timeout: 15_000,
  });
  expect(calls.filter((call) => call.name === 'browser_verify')).toEqual([
    {
      name: 'browser_verify',
      body: { workspaceId, connectionId: accountIds[0], code: '123456' },
    },
  ]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('123456');
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('[role="dialog"]') as HTMLElement,
        )
      ).violations,
  );
  expect(violations).toEqual([]);
});

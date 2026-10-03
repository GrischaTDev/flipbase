import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accountIds, mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

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
    if (path.endsWith('/login')) return route.fulfill({ json: { status: 'submitted' } });
    if (path.endsWith('/identify')) {
      identityChecks++;
      return route.fulfill({ status: 422, json: { code: 'vinted_login_pending' } });
    }
    if (path.endsWith('/close')) return route.fulfill({ status: 204 });
    throw new Error(`Unerwarteter Browseraufruf: ${path}`);
  });
  await page.goto('/settings/marketplaces');
  await page.getByRole('button', { name: 'Vinted-Anmeldung für Testkonto A öffnen' }).click();
  await page.getByRole('button', { name: 'Browser-Ansicht öffnen' }).click();
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
  await preview.click({ position: { x: 10, y: 10 } });
  await expect.poll(() => inputs.length).toBe(3);
  expect(inputs[2].kind).toBe('click');
  await expect(preview).toBeEnabled();
  await preview.focus();
  await preview.press('Enter');
  await expect.poll(() => inputs.length).toBe(4);
  expect(inputs[3]).toEqual({ kind: 'click', x: 0.5, y: 0.5 });
  await expect(preview).toBeEnabled();
  await page.clock.install();
  await page.getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail' }).fill('synthetic');
  await page.getByLabel('Vinted-Passwort').fill('synthetic');
  await page.getByRole('button', { name: 'Anmelden und Konto verbinden' }).click();
  await expect(preview).toBeEnabled();
  await page.clock.fastForward(6000);
  expect(identityChecks).toBe(0);
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
  await page.getByRole('button', { name: 'Account hinzufügen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Interner Name in Flipbase' }).fill('Neuer Zugang');
  await page.getByRole('button', { name: 'Weiter zur Anmeldung' }).click();
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
  await page.getByRole('button', { name: 'Vinted-Anmeldung für Testkonto A öffnen' }).click();
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
  await expect(page.getByRole('heading', { name: 'Anmeldung ausstehend' })).toBeVisible();
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
    await expect(page.locator('a[href="/marketplaces/vinted"]')).toContainText('Admin');
    const select = page.getByRole('combobox', { name: 'Vinted-Konto auswählen', exact: true });
    await expect(select).toContainText('Testkonto A');
    await select.focus();
    await select.press('Enter');
    await page.getByRole('option', { name: /Testkonto B/ }).click();
    await page
      .getByRole('navigation', { name: 'Vinted-Bereiche' })
      .getByRole('link', { name: 'Profil', exact: true })
      .click();
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
    await page
      .getByRole('navigation', { name: 'Vinted-Bereiche' })
      .getByRole('link', { name: 'Verkäufe', exact: true })
      .click();
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
    await page
      .getByRole('navigation', { name: 'Vinted-Bereiche' })
      .getByRole('link', { name: 'Inserate', exact: true })
      .click();
    await expect(page.locator('[data-views]')).toHaveText('0');
    await expect(page.locator('[data-favorites]')).toHaveText('—');
    await evidence(page, `vinted-listings-${width}`);
    await page
      .getByRole('navigation', { name: 'Vinted-Bereiche' })
      .getByRole('link', { name: 'Nachrichten', exact: true })
      .click();
    await page.getByRole('button', { name: /Frage zum Schal/ }).click();
    await expect(page.getByRole('log')).toContainText('Welche Maße hat der Schal?');
    await evidence(page, `vinted-messages-${width}`);
    await page.getByRole('button', { name: 'Vinted-Kontoeinstellungen', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Vinted-Kontoeinstellungen', exact: true })
      .getByRole('link', { name: 'Konten verwalten', exact: true })
      .click();
    const accountsHeading = page.getByRole('heading', { name: 'Vinted-Konten', exact: true });
    await expect(accountsHeading).toBeVisible();
    expect(
      await accountsHeading.evaluate((element) => element.scrollWidth <= element.clientWidth),
      'Die Kontenüberschrift darf auf kleinen Bildschirmen nicht von den Aktionen verdrängt werden.',
    ).toBe(true);
    await page.getByRole('button', { name: 'Account hinzufügen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Neues Testkonto');
    await page.getByRole('button', { name: 'Weiter zur Anmeldung', exact: true }).click();
    const accounts = page.locator('app-marketplace-accounts');
    await expect(page.getByRole('dialog')).toContainText('Neues Testkonto');
    await expect(page.getByRole('dialog')).toContainText(
      'Browserdienst ist auf dem Server nicht erreichbar',
    );
    await page.getByRole('button', { name: 'Dialog schließen' }).click();
    await expect(accounts.getByText('Neues Testkonto')).toHaveCount(0);
    expect(calls.filter((call) => call.name === 'marketplace_create_connection')).toHaveLength(0);
    await page.getByRole('button', { name: 'Testkonto A umbenennen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Umbenanntes Testkonto');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(accounts.getByText('Umbenanntes Testkonto')).toBeVisible();
    await page
      .getByRole('button', { name: 'Umbenanntes Testkonto pausieren', exact: true })
      .click();
    await expect(accounts.getByText('Pausiert', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Umbenanntes Testkonto fortsetzen', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Umbenanntes Testkonto pausieren', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Umbenanntes Testkonto löschen' }).click();
    await expect(page.getByRole('dialog')).toContainText('Gespeicherte Kontodaten');
    await page.getByRole('button', { name: 'Konto löschen', exact: true }).click();
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
            document.querySelector('app-marketplace-accounts') as HTMLElement,
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
  test(`Account hinzufügen führt automatisch zur bestätigten Anmeldung bei ${width}px @marketplace-preview`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await mockMarketplace(page, true);
    await page.goto('/settings/marketplaces');
    await page.getByRole('button', { name: 'Account hinzufügen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Mein Testkonto');
    await page.getByRole('button', { name: 'Weiter zur Anmeldung', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/marketplaces$/);
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
    await expect(page.getByText('Dein Vinted-Konto ist verbunden.', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
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
  await page.getByRole('button', { name: 'Vinted-Anmeldung für Testkonto A öffnen' }).click();
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

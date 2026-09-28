import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
const workspaceId = '25000000-0000-4000-8000-000000000011';
const accountIds = ['25000000-0000-4000-8000-000000000021', '25000000-0000-4000-8000-000000000022'];
const emptyPage = () => ({ items: [], total: 0, nextCursor: null });

/** Nur lokale HTTP-Antworten. Weder echte Anmeldung noch Vinted-Zugriff. */
async function mockMarketplace(
  page: Page,
  browserLogin = false,
  rejectFirstLogin = false,
  verificationRequired = false,
) {
  await page.route('**/marketplace-browser/healthz', (route) =>
    browserLogin
      ? route.fulfill({ json: { ok: true, readOnly: false } })
      : route.fulfill({ status: 502, body: 'Browserdienst nicht verfügbar' }),
  );
  const user = {
    id: '25000000-0000-4000-8000-000000000001',
    email: 'marketplace@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-09-26T00:00:00Z',
  };
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.addInitScript(
    ({ user, token }) => {
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      localStorage.setItem('flipbase_theme', 'light');
    },
    { user, token },
  );
  await page.routeWebSocket(/127\.0\.0\.1:54351/, (socket) => socket.close());
  const accounts = accountIds.map((connectionId, index) => ({
    workspaceId,
    connectionId,
    marketplace: 'vinted',
    displayName: `Testkonto ${index === 0 ? 'A' : 'B'}`,
    externalAccountId: null,
    status: 'needs_login',
    capabilities: {},
    allowedActions: [],
    lastSyncedAt: null,
  }));
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  await page.route('**/marketplace-browser/connections/delete', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push({ name: 'browser_delete_connection', body });
    const index = accounts.findIndex(
      (account) =>
        account.workspaceId === body['workspaceId'] &&
        account.connectionId === body['connectionId'],
    );
    if (index < 0) return route.fulfill({ status: 403 });
    accounts.splice(index, 1);
    return route.fulfill({ status: 204 });
  });
  if (browserLogin) {
    let connectionId = '';
    let loginSubmitted = false;
    let codeSubmitted = false;
    let identityChecks = 0;
    await page.route('**/marketplace-browser/sessions**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body['workspaceId'] !== workspaceId) return route.fulfill({ status: 403 });
      if (path.endsWith('/sessions')) {
        connectionId = String(body['connectionId']);
        return route.fulfill({ status: 201, json: { id: '25000000-0000-4000-8000-000000000031' } });
      }
      if (body['connectionId'] !== connectionId) return route.fulfill({ status: 403 });
      if (path.endsWith('/login')) {
        calls.push({ name: 'browser_login', body });
        loginSubmitted = true;
        return route.fulfill({ json: { status: 'submitted' } });
      }
      if (path.endsWith('/verify')) {
        calls.push({ name: 'browser_verify', body });
        codeSubmitted = true;
        return route.fulfill({ json: { status: 'submitted' } });
      }
      if (path.endsWith('/frame')) {
        calls.push({ name: 'unexpected_frame', body });
        return route.fulfill({ status: 500 });
      }
      if (path.endsWith('/identify')) {
        if (verificationRequired && !codeSubmitted)
          return route.fulfill({ status: 422, json: { code: 'vinted_verification_required' } });
        if (rejectFirstLogin && calls.filter((call) => call.name === 'browser_login').length === 1)
          return route.fulfill({ status: 422, json: { code: 'vinted_login_rejected' } });
        if (!loginSubmitted || ++identityChecks === 1) return route.fulfill({ status: 422 });
        accounts.find((account) => account.connectionId === connectionId)!.status = 'connected';
        return route.fulfill({
          json: {
            workspaceId,
            connectionId,
            externalAccountId: '12345',
            username: 'synthetic-user',
          },
        });
      }
      if (path.endsWith('/close')) return route.fulfill({ status: 204 });
      return route.fulfill({ status: 404 });
    });
  }
  const testSessions = new Map<
    string,
    {
      workspaceId: string;
      connectionId: string;
      id: string;
      state: 'active' | 'expired' | 'revoked' | 'interrupted';
      expiresAt: string;
      interactionCount: number;
    }
  >();
  await page.route('http://127.0.0.1:54351/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    const body =
      route.request().method() === 'POST'
        ? (route.request().postDataJSON() as Record<string, unknown>)
        : {};
    let json: unknown = [];
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Marktplatz-Test' };
    if (name === 'is_platform_operator') json = true;
    if (name === 'workspaces')
      json = [
        {
          id: workspaceId,
          name: 'Test-Workspace',
          currency: 'EUR',
          tax_mode: 'diff_25a',
          min_roi_percent: 35,
          min_profit_amount: 20,
          archived_at: null,
          setup_completed_at: '2026-09-26T00:00:00Z',
          created_at: '2026-09-26T00:00:00Z',
        },
      ];
    if (name.startsWith('marketplace_')) calls.push({ name, body });
    if (name === 'marketplace_can_manage') json = true;
    if (name === 'marketplace_list_connections') json = { canManage: true, connections: accounts };
    if (name === 'marketplace_create_connection') {
      const account = {
        ...accounts[0],
        connectionId: '25000000-0000-4000-8000-000000000024',
        displayName: String(body['p_display_name']),
      };
      accounts.push(account);
      json = account;
    }
    if (name === 'marketplace_rename_connection') {
      accounts.find((a) => a.connectionId === body['p_connection_id'])!.displayName = String(
        body['p_display_name'],
      );
      json = { ok: true };
    }
    if (name === 'marketplace_set_paused') {
      accounts.find((a) => a.connectionId === body['p_connection_id'])!.status = body['p_paused']
        ? 'paused'
        : 'needs_login';
      json = { ok: true };
    }
    if (name === 'marketplace_read_snapshot') {
      const scope = { workspaceId, connectionId: body['p_connection_id'] };
      const account = accounts.find((a) => a.connectionId === scope.connectionId)!;
      json = {
        ...scope,
        profile: {
          ...scope,
          displayName: `Profil ${account.displayName}`,
          username: 'testprofil',
          location: 'Deutschland',
          bio: 'Künstliche Daten für den Oberflächentest.',
        },
        publications: {
          items: [
            {
              ...scope,
              id: 'publication-1',
              title: 'Vintage-Schal · Testartikel',
              price: 29.9,
              currency: 'EUR',
              status: 'Aktiv',
              metrics: { views: 0, favorites: null, observedAt: '2026-09-26T12:00:00Z' },
            },
          ],
          total: 1,
          nextCursor: null,
        },
        conversations: {
          items: [
            {
              ...scope,
              id: 'conversation-1',
              title: 'Frage zum Schal',
              lastMessage: 'Welche Maße hat der Schal?',
            },
          ],
          total: 1,
          nextCursor: null,
        },
        sales: emptyPage(),
        activity: emptyPage(),
      };
    }
    if (name === 'marketplace_read_page') {
      json = {
        items: [
          {
            workspaceId,
            connectionId: body['p_connection_id'],
            conversationId: body['p_parent_id'],
            id: 'message-1',
            text: 'Welche Maße hat der Schal?',
            direction: 'inbound',
            occurredAt: '2026-09-26T12:00:00Z',
          },
        ],
        total: 1,
        nextCursor: null,
      };
    }
    if (name === 'marketplace_test_session_start') {
      const connectionId = String(body['p_connection_id']);
      const session = {
        workspaceId,
        connectionId,
        id:
          connectionId === accountIds[0]
            ? '25000000-0000-4000-8000-000000000031'
            : '25000000-0000-4000-8000-000000000032',
        state: 'active' as const,
        expiresAt: '2099-09-27T10:00:00Z',
        interactionCount: 0,
      };
      testSessions.set(connectionId, session);
      json = session;
    }
    if (name === 'marketplace_test_session_status') {
      json = testSessions.get(String(body['p_connection_id'])) ?? null;
    }
    if (name === 'marketplace_test_session_action') {
      const session = testSessions.get(String(body['p_connection_id']));
      if (session) {
        const action = body['p_action'];
        if (session.state === 'active' && action === 'ping') session.interactionCount++;
        if (session.state === 'active' && action === 'interrupt') session.state = 'interrupted';
        if (session.state === 'active' && action === 'revoke') session.state = 'revoked';
        json = { ...session, accepted: true };
      }
    }
    await route.fulfill({ json });
  });
  return calls;
}

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
    await expect(page.locator('app-vinted-account-content')).toContainText('Profil Testkonto B');
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
    await page.getByRole('link', { name: 'Konten verwalten', exact: true }).click();
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
    const table = page.locator('app-marketplace-accounts');
    await expect(page.getByRole('dialog')).toContainText('Neues Testkonto');
    await expect(page.getByRole('dialog')).toContainText(
      'Browserdienst ist auf dem Server nicht erreichbar',
    );
    await page.getByRole('button', { name: 'Dialog schließen' }).click();
    await page.getByRole('button', { name: 'Neues Testkonto umbenennen', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Umbenanntes Testkonto');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      table.getByRole('cell', { name: 'Umbenanntes Testkonto', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Umbenanntes Testkonto pausieren', exact: true })
      .click();
    await expect(table.getByRole('row').filter({ hasText: 'Umbenanntes Testkonto' })).toContainText(
      'Pausiert',
    );
    await page
      .getByRole('button', { name: 'Umbenanntes Testkonto fortsetzen', exact: true })
      .click();
    await expect(table.getByRole('row').filter({ hasText: 'Umbenanntes Testkonto' })).toContainText(
      'Anmeldung ausstehend',
    );
    await page.getByRole('button', { name: 'Umbenanntes Testkonto löschen' }).click();
    await expect(page.getByRole('dialog')).toContainText('Gespeicherte Kontodaten');
    await page.getByRole('button', { name: 'Konto löschen', exact: true }).click();
    await expect(
      table.getByRole('cell', { name: 'Umbenanntes Testkonto', exact: true }),
    ).toHaveCount(0);
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
    await page.addScriptTag({ content: axe.source });
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
    await page
      .getByRole('textbox', { name: 'Vinted-Mitgliedsname oder E-Mail', exact: true })
      .fill('synthetic-user');
    await page.getByLabel('Vinted-Passwort').fill('synthetic-password');
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
    await expect(page.getByText('Dein Vinted-Konto ist verbunden.', { exact: true })).toBeVisible();
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
    await expect(page.getByText('Dein Vinted-Konto ist verbunden.', { exact: true })).toBeVisible();
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
  await expect(dialog.getByText('Dein Vinted-Konto ist verbunden.')).toBeVisible();
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

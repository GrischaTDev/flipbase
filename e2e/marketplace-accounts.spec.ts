import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
const workspaceId = '25000000-0000-4000-8000-000000000011';
const accountIds = ['25000000-0000-4000-8000-000000000021', '25000000-0000-4000-8000-000000000022'];
const emptyPage = () => ({ items: [], total: 0, nextCursor: null });

/** Nur lokale HTTP-Antworten. Weder echte Anmeldung noch Vinted-Zugriff. */
async function mockMarketplace(page: Page) {
  await page.route('**/marketplace-browser/healthz', (route) =>
    route.fulfill({ status: 502, body: 'Browserdienst nicht verfügbar' }),
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
    await page.getByRole('button', { name: 'Verbindung vorbereiten', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Interner Name in Flipbase', exact: true })
      .fill('Neues Testkonto');
    await page.getByRole('button', { name: 'Vorbereitung speichern', exact: true }).click();
    const table = page.locator('app-marketplace-accounts');
    await expect(table.getByRole('cell', { name: 'Neues Testkonto', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Vinted-Anmeldung für Neues Testkonto öffnen' }).click();
    await expect(page.locator('app-marketplace-connect')).toContainText('Neues Testkonto');
    await expect(page.locator('app-marketplace-connect')).toContainText(
      'Browserdienst ist auf dem Server nicht erreichbar',
    );
    await page.getByRole('link', { name: 'Konten verwalten', exact: true }).click();
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

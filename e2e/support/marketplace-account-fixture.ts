import type { Page } from '@playwright/test';

export const workspaceId = '25000000-0000-4000-8000-000000000011';
export const accountIds = [
  '25000000-0000-4000-8000-000000000021',
  '25000000-0000-4000-8000-000000000022',
];
export const emptyPage = () => ({ items: [], total: 0, nextCursor: null });

/** Nur lokale HTTP-Antworten. Weder echte Anmeldung noch Vinted-Zugriff. */
export async function mockMarketplace(
  page: Page,
  browserLogin = false,
  rejectFirstLogin = false,
  verificationRequired = false,
  profileLimit = false,
  importedFeedbacks?: readonly Record<string, unknown>[],
  importedOverview?: {
    publicationsTotal: number;
    views?: number | null;
    favorites?: number | null;
    observedAt?: string;
    text?: string | null;
    textState?: 'loaded' | 'not_loaded';
    imageUrl?: string | null;
    imageUrls?: readonly string[];
  },
  localAccounts = false,
) {
  await page.route('**/marketplace-browser/healthz', (route) =>
    browserLogin
      ? route.fulfill({ json: { ok: true, readOnly: false, apiVersion: 2 } })
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
    executionMode: localAccounts ? 'local' : 'cloud',
    displayName: `Testkonto ${index === 0 ? 'A' : 'B'}`,
    externalAccountId: importedFeedbacks ? String(100 + index) : null,
    status: importedFeedbacks ? 'connected' : 'needs_login',
    capabilities: {},
    allowedActions: [],
    lastSyncedAt: null,
  }));
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const cloudSetups = new Map<
    string,
    {
      connectionId: string;
      state: string;
      sessionId: string | null;
      submitted: boolean;
      codeSubmitted: boolean;
      identityChecks: number;
    }
  >();
  await page.route('**/marketplace-browser/cloud-setups/**', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const path = new URL(route.request().url()).pathname;
    if (body['workspaceId'] !== workspaceId) return route.fulfill({ status: 403 });
    if (path.endsWith('/availability')) return route.fulfill({ json: { canSetup: true } });
    if (path.endsWith('/begin')) {
      calls.push({ name: 'browser_cloud_setup_begin', body });
      if (!browserLogin) return route.fulfill({ json: { status: 'no_capacity' } });
      const setupId = `25000000-0000-4000-8000-${String(41 + cloudSetups.size).padStart(12, '0')}`;
      const connectionId =
        typeof body['connectionId'] === 'string'
          ? body['connectionId']
          : `25000000-0000-4000-8000-${String(24 + cloudSetups.size).padStart(12, '0')}`;
      if (!accounts.some((account) => account.connectionId === connectionId))
        accounts.push({
          workspaceId,
          connectionId,
          marketplace: 'vinted',
          executionMode: 'local',
          displayName: String(body['displayName']),
          externalAccountId: null,
          status: 'needs_login',
          capabilities: {},
          allowedActions: [],
          lastSyncedAt: null,
        });
      cloudSetups.set(setupId, {
        connectionId,
        state: 'reserved',
        sessionId: null,
        submitted: false,
        codeSubmitted: false,
        identityChecks: 0,
      });
      return route.fulfill({
        json: {
          status: 'ready',
          setup: { workspaceId, connectionId, setupId, state: 'reserved', sessionId: null },
        },
      });
    }
    const setupId = path.split('/').at(-2) ?? '';
    const setup = cloudSetups.get(setupId);
    if (!setup || body['connectionId'] !== setup.connectionId)
      return route.fulfill({ status: 403 });
    const view = () => ({
      workspaceId,
      connectionId: setup.connectionId,
      setupId,
      state: setup.state,
      sessionId: setup.sessionId,
    });
    if (path.endsWith('/open')) {
      if (setup.state === 'cancelled' || setup.state === 'cleanup_pending')
        return route.fulfill({ status: 403 });
      if (profileLimit)
        return route.fulfill({ status: 503, json: { code: 'gologin_profile_limit_reached' } });
      setup.state = 'login';
      setup.sessionId = '25000000-0000-4000-8000-000000000031';
      return route.fulfill({ status: 201, json: { id: setup.sessionId } });
    }
    if (path.endsWith('/login')) {
      calls.push({ name: 'browser_login', body });
      setup.submitted = true;
      return route.fulfill({ json: { status: 'submitted' } });
    }
    if (path.endsWith('/verify')) {
      calls.push({ name: 'browser_verify', body });
      setup.codeSubmitted = true;
      return route.fulfill({ json: { status: 'submitted' } });
    }
    if (path.endsWith('/identify')) {
      if (verificationRequired && !setup.codeSubmitted)
        return route.fulfill({ status: 422, json: { code: 'vinted_verification_required' } });
      if (rejectFirstLogin && calls.filter((call) => call.name === 'browser_login').length === 1)
        return route.fulfill({ status: 422, json: { code: 'vinted_login_rejected' } });
      if (!setup.submitted || ++setup.identityChecks === 1) return route.fulfill({ status: 422 });
      setup.state = 'verified';
      return route.fulfill({
        json: {
          workspaceId,
          connectionId: setup.connectionId,
          externalAccountId: '12345',
          username: 'synthetic-user',
        },
      });
    }
    if (path.endsWith('/complete')) {
      calls.push({ name: 'browser_cloud_setup_complete', body });
      const account = accounts.find((account) => account.connectionId === setup.connectionId);
      if (!account) return route.fulfill({ status: 403 });
      account.executionMode = 'cloud';
      account.status = 'connected';
      account.externalAccountId = '12345';
      setup.state = 'completed';
      setup.sessionId = null;
      return route.fulfill({ json: view() });
    }
    if (path.endsWith('/cancel')) {
      if (setup.state !== 'completed') {
        setup.state = 'cancelled';
        setup.sessionId = null;
      }
      return route.fulfill({ json: view() });
    }
    if (path.endsWith('/read')) return route.fulfill({ json: view() });
    return route.fulfill({ status: 404 });
  });
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
        if (profileLimit)
          return route.fulfill({
            status: 503,
            json: { code: 'gologin_profile_limit_reached' },
          });
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
        const connected = accounts.find((account) => account.connectionId === connectionId)!;
        connected.status = 'connected';
        connected.externalAccountId = '12345';
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
    if (name === 'marketplace_read_local_extension') json = { binding: null };
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Marktplatz-Test' };
    if (name === 'is_platform_operator') json = true;
    // Der Marktplatztest verwendet einen weiterhin aktiven Bestands-Workspace.
    if (name === 'list_my_workspace_access')
      json = [
        {
          workspace_id: workspaceId,
          access_status: 'active',
          ends_at: null,
          server_time: new Date().toISOString(),
        },
      ];
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
    if (name === 'marketplace_read_listing_metric_changes')
      json = {
        workspaceId,
        connectionId: body['p_connection_id'],
        periodMinutes: body['p_period_minutes'],
        items: [],
      };
    if (name === 'marketplace_read_favorite_notifications')
      json = { workspaceId, items: [], unreadCount: 0 };
    if (name === 'marketplace_read_favorite_notification_settings')
      json = { workspaceId, connectionId: body['p_connection_id'], enabled: true, version: 0 };
    if (name === 'marketplace_set_favorite_notification_settings')
      json = {
        workspaceId,
        connectionId: body['p_connection_id'],
        enabled: body['p_enabled'],
        version: 1,
      };
    if (name === 'marketplace_mark_favorite_notifications') json = { ok: true };
    if (name === 'marketplace_list_connections') json = { canManage: true, connections: accounts };
    if (name === 'marketplace_create_connection') {
      const account = {
        ...accounts[0],
        connectionId: '25000000-0000-4000-8000-000000000024',
        displayName: String(body['p_display_name']),
        executionMode: 'local',
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
          ...(importedFeedbacks ? { feedbacks: importedFeedbacks } : {}),
        },
        publications: {
          items: [
            {
              ...scope,
              id: 'publication-1',
              title: 'Vintage-Schal · Testartikel',
              text: importedOverview?.text,
              textState: importedOverview?.textState,
              imageUrl: importedOverview?.imageUrl,
              imageUrls: importedOverview?.imageUrls,
              price: 29.9,
              currency: 'EUR',
              status: 'Aktiv',
              metrics: {
                views: importedOverview?.views === undefined ? 0 : importedOverview.views,
                favorites: importedOverview?.favorites ?? null,
                observedAt: importedOverview?.observedAt ?? '2026-09-26T12:00:00Z',
              },
            },
          ],
          total: importedOverview?.publicationsTotal ?? 1,
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
        sales: {
          items: [
            {
              ...scope,
              id: 'sale-1',
              title: 'Verkauftes Hemd · Testartikel',
              price: 30,
              currency: 'EUR',
              status: 'Versendet',
            },
          ],
          total: 1,
          nextCursor: null,
        },
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

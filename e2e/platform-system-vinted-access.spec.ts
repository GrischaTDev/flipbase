import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';

// Diese Datei mockt die gesamte Supabase-API und braucht keine echte Sitzung.
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

interface RpcCall {
  name: string;
  body: Record<string, unknown>;
}

/** Ausschließlich lokale HTTP-Fixtures; kein Betreiberkonto und keine echten Dienstaufträge. */
async function mockSystemPage(page: Page) {
  const user = {
    id: 'a0000000-0000-4000-8000-000000000001',
    email: 'admin@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.addInitScript(
    ({ user, token }) =>
      localStorage.setItem(
        'sb-127-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'local-fixture',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      ),
    { user, token },
  );
  const calls: RpcCall[] = [];
  const settings = { max_category_sources: 12, category_poll_interval_seconds: 60 };
  const recent = () => new Date(Date.now() - 15_000).toISOString();
  // Auch die Sitzungsmeldungen bleiben lokal; es wird kein echter Server verbunden.
  await page.routeWebSocket(/127\.0\.0\.1:54351/, (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      const [joinRef, ref, topic, event] = JSON.parse(message) as unknown[];
      if (['phx_join', 'phx_leave', 'heartbeat'].includes(String(event)))
        socket.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
    });
  });
  await page.route('http://127.0.0.1:54351/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.pathname.split('/').at(-1) ?? '';
    const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    let json: unknown = [];
    if (url.pathname.includes('/rest/v1/rpc/'))
      calls.push({ name, body: (request.postDataJSON() ?? {}) as Record<string, unknown> });
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Test Administration' };
    if (name === 'list_my_workspace_access')
      json = [
        {
          workspace_id: 'a0000000-0000-4000-8000-000000000002',
          access_status: 'active',
          ends_at: null,
          server_time: new Date().toISOString(),
        },
      ];
    if (name === 'workspaces')
      json = [
        {
          id: 'a0000000-0000-4000-8000-000000000002',
          owner_id: user.id,
          name: 'Lokaler Test',
          currency: 'EUR',
          tax_mode: 'diff_25a',
          setup_completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];
    if (name === 'is_platform_operator') json = true;
    if (name === 'platform_system_health')
      json = {
        checkedAt: new Date().toISOString(),
        marketplaceWorker: { heartbeatAt: recent(), expiresAt: recent() },
        feedBot: {
          reportedAt: recent(),
          requestsLastMinute: 3,
          rejectedLastMinute: 1,
          requestBudget: 30,
          lastCycleError: null,
          vintedLastSuccessAt: recent(),
        },
        pushWorker: null,
        storage: null,
        operationsLastHour: { queued: 0, running: 0, succeeded: 0, failed: 0 },
        cloudIps: { enabled: 0, expiringSoon: 0, expired: 0 },
      };
    if (name === 'sniper_feed_capacity')
      json = {
        ...settings,
        active_category_sources: 2,
        active_feeds: 5,
        requests_last_minute: 18,
        request_budget: 120,
        reported_at: recent(),
        sources: [
          {
            key: 'main',
            kind: 'main',
            catalog_id: null,
            category_path: null,
            feed_count: 3,
            last_success_at: recent(),
            coverage_status: 'caught_up',
            run_state: 'idle',
            last_status: 200,
          },
          {
            key: 'category:1206',
            kind: 'category',
            catalog_id: 1206,
            category_path: 'Herren > Jacken',
            feed_count: 2,
            last_success_at: recent(),
            coverage_status: 'limited',
            run_state: 'idle',
            last_status: 200,
          },
        ],
      };
    if (name === 'set_sniper_feed_settings') {
      const body = request.postDataJSON() as Record<string, number>;
      settings.max_category_sources = body['p_max_category_sources'];
      settings.category_poll_interval_seconds = body['p_category_poll_interval_seconds'];
      await route.fulfill({ status: 204 });
      return;
    }
    if (name === 'vinted_category_syncs') {
      const row = {
        refreshed_at: recent(),
        requested_at: null,
        last_attempt_at: recent(),
        category_count: 2500,
        last_error: null,
      };
      json = single ? row : [row];
    }
    await route.fulfill({ json });
  });
  return { calls };
}

async function checkAxe(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async (target) =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector(target) as HTMLElement,
          )
        ).violations,
      selector,
    ),
  ).toEqual([]);
}

test('prüft den Vinted-Zugriff manuell und behält bei Ablehnung die Pause @core-smoke', async ({
  page,
}) => {
  await mockSystemPage(page);
  const id = '12345678-1234-1234-1234-123456789012';
  const commands: unknown[] = [];
  const authenticated: boolean[] = [];
  let opened = 0;
  let closed = 0;
  let manual = false;
  await page.route('**/sniper-browser/**', async (route) => {
    const request = route.request();
    authenticated.push(Boolean(request.headers()['authorization']?.startsWith('Bearer ')));
    expect(new URL(request.url()).search).toBe('');
    if (request.url().endsWith('/frame')) {
      // Lokales Bildfixture, keine echte Vinted-Seite.
      const screenshot = await page.screenshot({ type: 'jpeg' });
      await route.fulfill({ contentType: 'image/jpeg', body: screenshot });
      return;
    }
    if (request.url().endsWith('/input')) {
      commands.push(request.postDataJSON());
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.url().endsWith('/verify')) {
      manual = false;
      await route.fulfill({
        status: 409,
        json: { message: 'Vinted verlangt weiterhin eine manuelle Prüfung.' },
      });
      return;
    }
    if (request.method() === 'DELETE') {
      closed += 1;
      manual = false;
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.url().endsWith('/sessions')) {
      opened += 1;
      manual = true;
    }
    await route.fulfill({
      json: {
        state: manual ? 'manual' : 'interaction_required',
        sessionId: manual ? id : null,
        expiresAt: manual ? new Date(Date.now() + 600000).toISOString() : null,
        message: null,
      },
    });
  });
  await page.goto('/admin/vinted-bot/operation');
  await expect(page).toHaveURL(/\/admin\/system$/u);
  const feedService = page.locator('[data-service="feed-bot"]');
  const check = feedService.getByRole('button', { name: 'Vinted-Zugriff prüfen', exact: true });
  await expect(check).toBeEnabled();
  await check.click();
  const dialog = page.getByRole('dialog', { name: 'Vinted-Zugriff manuell prüfen', exact: true });
  await expect(dialog.getByAltText('Aktuelle Vinted-Seite im Botbrowser')).toBeVisible();
  await checkAxe(page, 'app-sniper-browser-connect [role="dialog"]');
  const viewport = dialog.getByRole('application');
  await viewport.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => commands).toContainEqual({ kind: 'key', key: 'Enter' });
  await page.keyboard.press('Shift+Tab');
  await expect(viewport).not.toBeFocused();
  await dialog.getByLabel('Text an Vinted senden', { exact: true }).fill('Test');
  await dialog.getByRole('button', { name: 'Text senden', exact: true }).click();
  await expect.poll(() => commands).toContainEqual({ kind: 'text', text: 'Test' });
  await dialog.getByRole('button', { name: 'Zugriff erneut prüfen', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('weiterhin eine manuelle Prüfung');
  await expect(dialog.getByAltText('Aktuelle Vinted-Seite im Botbrowser')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  // Die Pause bleibt bestehen: Die Prüfung wird weiterhin angeboten.
  await expect(check).toBeVisible();
  expect(opened).toBe(1);
  expect(closed).toBe(1);
  expect(authenticated.every(Boolean)).toBe(true);
});

test('speichert die Grenze für Kategoriequellen über die Systemseite', async ({ page }) => {
  const { calls } = await mockSystemPage(page);
  await page.route('**/sniper-browser/**', (route) =>
    route.fulfill({ json: { state: 'ready', sessionId: null, expiresAt: null, message: null } }),
  );
  await page.goto('/admin/system');
  const card = page.locator('[data-vinted-feed-sources]');
  await expect(card.locator('[data-metric="category-sources"]')).toHaveText('2 / 12');
  await expect(card.locator('[data-vinted-feed-sources-table] tbody tr')).toHaveCount(2);
  await expect(card).toContainText('Kommt nicht hinterher');

  const limit = card.getByLabel('Grenze für Kategorien', { exact: true });
  await limit.fill('600');
  await card.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(card.getByText('Bitte gib eine ganze Zahl von 0 bis 500 ein.')).toBeVisible();
  expect(calls.some(({ name }) => name === 'set_sniper_feed_settings')).toBe(false);

  await limit.fill('40');
  await card.getByLabel('Takt der Kategorien (Sekunden)', { exact: true }).fill('90');
  await card.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect
    .poll(() =>
      calls.filter(({ name }) => name === 'set_sniper_feed_settings').map(({ body }) => body),
    )
    .toEqual([{ p_max_category_sources: 40, p_category_poll_interval_seconds: 90 }]);
  await expect(card.getByText('Bitte gib eine ganze Zahl von 0 bis 500 ein.')).toHaveCount(0);
  await checkAxe(page, '[data-vinted-feed-sources]');
});

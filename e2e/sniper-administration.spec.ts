import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Diese Datei mockt die gesamte Supabase-API und braucht keine echte Sitzung.
test.use({ storageState: { cookies: [], origins: [] } });

// Name, Notiz und Takt bilden entsprechend dem bestehenden RPC keine neue Suche.
function fixtureFilterConditions(row: Record<string, unknown>): string {
  const words = (value: unknown) =>
    [
      ...new Set(
        (Array.isArray(value) ? value : []).map((term) =>
          String(term)
            .normalize('NFKC')
            .toLowerCase()
            .replace(/\p{Dash_Punctuation}/gu, ' ')
            .replace(/\s+/gu, ' ')
            .trim(),
        ),
      ),
    ].sort();
  const terms = words(row['title_keywords']);
  const brands = Array.isArray(row['brand_ids'])
    ? row['brand_ids']
    : row['brand_id']
      ? [row['brand_id']]
      : [];
  return JSON.stringify([
    String(row['search_text'] ?? '')
      .trim()
      .replace(/\s+/gu, ' ')
      .toLowerCase(),
    row['catalog_id'] ?? null,
    [...brands].map(Number).sort((a, b) => a - b),
    terms,
    terms.length <= 1 ? 'all' : row['keyword_mode'],
    words(row['excluded_title_keywords']),
    row['price_from'] ?? null,
    row['price_to'] ?? null,
  ]);
}

/** Ausschliesslich lokale HTTP-Fixtures; kein Betreiberkonto und keine echten Botauftraege. */
async function mockAdministration(page: Page) {
  await page.route('**/sniper-browser/**', (route) =>
    route.fulfill({ json: { state: 'ready', sessionId: null, expiresAt: null, message: null } }),
  );
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
  const rows: Record<string, unknown>[] = [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let rejectSave = false;
  let rejectedActiveId: string | null = null;
  let rejectQueryRead = false;
  let runtimeAge = 0;
  let categoryRequestedAt: string | null = null;
  const refreshedAt = new Date(Date.now() - 60000).toISOString();
  const categories = [
    { id: 1, parent_id: null, title: 'Herren', path: 'Herren', is_leaf: false },
    { id: 2, parent_id: 1, title: 'Kleidung', path: 'Herren > Kleidung', is_leaf: false },
    { id: 79, parent_id: 2, title: 'Jacken', path: 'Herren > Kleidung > Jacken', is_leaf: true },
    { id: 80, parent_id: 2, title: 'Hosen', path: 'Herren > Kleidung > Hosen', is_leaf: true },
    { id: 3, parent_id: null, title: 'Damen', path: 'Damen', is_leaf: false },
    { id: 16, parent_id: 3, title: 'Schuhe', path: 'Damen > Schuhe', is_leaf: false },
    { id: 1049, parent_id: 16, title: 'Stiefel', path: 'Damen > Schuhe > Stiefel', is_leaf: true },
    { id: 1050, parent_id: 16, title: 'Sneaker', path: 'Damen > Schuhe > Sneaker', is_leaf: true },
  ];
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
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1) ?? '';
    let json: unknown = [];
    if (name === 'sniper_queries' && rejectQueryRead) {
      await route.fulfill({
        status: 500,
        json: { message: 'Filterstand vorübergehend nicht verfügbar' },
      });
      return;
    }
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
    if (name === 'sniper_queries')
      json =
        Number(url.searchParams.get('offset') ?? 0) === 0
          ? rows.filter((row) => !row['deleted_at'])
          : [];
    if (name === 'sniper_query_listing_counts') json = [];
    if (name === 'sniper_runtime_status')
      json = {
        id: 1,
        reported_at: new Date(Date.now() - runtimeAge).toISOString(),
        requests_last_minute: 3,
        rejected_last_minute: 1,
        request_budget: 30,
        last_cycle_error: null,
        vinted_connected_since: new Date(Date.now() - 60_000).toISOString(),
        vinted_last_success_at: new Date().toISOString(),
      };
    if (name === 'vinted-brand-search') {
      const { keyword } = route.request().postDataJSON() as { keyword: string };
      const brands = [
        { id: 53, name: 'Nike' },
        { id: 88, name: 'Ralph Lauren' },
        { id: 123, name: 'Patagonia' },
      ];
      json = {
        brands: keyword
          ? brands.filter((brand) => brand.name.toLowerCase().includes(keyword.toLowerCase()))
          : brands.slice(0, 2),
      };
    }
    if (name === 'vinted_category_syncs') {
      if (route.request().method() === 'PATCH') {
        calls.push({ name, body: route.request().postDataJSON() as Record<string, unknown> });
        categoryRequestedAt = new Date().toISOString();
      }
      json = {
        refreshed_at: refreshedAt,
        requested_at: categoryRequestedAt,
        last_attempt_at: null,
        category_count: categories.length,
        last_error: null,
      };
    }
    if (name === 'vinted_categories') {
      const available =
        url.searchParams.get('is_leaf') === 'eq.true'
          ? categories.filter((category) => category.is_leaf)
          : categories;
      json = Number(url.searchParams.get('offset') ?? 0) === 0 ? available : [];
    }
    if (
      ['save_sniper_search_filter', 'set_sniper_query_active', 'delete_sniper_query'].includes(name)
    ) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      if (name === 'set_sniper_query_active' && body['p_id'] === rejectedActiveId) {
        await route.fulfill({
          status: 400,
          json: { message: 'Status vorübergehend nicht gespeichert' },
        });
        return;
      }
      if (rejectSave && name === 'save_sniper_search_filter') {
        await route.fulfill({
          status: 400,
          json: { message: 'Speichern vorübergehend fehlgeschlagen' },
        });
        return;
      }
      if (name === 'save_sniper_search_filter') {
        const brands = body['p_brands'] as { id: number; name: string }[];
        const existing = rows.find((row) => row['id'] === body['p_id']);
        const conditions = {
          title: body['p_title'],
          notes: body['p_notes'],
          catalog_id: body['p_catalog_id'],
          brand_ids: brands.map((brand) => brand.id),
          brand_names: brands.map((brand) => brand.name),
          brand_id: brands.length === 1 ? brands[0].id : null,
          title_keywords: body['p_title_keywords'],
          excluded_title_keywords: body['p_excluded_title_keywords'] ?? [],
          keyword_mode: body['p_keyword_mode'],
          poll_interval_ms: body['p_poll_interval_ms'],
          search_text: body['p_search_text'],
          price_from: body['p_price_from'],
          price_to: body['p_price_to'],
          filter_revision: Number(existing?.['filter_revision'] ?? 0) + 1,
          filter_format_version: 1,
        };
        if (
          rows.some(
            (row) =>
              row['id'] !== body['p_id'] &&
              !row['deleted_at'] &&
              fixtureFilterConditions(row) === fixtureFilterConditions(conditions),
          )
        ) {
          await route.fulfill({
            status: 409,
            json: { message: 'Ein Suchfilter mit diesen Bedingungen besteht bereits.' },
          });
          return;
        }
        if (existing) Object.assign(existing, conditions);
        else
          rows.push({
            ...conditions,
            id: `query-${rows.length + 1}`,
            marketplace: 'vinted',
            query_key: `fixture-${rows.length + 1}`,
            is_active: false,
            is_seeded: false,
            is_standard: false,
            last_status: 'never_polled',
            last_polled_at: null,
            consecutive_failures: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          });
        json = existing?.['id'] ?? rows.at(-1)?.['id'];
      } else if (name === 'delete_sniper_query') {
        Object.assign(
          rows.find((row) => row['id'] === body['p_id'])!,
          {
            is_active: false,
            deleted_at: new Date().toISOString(),
          },
        );
        json = null;
      } else {
        rows.find((row) => row['id'] === body['p_id'])!['is_active'] = body['p_active'];
        json = null;
      }
    }
    await route.fulfill({ json });
  });
  return {
    failQueryRead: (value: boolean) => {
      rejectQueryRead = value;
    },
    failActive: (id: string | null) => {
      rejectedActiveId = id;
    },
    seedOverview: () => {
      const titles = [
        'Pufferjacken · Nike & Patagonia',
        'Pufferjacken · Patagonia',
        'Windjacken · Nike',
        'Zopfpullover · Ralph Lauren',
        'Vintage-Pullover',
        'Damen-Sneaker',
        'Vintage-Jacken',
        'Herrenjacken bis 65 €',
        'Damen-Stiefel',
        'Sportjacken',
        'Steppjacken',
        'Zopfpullover · weitere Varianten',
      ];
      rows.splice(0);
      for (const [index, title] of titles.entries()) {
        const puffer = title.startsWith('Pufferjacken');
        const pullover = title.toLowerCase().includes('pullover');
        const brand = pullover
          ? { id: 88, name: 'Ralph Lauren' }
          : index % 2
            ? { id: 123, name: 'Patagonia' }
            : { id: 53, name: 'Nike' };
        const brands = index === 0 ? [brand, { id: 123, name: 'Patagonia' }] : [brand];
        rows.push({
          id: `documentation-${index}`,
          title,
          marketplace: 'vinted',
          query_key: `documentation-${index}`,
          catalog_id: pullover
            ? null
            : title.includes('Sneaker')
              ? 1050
              : title.includes('Stiefel')
                ? 1049
                : 79,
          brand_id: brands.length === 1 ? brand.id : null,
          brand_ids: brands.map((entry) => entry.id),
          brand_names: brands.map((entry) => entry.name),
          title_keywords: puffer
            ? ['puffer', 'pufferjacke', 'puffer jacke', 'pufferjacken', 'puffer jacken']
            : pullover
              ? ['zopfpullover', 'zopf pullover', 'cable knit']
              : title.startsWith('Vintage')
                ? ['vintage']
                : [],
          excluded_title_keywords: puffer ? ['weste', 'pufferweste'] : [],
          keyword_mode: 'any',
          poll_interval_ms: index % 2 ? 10000 : 5000,
          price_from: null,
          price_to: 30 + index * 5,
          notes: null,
          search_text: null,
          is_active: index % 4 !== 3,
          filter_revision: 1,
          filter_format_version: 1,
          is_seeded: index < 10,
          is_standard: false,
          last_status: index === 6 ? 'failed' : index < 10 ? 'ok' : 'never_polled',
          last_success_at: index < 10 ? '2026-10-29T08:00:00Z' : null,
          last_polled_at: index < 10 ? '2026-10-29T08:00:00Z' : null,
          last_error_message: index === 6 ? 'Zeitlimit beim letzten Abruf.' : null,
          coverage_status:
            index === 6 ? 'limited' : index < 9 ? 'caught_up' : index === 9 ? 'initial' : 'unknown',
          coverage_checked_at: index < 10 ? '2026-10-29T08:00:00Z' : null,
          last_request_duration_ms: index < 10 ? 1234 + index * 100 : null,
          shared_filter_count: index === 0 ? 2 : 1,
          consecutive_failures: index === 6 ? 1 : 0,
          created_at: '2026-10-29T07:00:00Z',
          updated_at: '2026-10-29T08:00:00Z',
          deleted_at: null,
        });
      }
    },
    updateQuery: (id: string, values: Record<string, unknown>) => {
      const row = rows.find((entry) => entry['id'] === id);
      if (!row) throw new Error('Lokales Suchfilter-Fixture fehlt.');
      Object.assign(row, values);
    },
    staleRuntime: () => {
      runtimeAge = 300_000;
    },
    calls,
    failSave: (value: boolean) => {
      rejectSave = value;
    },
  };
}

test('prüft den Vinted-Bot manuell und behält bei Ablehnung die Pause @core-smoke', async ({
  page,
}) => {
  await mockAdministration(page);
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
  await expect(page.getByText('Manuelle Prüfung erforderlich', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vinted-Zugriff prüfen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Vinted-Zugriff manuell prüfen', exact: true });
  await expect(dialog.getByAltText('Aktuelle Vinted-Seite im Botbrowser')).toBeVisible();
  await checkAxe(page);
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
  await expect(page.getByText('Manuelle Prüfung erforderlich', { exact: true })).toBeVisible();
  expect(opened).toBe(1);
  expect(closed).toBe(1);
  expect(authenticated.every(Boolean)).toBe(true);
});

async function checkAxe(page: Page) {
  await page.addScriptTag({ content: axe.source });
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            (document.querySelector('app-confirm-dialog [role="dialog"]') ??
              document.querySelector('app-sniper-queries, app-sniper-operation')) as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
}

// Der Botbetrieb öffnet sich aus der Statuszeile als Panel. Beim Schließen
// bleibt die Filterverwaltung erhalten, auch auf schmalen Bildschirmen.
async function openVintedBotSection(page: Page, name: string) {
  if (name === 'Botbetrieb') await page.getByRole('button', { name: /Betrieb ansehen/ }).click();
  else
    await page
      .getByRole('dialog', { name: 'Botbetrieb', exact: true })
      .getByRole('button', { name: 'Fertig', exact: true })
      .click();
}

async function filterAction(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: 'Einstellungen für ' + title, exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Einstellungen für ' + title, exact: true })
    .getByRole('button', { name: action, exact: true })
    .click();
}

for (const view of [
  { name: 'desktop-dark', width: 1280, theme: 'dark', touch: false },
  { name: 'mobile-light', width: 390, theme: 'light', touch: true },
]) {
  test.describe(`Neue Filterverwaltung ${view.name}`, () => {
    test.use({ viewport: { width: view.width, height: 1000 }, hasTouch: view.touch });
    test('verbindet Kacheln, Zahnrad, Details, Duplizieren und sichere Mehrfachpause', async ({
      page,
    }, testInfo) => {
      await page.addInitScript(
        (theme) => localStorage.setItem('flipbase_theme', theme),
        view.theme,
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const backend = await mockAdministration(page);
      backend.seedOverview();
      await page.goto('/admin/vinted-bot/queries');
      const cards = page.locator('app-sniper-filter-card');
      await expect(cards).toHaveCount(12);
      await expect(page.getByRole('navigation', { name: 'Bereiche des Vinted Bots' })).toHaveCount(
        0,
      );
      const title = 'Pufferjacken · Nike & Patagonia';
      const gear = page.getByRole('button', { name: 'Einstellungen für ' + title, exact: true });
      await expect(gear).toHaveText('');
      await gear.click();
      const settings = page.getByRole('dialog', {
        name: 'Einstellungen für ' + title,
        exact: true,
      });
      await expect(settings.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(gear).toBeFocused();
      await page.getByRole('button', { name: title, exact: true }).focus();
      await page.keyboard.press('Enter');
      const detail = page.getByRole('dialog', { name: title, exact: true });
      await expect(detail).toContainText('Nike · Patagonia');
      await expect(detail).toContainText('puffer jacken');
      await checkAxe(page);
      await detail.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
      await cards
        .filter({ has: page.getByRole('button', { name: title, exact: true }) })
        .getByText('Nike · Patagonia', { exact: true })
        .click();
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
      await filterAction(page, title, 'Duplizieren');
      const duplicate = page.getByRole('dialog', { name: 'Suchfilter duplizieren', exact: true });
      await expect(duplicate.getByRole('textbox', { name: 'Filtername', exact: true })).toHaveValue(
        title + ' – Kopie',
      );
      await expect(duplicate).toContainText('Ändere mindestens eine Suchbedingung');
      await duplicate.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
      await expect(duplicate.getByRole('alert')).toContainText(
        'Ein Suchfilter mit diesen Bedingungen besteht bereits.',
      );
      await expect(cards).toHaveCount(12);
      await duplicate
        .getByRole('spinbutton', { name: 'Höchstpreis · optional', exact: true })
        .fill('31');
      await duplicate.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
      await expect(cards).toHaveCount(13);
      expect(
        backend.calls.find((call) => call.name === 'save_sniper_search_filter')?.body['p_id'],
      ).toBeNull();
      const copyCard = cards.filter({
        has: page.getByRole('button', { name: title + ' – Kopie', exact: true }),
      });
      await expect(copyCard).toContainText('Pausiert');
      await page.getByRole('button', { name: 'Kompakt', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Kompakt', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page
        .getByRole('searchbox', { name: 'Zentrale Suchfilter durchsuchen', exact: true })
        .fill('Ralph Lauren');
      await expect(cards).toHaveCount(3);
      await page
        .getByRole('searchbox', { name: 'Zentrale Suchfilter durchsuchen', exact: true })
        .fill('');
      const status = page.getByRole('group', {
        name: 'Suchfilter nach Status filtern',
        exact: true,
      });
      await status.getByRole('button', { name: /^Aufmerksamkeit/ }).click();
      await expect(cards).toHaveCount(1);
      await expect(cards).toContainText('Vintage-Jacken');
      await status.getByRole('button', { name: /^Alle/ }).click();
      backend.failActive('documentation-1');
      await page.getByRole('checkbox', { name: title + ' auswählen', exact: true }).click();
      await expect(
        page.getByRole('checkbox', { name: title + ' auswählen', exact: true }),
      ).toBeChecked();
      if (view.touch) {
        const selectionTarget = await page
          .getByRole('checkbox', { name: title + ' auswählen', exact: true })
          .boundingBox();
        expect(selectionTarget!.height).toBeGreaterThanOrEqual(44);
        expect(selectionTarget!.width).toBeGreaterThanOrEqual(44);
      }
      await page
        .getByRole('checkbox', { name: 'Pufferjacken · Patagonia auswählen', exact: true })
        .click();
      await expect(
        page.getByRole('checkbox', { name: 'Pufferjacken · Patagonia auswählen', exact: true }),
      ).toBeChecked();
      await page
        .getByRole('group', { name: 'Ausgewählte Suchfilter', exact: true })
        .getByRole('button', { name: 'Pausieren', exact: true })
        .click();
      await expect(page.getByRole('alert')).toContainText('Pufferjacken · Patagonia');
      await expect(
        page.getByRole('checkbox', { name: title + ' auswählen', exact: true }),
      ).not.toBeChecked();
      await expect(
        page.getByRole('checkbox', { name: 'Pufferjacken · Patagonia auswählen', exact: true }),
      ).toBeChecked();
      const mutations = backend.calls.filter((call) => call.name === 'set_sniper_query_active');
      expect(mutations.map((call) => call.body)).toEqual([
        { p_id: 'documentation-0', p_active: false },
        { p_id: 'documentation-1', p_active: false },
      ]);
      await expect(
        cards.filter({ has: page.getByRole('button', { name: title, exact: true }) }),
      ).toContainText('Pausiert');
      await checkAxe(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('compact-selection.png'),
        fullPage: false,
      });
    });
    test('zeigt Statusfehler und fehlgeschlagenes Nachladen im offenen Detailpanel', async ({
      page,
    }) => {
      const backend = await mockAdministration(page);
      backend.seedOverview();
      backend.failActive('documentation-0');
      await page.goto('/admin/vinted-bot/queries');
      const title = 'Pufferjacken · Nike & Patagonia';
      await page.getByRole('button', { name: title, exact: true }).click();
      const detail = page.getByRole('dialog', { name: title, exact: true });
      await detail.getByRole('button', { name: 'Pausieren', exact: true }).click();
      await expect(detail.getByRole('alert')).toContainText(
        'Status vorübergehend nicht gespeichert',
      );
      backend.failActive(null);
      backend.failQueryRead(true);
      await detail.getByRole('button', { name: 'Pausieren', exact: true }).click();
      await expect(detail.getByRole('alert')).toContainText(
        'Filterstand vorübergehend nicht verfügbar',
      );
      await expect(detail.getByRole('button', { name: 'Erneut laden', exact: true })).toBeVisible();
    });
  });
}

for (const theme of ['light', 'dark']) {
  test(`verwaltet zentrale Kategorie-, Marken- und Titel-Suchfilter ${theme} @core-smoke`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: theme === 'dark' ? 390 : 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
    const backend = await mockAdministration(page);
    const errors: string[] = [];
    const consoleMessages: { type: string; text: string }[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        consoleMessages.push({ type: message.type(), text: message.text() });
    });
    await page.goto('/admin/queries');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    const create = page
      .locator('[data-new-query]')
      .getByRole('button', { name: 'Suchfilter erstellen', exact: true });
    // Erst die lazy geladene Seite abwarten; danach muss auch die alte Adresse umgeleitet sein.
    await create.waitFor({ state: 'visible' });
    await expect(page).toHaveURL(/\/admin\/vinted-bot\/queries$/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await create.click();
    const editor = page.getByRole('dialog', { name: 'Neuen Suchfilter anlegen', exact: true });
    await expect(editor).toBeVisible();
    await editor
      .getByRole('textbox', { name: 'Filtername', exact: true })
      .fill('Nike Herrenjacken – Vintage');
    await editor.locator('app-vinted-category-picker button[aria-haspopup="dialog"]').click();
    const categoryPanel = page.getByRole('dialog', { name: 'Kategorie · optional', exact: true });
    await categoryPanel.getByRole('combobox', { name: 'Kategorie suchen' }).fill('Herren Jacken');
    await categoryPanel
      .getByRole('option')
      .filter({ hasText: 'Herren › Kleidung › Jacken' })
      .click();
    const trigger = editor.locator('#vinted-brand-picker');
    await trigger.click();
    const picker = page.getByRole('dialog', { name: 'Marken · optional', exact: true });
    const search = picker.getByRole('combobox');
    await expect(picker.getByRole('option')).toHaveCount(0);
    await search.fill('Nike');
    await expect(picker.getByRole('option', { name: 'Nike', exact: true })).toBeVisible();
    // Außerhalb schließen und Escape dürfen den übergeordneten Editor nicht schließen.
    await editor.getByRole('textbox', { name: 'Filtername', exact: true }).click();
    await expect(picker).not.toBeVisible();
    await expect(editor).toBeVisible();
    await trigger.click();
    await expect(search).toHaveValue('Nike');
    await search.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(editor).toBeVisible();
    await trigger.click();
    await search.press('ArrowDown');
    await search.press('Enter');
    await search.fill('Patagonia');
    await picker.getByRole('option', { name: 'Patagonia', exact: true }).click();
    await picker.getByRole('button', { name: 'Auswahl schließen', exact: true }).click();
    await expect(
      editor.getByRole('button', { name: 'Patagonia aus Auswahl entfernen', exact: true }),
    ).toBeVisible();
    await editor
      .getByRole('textbox', { name: 'Stichwörter im Titel · optional', exact: true })
      .fill('Vintage');
    await editor
      .getByRole('textbox', { name: 'Stichwörter im Titel · optional', exact: true })
      .press('Enter');
    await expect(
      editor.getByRole('status').filter({ hasText: 'Herren > Kleidung > Jacken' }),
    ).toContainText('Titel enthält alle Begriffe: vintage');
    await editor
      .getByRole('spinbutton', { name: 'Gewünschter Abstand in Sekunden', exact: true })
      .fill('30');
    await editor.getByRole('textbox', { name: 'Notiz', exact: true }).fill('Sportmarken');
    await checkAxe(page);
    await page.screenshot({
      path: testInfo.outputPath('specific-search-filter.png'),
      fullPage: true,
    });
    backend.failSave(true);
    await editor.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('Speichern vorübergehend fehlgeschlagen');
    await expect(
      editor.getByRole('button', { name: 'Nike aus Auswahl entfernen', exact: true }),
    ).toBeVisible();
    backend.failSave(false);
    await editor.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(editor).not.toBeVisible();
    const title = 'Nike Herrenjacken – Vintage';
    await expect(page.locator('[data-filter-collection]')).toContainText(
      'Herren › Kleidung › Jacken',
    );
    await page.getByRole('button', { name: title, exact: true }).focus();
    await page.keyboard.press('Enter');
    const conditions = page.getByRole('dialog', { name: title, exact: true });
    await expect(conditions).toContainText('Herren › Kleidung › Jacken');
    await expect(conditions).toContainText('Nike · Patagonia');
    await conditions.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    await page
      .getByRole('button', { name: `Suchfilter aktivieren: ${title}`, exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Wird geprüft' })).toBeVisible();
    await page.getByRole('button', { name: `Suchfilter pausieren: ${title}`, exact: true }).click();
    await filterAction(page, title, 'Bearbeiten');
    const editing = page.getByRole('dialog', { name: 'Suchfilter bearbeiten', exact: true });
    await expect(
      editing.getByRole('button', { name: 'Nike aus Auswahl entfernen', exact: true }),
    ).toBeVisible();
    await expect(
      editing.getByRole('button', { name: 'vintage aus Titelbegriffen entfernen', exact: true }),
    ).toBeVisible();
    await editing.getByRole('textbox', { name: 'Filtername', exact: true }).fill('Nike geändert');
    await editing.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Änderungen verwerfen?', exact: true });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(discard).not.toBeVisible();
    await editing
      .getByRole('textbox', { name: 'Notiz', exact: true })
      .fill('Gezielter Testbereich');
    await expect(editing.getByRole('textbox', { name: 'Notiz', exact: true })).toHaveValue(
      'Gezielter Testbereich',
    );
    await editing.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
    const renamed = page.getByRole('button', { name: 'Nike geändert', exact: true });
    await expect(renamed).toBeFocused();
    await renamed.click();
    const changedDetails = page.getByRole('dialog', { name: 'Nike geändert', exact: true });
    await expect(changedDetails).toContainText('Gezielter Testbereich');
    await changedDetails.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    await page.reload();
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.locator('[data-filter-collection]')).toContainText('Nike geändert');
    await create.click();
    const second = page.getByRole('dialog', { name: 'Neuen Suchfilter anlegen', exact: true });
    await second.getByRole('textbox', { name: 'Filtername', exact: true }).fill('Herren komplett');
    await second.locator('app-vinted-category-picker button[aria-haspopup="dialog"]').click();
    const parentCategoryPanel = page.getByRole('dialog', {
      name: 'Kategorie · optional',
      exact: true,
    });
    await parentCategoryPanel.getByRole('option', { name: /^Herren.*Unterkategorien$/ }).click();
    await parentCategoryPanel
      .getByRole('button', { name: 'Herren auswählen', exact: true })
      .click();
    await expect(parentCategoryPanel).not.toBeVisible();
    // Übergeordnete Kategorien sind ausdrücklich ohne Marke speicherbar.
    await second.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(page.locator('[data-filter-collection]')).toContainText('Herren komplett');
    expect(
      backend.calls.some(
        (call) =>
          call.name === 'save_sniper_search_filter' &&
          call.body['p_catalog_id'] === 1 &&
          (call.body['p_brands'] as unknown[]).length === 0,
      ),
    ).toBe(true);
    await create.click();
    const third = page.getByRole('dialog', { name: 'Neuen Suchfilter anlegen', exact: true });
    await third.locator('#vinted-brand-picker').click();
    const thirdPicker = page.getByRole('dialog', { name: 'Marken · optional', exact: true });
    await thirdPicker.getByRole('combobox').fill('Nike');
    await expect(thirdPicker.getByRole('option', { name: 'Nike', exact: true })).toBeVisible();
    const thirdSearch = thirdPicker.getByRole('combobox');
    const clearSearch = thirdPicker.getByRole('button', {
      name: 'Suche zurücksetzen',
      exact: true,
    });
    const closePicker = thirdPicker.getByRole('button', { name: 'Auswahl schließen', exact: true });
    // Bei gefüllter Suche ist die zugängliche Zurücksetzen-Aktion eine eigene Tab-Station.
    await thirdSearch.press('Tab');
    await expect(clearSearch).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closePicker).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(clearSearch).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(thirdSearch).toHaveValue('');
    await expect(thirdSearch).toBeFocused();
    await expect(clearSearch).toHaveCount(0);
    await expect(thirdPicker.getByRole('option')).toHaveCount(0);
    // Ohne Suchwert folgt direkt Schließen; Escape lässt den übergeordneten Editor offen.
    await page.keyboard.press('Tab');
    await expect(closePicker).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(thirdPicker).not.toBeVisible();
    await expect(third.locator('#vinted-brand-picker')).toBeFocused();
    await expect(third).toBeVisible();
    await third.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('query-list.png'), fullPage: true });
    const deleteButton = page.getByRole('button', {
      name: 'Einstellungen für Nike geändert',
      exact: true,
    });
    await filterAction(page, 'Nike geändert', 'Löschen …');
    const confirmation = page.getByRole('dialog', { name: 'Suchfilter löschen?', exact: true });
    await expect(confirmation).toContainText('Favoriten');
    await checkAxe(page);
    await confirmation.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(deleteButton).toBeFocused();
    expect(backend.calls.filter((call) => call.name === 'delete_sniper_query')).toHaveLength(0);
    await filterAction(page, 'Nike geändert', 'Löschen …');
    await confirmation.getByRole('button', { name: 'Löschen', exact: true }).click();
    await expect(page.locator('[data-filter-collection]')).not.toContainText('Nike geändert');
    await expect(create).toBeFocused();
    await openVintedBotSection(page, 'Botbetrieb');
    await expect(page.getByRole('heading', { name: 'Vinted-Zugriff', exact: true })).toBeVisible();
    await expect(page.getByText('Vinted verbunden', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Bereiche des Vinted Bots' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Botbetrieb', exact: true })).toBeVisible();
    await page.getByRole('heading', { name: 'Vinted-Zugriff', exact: true }).hover();
    await page.screenshot({ path: testInfo.outputPath('bot-overview.png'), fullPage: true });
    await expect(page.getByText('Gespeicherte Kategorien', { exact: true })).not.toBeVisible();
    await page.getByText('Kategorienpflege', { exact: true }).click();
    await expect(page.getByText('Gespeicherte Kategorien', { exact: true })).toBeVisible();
    await expect(page.locator('app-vinted-categories')).toContainText('persönlichen Suchfiltern');
    await page.getByRole('button', { name: 'Kategorien neu einlesen', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Kategorien neu einlesen', exact: true }),
    ).toBeDisabled();
    await expect(page.locator('app-vinted-categories')).toContainText('Auffrischung angefordert');
    await page.getByText('Technische Details', { exact: true }).click();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('bot-operation.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.goto('/admin/vinted-bot/categories');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page).toHaveURL(/\/admin\/vinted-bot\/operation$/);
    backend.staleRuntime();
    await page.reload();
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByText('Betriebsstand unbestätigt', { exact: true })).toBeVisible();
    expect(backend.calls.filter((call) => call.name === 'vinted_category_syncs')).toHaveLength(1);
    expect(
      backend.calls.some(
        (call) =>
          call.name === 'save_sniper_search_filter' &&
          (call.body['p_brands'] as { id: number }[]).some((brand) => brand.id === 53) &&
          call.body['p_poll_interval_ms'] === 30000,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    // Die fehlgeschlagenen Speicherversuche sind ausdrueckliche Fehler-Fixtures.
    // Das HTTP-400-Protokoll des Browsers ist dabei erwartet, weitere Fehler nicht.
    expect(
      consoleMessages.filter(
        (message) => message.type === 'error' && !message.text.includes('400 (Bad Request)'),
      ),
    ).toEqual([]);
    await testInfo.attach('browser-console', {
      body: JSON.stringify(consoleMessages),
      contentType: 'application/json',
    });
  });
}

for (const theme of ['light', 'dark']) {
  test.describe(`Titelvarianten per Touch ${theme}`, () => {
    test.use({ hasTouch: true, viewport: { width: theme === 'dark' ? 390 : 834, height: 1000 } });
    test('übernimmt Vorschläge ausdrücklich, erhält Ausschlüsse und trennt Wunschtempo vom Abrufstand @core-smoke', async ({
      page,
    }, testInfo) => {
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const backend = await mockAdministration(page);
      await page.goto('/admin/vinted-bot/queries');
      const create = page
        .locator('[data-new-query]')
        .getByRole('button', { name: 'Suchfilter erstellen', exact: true });
      await create.click();
      const editor = page.getByRole('dialog', { name: 'Neuen Suchfilter anlegen', exact: true });
      await expect(editor.getByRole('textbox', { name: 'Filtername', exact: true })).toBeFocused();
      const touchField = await editor.locator('#sniper-title').evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      }));
      expect(touchField.height).toBeGreaterThanOrEqual(44);
      expect(touchField.fontSize).toBeGreaterThanOrEqual(16);
      await editor.getByRole('textbox', { name: 'Filtername', exact: true }).fill('Pufferjacken');
      const titleHelp = editor
        .locator('details')
        .filter({ hasText: 'So funktionieren die Titelregeln' });
      await titleHelp.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(titleHelp).toHaveAttribute('open', '');
      await expect(titleHelp.locator('p').first()).toBeVisible();
      await expect(titleHelp.locator('p').first()).toContainText('„Alle“ verlangt jeden Begriff');
      await expect(titleHelp.locator('p').first()).toContainText('Kein Ausschlussbegriff');
      await page.keyboard.press('Enter');
      await editor.getByRole('button', { name: 'Pufferjacken übernehmen', exact: true }).tap();
      for (const term of ['puffer', 'pufferjacke', 'puffer jacke', 'pufferjacken', 'puffer jacken'])
        await expect(
          editor.getByRole('button', { name: `${term} aus Titelbegriffen entfernen`, exact: true }),
        ).toBeVisible();
      await expect(
        editor.getByRole('combobox', { name: 'Welche Stichwörter müssen vorkommen?', exact: true }),
      ).toContainText('Mindestens eines');
      await editor.getByRole('button', { name: 'puffer bearbeiten', exact: true }).tap();
      const titleEntry = editor.getByRole('textbox', {
        name: 'Stichwörter im Titel · optional',
        exact: true,
      });
      expect((await titleEntry.boundingBox())!.width).toBeGreaterThanOrEqual(240);
      await expect(titleEntry).toBeFocused();
      await titleEntry.fill('Puffermantel');
      await titleEntry.press('Enter');
      await editor
        .getByRole('button', { name: 'puffermantel aus Titelbegriffen entfernen', exact: true })
        .tap();
      const exclusion = editor.getByRole('textbox', {
        name: 'Ausschlussbegriffe im Titel · optional',
        exact: true,
      });
      expect((await exclusion.boundingBox())!.width).toBeGreaterThanOrEqual(240);
      await exclusion.fill('Weste');
      await exclusion.press('Enter');
      await exclusion.fill('Pufferweste');
      await editor.getByRole('button', { name: 'Ausschluss hinzufügen', exact: true }).tap();
      await editor
        .getByRole('spinbutton', { name: 'Höchstpreis · optional', exact: true })
        .fill('50');
      const interval = editor.getByRole('spinbutton', {
        name: 'Gewünschter Abstand in Sekunden',
        exact: true,
      });
      await expect(interval).toHaveValue('5');
      await interval.fill('0');
      await editor.getByRole('button', { name: 'Suchfilter speichern', exact: true }).tap();
      await expect(interval).toHaveAttribute('aria-invalid', 'true');
      await expect(interval).toBeFocused();
      await interval.fill('1');
      await checkAxe(page);
      await page.screenshot({
        path: testInfo.outputPath('title-variants-touch.png'),
        fullPage: true,
      });
      await editor.getByRole('button', { name: 'Suchfilter speichern', exact: true }).tap();
      await expect(editor).not.toBeVisible();
      expect(
        backend.calls.find((call) => call.name === 'save_sniper_search_filter')?.body,
      ).toMatchObject({
        p_title_keywords: ['pufferjacke', 'puffer jacke', 'pufferjacken', 'puffer jacken'],
        p_excluded_title_keywords: ['weste', 'pufferweste'],
        p_keyword_mode: 'any',
        p_poll_interval_ms: 1000,
        p_price_to: 50,
      });
      const table = page.locator('[data-filter-collection]');
      await expect(table).toContainText('Noch kein erfolgreicher Abruf');
      await page.getByRole('button', { name: 'Pufferjacken', exact: true }).tap();
      let detail = page.getByRole('dialog', { name: 'Pufferjacken', exact: true });
      await expect(detail).toContainText('Ausgeschlossen');
      await expect(detail).toContainText('weste');
      await expect(detail).toContainText('pufferweste');
      await expect(detail).toContainText('Abrufumfang noch unbekannt');
      await detail.getByRole('button', { name: 'Dialog schließen', exact: true }).tap();
      backend.updateQuery('query-1', {
        last_status: 'failed',
        last_error_message: 'Zeitlimit beim letzten Abruf',
        last_success_at: '2026-10-29T08:00:00Z',
        coverage_status: 'limited',
        coverage_checked_at: '2026-10-29T08:05:00Z',
        last_request_duration_ms: 1234,
        shared_filter_count: 2,
      });
      await page.reload();
      await page.getByRole('button', { name: 'Pufferjacken', exact: true }).tap();
      detail = page.getByRole('dialog', { name: 'Pufferjacken', exact: true });
      await expect(detail).toContainText('Zeitlimit beim letzten Abruf');
      await expect(detail).toContainText('Aufholen begrenzt');
      await expect(detail).toContainText('1234 ms');
      const run = detail.locator('app-sniper-query-run-status');
      await expect(run.getByText('Zeitlimit beim letzten Abruf', { exact: true })).toBeVisible();
      await expect(
        run.getByText('Aufholen begrenzt · weitere Artikel möglich', { exact: true }),
      ).toBeVisible();
      const runDetails = run.locator('details[data-query-run-details]');
      await expect(runDetails).not.toHaveAttribute('open');
      await runDetails.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(runDetails).toHaveAttribute('open', '');
      await expect(runDetails.getByText('1234 ms', { exact: true })).toBeVisible();
      await expect(runDetails.locator('time').first()).toHaveAttribute(
        'datetime',
        '2026-10-29T08:00:00Z',
      );
      await expect(runDetails.locator('time').first()).toBeVisible();
      await expect(runDetails).toContainText('Geteilt mit insgesamt 2 Filtern');
      await page.keyboard.press('Enter');
      await expect(runDetails.locator('summary')).toBeFocused();
      const fullConditions = detail.getByRole('region', { name: 'Suchbedingungen', exact: true });
      await expect(fullConditions).toContainText('weste');
      await expect(fullConditions).toContainText('pufferweste');
      await detail.getByRole('button', { name: 'Dialog schließen', exact: true }).tap();
      const status = page.getByRole('group', {
        name: 'Suchfilter nach Status filtern',
        exact: true,
      });
      await status.getByRole('button', { name: /^Aktiv/ }).tap();
      await expect(page.getByText('Keine passenden Suchfilter', { exact: true })).toBeVisible();
      await status.getByRole('button', { name: /^Pausiert/ }).tap();
      await expect(table).toContainText('Pufferjacken');
      await filterAction(page, 'Pufferjacken', 'Bearbeiten');
      const editing = page.getByRole('dialog', { name: 'Suchfilter bearbeiten', exact: true });
      await expect(
        editing.getByRole('button', { name: 'weste aus Ausschlüssen entfernen', exact: true }),
      ).toBeVisible();
      await expect(
        editing.getByRole('button', {
          name: 'pufferweste aus Ausschlüssen entfernen',
          exact: true,
        }),
      ).toBeVisible();
      await editing.getByRole('button', { name: 'Abbrechen', exact: true }).tap();
      await expect(page.getByRole('button', { name: 'Pufferjacken', exact: true })).toBeFocused();
      await checkAxe(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('title-variants-list-touch.png'),
        fullPage: true,
      });
    });
  });
}

for (const view of [
  { name: 'desktop-light', theme: 'light', width: 1440, formHeight: 1500 },
  { name: 'mobile-dark', theme: 'dark', width: 390, formHeight: 2200 },
]) {
  test.describe(`Bildnachweis ${view.name}`, () => {
    test.use({ hasTouch: view.name === 'mobile-dark' });
    test(`zeigt vollständige Filterübersicht und neue Anlage ${view.name} mit synthetischen Daten`, async ({
      page,
    }) => {
      const directory = resolve(
        process.env['VINTED_UI_EVIDENCE_DIR'] ??
          '.superpowers/sdd/vinted-bot-management-ui/screenshots',
      );
      await mkdir(directory, { recursive: true });
      await page.setViewportSize({ width: view.width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(
        (theme) => localStorage.setItem('flipbase_theme', theme),
        view.theme,
      );
      const backend = await mockAdministration(page);
      backend.seedOverview();
      await page.goto('/admin/vinted-bot/queries');
      await expect(page.locator('app-sniper-filter-card')).toHaveCount(12);
      await expect(page.locator('#app-startup')).not.toBeVisible();
      if (view.name === 'desktop-light') {
        const tableWidth = await page.locator('[data-filter-collection]').evaluate((element) => ({
          available: element.clientWidth,
          content: element.scrollWidth,
        }));
        expect(tableWidth.content).toBeLessThanOrEqual(tableWidth.available + 1);
      }
      await checkAxe(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      // Die Übersicht vollständig zeigen, ohne dass die feste mobile Navigation
      // beim Vollseitenfoto mitten über einer Filterzeile liegt.
      const overviewHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (view.name === 'desktop-light') expect(overviewHeight).toBeLessThan(1550);
      await page.setViewportSize({ width: view.width, height: overviewHeight });
      await page.screenshot({
        path: resolve(directory, `${view.name}-overview.png`),
        fullPage: false,
      });
      await page
        .locator('[data-new-query]')
        .getByRole('button', { name: 'Suchfilter erstellen', exact: true })
        .click();
      const editor = page.getByRole('dialog', { name: 'Neuen Suchfilter anlegen', exact: true });
      await expect(editor.getByRole('textbox', { name: 'Filtername', exact: true })).toBeFocused();
      // Für den vollständigen Formularnachweis nur die Fensterhöhe vergrößern;
      // keine DOM-/CSS-Manipulation und kein abgeschnittener Formularteil.
      await page.setViewportSize({ width: view.width, height: view.formHeight });
      await expect(
        editor.getByRole('button', { name: 'Suchfilter speichern', exact: true }),
      ).toBeInViewport();
      await expect(
        editor.getByRole('textbox', { name: 'Filtername', exact: true }),
      ).toBeInViewport();
      await checkAxe(page);
      await page.screenshot({
        path: resolve(directory, `${view.name}-new-filter.png`),
        fullPage: false,
      });
      expect(backend.calls).toEqual([]);
      await writeFile(
        resolve(directory, `${view.name}-measurements.json`),
        JSON.stringify(
          {
            width: view.width,
            overviewHeight,
            editorContentHeight: (await editor.locator('form').boundingBox())?.height,
            formViewportHeight: view.formHeight,
          },
          null,
          2,
        ),
      );
    });
  });
}

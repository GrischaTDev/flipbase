import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';

// Diese Datei mockt die gesamte Supabase-API und braucht keine echte Sitzung.
test.use({ storageState: { cookies: [], origins: [] } });

/** Ausschliesslich lokale HTTP-Fixtures; kein Betreiberkonto und keine echten Botauftraege. */
async function mockAdministration(page: Page) {
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
  let runtimeAge = 0;
  let categoryRequestedAt: string | null = null;
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
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Test Administration' };
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
        refreshed_at: new Date(Date.now() - 60_000).toISOString(),
        requested_at: categoryRequestedAt,
        last_attempt_at: null,
        category_count: 2,
        last_error: null,
      };
    }
    if (name === 'vinted_categories')
      json =
        Number(url.searchParams.get('offset') ?? 0) === 0
          ? [
              { id: 1049, parent_id: 16, title: 'Stiefel', path: 'Damen > Schuhe > Stiefel' },
              { id: 1050, parent_id: 16, title: 'Sneaker', path: 'Damen > Schuhe > Sneaker' },
            ]
          : [];
    if (['upsert_sniper_query', 'set_sniper_query_active', 'delete_sniper_query'].includes(name)) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      if (rejectSave && name === 'upsert_sniper_query') {
        await route.fulfill({
          status: 400,
          json: { message: 'Speichern vorübergehend fehlgeschlagen' },
        });
        return;
      }
      if (name === 'upsert_sniper_query') {
        if (body['p_id'])
          Object.assign(
            rows.find((row) => row['id'] === body['p_id'])!,
            {
              title: body['p_title'],
              notes: body['p_notes'],
              poll_interval_ms: body['p_poll_interval_ms'],
            },
          );
        else
          rows.push({
            id: `query-${rows.length + 1}`,
            title: body['p_title'],
            query_key: `vinted|search=|catalog=-|brand=${body['p_brand_id']}|price_from=-|price_to=-`,
            marketplace: 'vinted',
            search_text: null,
            catalog_id: null,
            brand_id: body['p_brand_id'],
            price_from: null,
            price_to: null,
            poll_interval_ms: body['p_poll_interval_ms'],
            notes: body['p_notes'],
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
        json = 'query-1';
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
    staleRuntime: () => {
      runtimeAge = 300_000;
    },
    calls,
    failSave: (value: boolean) => {
      rejectSave = value;
    },
  };
}

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

// Die Bot-Seiten wechselt man im Seitenmenue des Vinted Bots. Auf schmalen
// Bildschirmen ist es ein Auswahlfeld - ein Klick auf den dann unsichtbaren
// Link wartete sonst bis zum Testabbruch.
async function openVintedBotSection(page: Page, name: string) {
  // Link und Option lesen sich mit ihrer Beschreibung ("Botbetrieb Anfragen
  // und Fehler"); gesucht wird deshalb am Namensanfang.
  const label = new RegExp(`^${name}`);
  const navigation = page.getByRole('navigation', { name: 'Bereiche des Vinted Bots' });
  if (await navigation.isVisible()) {
    await navigation.getByRole('link', { name: label }).click();
    return;
  }
  const select = page.getByRole('combobox', {
    name: 'Bereich des Vinted Bots auswählen',
    exact: true,
  });
  await select.scrollIntoViewIfNeeded();
  // Das Scrollen des Ankers schliesst die Shared-Auswahl absichtlich. Erst
  // nach dem Layout-Takt oeffnen - ein direkter Klick scrollte und schloss sie.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await select.focus();
  await select.press('Enter');
  await page.getByRole('option', { name: label }).click();
}

for (const theme of ['light', 'dark']) {
  test(`Markenfilter verwalten und Kategorien im Botbetrieb ${theme} @pr-smoke`, async ({
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
    await expect(page).toHaveURL(/\/admin\/vinted-bot\/queries$/);
    await expect(page).toHaveTitle(/Flipbase/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    const create = page
      .locator('[data-new-query]')
      .getByRole('button', { name: 'Neuer Markenfilter', exact: true });
    await expect(create).toBeVisible();
    await create.click();
    const creator = page.getByRole('dialog', { name: 'Neuen Markenfilter anlegen', exact: true });
    await expect(creator).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Markenfilter anlegen', exact: true }),
    ).toBeDisabled();
    const trigger = page.locator('#vinted-brand-picker');
    await trigger.click();
    const picker = page.getByRole('dialog', { name: 'Vinted-Marken', exact: true });
    const search = page.getByRole('combobox', { name: 'Vinted-Marken suchen', exact: true });
    await expect(picker.getByRole('option', { name: 'Nike', exact: true })).toBeVisible();
    await search.fill('Patagonia');
    await expect(picker.getByRole('option', { name: 'Patagonia', exact: true })).toBeVisible();
    await expect(search).toHaveAttribute('type', 'text');
    await expect(
      picker.getByRole('button', { name: 'Suche zurücksetzen', exact: true }),
    ).toBeVisible();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('brand-search.png'), fullPage: true });
    await page.getByRole('textbox', { name: 'Notiz', exact: true }).click();
    await expect(picker).not.toBeVisible();
    await expect(creator).toBeVisible();
    await trigger.click();
    await expect(search).toHaveValue('Patagonia');
    await search.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(creator).toBeVisible();
    await trigger.click();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Patagonia aus Auswahl entfernen', exact: true }),
    ).toBeVisible();
    await search.fill('Nike');
    await picker.getByRole('option', { name: 'Nike', exact: true }).click();
    await picker.getByRole('button', { name: 'Auswahl schließen', exact: true }).click();
    await expect(picker).not.toBeVisible();
    await page
      .getByRole('spinbutton', { name: 'Abstand zwischen Abfragen in Sekunden', exact: true })
      .fill('30');
    await page.getByRole('textbox', { name: 'Notiz', exact: true }).fill('Sportmarken');
    backend.failSave(true);
    await page.getByRole('button', { name: 'Markenfilter anlegen', exact: true }).click();
    await expect(creator.getByRole('alert')).toContainText('konnten nicht angelegt');
    await expect(
      page.getByRole('button', { name: 'Patagonia aus Auswahl entfernen', exact: true }),
    ).toBeVisible();
    backend.failSave(false);
    await page.getByRole('button', { name: 'Markenfilter anlegen', exact: true }).click();
    await expect(creator).not.toBeVisible();
    await expect(page.getByRole('table')).toContainText('Patagonia');
    await expect(page.getByRole('table')).toContainText('Nike');
    await expect(page.getByRole('table')).toContainText('Pausiert');
    await page.getByRole('button', { name: 'Markenfilter aktivieren: Nike', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Wird geprüft' })).toBeVisible();
    await page.getByRole('button', { name: 'Markenfilter pausieren: Nike', exact: true }).click();
    await page.getByRole('button', { name: 'Markenfilter bearbeiten: Nike', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Markenfilter bearbeiten', exact: true });
    await page.getByRole('textbox', { name: 'Filtername', exact: true }).fill('Nike geändert');
    await page.getByRole('textbox', { name: 'Notiz' }).fill('Gezielter Testbereich');
    await editor.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Änderungen verwerfen?', exact: true });
    await expect(discard).toBeVisible();
    await discard.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(editor).toBeVisible();
    await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Gezielter Testbereich');
    await expect(create).toBeFocused();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('query-list.png'), fullPage: true });
    const deleteButton = page.getByRole('button', {
      name: 'Markenfilter löschen: Nike geändert',
      exact: true,
    });
    await deleteButton.click();
    const confirmation = page.getByRole('dialog', { name: 'Markenfilter löschen?', exact: true });
    await expect(confirmation).toContainText('Favoriten');
    await checkAxe(page);
    await confirmation.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(deleteButton).toBeFocused();
    expect(backend.calls.filter((call) => call.name === 'delete_sniper_query')).toHaveLength(0);
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await confirmation.getByRole('button', { name: 'Löschen', exact: true }).click();
    await expect(page.getByRole('table')).not.toContainText('Nike geändert');
    await expect(create).toBeFocused();
    expect(backend.calls.filter((call) => call.name === 'delete_sniper_query')).toHaveLength(1);
    await create.click();
    await trigger.click();
    await expect(picker.getByRole('option', { name: 'Nike', exact: true })).toBeVisible();
    await expect(picker.getByRole('option', { name: 'Patagonia', exact: true })).toHaveCount(0);
    await search.press('Tab');
    await expect(
      picker.getByRole('button', { name: 'Auswahl schließen', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(creator).toBeVisible();
    await creator.getByRole('button', { name: 'Dialog schließen', exact: true }).click();
    await openVintedBotSection(page, 'Botbetrieb');
    await expect(page.getByRole('heading', { name: 'Vinted-Zugriff', exact: true })).toBeVisible();
    await expect(page.getByText('Vinted verbunden', { exact: true })).toBeVisible();
    const sectionNavigation = page.getByRole('navigation', { name: 'Bereiche des Vinted Bots' });
    if (await sectionNavigation.isVisible()) {
      await expect(sectionNavigation.getByRole('link')).toHaveCount(2);
      await expect(sectionNavigation.getByRole('link', { name: /^Botbetrieb/ })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
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
    await expect(page).toHaveURL(/\/admin\/vinted-bot\/operation$/);
    backend.staleRuntime();
    await page.reload();
    await expect(page.getByText('Betriebsstand unbestätigt', { exact: true })).toBeVisible();
    expect(backend.calls.filter((call) => call.name === 'vinted_category_syncs')).toHaveLength(1);
    expect(
      backend.calls.some(
        (call) =>
          call.name === 'upsert_sniper_query' &&
          call.body['p_brand_id'] === 53 &&
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

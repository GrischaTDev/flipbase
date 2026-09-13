import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';

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
  await page.route('http://127.0.0.1:54351/**', async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1) ?? '';
    let json: unknown = [];
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Test Administration' };
    if (name === 'is_platform_operator') json = true;
    if (name === 'sniper_queries')
      json = Number(url.searchParams.get('offset') ?? 0) === 0 ? rows : [];
    if (name === 'sniper_query_listing_counts') json = [];
    if (name === 'sniper_runtime_status')
      json = {
        id: 1,
        reported_at: new Date(Date.now() - runtimeAge).toISOString(),
        requests_last_minute: 3,
        rejected_last_minute: 1,
        request_budget: 30,
        last_cycle_error: null,
      };
    if (name === 'vinted_categories')
      json =
        Number(url.searchParams.get('offset') ?? 0) === 0
          ? [
              { id: 1049, parent_id: 16, title: 'Stiefel', path: 'Damen > Schuhe > Stiefel' },
              { id: 1050, parent_id: 16, title: 'Sneaker', path: 'Damen > Schuhe > Sneaker' },
            ]
          : [];
    if (['upsert_sniper_query', 'set_sniper_query_active'].includes(name)) {
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
              notes: body['p_notes'],
              poll_interval_ms: body['p_poll_interval_ms'],
            },
          );
        else
          rows.push({
            id: `query-${rows.length + 1}`,
            query_key: 'test',
            marketplace: 'vinted',
            search_text: body['p_search_text'],
            catalog_id: body['p_catalog_id'],
            brand_id: body['p_brand_id'],
            price_from: body['p_price_from'],
            price_to: body['p_price_to'],
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
          });
        json = 'query-1';
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
            document.querySelector('app-sniper-queries, app-sniper-operation') as HTMLElement,
          )
        ).violations,
    ),
  ).toEqual([]);
}

// Die Unterseiten der Administration stehen nur noch in der Seitenleiste. Auf
// schmalen Bildschirmen liegt die hinter "Menü" - ein Klick auf den
// unsichtbaren Link wartete sonst bis zum Testabbruch.
async function openAdminPage(page: Page, name: string) {
  const menu = page.locator('app-bottom-nav').getByRole('button', { name: 'Menü', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('app-sidebar').getByRole('link', { name, exact: true }).click();
}

for (const theme of ['light', 'dark']) {
  test(`Sammelaufträge anlegen, Fehler beheben, aktivieren und pausieren ${theme} @pr-smoke`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: theme === 'dark' ? 390 : 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
    const backend = await mockAdministration(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/admin/queries');
    await expect(page.getByRole('heading', { name: 'Sammelaufträge', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Neuer Auftrag', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'Vinted-Suchlink übernehmen (optional)', exact: true }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Pausiert anlegen' }).click();
    await expect(page.getByRole('alert')).toContainText('Kategorie, Marke oder einen Suchbegriff');
    await page
      .getByRole('searchbox', { name: 'Kategorie suchen', exact: true })
      .fill('Damen Stiefel');
    const category = page.getByRole('combobox', { name: 'Kategorie', exact: true });
    await category.scrollIntoViewIfNeeded();
    // Das Scrollen des Ankers schliesst die Shared-Auswahl absichtlich.
    // Erst nach dem Layout-Takt oeffnen, wie bei einer menschlichen Eingabe.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await category.focus();
    await category.press('Enter');
    await page.getByRole('option', { name: 'Damen > Schuhe > Stiefel', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Vinted-Suchlink übernehmen (optional)', exact: true })
      .fill('https://www.vinted.de/catalog?catalog_ids[]=1049&brand_ids[]=53&price_to=50');
    await page.getByRole('button', { name: 'Filter übernehmen' }).click();
    await expect(page.getByRole('combobox', { name: 'Kategorie', exact: true })).toContainText(
      'Damen > Schuhe > Stiefel',
    );
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('query-editor.png'), fullPage: true });
    backend.failSave(true);
    await page.getByRole('button', { name: 'Pausiert anlegen' }).click();
    await expect(page.getByRole('alert')).toContainText('Speichern vorübergehend fehlgeschlagen');
    await expect(
      page.getByRole('spinbutton', { name: 'Vinted-Markenkennung', exact: true }),
    ).toHaveValue('53');
    backend.failSave(false);
    await page.getByRole('button', { name: 'Pausiert anlegen' }).click();
    await expect(page.getByRole('table')).toContainText('Pausiert');
    await page
      .getByRole('button', { name: 'Aktivieren: Damen > Schuhe > Stiefel', exact: true })
      .click();
    await expect(page.getByRole('table')).toContainText('Aktiv');
    await page
      .getByRole('button', { name: 'Pausieren: Damen > Schuhe > Stiefel', exact: true })
      .click();
    await expect(page.getByRole('table')).toContainText('Pausiert');
    await page
      .getByRole('button', {
        name: 'Takt und Notiz bearbeiten: Damen > Schuhe > Stiefel',
        exact: true,
      })
      .click();
    await expect(page.getByRole('combobox', { name: 'Kategorie', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: 'Kategorie', exact: true })).toContainText(
      'Damen > Schuhe > Stiefel',
    );
    await page.getByRole('textbox', { name: 'Notiz (optional)' }).fill('Gezielter Testbereich');
    page.once('dialog', (dialog) => dialog.dismiss());
    await openAdminPage(page, 'Botbetrieb');
    await expect(page).toHaveURL(/\/admin\/queries$/);
    await page.getByRole('button', { name: 'Änderungen speichern' }).click();
    await expect(page.getByRole('table')).toContainText('Gezielter Testbereich');
    await expect(page.getByRole('button', { name: 'Neuer Auftrag', exact: true })).toBeFocused();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('query-list.png'), fullPage: true });
    await openAdminPage(page, 'Botbetrieb');
    await expect(page.getByRole('heading', { name: 'Botbetrieb', exact: true })).toBeVisible();
    await expect(page.getByText('Aktuelle Betriebsmeldung', { exact: true })).toBeVisible();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('bot-operation.png'), fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    backend.staleRuntime();
    await page.reload();
    await expect(page.getByText('Betriebsstand unbestätigt', { exact: true })).toBeVisible();
    expect(
      backend.calls.some(
        (call) =>
          call.name === 'upsert_sniper_query' &&
          call.body['p_catalog_id'] === 1049 &&
          call.body['p_brand_id'] === 53,
      ),
    ).toBe(true);
    await page.goto('/admin/queries');
    await page.getByRole('button', { name: 'Neuer Auftrag', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Vinted-Suchlink übernehmen (optional)', exact: true })
      .fill('https://www.vinted.de/catalog?brand_ids[]=53');
    await page.getByRole('button', { name: 'Filter übernehmen' }).click();
    await expect(
      page.getByRole('textbox', {
        name: 'Suchbegriff (optional bei Kategorie oder Marke)',
        exact: true,
      }),
    ).toHaveValue('');
    await expect(
      page.getByRole('spinbutton', { name: 'Höchstpreis in EUR', exact: true }),
    ).toHaveValue('');
    await expect(
      page.getByText('Ohne Kategorie werden Artikel gesammelt.', { exact: false }),
    ).toBeVisible();
    await checkAxe(page);
    await page.screenshot({ path: testInfo.outputPath('brand-only-editor.png'), fullPage: true });
    await page.getByRole('button', { name: 'Pausiert anlegen' }).click();
    const brandRow = page.getByRole('row').filter({ hasText: 'Alle Kategorien' });
    await expect(brandRow).toContainText('Markenkennung 53');
    await expect(brandRow).toContainText('Pausiert');
    backend.staleRuntime();
    const savedBrand = backend.calls
      .filter((call) => call.name === 'upsert_sniper_query')
      .at(-1)?.body;
    expect(savedBrand).toMatchObject({
      p_catalog_id: null,
      p_brand_id: 53,
      p_search_text: '',
      p_price_from: null,
      p_price_to: null,
    });
    expect(errors).toEqual([]);
  });
}

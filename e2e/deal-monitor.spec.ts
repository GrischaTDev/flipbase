import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';

// Diese Datei mockt die gesamte Supabase-API und braucht keine echte Sitzung.
test.use({ storageState: { cookies: [], origins: [] } });

const workspace = '92000000-0000-4000-8000-000000000003';
const secondWorkspace = '92000000-0000-4000-8000-000000000004';
const makeItem = (i: number) => ({
  id: `92000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  title: `Nike Sneaker ${i}`,
  url: `https://www.vinted.de/items/${i}`,
  image_urls:
    i === 4
      ? []
      : i === 5
        ? ['https://images1.vinted.net/feed-fixture/broken.svg']
        : i === 6
          ? ['https://example.test/unsafe.svg']
          : Array.from(
              { length: i === 2 ? 1 : i === 3 ? 2 : 4 },
              (_, index) => `https://images1.vinted.net/feed-fixture/${i}-${index + 1}.svg`,
            ),
  item_price: 18 + i,
  total_price: 20 + i,
  currency: 'EUR',
  brand: 'Nike',
  size: '42',
  condition: 'Gut',
  is_hidden: false,
  first_seen_at: new Date(Date.now() - i * 1000).toISOString(),
  catalog_id: 1049,
  category_path: 'Herren > Schuhe > Sneaker',
});

type FavoriteFixtureStore = Map<string, Record<string, unknown> | null>;

async function fixture(
  page: Page,
  favoriteStore: FavoriteFixtureStore = new Map(),
  userId = '92000000-0000-4000-8000-000000000001',
  initialCount = 8,
  initialFeed = true,
) {
  // Lokale Bildantworten statt fremder Produktfotos: prüft Raster und Fehlerzustände.
  await page.route('https://images1.vinted.net/feed-fixture/**', async (route) => {
    if (route.request().url().endsWith('/broken.svg')) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    const index = Number(/-(\d+)\.svg$/.exec(route.request().url())?.[1] ?? 1);
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500"><rect width="400" height="500" fill="#e8e5df"/><g transform="translate(${index === 2 ? -40 : 0},${index === 3 ? -160 : 0}) scale(${index === 1 ? 1 : 1.4})"><path d="M100 230 165 210 210 255 300 290 330 335 315 370 85 370 65 345Z" fill="#444b50"/><path d="M70 340H326L315 370H85Z" fill="#fafafa"/><path d="m165 244 48 20m-34-6 48 20m-34-6 48 20" stroke="#ddd" stroke-width="6"/></g><text x="20" y="40" fill="#444" font-family="sans-serif" font-size="22">Testbild ${index}</text></svg>`,
    });
  });
  const user = {
    id: userId,
    email: 'feed@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
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
    },
    { user, token },
  );
  let items = Array.from({ length: initialCount }, (_, i) => makeItem(i + 1));
  const feedId = '92000000-0000-4000-8000-000000000090';
  const makeFeed = (id: string, targetWorkspace: string) => ({
    id,
    workspace_id: targetWorkspace,
    user_id: user.id,
    title: 'Nike live',
    brand: 'Nike',
    brand_id: 53,
    is_active: true,
    started_at: new Date(Date.now() - 120_000).toISOString(),
    created_at: new Date(Date.now() - 120_000).toISOString(),
    catalog_id: null,
    search_text: null,
    price_from: null,
    price_to: null,
    condition: null,
    legacy_brand_id: null,
    audience: null,
    sizes: [],
  });
  const watchlists: Record<string, unknown>[] = initialFeed ? [makeFeed(feedId, workspace)] : [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let failSave = false;
  let failFavorites = false;
  let announceFeedUpdate: (() => void) | undefined;
  await page.routeWebSocket(/127\.0\.0\.1:54351/, (socket) => {
    socket.onMessage((message) => {
      if (typeof message !== 'string') return;
      const [joinRef, ref, topic, event] = JSON.parse(message) as unknown[];
      if (['phx_join', 'phx_leave', 'heartbeat'].includes(String(event)))
        socket.send(
          JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]),
        );
      if (event === 'phx_join' && topic === `realtime:workspace:${workspace}:sniper_feed`)
        announceFeedUpdate = () =>
          socket.send(
            JSON.stringify([
              joinRef,
              null,
              topic,
              'broadcast',
              {
                type: 'broadcast',
                event: 'feed_updated',
                payload: { refresh: true },
              },
            ]),
          );
    });
  });
  await page.route('http://127.0.0.1:54351/**', async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1) ?? '';
    let json: unknown = [];
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Monitor Test' };
    if (name === 'is_platform_operator') json = false;
    if (name === 'list_my_workspace_access')
      json = [workspace, secondWorkspace].map((workspaceId) => ({
        workspace_id: workspaceId,
        access_status: 'active',
        ends_at: null,
        server_time: new Date().toISOString(),
      }));
    if (name === 'workspaces')
      json = [
        {
          id: workspace,
          name: 'Testbereich',
          currency: 'EUR',
          tax_mode: 'diff_25a',
          min_roi_percent: 35,
          min_profit_amount: 20,
          created_at: new Date().toISOString(),
        },
        {
          id: secondWorkspace,
          name: 'Zweitbereich',
          currency: 'EUR',
          tax_mode: 'diff_25a',
          min_roi_percent: 35,
          min_profit_amount: 20,
          created_at: new Date().toISOString(),
        },
      ];
    if (name === 'vinted_categories')
      json =
        Number(url.searchParams.get('offset') ?? 0) === 0
          ? [
              { id: 5, parent_id: null, title: 'Herren', path: 'Herren' },
              { id: 69, parent_id: 5, title: 'Schuhe', path: 'Herren > Schuhe' },
              {
                id: 1049,
                parent_id: 69,
                title: 'Sneaker',
                path: 'Herren > Schuhe > Sneaker',
                is_leaf: true,
              },
            ]
          : [];
    if (name === 'vinted_category_syncs')
      json = { refreshed_at: '2026-11-19T12:00:00Z', category_count: 3 };
    if (name === 'sniper_watchlists') {
      const firstWorkspace = url.searchParams.get('workspace_id') === `eq.${workspace}`;
      json = firstWorkspace && Number(url.searchParams.get('offset') ?? 0) === 0 ? watchlists : [];
    }
    if (name === 'sniper_feed_import_brand') {
      const body = route.request().postDataJSON();
      json = body.p_brand_id === 53 ? 'Nike' : null;
    }
    if (name === 'vinted-brand-search')
      json = {
        brands: [
          { id: 53, name: 'Nike' },
          { id: 88, name: 'Ralph Lauren' },
        ],
      };
    if (name === 'vinted_listing_sizes')
      json = [
        { id: 13, title: 'S' },
        { id: 14, title: 'M' },
      ];
    if (name === 'vinted_listing_options') json = { title: 'Neu, mit Etikett' };
    if (name === 'sniper_feed_search') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      const feed = watchlists.find((entry) => entry['id'] === body['p_watchlist_id']);
      json = {
        items: (feed?.['started_at'] ? items : [])
          .filter(
            (item) =>
              (!body['p_after_time'] ||
                Date.parse(item.first_seen_at) >= Date.parse(String(body['p_after_time']))) &&
              String(body['p_title_query'] ?? '')
                .toLowerCase()
                .split(/\s+/u)
                .every((word) => item.title.toLowerCase().includes(word)),
          )
          .slice(0, Number(body['p_limit'] ?? 100)),
        covered: true,
        reported_at: new Date().toISOString(),
      };
    }
    if (
      [
        'sniper_favorites_page',
        'save_sniper_favorite',
        'remove_sniper_favorite',
        'clear_sniper_favorites',
        'import_sniper_favorites',
      ].includes(name)
    ) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      const scope = `${user.id}:${body['p_workspace_id']}:`;
      const key = (item: Record<string, unknown>) =>
        scope + /\/items\/(\d+)/u.exec(String(item['url']))?.[1];
      if (
        body['p_expected_user_id'] !== user.id ||
        (failFavorites && name !== 'sniper_favorites_page')
      ) {
        await route.fulfill({ status: 400, json: { message: 'Speichern fehlgeschlagen' } });
        return;
      }
      if (name === 'sniper_favorites_page')
        json = {
          items: [...favoriteStore.entries()]
            .filter(([id, item]) => id.startsWith(scope) && item !== null)
            .map(([, item]) => item),
          next_cursor: null,
        };
      if (name === 'save_sniper_favorite') {
        const item = body['p_item'] as Record<string, unknown>;
        if (!favoriteStore.get(key(item))) favoriteStore.set(key(item), item);
        json = true;
      }
      if (name === 'remove_sniper_favorite') {
        favoriteStore.set(scope + body['p_external_id'], null);
        json = true;
      }
      if (name === 'clear_sniper_favorites') {
        for (const id of favoriteStore.keys())
          if (id.startsWith(scope)) favoriteStore.set(id, null);
        json = true;
      }
      if (name === 'import_sniper_favorites') {
        const rows = body['p_items'] as Record<string, unknown>[];
        for (const item of rows)
          if (!favoriteStore.has(key(item))) favoriteStore.set(key(item), item);
        json = rows.length;
      }
    }
    if (name === 'save_sniper_watchlist') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      if (failSave) {
        await route.fulfill({ status: 400, json: { message: 'Speichern fehlgeschlagen' } });
        return;
      }
      const id = String(body['p_id'] ?? feedId);
      const existing = watchlists.findIndex((entry) => entry['id'] === id);
      const row = {
        ...makeFeed(id, String(body['p_workspace_id'])),
        ...(existing < 0 ? { is_active: false, started_at: null } : watchlists[existing]),
        id,
        workspace_id: body['p_workspace_id'],
        title: body['p_title'],
        catalog_id: body['p_catalog_id'],
        brand: body['p_brand'],
        brand_id: body['p_brand_id'],
        search_text: body['p_search_text'],
        price_from: body['p_price_from'],
        price_to: body['p_price_to'],
        condition: body['p_condition'],
        legacy_brand_id: null,
        audience: body['p_audience'],
        sizes: body['p_sizes'],
      };
      if (existing >= 0) watchlists[existing] = row;
      else watchlists.push(row);
      json = row.id;
    }
    if (name === 'set_sniper_watchlist_active') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      const row = watchlists.find((entry) => entry['id'] === body['p_id']);
      if (row) {
        row['is_active'] = body['p_active'];
        if (body['p_active']) row['started_at'] = new Date().toISOString();
      }
      json = null;
    }
    if (name === 'delete_sniper_watchlist') {
      watchlists.splice(0);
      json = null;
    }
    await route.fulfill({ json });
  });
  return {
    calls,
    feedId,
    feedConnected: () => !!announceFeedUpdate,
    announceFeedUpdate: () => announceFeedUpdate?.(),
    addRecent: (id: number) => {
      items = [{ ...makeItem(id), first_seen_at: new Date().toISOString() }, ...items];
    },
    clearFeed: () => {
      items = [];
    },
    failFavorites: (value: boolean) => {
      failFavorites = value;
    },
    failSave: (value: boolean) => {
      failSave = value;
    },
  };
}

async function checkAxe(page: Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations,
  );
  expect(violations).toEqual([]);
}

test('ergänzt einen Live-Fund mit zwei statt 100 Karten im Abruf @pr-smoke', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const mock = await fixture(page, new Map(), undefined, 100);
  const snapshot = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/sniper_feed_search') &&
      !response.request().postDataJSON()['p_after_time'],
  );
  await page.goto('/vinted-bot');
  await snapshot;
  await expect(page.getByRole('article', { name: 'Nike Sneaker 1', exact: true })).toBeVisible();
  await expect.poll(mock.feedConnected).toBe(true);
  await expect
    .poll(
      () =>
        mock.calls.filter(
          ({ name, body }) => name === 'sniper_feed_search' && !body['p_after_time'],
        ).length,
    )
    .toBeGreaterThanOrEqual(2);

  const arrival = 9831702863;
  mock.addRecent(arrival);
  const delta = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/sniper_feed_search') &&
      !!response.request().postDataJSON()['p_after_time'],
  );
  mock.announceFeedUpdate();
  const update = await (await delta).json();
  expect(update.items.map(({ url }: { url: string }) => url)).toEqual([
    `https://www.vinted.de/items/${arrival}`,
    'https://www.vinted.de/items/1',
  ]);
  await expect(
    page.getByRole('article', { name: `Nike Sneaker ${arrival}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article', { name: 'Nike Sneaker 2', exact: true })).toBeVisible();
  const fullResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/sniper_feed_search') &&
      !response.request().postDataJSON()['p_after_time'],
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const full = await (await fullResponse).json();
  expect(full.items).toHaveLength(100);
  expect(full.items.slice(0, update.items.length)).toEqual(update.items);
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test.describe('Persönlicher Vinted-Feed', () => {
      test.use({ hasTouch: width < 1000, isMobile: width < 1000 });
      test(
        'speichert und schaltet den eigenen Feed samt Linkimport ' +
          theme +
          ' ' +
          width +
          ' @pr-smoke',
        async ({ page }) => {
          await page.setViewportSize({ width, height: 1000 });
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
          await page.addInitScript((color) => localStorage.setItem('flipbase_theme', color), theme);
          const mock = await fixture(page, new Map(), undefined, 8, false);
          await page.goto('/deal-monitor');
          await expect(page).toHaveURL(/\/vinted-bot$/);
          await expect(page.getByRole('heading', { name: 'Noch keine Feeds' })).toBeVisible();
          expect(mock.calls.filter(({ name }) => name === 'sniper_feed_search')).toHaveLength(0);

          await page.getByRole('button', { name: 'Neuer Feed', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Neuer Feed', exact: true });
          const save = dialog.getByRole('button', { name: 'Feed speichern', exact: true });
          await expect(save).toBeHidden();
          await dialog.getByRole('textbox', { name: 'Name des Feeds' }).fill('Meine Nike-Suche');
          await dialog
            .getByRole('textbox', { name: 'Vinted-Suchlink' })
            .fill('https://www.vinted.de/catalog?brand_ids[]=53&price_to=40');
          await dialog.getByRole('button', { name: 'Link übernehmen' }).click();
          await expect(dialog.getByText(/übernommen/i)).toBeVisible();

          mock.failSave(true);
          await save.click();
          await expect(dialog.getByRole('alert')).toBeVisible();
          mock.failSave(false);
          await save.click();
          await expect(dialog).toHaveCount(0);
          await expect(
            page.getByRole('heading', { name: 'Feed gestoppt', exact: true }),
          ).toBeVisible();
          expect(
            mock.calls.filter(({ name }) => name === 'save_sniper_watchlist').at(-1)?.body,
          ).toMatchObject({
            p_brand_id: 53,
            p_price_to: 40,
          });
          expect(mock.calls.filter(({ name }) => name === 'sniper_feed_search')).toHaveLength(0);

          await page.getByRole('button', { name: 'Feed starten', exact: true }).click();
          const items = page.getByRole('region', { name: 'Artikel im Vinted Feed', exact: true });
          const card = items.getByRole('article', { name: 'Nike Sneaker 1', exact: true });
          await expect(card).toBeVisible();
          await expect(card.getByRole('img')).toHaveCount(1);
          await expect(items.getByRole('article')).toHaveCount(8);
          expect(
            mock.calls.filter(({ name }) => name === 'sniper_feed_search').at(-1)?.body,
          ).toMatchObject({
            p_workspace_id: workspace,
            p_watchlist_id: mock.feedId,
          });
          const preview = card.getByRole('button', { name: /in Großansicht öffnen/ });
          await preview.click();
          await expect(
            page.getByRole('dialog').getByRole('img', { name: 'Großansicht: Nike Sneaker 1' }),
          ).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(preview).toBeFocused();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await checkAxe(page);

          await page.getByRole('button', { name: 'Feed stoppen', exact: true }).click();
          await expect(
            page.getByRole('heading', { name: 'Feed gestoppt', exact: true }),
          ).toBeVisible();
          await expect(items).toHaveCount(0);
          expect(
            mock.calls
              .filter(({ name }) => name === 'set_sniper_watchlist_active')
              .map(({ body }) => body['p_active']),
          ).toEqual([true, false]);

          await page.getByRole('button', { name: 'Feed bearbeiten', exact: true }).click();
          const edit = page.getByRole('dialog', { name: 'Feed bearbeiten', exact: true });
          await expect(edit.getByRole('button', { name: 'Feed speichern' })).toBeHidden();
          await edit.getByRole('textbox', { name: 'Name des Feeds' }).fill('Umbenannt');
          await edit.getByRole('button', { name: 'Abbrechen', exact: true }).click();
          await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
          await expect(edit).toHaveCount(0);
          await expect(page.getByRole('combobox', { name: 'Feed', exact: true })).toContainText(
            'Meine Nike-Suche',
          );

          await page.getByRole('button', { name: 'Feed löschen', exact: true }).click();
          await page
            .getByRole('dialog', { name: 'Feed löschen?' })
            .getByRole('button', { name: 'Feed löschen', exact: true })
            .click();
          await expect(page.getByRole('heading', { name: 'Noch keine Feeds' })).toBeVisible();
        },
      );
    });
  }
}

test('Account-Favoriten bleiben auf Tablet und Desktop nach Feed-Bereinigung erhalten @core-smoke', async ({
  page,
  browser,
}, testInfo) => {
  const store: FavoriteFixtureStore = new Map();
  const desktop = await fixture(page, store);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/vinted-bot');
  await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
  const card = page.getByRole('article', { name: 'Nike Sneaker 2', exact: true });
  await expect(card).toBeVisible();
  const favorite = card.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true });
  desktop.failFavorites(true);
  await favorite.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Änderung konnte nicht gespeichert' }),
  ).toBeVisible();
  await expect(favorite).toHaveAttribute('aria-pressed', 'false');
  desktop.failFavorites(false);
  await favorite.click();
  await expect(
    card.getByRole('button', { name: 'Aus Favoriten entfernen', exact: true }),
  ).toBeVisible();
  desktop.clearFeed();
  const tabletContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1024, height: 900 },
    storageState: { cookies: [], origins: [] },
  });
  const tablet = await tabletContext.newPage();
  try {
    const tabletBackend = await fixture(tablet, store);
    tabletBackend.clearFeed();
    await tablet.goto('/vinted-bot/favorites');
    await tablet.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(
      tablet.getByRole('article', { name: 'Nike Sneaker 2', exact: true }),
    ).toBeVisible();
    await checkAxe(tablet);
    await tablet.screenshot({
      path: testInfo.outputPath('account-favorites-tablet.png'),
      fullPage: true,
    });
    await page.goto('/vinted-bot/favorites');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByRole('article')).toHaveCount(1);
    await tablet.getByRole('button', { name: 'Aus Favoriten entfernen', exact: true }).click();
    await expect(tablet.getByRole('article')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('article')).toHaveCount(0);
    // Ein alter Browserimport darf den auf dem Tablet entfernten Favoriten nicht wiederherstellen.
    await page.evaluate(
      ({ workspace, item }) =>
        localStorage.setItem('flipbase_vinted_favorites_' + workspace, JSON.stringify([item])),
      { workspace, item: makeItem(2) },
    );
    await page.reload();
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    const legacy = page.getByRole('button', {
      name: 'Lokale Favoriten in meinen Account übernehmen',
      exact: true,
    });
    await expect(legacy).toBeEnabled();
    await legacy.click();
    await expect(legacy).not.toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  } finally {
    await tabletContext.close();
  }
});

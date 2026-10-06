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
  reference_price: i === 1 ? 60 : null,
  reference_scope: i === 1 ? 'category_brand_condition' : null,
  discount_percent: i === 1 ? 68.33 : null,
  watchlist_title: i === 1 ? 'Meine Sneaker' : null,
});

type FavoriteFixtureStore = Map<string, Record<string, unknown> | null>;
async function fixture(
  page: Page,
  favoriteStore: FavoriteFixtureStore = new Map(),
  userId = '92000000-0000-4000-8000-000000000001',
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
  let items = Array.from({ length: 8 }, (_, i) => makeItem(i + 1));
  const watchlists: Record<string, unknown>[] = [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let failSave = false;
  let failFavorites = false;
  let covered = true;
  let watchlistGate: Promise<void> | null = null;
  let releaseWatchlists: (() => void) | undefined;
  let waitingForWatchlists = false;
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
          ? [{ id: 1049, path: 'Herren > Schuhe > Sneaker' }]
          : [];
    if (name === 'sniper_watchlists') {
      const firstWorkspace = url.searchParams.get('workspace_id') === `eq.${workspace}`;
      if (firstWorkspace && watchlistGate) {
        waitingForWatchlists = true;
        await watchlistGate;
      }
      json = firstWorkspace && Number(url.searchParams.get('offset') ?? 0) === 0 ? watchlists : [];
    }
    if (name === 'sniper_supported_brands') json = [{ brand: 'Nike' }];
    if (name === 'sniper_feed_search') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      json = {
        items: (body['p_workspace_id'] === secondWorkspace ? [makeItem(700)] : items).filter(
          (item) =>
            String(body['p_title_query'] ?? '')
              .toLowerCase()
              .split(/\s+/u)
              .every((word) => item.title.toLowerCase().includes(word)),
        ),
        covered,
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
      const row = {
        id: body['p_id'] ?? '92000000-0000-4000-8000-000000000090',
        workspace_id: body['p_workspace_id'],
        title: body['p_title'],
        catalog_id: body['p_catalog_id'],
        brand: body['p_brand'],
        search_text: body['p_search_text'],
        price_from: body['p_price_from'],
        price_to: body['p_price_to'],
        condition: body['p_condition'],
        discount_threshold_percent: body['p_discount_threshold_percent'],
        is_active: body['p_is_active'],
        legacy_brand_id: null,
      };
      if (watchlists.length) watchlists[0] = row;
      else watchlists.push(row);
      json = row.id;
    }
    if (name === 'delete_sniper_watchlist') {
      watchlists.splice(0);
      json = null;
    }
    await route.fulfill({ json });
  });
  return {
    calls,
    clearFeed: () => {
      items = [];
    },
    failFavorites: (value: boolean) => {
      failFavorites = value;
    },
    add: (...ids: number[]) => {
      items = [...(ids.length ? ids : [99]).map(makeItem), ...items];
    },
    failSave: (value: boolean) => {
      failSave = value;
    },
    uncovered: () => {
      covered = false;
    },
    holdWatchlists: () => {
      watchlistGate = new Promise<void>((resolve) => {
        releaseWatchlists = resolve;
      });
    },
    waitingForWatchlists: () => waitingForWatchlists,
    releaseWatchlists: () => {
      watchlistGate = null;
      releaseWatchlists?.();
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

for (const theme of ['light', 'dark'] as const) {
  test(`Vinted Bot Feed und Suchfilter verwalten ${theme} @pr-smoke`, async ({ page }) => {
    await page.setViewportSize(
      theme === 'light' ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
    );
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const mock = await fixture(page);
    // Ueber die fruehere Adresse, damit auch die Weiterleitung abgedeckt ist.
    await page.goto('/deal-monitor');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page).toHaveURL(/\/vinted-bot$/);
    await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(8);
    const finds = page.getByRole('region', { name: 'Artikel im Vinted Feed', exact: true });
    await expect(finds.getByRole('article')).toHaveCount(8);
    await expect(page.getByText('Weitere Funde', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Prüft alle 2 Sekunden auf neue Funde', { exact: false }),
    ).toHaveCount(0);
    await expect(page.getByText('Botmeldung', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zulauf pausieren', exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Neuer Suchfilter', exact: true })).toHaveCount(
      0,
    );
    const firstCard = page.getByRole('article', { name: 'Nike Sneaker 1', exact: true });
    await expect(firstCard.getByRole('img')).toHaveCount(1);
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 2', exact: true }).getByRole('img'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 3', exact: true }).getByRole('img'),
    ).toHaveCount(1);
    for (const id of [4, 5, 6]) {
      const card = page.getByRole('article', { name: `Nike Sneaker ${id}`, exact: true });
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('Kein Artikelbild', { exact: true })).toBeVisible();
      await expect(card.getByRole('img')).toHaveCount(0);
    }
    await firstCard.scrollIntoViewIfNeeded();
    const photos = firstCard.getByRole('img');
    await expect
      .poll(() =>
        photos.evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
      )
      .toBe(true);
    const boxes = await photos.evaluateAll((images) =>
      images.map((image) => {
        const { x, y, width, height } = image.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(boxes[0].height / boxes[0].width).toBeCloseTo(4 / 3, 2);
    if (theme === 'light') {
      const allCards = await finds.getByRole('article').evaluateAll((articles) =>
        articles.map((article) => {
          const { x, y, width, height } = article.getBoundingClientRect();
          return { x, y, width, height };
        }),
      );
      expect(allCards[0].x).toBeLessThan(allCards[1].x);
      expect(allCards[1].x).toBeLessThan(allCards[2].x);
      expect(allCards[0].y).toBeCloseTo(allCards[1].y, 0);
      expect(allCards[1].y).toBeCloseTo(allCards[2].y, 0);
      expect(allCards[0].width).toBeCloseTo(allCards[4].width, 0);
      expect(allCards[4].y).toBeCloseTo(allCards[0].y, 0);
      expect(allCards[5].y).toBeGreaterThan(allCards[0].y);
    }
    const viewItem = firstCard.getByRole('link', {
      name: 'Nike Sneaker 1 – auf Vinted ansehen (neuer Tab)',
      exact: true,
    });
    await expect(viewItem).toHaveAttribute('href', 'https://www.vinted.de/items/1');
    await expect(viewItem).toHaveAttribute('target', '_blank');
    await expect(viewItem).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(firstCard.locator('dt').filter({ hasText: 'Marke:' })).toHaveCount(1);
    await page.context().route('https://www.vinted.de/items/1', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>Vinted Testziel</title><p>Artikel 1</p>',
      }),
    );
    const opened = page.waitForEvent('popup');
    await viewItem.click();
    const itemTab = await opened;
    await expect(itemTab).toHaveURL('https://www.vinted.de/items/1');
    await itemTab.close();
    await page.bringToFront();
    await expect(page).toHaveURL(/\/vinted-bot$/);
    await expect(firstCard).toBeVisible();
    await checkAxe(page);
    await firstCard.evaluate((card) => card.scrollIntoView({ block: 'center' }));
    await firstCard.screenshot({ path: `test-results/deal-card-${theme}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/deal-monitor-${theme}.png`, fullPage: true });

    await page.goto('/vinted-bot/filters');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Suchfilter', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Neuer Suchfilter', exact: true }).click();
    await expect(page.getByLabel('Name des Suchfilters')).toBeFocused();
    await page.getByLabel('Name des Suchfilters').fill('Meine Sneaker');
    await page.getByLabel('Marke', { exact: true }).fill('Nike');
    await checkAxe(page);
    mock.failSave(true);
    await page.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Suchfilter konnte nicht gespeichert' }),
    ).toBeVisible();
    await expect(page.getByLabel('Name des Suchfilters')).toHaveValue('Meine Sneaker');
    mock.failSave(false);
    await page.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect(
      page.getByRole('form', { name: 'Suchfilter bearbeiten', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Meine Sneaker', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausieren', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aktivieren', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Suchfilter bearbeiten', exact: true }).click();
    await page.getByLabel('Name des Suchfilters').fill('Ungespeichert');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Änderungen verwerfen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
    await page.getByRole('button', { name: 'Suchfilter löschen', exact: true }).click();
    await checkAxe(page);
    await page
      .getByRole('dialog', { name: 'Suchfilter löschen?', exact: true })
      .getByRole('button', { name: 'Suchfilter löschen', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Noch keine Suchfilter angelegt', exact: true }),
    ).toBeVisible();
    expect(
      mock.calls
        .filter((call) => call.name === 'save_sniper_watchlist')
        .every((call) => call.body['p_workspace_id'] === workspace),
    ).toBe(true);
    mock.uncovered();
    await page.goto('/vinted-bot');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(
      page.getByText('Für diesen Bereich sammelt der Monitor noch nicht.', { exact: false }),
    ).toBeVisible();
    // Der bestehende Workspace-Schutz sperrt den Wechsel auf der
    // Erfassungsseite; nach dem Speichern geht es zurück zum Feed.
    await page.goto('/vinted-bot/filters');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: 'Neuer Suchfilter', exact: true }).click();
    await page.getByLabel('Name des Suchfilters').fill('Verzögert gespeichert');
    mock.holdWatchlists();
    await page.getByRole('button', { name: 'Suchfilter speichern', exact: true }).click();
    await expect.poll(mock.waitingForWatchlists).toBe(true);
    const workspaceSwitch = page.locator('[aria-controls="header-workspace-menu"]');
    await expect(workspaceSwitch).toBeDisabled();
    mock.releaseWatchlists();
    await expect(
      page.getByRole('form', { name: 'Suchfilter bearbeiten', exact: true }),
    ).toHaveCount(0);
    await page.goto('/vinted-bot');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
    await expect(workspaceSwitch).toBeEnabled();
    await workspaceSwitch.click();
    await page.getByRole('button', { name: 'Zweitbereich', exact: true }).click();
    await page.goto('/vinted-bot');
    await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 700', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 700', exact: true }),
    ).toBeVisible();
    expect(
      mock.calls.filter((call) => call.name === 'sniper_feed_search').at(-1)?.body[
        'p_workspace_id'
      ],
    ).toBe(secondWorkspace);
    expect(runtimeErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    test.describe(`Kartenansicht ${theme} ${viewport.width}px`, () => {
      test.use({ hasTouch: viewport.width === 390, isMobile: viewport.width === 390 });
      test(`Feed-Kompaktmodus ${theme} ${viewport.width}px @pr-smoke`, async ({
        page,
      }, testInfo) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        const runtimeErrors: string[] = [];
        const consoleIssues: string[] = [];
        page.on('pageerror', (error) => runtimeErrors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning')
            consoleIssues.push(message.text());
        });
        const mock = await fixture(page);
        await page.goto('/vinted-bot');
        await page.locator('app-page-header').waitFor({ state: 'visible', timeout: 30_000 });
        await expect(page).toHaveURL(/\/vinted-bot$/);
        await expect(page).toHaveTitle(/Flipbase/);
        await expect(page.getByRole('heading', { name: 'Vinted Feed', exact: true })).toBeVisible();
        await expect(page.getByRole('article')).toHaveCount(8);
        const pageHeader = page.locator('app-page-header');
        const filters = page.locator('[data-feed-filters]');
        const headerBefore = await pageHeader.innerHTML();
        // Das Zahlenfeld hinterlässt beim Blur ein leeres style-Attribut.
        // Dieser harmlose Browserzustand ist keine Änderung der Filterleiste.
        const filterMarkup = async () => (await filters.innerHTML()).replaceAll(' style=""', '');
        const filtersBefore = await filterMarkup();
        const firstCard = page.getByRole('article', { name: 'Nike Sneaker 1', exact: true });
        const preview = firstCard.getByRole('button', {
          name: 'Nike Sneaker 1 in Großansicht öffnen',
          exact: true,
        });
        const toggle = page.getByRole('button', { name: 'Kompakt', exact: true });
        const viewItem = firstCard.getByRole('link', {
          name: 'Nike Sneaker 1 – auf Vinted ansehen (neuer Tab)',
          exact: true,
        });
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(firstCard.getByRole('heading', { name: 'Nike Sneaker 1' })).toBeVisible();
        await expect(firstCard.locator('dl app-badge')).toHaveCount(4);
        await expect(firstCard.getByRole('img')).toHaveCount(1);
        await expect
          .poll(() =>
            firstCard.getByRole('img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        const normalPhoto = await preview.boundingBox();
        expect(normalPhoto!.height / normalPhoto!.width).toBeCloseTo(4 / 3, 2);
        await checkAxe(page);
        await page
          .getByRole('region', { name: 'Artikel im Vinted Feed' })
          .screenshot({ path: testInfo.outputPath('feed-standard.png') });

        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        await expect(toggle).toBeFocused();
        await expect(firstCard.locator('h3, dl, time')).toHaveCount(0);
        await expect(firstCard.getByRole('button', { name: 'Artikel teilen' })).toHaveCount(0);
        await expect(firstCard.locator('app-button')).toHaveCount(2);
        await expect(viewItem).toHaveText('');
        await expect(viewItem).toHaveAttribute('href', 'https://www.vinted.de/items/1');
        await expect(viewItem).toHaveAttribute('target', '_blank');
        await expect(viewItem).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(firstCard.getByText('19,00', { exact: false })).toBeVisible();
        const compactPhoto = await preview.boundingBox();
        expect(compactPhoto!.height).toBeGreaterThan(normalPhoto!.height);
        expect(compactPhoto!.height / compactPhoto!.width).toBeCloseTo(5 / 3, 2);
        const favorite = firstCard.getByRole('button', { name: 'Zu Favoriten hinzufügen' });
        await favorite.click();
        const savedFavorite = firstCard.getByRole('button', { name: 'Aus Favoriten entfernen' });
        await expect(savedFavorite).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        const favoriteBox = await savedFavorite.boundingBox();
        const linkBox = await viewItem.boundingBox();
        const currentPhoto = await preview.boundingBox();
        expect(linkBox!.width).toBeCloseTo(favoriteBox!.width, 0);
        expect(linkBox!.height).toBeCloseTo(favoriteBox!.height, 0);
        expect(linkBox!.x + linkBox!.width).toBeLessThan(favoriteBox!.x);
        expect(favoriteBox!.y + favoriteBox!.height).toBeGreaterThan(
          currentPhoto!.y + currentPhoto!.height - 20,
        );
        expect(await pageHeader.innerHTML()).toBe(headerBefore);
        expect(await filterMarkup()).toBe(filtersBefore);
        await checkAxe(page);
        await page
          .getByRole('region', { name: 'Artikel im Vinted Feed' })
          .screenshot({ path: testInfo.outputPath('feed-compact.png') });
        if (viewport.width === 390) {
          const touchState = await savedFavorite.evaluate((button) => ({
            coarse: matchMedia('(pointer: coarse)').matches,
            minWidth: getComputedStyle(button).minWidth,
            spacing: getComputedStyle(button).getPropertyValue('--spacing'),
            classes: button.className,
          }));
          expect(favoriteBox!.width, JSON.stringify(touchState)).toBeGreaterThanOrEqual(44);
          expect(linkBox!.width).toBeGreaterThanOrEqual(44);
        }
        await page.context().route('https://www.vinted.de/items/1', (route) =>
          route.fulfill({
            contentType: 'text/html',
            body: '<title>Vinted Testziel</title><p>Artikel 1</p>',
          }),
        );
        const opened = page.waitForEvent('popup');
        await viewItem.click();
        const itemTab = await opened;
        await expect(itemTab).toHaveURL('https://www.vinted.de/items/1');
        await itemTab.close();
        await preview.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(
          page.getByRole('dialog').getByRole('img', { name: 'Großansicht: Nike Sneaker 1' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(preview).toBeFocused();
        await savedFavorite.click();
        await expect(favorite).toHaveAttribute('aria-pressed', 'false');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect(firstCard.getByRole('heading', { name: 'Nike Sneaker 1' })).toBeVisible();
        expect(await pageHeader.innerHTML()).toBe(headerBefore);
        expect(await filterMarkup()).toBe(filtersBefore);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        expect(runtimeErrors).toEqual([]);
        await testInfo.attach('console-issues', {
          body: consoleIssues.join('\n') || 'Keine Warnungen oder Fehler.',
          contentType: 'text/plain',
        });
        expect(
          mock.calls
            .filter((call) => call.name === 'sniper_feed_search')
            .every((call) => call.body['p_workspace_id'] === workspace),
        ).toBe(true);
      });
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
  const search = page.getByRole('searchbox', { name: 'Artikel im Titel durchsuchen', exact: true });
  await search.fill('Sneaker 2');
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(
    desktop.calls.filter((call) => call.name === 'sniper_feed_search').at(-1)?.body[
      'p_title_query'
    ],
  ).toBe('Sneaker 2');
  desktop.failFavorites(true);
  await page.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Änderung konnte nicht gespeichert' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  desktop.failFavorites(false);
  await page.getByRole('button', { name: 'Zu Favoriten hinzufügen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Aus Favoriten entfernen', exact: true }),
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

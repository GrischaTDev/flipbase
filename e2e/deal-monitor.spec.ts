import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';

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

async function fixture(page: Page) {
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
    id: '92000000-0000-4000-8000-000000000001',
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
  let covered = true;
  let watchlistGate: Promise<void> | null = null;
  let releaseWatchlists: (() => void) | undefined;
  let waitingForWatchlists = false;
  await page.route('http://127.0.0.1:54351/**', async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1) ?? '';
    let json: unknown = [];
    if (name === 'user') json = user;
    if (name === 'profiles') json = { id: user.id, full_name: 'Monitor Test' };
    if (name === 'is_platform_operator') json = false;
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
    if (name === 'sniper_feed') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ name, body });
      json = {
        items:
          body['p_workspace_id'] === secondWorkspace
            ? [makeItem(700)]
            : body['p_deals_only']
              ? items.filter((item) => item.reference_price)
              : items,
        covered,
        reported_at: new Date().toISOString(),
      };
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
  test(`Deal-Monitor pausieren und Merkzettel verwalten ${theme} @pr-smoke`, async ({ page }) => {
    await page.setViewportSize(
      theme === 'light' ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
    );
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const mock = await fixture(page);
    await page.goto('/deal-monitor');
    await expect(page.getByRole('heading', { name: 'Deal-Monitor', exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(8);
    await expect(page.getByLabel('Die neuesten Funde').getByRole('article')).toHaveCount(3);
    const firstCard = page.getByRole('article', { name: 'Nike Sneaker 1', exact: true });
    await expect(firstCard.getByRole('img')).toHaveCount(3);
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 2', exact: true }).getByRole('img'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 3', exact: true }).getByRole('img'),
    ).toHaveCount(2);
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
    expect(boxes[0].x + boxes[0].width).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeCloseTo(boxes[2].x, 0);
    expect(boxes[1].y + boxes[1].height).toBeLessThan(boxes[2].y);
    expect(boxes[0].height).toBeCloseTo(boxes[1].height + boxes[2].height + 4, 0);
    const viewItem = firstCard.getByRole('link', {
      name: 'Nike Sneaker 1 – auf Vinted ansehen (neuer Tab)',
      exact: true,
    });
    await expect(viewItem).toHaveAttribute('href', 'https://www.vinted.de/items/1');
    await expect(viewItem).toHaveAttribute('target', '_blank');
    await expect(viewItem).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(firstCard.getByText('Marke', { exact: true })).toHaveCount(1);
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
    await expect(page).toHaveURL(/\/deal-monitor$/);
    await page.getByRole('button', { name: 'Zulauf fortsetzen', exact: true }).click();
    await expect(firstCard).toBeVisible();
    await checkAxe(page);
    await firstCard.evaluate((card) => card.scrollIntoView({ block: 'center' }));
    await firstCard.screenshot({ path: `test-results/deal-card-${theme}.png` });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/deal-monitor-${theme}.png`, fullPage: true });

    // Bereits bekannte Funde nicht durch eine künstliche Ausgabewarteschlange verzögern.
    mock.add(101, 102, 103);
    await expect(page.getByRole('article')).toHaveCount(11, { timeout: 5_000 });
    await expect(page.getByLabel('Die neuesten Funde').getByRole('article')).toHaveCount(3);
    await page.getByRole('button', { name: 'Zulauf pausieren', exact: true }).click();
    mock.add();
    await expect(page.getByText('1 neue Artikel warten.')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('article')).toHaveCount(11);
    await page.getByRole('button', { name: 'Neueste Artikel anzeigen' }).click();
    await expect(page.getByRole('article')).toHaveCount(12);

    await page.getByRole('button', { name: 'Neuer Merkzettel', exact: true }).click();
    await expect(page.getByLabel('Name des Merkzettels')).toBeFocused();
    await page.getByLabel('Name des Merkzettels').fill('Meine Sneaker');
    await page.getByLabel('Marke (optional)', { exact: true }).fill('Nike');
    await checkAxe(page);
    mock.failSave(true);
    await page.getByRole('button', { name: 'Merkzettel speichern', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Merkzettel konnte nicht gespeichert' }),
    ).toBeVisible();
    await expect(page.getByLabel('Name des Merkzettels')).toHaveValue('Meine Sneaker');
    mock.failSave(false);
    await page.getByRole('button', { name: 'Merkzettel speichern', exact: true }).click();
    await expect(page.getByLabel('Merkzettel bearbeiten')).toHaveCount(0);
    await page.getByRole('button', { name: 'Merkzettel · 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Meine Sneaker', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pausieren', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Aktivieren', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByLabel('Name des Merkzettels').fill('Ungespeichert');
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Änderungen verwerfen?' })).toBeVisible();
    await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
    await page.getByRole('button', { name: 'Löschen', exact: true }).click();
    await checkAxe(page);
    await page.getByRole('button', { name: 'Merkzettel löschen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Merkzettel · 0', exact: true })).toBeVisible();
    expect(
      mock.calls
        .filter((call) => call.name === 'save_sniper_watchlist')
        .every((call) => call.body['p_workspace_id'] === workspace),
    ).toBe(true);
    await page.getByRole('button', { name: 'Deals', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    mock.uncovered();
    await page.getByRole('button', { name: 'Artikel', exact: true }).click();
    await expect(
      page.getByText('Für diesen Bereich sammelt der Monitor noch nicht.', { exact: false }),
    ).toBeVisible();
    // Der Speichervorgang darf nach einem Arbeitsbereichswechsel keinen alten
    // Feed wiederherstellen, auch wenn erst sein nachgeladener Merkzettel kommt.
    await page.getByRole('button', { name: 'Neuer Merkzettel', exact: true }).click();
    await page.getByLabel('Name des Merkzettels').fill('Verzögert gespeichert');
    mock.holdWatchlists();
    await page.getByRole('button', { name: 'Merkzettel speichern', exact: true }).click();
    await expect.poll(mock.waitingForWatchlists).toBe(true);
    await page.locator('[aria-controls="header-workspace-menu"]').click();
    await page.getByRole('button', { name: 'Zweitbereich', exact: true }).click();
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 700', exact: true }),
    ).toBeVisible();
    const feedsBeforeRelease = mock.calls.filter((call) => call.name === 'sniper_feed').length;
    mock.releaseWatchlists();
    await expect(page.getByRole('button', { name: 'Neuer Merkzettel', exact: true })).toBeEnabled();
    await expect(
      page.getByRole('article', { name: 'Nike Sneaker 700', exact: true }),
    ).toBeVisible();
    expect(
      mock.calls
        .filter((call) => call.name === 'sniper_feed')
        .slice(feedsBeforeRelease)
        .every((call) => call.body['p_workspace_id'] === secondWorkspace),
    ).toBe(true);
    expect(runtimeErrors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

import axe from 'axe-core';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { build } from 'esbuild';
import {
  accountIds,
  emptyPage,
  mockMarketplace,
  workspaceId,
} from './support/marketplace-account-fixture';
import { listingCurrentContentFixture } from '../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { emptyVintedListingContent } from '../src/app/features/marketplaces/models/vinted-listing-content';
import type { VintedListingDraft } from '../src/app/features/marketplaces/models/vinted-listing-draft';
import type { VintedListingJob } from '../src/app/features/marketplaces/models/vinted-listing-job';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', hasTouch: true });

const entryId = 'publication-1';
const images = [
  'https://images.example.test/listing-portrait.svg',
  'https://images.example.test/listing-landscape.svg',
  'https://images.example.test/listing-broken.svg',
];
const detailPath = `/marketplaces/vinted/listings/${accountIds[0]}/${entryId}`;

test('Relisting übernimmt Karte und Alter vor genau einem Erfolgstoast @marketplace-preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const title = 'EA7 Emporio Armani Jogginganzug';
  const runtimeErrors = await prepareListing(page, {
    title,
    text: 'Originalbeschreibung',
    textState: 'loaded',
    imageUrls: [images[0]],
  });
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: {
        id: '25000000-0000-4000-8000-000000000001',
        email: 'marketplace@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: { flipbase_action_overview: true },
        created_at: '2026-09-26T00:00:00Z',
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_action_overview', (route) =>
    route.fulfill({
      json: {
        ok: true,
        workspaceId,
        connectionId: route.request().postDataJSON().p_connection_id,
        actions: [],
      },
    }),
  );
  await page.clock.install();
  const createdAt = new Date().toISOString();
  const originalEntryId = '25000000-0000-4000-8000-000000000099';
  const draft: VintedListingDraft = {
    id: '20',
    workspaceId,
    connectionId: accountIds[0],
    relistExternalId: '98765',
    revision: 1,
    content: {
      ...emptyVintedListingContent(),
      title,
      description: 'Originalbeschreibung',
      priceCents: 6490,
    },
    images: [],
    inventoryItemId: null,
    createdAt,
    updatedAt: createdAt,
  };
  let job: VintedListingJob = {
    id: '30',
    workspaceId,
    connectionId: accountIds[0],
    draftId: '20',
    draftRevision: 1,
    externalAccountId: '100',
    executionMode: 'cloud',
    action: 'publish',
    state: 'writing',
    version: 1,
    relistEntryId: originalEntryId,
    relistExternalId: '98765',
    relistDeletedAt: createdAt,
    relistDelaySeconds: 0,
    itemTitle: title,
    scheduledAt: null,
    timeZone: null,
    latePolicy: 'pause_after_30_minutes',
    errorCode: null,
    externalId: null,
    providerState: null,
    verifiedAt: null,
    replacesJobId: null,
    createdAt,
    updatedAt: createdAt,
  };
  let planVisible = true;
  let holdSnapshot = false;
  let snapshotReads = 0;
  let publicationTime: string | null = null;
  let releaseSnapshot: () => void = () => undefined;
  const snapshotReady = new Promise<void>((resolve) => {
    releaseSnapshot = resolve;
  });
  await page.route('**/rest/v1/rpc/marketplace_read_relisting_plans', (route) =>
    route.fulfill({ json: { items: planVisible ? [{ job, draft }] : [] } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_listing_jobs', (route) =>
    route.fulfill({ json: { items: [job] } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', async (route) => {
    snapshotReads++;
    if (holdSnapshot) await snapshotReady;
    const scope = { workspaceId, connectionId: route.request().postDataJSON().p_connection_id };
    return route.fulfill({
      json: {
        ...scope,
        profile: null,
        publications: {
          items: [
            {
              ...scope,
              id: originalEntryId,
              externalId: publicationTime ? '45678' : '98765',
              title,
              text: 'Originalbeschreibung',
              textState: 'loaded',
              price: 64.9,
              currency: 'EUR',
              publicationState: 'active',
              occurredAt: publicationTime,
              imageUrl: images[0],
              imageUrls: [images[0]],
            },
          ],
          total: 1,
          nextCursor: null,
        },
        conversations: emptyPage(),
        sales: emptyPage(),
        activity: emptyPage(),
      },
    });
  });
  await page.goto('/marketplaces/vinted/listings');
  const wardrobe = page.locator('app-vinted-listings');
  const plan = wardrobe.locator('[data-relisting-plan]');
  await expect(plan).toContainText('Wird inseriert');
  job = {
    ...job,
    state: 'outcome_unknown',
    version: 2,
    externalId: '45678',
    errorCode: 'provider_unconfirmed_active_evidence',
    updatedAt: await page.evaluate(() => new Date().toISOString()),
  };
  await page.clock.fastForward(6000);
  await expect(plan).toContainText('Veröffentlichung wird geprüft');
  await expect(plan).toHaveAttribute('aria-busy', 'true');
  await expect(wardrobe).not.toContainText('Ergebnis unklar');
  await expect(page.locator('[data-action-overview-error]')).toHaveCount(0);
  await expect(page.locator('[data-action-overview-spinner]')).toHaveCount(1);
  await page.evaluate(() => {
    const observed: { title: string; wardrobe: string; cards: number }[] = [];
    (window as unknown as { relistingToasts: typeof observed }).relistingToasts = observed;
    const seen = new Set<Element>();
    new MutationObserver(() => {
      for (const toast of document.querySelectorAll('app-toast-container [role="status"]')) {
        if (!toast.textContent?.includes('Veröffentlicht') || seen.has(toast)) continue;
        seen.add(toast);
        const wardrobe = document.querySelector('app-vinted-listings');
        observed.push({
          title: toast.textContent,
          wardrobe: wardrobe?.textContent ?? '',
          cards:
            wardrobe?.querySelectorAll('[data-listing-row], [data-relisting-plan]').length ?? 0,
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  holdSnapshot = true;
  const readsBeforeConfirmation = snapshotReads;
  publicationTime = await page.evaluate(() => new Date().toISOString());
  job = {
    ...job,
    state: 'confirmed',
    version: 3,
    errorCode: null,
    providerState: 'active',
    verifiedAt: publicationTime,
    updatedAt: publicationTime,
  };
  planVisible = false;
  await page.clock.fastForward(6000);
  await expect.poll(() => snapshotReads).toBeGreaterThan(readsBeforeConfirmation);
  await expect(plan).toContainText('Veröffentlichung wird geprüft');
  await expect(page.locator('app-toast-container')).not.toContainText('Veröffentlicht');
  releaseSnapshot();
  // Der fehlgeschlagene parallele Leseversuch wird im nächsten Takt wiederholt.
  await page.clock.fastForward(6000);
  await expect(wardrobe.locator('[data-listing-row]')).toHaveCount(1);
  await expect(plan).toHaveCount(0);
  await expect(wardrobe.locator('app-vinted-listing-age')).toHaveText('Neu');
  await expect(wardrobe).not.toContainText('Alter unbekannt');
  await expect(wardrobe.locator(`a[href*="${originalEntryId}"]`).first()).toBeVisible();
  await expect(page.locator('app-toast-container')).toContainText('Veröffentlicht');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { relistingToasts: unknown[] }).relistingToasts.length,
      ),
    )
    .toBe(1);
  const observed = await page.evaluate(
    () =>
      (window as unknown as { relistingToasts: { wardrobe: string; cards: number }[] })
        .relistingToasts,
  );
  expect(observed[0].cards).toBe(1);
  expect(observed[0].wardrobe).toContain('Neu');
  expect(observed[0].wardrobe).not.toContain('Alter unbekannt');
  await page.clock.fastForward(10000);
  expect(
    await page.evaluate(
      () => (window as unknown as { relistingToasts: unknown[] }).relistingToasts.length,
    ),
  ).toBe(1);
  await screenshot(page, 'vinted-relisting-confirmed-together', wardrobe);
  await checkPage(page, runtimeErrors);
});

test('Bildbearbeitung liest bereits angezeigte private Originalfotos mit echtem Browsercache @marketplace-preview', async ({
  page,
}) => {
  const servers: Server[] = [];
  const listen = async (server: Server) => {
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Bildserver fehlt.');
    return `http://127.0.0.1:${address.port}`;
  };
  try {
    const original = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 120;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas fehlt.');
      context.fillStyle = '#b6d5e8';
      context.fillRect(0, 0, 80, 120);
      return canvas.toDataURL('image/jpeg').split(',')[1];
    });
    const requests: (string | undefined)[] = [];
    const photoOrigin = await listen(
      createServer((request, response) => {
        requests.push(request.headers.origin);
        // Der produktive Speicher unterscheidet nach Origin, setzt aber kein Vary.
        response.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
          ...(request.headers.origin
            ? { 'Access-Control-Allow-Origin': request.headers.origin }
            : {}),
        });
        response.end(Buffer.from(original, 'base64'));
      }),
    );
    const bundle = await build({
      entryPoints: ['e2e/support/vinted-photo-source-browser.ts'],
      bundle: true,
      write: false,
      format: 'iife',
      globalName: 'photoSourceFixture',
    });
    const photoUrl = photoOrigin + '/storage/v1/object/sign/private/original.jpg?token=fixture';
    const appOrigin = await listen(
      createServer((request, response) => {
        if (request.url === '/fixture.js') {
          response.writeHead(200, { 'Content-Type': 'text/javascript' });
          response.end(bundle.outputFiles[0].text);
        } else {
          response.writeHead(200, { 'Content-Type': 'text/html' });
          response.end(`<img src="${photoUrl}" alt="Original"><script src="/fixture.js"></script>`);
        }
      }),
    );
    // Keine Route-Mocks: Sie deaktivieren den HTTP-Cache und verdecken diese Regression.
    await page.goto(appOrigin);
    await expect(page.getByRole('img', { name: 'Original' })).toHaveJSProperty(
      'naturalHeight',
      120,
    );
    expect(requests).toEqual([undefined]);
    const result = await page.evaluate(async (source) => {
      const fixture = (
        window as unknown as {
          photoSourceFixture: typeof import('./support/vinted-photo-source-browser');
        }
      ).photoSourceFixture;
      const original = await fixture.readOriginal(source);
      const previews = [];
      for (const options of [
        { resize: 1200, filter: 'none', border: 'none' },
        { resize: null, filter: 'darker', border: 'none' },
        { resize: 1600, filter: 'lighter', border: 'small' },
      ] as const) {
        const base64 = await fixture.renderVintedListingPhoto({
          ...original,
          ...options,
          crop: null,
        });
        const image = new Image();
        image.src = 'data:image/jpeg;base64,' + base64;
        await image.decode();
        previews.push({ height: image.naturalHeight, changed: base64 !== original.base64 });
      }
      return { original, previews };
    }, photoUrl);
    expect(result.original).toEqual({ base64: original, mimeType: 'image/jpeg' });
    expect(result.previews).toEqual([
      { height: 1200, changed: true },
      { height: 120, changed: true },
      { height: 1600, changed: true },
    ]);
    expect(requests).toEqual([undefined, appOrigin]);
  } finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});

for (const width of [390, 1440])
  for (const theme of ['light', 'dark'] as const) {
    test(`Unvollständigen Vinted-Entwurf direkt im Formular ergänzen bei ${width}px ${theme} @marketplace-preview`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await prepareListing(page, {
        title: 'Unvollständiger Entwurf',
        text: '',
        textState: 'loaded',
        publicationState: 'draft',
      });
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      await page.route('**/marketplace-browser/listings/content/read', (route) =>
        route.fulfill({ json: { listing: null } }),
      );
      await page.route('**/marketplace-browser/listings/edit/read', (route) =>
        route.fulfill({
          json: { fields: { title: 'Unvollständiger Entwurf', description: '', price: '' } },
        }),
      );
      const saves: Record<string, unknown>[] = [];
      await page.route('**/marketplace-browser/listings/edit/save', (route) => {
        saves.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ json: { status: 'confirmed' } });
      });
      await page.goto(detailPath);
      await expect(page.locator('html')).toHaveClass(
        theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/,
      );
      const detail = page.locator('app-vinted-listing-detail');
      await expect(detail.locator('app-vinted-listing-age')).toHaveCount(0);
      await detail.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
      await expect(
        detail.getByRole('heading', { name: 'Vinted-Entwurf bearbeiten', exact: true }),
      ).toBeVisible();
      await expect(
        detail.getByRole('button', { name: 'Daten übernehmen', exact: true }),
      ).toHaveCount(0);
      await detail.getByRole('textbox', { name: 'Verkaufspreis', exact: true }).fill('18,00');
      expect(saves).toEqual([]);
      await detail.getByRole('button', { name: 'Bei Vinted speichern', exact: true }).click();
      await expect(page.locator('app-toast-container')).toContainText(
        'Inserat erfolgreich geändert',
      );
      await expect(detail).not.toContainText('Die Änderung wurde bei Vinted bestätigt.');
      expect(saves).toEqual([
        {
          workspaceId,
          connectionId: accountIds[0],
          entryId,
          fields: { title: 'Unvollständiger Entwurf', description: '', price: '18,00' },
        },
      ]);
      await expect(
        detail.locator('app-badge').getByText('Vinted-Entwurf', { exact: true }),
      ).toBeVisible();
      await screenshot(page, `vinted-native-draft-${width}-${theme}`);
    });
  }

interface ListingFixture {
  storedContent?: VintedListingDraft['content'];
  title: string;
  text: string | null;
  textState: 'loaded' | 'not_loaded';
  occurredAt?: string | null;
  createdAt?: string | null;
  publicationState?: 'active' | 'reserved' | 'draft' | 'hidden' | 'ended' | 'unknown';
  imageUrls?: readonly string[];
  price?: number | null;
}

async function prepareListing(page: Page, listing: ListingFixture) {
  // Diese Fälle prüfen die Oberfläche ohne Service Worker; PWA-Lebenszyklen haben eigene Tests.
  await page.addInitScript(() =>
    Reflect.deleteProperty(Object.getPrototypeOf(navigator), 'serviceWorker'),
  );
  await mockMarketplace(page, true, false, false, false, []);
  await page.route('**/rest/v1/rpc/marketplace_read_relisting_plans', (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  if (listing.storedContent) {
    const source: VintedListingDraft = {
      id: '5',
      workspaceId,
      connectionId: accountIds[0],
      revision: 1,
      content: listing.storedContent,
      images: (listing.imageUrls ?? images).map((_, index) => ({
        id: String(index + 1),
        storagePath: workspaceId + '/5/' + (index + 1) + '.jpg',
        fileName: 'Original.jpg',
        mimeType: 'image/jpeg',
        byteSize: 123,
      })),
      inventoryItemId: null,
      createdAt: '2026-11-04T00:00:00Z',
      updatedAt: '2026-11-04T00:00:00Z',
    };
    await page.route('**/rest/v1/rpc/marketplace_read_listing_photo_sources', (route) =>
      route.fulfill({ json: { items: [{ externalId: '98765', draft: source }] } }),
    );
    await page.route('**/storage/v1/**', (route) => {
      if (route.request().method() === 'POST')
        return route.fulfill({
          json: (route.request().postDataJSON().paths as string[]).map((path) => ({
            path,
            signedURL: '/object/sign/marketplace-listing-media/' + path + '?token=fixture',
            error: null,
          })),
        });
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#fcc601"/></svg>',
      });
    });
  }
  const entry = {
    id: entryId,
    externalId: '98765',
    publicationState: 'active',
    ...listing,
    price: listing.price === undefined ? 29.9 : listing.price,
    currency: 'EUR',
    imageUrl: listing.imageUrls ? (listing.imageUrls[0] ?? null) : images[0],
    imageUrls: listing.imageUrls ?? images,
  };
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (
      (message.type() === 'error' || message.type() === 'warning') &&
      !message.text().includes('WebSocket') &&
      !message.location().url.endsWith('listing-broken.svg')
    )
      runtimeErrors.push(message.text());
  });
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) => {
    const connectionId = route.request().postDataJSON()['p_connection_id'];
    const scope = { workspaceId, connectionId };
    return route.fulfill({
      json: {
        ...scope,
        profile: null,
        publications: {
          items: [{ ...scope, ...entry }],
          total: 1,
          nextCursor: null,
        },
        conversations: emptyPage(),
        sales: emptyPage(),
        activity: emptyPage(),
      },
    });
  });
  await page.route('**/rest/v1/marketplace_*account_entries**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('workspace_id')).toBe(`eq.${workspaceId}`);
    expect(query.get('connection_id')).toBe(`eq.${accountIds[0]}`);
    expect(query.get('kind')).toBe('eq.publication');
    if (!query.has('id')) {
      expect(query.get('body->>publicationState')).toBe('eq.draft');
      return route.fulfill({
        headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' },
        ...(route.request().method() === 'HEAD' ? { body: '' } : { json: [] }),
      });
    }
    expect(query.get('id')).toBe(`eq.${entryId}`);
    return route.fulfill({ json: { id: entryId, body: entry } });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_sync_schedule', (route) =>
    route.fulfill({
      json: {
        workspaceId,
        connectionId: route.request().postDataJSON()['p_connection_id'],
        enabled: false,
        intervalMinutes: 15,
        nextDueAt: null,
        lastAttemptAt: null,
        lastSuccessAt: null,
        pausedReason: null,
        retryAfter: null,
        authorizationVersion: 1,
      },
    }),
  );
  // Die Bearbeitung zeigt die Fotos, die Vinted beim Lesen der Maske geliefert hat.
  await page.route('https://*.vinted.net/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#fcc601"/></svg>',
    }),
  );
  await page.route('https://images.example.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('listing-broken.svg'))
      return route.fulfill({ status: 404, body: 'Künstlicher Bildfehler' });
    const portrait = path.endsWith('listing-portrait.svg');
    const width = portrait ? 300 : 1200;
    const height = portrait ? 1200 : 300;
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#344b46"/><rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="#fcc601"/></svg>`,
    });
  });
  return runtimeErrors;
}

async function screenshot(page: Page, name: string, surface?: Locator) {
  const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  if (surface) await surface.screenshot({ path: join(directory, `${name}.png`) });
  else await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
}

async function checkPage(page: Page, runtimeErrors: string[]) {
  await expect(page).toHaveTitle(/Flipbase/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(runtimeErrors).toEqual([]);
}

test('Großansicht behält den Tastaturfokus an beiden Galeriegrenzen @marketplace-preview @core-smoke', async ({
  page,
}) => {
  await prepareListing(page, { title: 'Galeriegrenzen', text: 'Test', textState: 'loaded' });
  await page.goto(detailPath);
  await page.getByRole('button', { name: 'Foto 1 von 3 öffnen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Artikelfotos' });
  await dialog.getByRole('button', { name: 'Nächstes Foto' }).click();
  await dialog.getByRole('button', { name: 'Nächstes Foto' }).click();
  await expect(dialog.getByRole('button', { name: 'Nächstes Foto' })).toBeDisabled();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('img')).toHaveAttribute('src', images[1]);
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('button', { name: 'Vorheriges Foto' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('img')).toHaveAttribute('src', images[1]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Foto 1 von 3 öffnen' })).toBeFocused();
});

for (const width of [320, 390, 834, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`Vinted-Mosaik und Zeit-Badges bei ${width}px ${theme} @marketplace-preview @core-smoke`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 1000 });
      if (width < 1024) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
      const photos = Array.from(
        { length: 20 },
        (_, index) => `https://images.example.test/photo-${index}.svg`,
      );
      const title = 'Jacke mit zwanzig Fotos';
      const listing = {
        title,
        text: 'Vollständige Beschreibung der Jacke.',
        textState: 'loaded' as const,
        imageUrls: photos,
        occurredAt: '2026-10-12T00:00:00Z',
        createdAt: '2026-10-01T12:00:00Z',
      };
      const errors = await prepareListing(page, listing);
      await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
      const entries = [84, 36, 120, 168, null].map((hours, index) => ({
        workspaceId,
        connectionId: accountIds[0],
        id: index === 0 ? entryId : `publication-${index + 1}`,
        title: index === 0 ? title : `Altersfall ${index}`,
        text: index === 0 ? listing.text : 'Beschreibung',
        textState: 'loaded',
        imageUrl: photos[0],
        imageUrls: photos,
        price: 29.9,
        currency: 'EUR',
        brand: index === 0 ? 'Eine besonders lange Testmarke ohne Zeilenumbruch' : null,
        size: index === 0 ? 'M' : null,
        status: index === 0 ? 'Sehr gut' : null,
        publicationState: 'active',
        createdAt: hours === null ? null : listing.createdAt,
        promoted: index === 0,
        metrics: {
          views: index === 0 ? 1234 : null,
          favorites: index === 0 ? 123 : null,
          observedAt: '2026-10-15T12:00:00Z',
        },
        occurredAt:
          hours === null
            ? null
            : new Date(Date.parse('2026-10-15T12:00:00Z') - hours * 3_600_000).toISOString(),
      }));
      const stateCases = [
        { state: 'reserved', title: 'Reservierter Testschal', label: 'Reserviert' },
        { state: 'draft', title: 'Vinted-Entwurf', label: 'Entwurf' },
        { state: 'hidden', title: 'Versteckter Testschal', label: 'Versteckt' },
        { state: 'unknown', title: 'Testschal ohne Status', label: 'Status unbekannt' },
        { state: 'ended', title: 'Beendeter Testschal', label: 'Beendet' },
      ];
      entries.push(
        ...stateCases.map(({ state, title }, index) => ({
          ...entries[0],
          id: `publication-state-${index + 1}`,
          title,
          publicationState: state,
          promoted: false,
          brand: null,
          size: null,
          status: null,
          createdAt: '2026-10-10T12:00:00Z',
          // Ein alter Importzeitpunkt darf bei Entwürfen kein Online-Alter vortäuschen.
          occurredAt: '2026-10-12T12:00:00Z',
        })),
      );
      const wardrobeEntries = entries.filter((entry) => entry.publicationState !== 'draft');
      wardrobeEntries.push({
        ...entries[0],
        id: 'publication-new',
        title: 'Neu eingestellter Schal',
        publicationState: 'active',
        occurredAt: '2026-10-15T11:59:00Z',
      });
      await page.route('**/rest/v1/marketplace_*account_entries**', (route) => {
        const query = new URL(route.request().url()).searchParams;
        const id = query.get('id')?.replace('eq.', '');
        if (!id) return route.fallback();
        expect(query.get('workspace_id')).toBe(`eq.${workspaceId}`);
        expect(query.get('connection_id')).toBe(`eq.${accountIds[0]}`);
        expect(query.get('kind')).toBe('eq.publication');
        const entry = entries.find((candidate) => candidate.id === id);
        expect(entry).toBeDefined();
        return route.fulfill({ json: { id, body: entry } });
      });
      await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) =>
        route.fulfill({
          json: {
            workspaceId,
            connectionId: accountIds[0],
            profile: null,
            publications: {
              items: wardrobeEntries,
              total: wardrobeEntries.length,
              nextCursor: null,
            },
            conversations: emptyPage(),
            sales: emptyPage(),
            activity: emptyPage(),
          },
        }),
      );
      const comparisons = [
        { minutes: 5, label: 'Letzter Abruf', views: 12, favorites: 3 },
        { minutes: 60, label: 'Stunde', views: 20, favorites: 4 },
        { minutes: 1440, label: 'Tag', views: 35, favorites: 6 },
        { minutes: 10080, label: 'Woche', views: 55, favorites: 9 },
      ];
      await page.route('**/rest/v1/rpc/marketplace_read_listing_metric_changes', (route) => {
        const request = route.request().postDataJSON() as { p_period_minutes: number };
        const comparison = comparisons.find(
          (period) => period.minutes === request.p_period_minutes,
        );
        if (!comparison) throw new Error('Unexpected statistics period');
        return route.fulfill({
          json: {
            workspaceId,
            connectionId: accountIds[0],
            periodMinutes: comparison.minutes,
            items: [
              {
                entryId,
                observedAt: '2026-10-15T12:00:00Z',
                baselineAt: new Date(
                  Date.parse('2026-10-15T12:00:00Z') - comparison.minutes * 60_000,
                ).toISOString(),
                views: comparison.views,
                favorites: comparison.favorites,
              },
            ],
          },
        });
      });
      if ((width === 1440 && theme === 'light') || (width === 390 && theme === 'dark')) {
        // Eine lokale Kopie mit gleichem Titel ändert den Anbieterstatus des Originals nicht.
        await page.route('**/rest/v1/rpc/marketplace_list_listing_drafts', (route) =>
          route.fulfill({
            json: {
              items: [
                {
                  id: '9007199254740999',
                  workspaceId,
                  connectionId: accountIds[0],
                  revision: 1,
                  content: { ...emptyVintedListingContent(), title },
                  images: [],
                  inventoryItemId: null,
                  createdAt: '2026-10-14T12:00:00Z',
                  updatedAt: '2026-10-14T12:00:00Z',
                },
              ],
              nextCursor: null,
            },
          }),
        );
        await page.goto('/marketplaces/vinted/listing-drafts');
        await expect(
          page.locator('app-vinted-listing-drafts').getByText(title, { exact: true }),
        ).toBeVisible();
      }
      await page.goto('/marketplaces/vinted/listings');
      const gridView = page.getByRole('button', { name: 'Rasteransicht', exact: true });
      const listView = page.getByRole('button', { name: 'Listenansicht', exact: true });
      await expect(gridView).toHaveAttribute('aria-pressed', 'true');
      await expect(listView).toHaveAttribute('aria-pressed', 'false');
      const cards = page.locator('app-vinted-listings [data-listing-row]');
      const firstThumbnail = cards.first().locator('app-product-thumbnail');
      const gridWidth = (await firstThumbnail.boundingBox())!.width;
      await listView.click();
      await expect(listView).toHaveAttribute('aria-pressed', 'true');
      await expect(gridView).toHaveAttribute('aria-pressed', 'false');
      await expect(cards).toHaveCount(wardrobeEntries.length);
      const checkPublicationStates = async () => {
        await expect(
          page
            .locator('[data-listing-row]')
            .filter({
              has: page.getByRole('link', {
                name: 'Inserat Neu eingestellter Schal öffnen',
                exact: true,
              }),
            })
            .locator('app-vinted-listing-age'),
        ).toHaveText('Neu');
        for (const stateCase of stateCases.filter((stateCase) => stateCase.state !== 'draft')) {
          const card = page.locator('[data-listing-row]').filter({
            has: page.getByRole('link', {
              name: `Inserat ${stateCase.title} öffnen`,
              exact: true,
            }),
          });
          await expect(card.getByText(stateCase.label, { exact: true })).toBeVisible();
          if (stateCase.state !== 'reserved')
            await expect(card.locator('app-vinted-listing-age')).toHaveText('5 T · erstellt');
        }
        const original = cards.first();
        for (const label of [
          'Entwurf',
          'Versteckt',
          'Status unbekannt',
          'Reserviert',
          'Beendet',
          'Online',
          'Aktiv',
        ])
          await expect(original.getByText(label, { exact: true })).toHaveCount(0);
        await expect(original.locator('app-vinted-listing-age')).toHaveText('3 T');
        const publicationTooltip = original.locator('app-vinted-listing-age app-badge');
        await expect(publicationTooltip).toHaveAttribute('title', /Veröffentlicht:/);
        await expect(publicationTooltip).toHaveAttribute('title', /Erstellt:/);
        await expect(
          page.getByRole('link', { name: 'Inserat Vinted-Entwurf öffnen', exact: true }),
        ).toHaveCount(0);
      };
      await checkPublicationStates();
      await expect(cards.first()).toContainText(
        'Eine besonders lange Testmarke ohne Zeilenumbruch',
      );
      await expect(cards.first()).toContainText('29,90');
      await expect(cards.first().locator('app-vinted-listing-metrics').first()).toBeVisible();
      await expect(cards.first().getByText('Gepusht', { exact: true })).toBeVisible();
      await expect(cards.first().locator('[data-metric-increase="favorites"]')).toContainText('+3');
      const periodSelect = page.getByRole('combobox', { name: 'Zeitraum für Inseratänderungen' });
      for (const comparison of [...comparisons.slice(1), ...comparisons.slice(0, 1)]) {
        await periodSelect.click();
        await page.getByRole('option', { name: new RegExp('^' + comparison.label) }).click();
        await expect(cards.first().locator('[data-metric-increase="views"]')).toContainText(
          '+' + comparison.views,
        );
        await expect(cards.first().locator('[data-metric-increase="favorites"]')).toContainText(
          '+' + comparison.favorites,
        );
      }
      await expect(cards.first().locator('[data-metric-increase="views"]')).toHaveCSS(
        'color',
        theme === 'dark' ? 'rgb(134, 223, 187)' : 'rgb(8, 103, 77)',
      );
      const listBounds = (await cards.first().boundingBox())!;
      const statusBounds = (await cards
        .first()
        .locator('[title="Zustand: Sehr gut"]')
        .boundingBox())!;
      expect(statusBounds.width).toBeGreaterThan(1);
      const metricBounds = await cards
        .first()
        .locator('[data-views], [data-favorites], [data-metric-increase]')
        .evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect();
            return { left: bounds.left, right: bounds.right };
          }),
        );
      for (const bounds of metricBounds) {
        expect(bounds.left).toBeGreaterThanOrEqual(listBounds.x);
        expect(bounds.right).toBeLessThanOrEqual(listBounds.x + listBounds.width);
      }
      expect((await firstThumbnail.boundingBox())!.width).toBeLessThan(gridWidth);
      expect(listBounds.width).toBeGreaterThan(width / 2);
      expect(listBounds.height).toBeLessThan(130);
      await page.evaluate(axe.source);
      expect(
        (
          await page.evaluate(() =>
            (window as unknown as { axe: typeof axe }).axe.run('app-vinted-listings'),
          )
        ).violations,
      ).toEqual([]);
      await checkPage(page, errors);
      await screenshot(page, `vinted-list-view-${width}-${theme}`);
      await gridView.focus();
      await page.keyboard.press('Enter');
      await expect(gridView).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => (await firstThumbnail.boundingBox())!.width)
        .toBeCloseTo(gridWidth, 0);
      await expect(page.locator('app-vinted-listing-age')).toHaveCount(wardrobeEntries.length);
      await checkPublicationStates();
      await expect(cards.first().locator('[data-metric-increase="views"]')).toContainText('+12');
      await expect(cards.first().locator('[data-metric-increase="favorites"]')).toContainText('+3');
      await expect(
        page.locator('app-vinted-listings').getByText('Wochenziel überschritten', { exact: true }),
      ).toHaveCount(0);
      for (const [index, text] of ['3 T', '1 T', '5 T', '7 T', 'Alter unbekannt'].entries())
        await expect(cards.nth(index).getByText(text, { exact: true })).toBeVisible();
      await page.evaluate(axe.source);
      expect(
        (
          await page.evaluate(() =>
            (window as unknown as { axe: typeof axe }).axe.run('app-vinted-listings'),
          )
        ).violations,
      ).toEqual([]);
      await page.goto(`/marketplaces/vinted/listings/${accountIds[0]}/publication-state-2`);
      const draftDetail = page.locator('app-vinted-listing-detail');
      await expect(
        draftDetail.locator('app-badge').getByText('Vinted-Entwurf', { exact: true }),
      ).toBeVisible();
      await expect(draftDetail.locator('app-vinted-listing-age')).toHaveCount(0);
      await page.goBack();
      await expect(cards).toHaveCount(wardrobeEntries.length);
      await listView.focus();
      await page.keyboard.press('Space');
      await expect(listView).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('link', { name: `Inserat ${title} öffnen`, exact: true }).click();
      const gallery = page.locator('app-product-gallery');
      await expect(gallery.getByRole('button')).toHaveCount(5);
      await expect(gallery.getByText('+15 Fotos')).toBeVisible();
      await expect(page.getByText('3 Tage online', { exact: true })).toBeVisible();
      if (width === 1440) {
        const galleryBounds = await gallery.boundingBox();
        const information = await page
          .locator('app-vinted-listing-detail > div')
          .last()
          .locator('app-card')
          .boundingBox();
        expect(galleryBounds!.width).toBeGreaterThan(information!.width * 1.8);
      }
      await expect(page.locator('app-vinted-listing-detail details')).toHaveCount(0);
      await expect(page.getByText(listing.text, { exact: true })).toBeVisible();
      const opener = gallery.getByRole('button', { name: 'Foto 5 von 20 öffnen' });
      if (width < 1024) await opener.tap();
      else await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Artikelfotos' });
      await expect(dialog.getByRole('img')).toHaveAttribute('src', photos[4]);
      if (width < 1024) await dialog.getByRole('button', { name: 'Nächstes Foto' }).tap();
      else await dialog.getByRole('button', { name: 'Nächstes Foto' }).click();
      await expect(dialog.getByRole('img')).toHaveAttribute('src', photos[5]);
      for (let index = 6; index < 20; index++) await page.keyboard.press('ArrowRight');
      await expect(dialog.getByRole('img')).toHaveAttribute('src', photos[19]);
      await expect(dialog.getByRole('button', { name: 'Nächstes Foto' })).toBeDisabled();
      await page.evaluate(axe.source);
      expect(
        (
          await page.evaluate(() =>
            (window as unknown as { axe: typeof axe }).axe.run('[role="dialog"]'),
          )
        ).violations,
      ).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
      await checkPage(page, errors);
      await screenshot(page, `vinted-mosaic-${width}-${theme}`);
      if (width === 1440 && theme === 'light') {
        // Keine Fotoanzahl darf leere Rasterzellen oder verlorene Originale erzeugen.
        for (const count of [0, 1, 2, 3, 4, 5]) {
          await prepareListing(page, { ...listing, imageUrls: photos.slice(0, count) });
          await page.reload();
          await expect(gallery.getByRole('button')).toHaveCount(count);
          if (count === 0) await expect(gallery).toContainText('Keine Fotos vorhanden');
          else {
            await gallery
              .getByRole('button', { name: `Foto ${count} von ${count} öffnen` })
              .click();
            await expect(dialog.getByRole('img')).toHaveAttribute('src', photos[count - 1]);
            await page.keyboard.press('Escape');
          }
          await checkPage(page, errors);
        }
      }
    });
  }
}

for (const width of [1440, 390]) {
  test(`Inseratgalerie erhält Hoch-/Querformat, Bildfehlerrahmen und langen Titel bei ${width}px @marketplace-preview @core-smoke`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const title = `Langer Inserattitel ${'ExtraLangesUngetrenntesTitelwort'.repeat(8)} mit vollständigem Schluss`;
    const errors = await prepareListing(page, {
      title,
      text: 'Bereits gespeicherte Beschreibung.',
      textState: 'loaded',
    });
    await page.goto(detailPath);
    await expect(page).toHaveURL(detailPath);
    const detail = page.locator('app-vinted-listing-detail');
    await expect(detail.getByRole('heading', { name: title, exact: true })).toBeVisible();
    for (const [number, expectedWidth, expectedHeight] of [
      [1, 300, 1200],
      [2, 1200, 300],
    ]) {
      const opener = detail.getByRole('button', {
        name: `Foto ${number} von 3 öffnen`,
        exact: true,
      });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Artikelfotos' });
      const image = dialog.getByRole('img');
      await expect(image).toHaveAttribute('src', images[number - 1]);
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBe(expectedWidth);
      expect(await image.evaluate((node) => (node as HTMLImageElement).naturalHeight)).toBe(
        expectedHeight,
      );
      // Die Großansicht zeigt das gesamte Original innerhalb der verfügbaren Fläche.
      expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe('contain');
      await checkPage(page, errors);
      await screenshot(page, `vinted-listing-${width}-${number === 1 ? 'portrait' : 'landscape'}`);
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
    }
    await detail.getByRole('button', { name: 'Foto 3 von 3 öffnen', exact: true }).click();
    const failedPhoto = page.getByRole('dialog').locator('[data-product-placeholder]');
    await expect(failedPhoto).toHaveAttribute('aria-label', title + ' – Foto 3');
    const failedBounds = await failedPhoto.boundingBox();
    expect(failedBounds!.height).toBeGreaterThan(0);
    await checkPage(page, errors);
    await screenshot(page, `vinted-listing-${width}-image-fallback`);
    await page.keyboard.press('Escape');
    await detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
    await expect(page).toHaveURL('/marketplaces/vinted/listings');
    await expect(
      page.getByRole('link', { name: `Inserat ${title} öffnen`, exact: true }),
    ).toBeVisible();
    await checkPage(page, errors);
  });
}

test('Bekannte leere Beschreibung startet auch beim Wiederöffnen keinen Browserabruf @marketplace-preview @core-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const title = 'Inserat ohne Beschreibung';
  const errors = await prepareListing(page, { title, text: '', textState: 'loaded' });
  let browserReads = 0;
  await page.route('**/marketplace-browser/listings/edit/read', (route) => {
    browserReads++;
    return route.fulfill({
      json: { fields: { title, description: 'Unerwarteter Abruf', price: '29.90' } },
    });
  });
  await page.goto(detailPath);
  const detail = page.locator('app-vinted-listing-detail');
  await expect(detail).toContainText('Keine Beschreibung vorhanden.');
  await expect(detail).not.toContainText('Beschreibung wird von Vinted geladen');
  await detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
  await page.getByRole('link', { name: `Inserat ${title} öffnen`, exact: true }).click();
  await expect(detail).toContainText('Keine Beschreibung vorhanden.');
  expect(browserReads).toBe(0);
  await checkPage(page, errors);
  await screenshot(page, 'vinted-listing-empty-loaded');
});

test('Beschreibungen stammen beim Öffnen und Relisten aus dem gespeicherten Hintergrundstand @marketplace-preview @core-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const title = 'Inserat mit gespeicherter Beschreibung';
  const errors = await prepareListing(page, { title, text: null, textState: 'not_loaded' });
  const reads: Record<string, unknown>[] = [];
  await page.route('**/marketplace-browser/listings/edit/read', async (route) => {
    reads.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: {
        fields: { title, description: 'Gezielt geladener Beschreibungstext.', price: '29.90' },
        cache: 'pending',
      },
    });
  });
  const imported = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/marketplace_read_snapshot') &&
      response.request().postDataJSON().p_connection_id === accountIds[0],
  );
  await page.goto(detailPath);
  const snapshot = await (await imported).json();
  const detail = page.locator('app-vinted-listing-detail');
  await expect(detail).not.toContainText('Beschreibung wird von Vinted geladen');
  await expect(detail.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeEnabled();
  await expect(detail.locator('app-listing-transfer-action')).toHaveCount(0);
  expect(reads).toEqual([]);
  await page.route('**/rest/v1/rpc/marketplace_read_snapshot', (route) =>
    route.fulfill({
      json: {
        ...snapshot,
        publications: {
          ...snapshot.publications,
          items: snapshot.publications.items.map((item: { id: string }) =>
            item.id === entryId
              ? {
                  ...item,
                  text: 'Im Hintergrund gespeicherter Beschreibungstext.',
                  textState: 'loaded',
                }
              : item,
          ),
        },
      },
    }),
  );
  await page.reload();
  await expect(detail.locator('details')).toHaveCount(0);
  await expect(
    detail.getByText('Im Hintergrund gespeicherter Beschreibungstext.', { exact: true }),
  ).toBeVisible();
  await detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
  await page.getByRole('link', { name: `Inserat ${title} öffnen`, exact: true }).click();
  await expect(detail).toContainText('Im Hintergrund gespeicherter Beschreibungstext.');
  await expect(detail).not.toContainText('Beschreibung wird von Vinted geladen');
  await detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
  await page.getByRole('button', { name: `${title} relisten`, exact: true }).click();
  await expect(
    page
      .locator('app-vinted-listing-editor')
      .getByRole('textbox', { name: 'Beschreibung', exact: true }),
  ).toHaveValue('Im Hintergrund gespeicherter Beschreibungstext.');
  expect(reads).toHaveLength(0);
  await checkPage(page, errors);
  await screenshot(page, 'vinted-listing-description-cache-mobile');
});

for (const width of [390, 1440])
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`Preisdialog ${width} ${theme}`, () => {
      test.use({ hasTouch: width < 1024 });
      test(`Preis direkt ändern und nach einem Fehler erneut speichern bei ${width}px ${theme} @marketplace-preview @core-smoke`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const errors = await prepareListing(page, {
          title: 'Jacke für Preisänderung',
          text: 'Vorhandener Text',
          textState: 'loaded',
        });
        await page.route('**/auth/v1/user', (route) =>
          route.fulfill({
            json: {
              id: '25000000-0000-4000-8000-000000000001',
              email: 'marketplace@example.test',
              aud: 'authenticated',
              role: 'authenticated',
              app_metadata: {},
              user_metadata: { flipbase_action_overview: true },
              created_at: '2026-09-26T00:00:00Z',
            },
          }),
        );
        await page.route('**/rest/v1/rpc/marketplace_read_action_overview', (route) =>
          route.fulfill({
            json: {
              ok: true,
              workspaceId,
              connectionId: route.request().postDataJSON().p_connection_id,
              actions: [],
            },
          }),
        );
        await page.route('**/rest/v1/rpc/marketplace_read_listing_jobs', (route) =>
          route.fulfill({ json: { items: [] } }),
        );
        await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
        let reads = 0;
        for (const route of ['edit/read', 'content/read'])
          await page.route('**/marketplace-browser/listings/' + route, (request) => {
            reads++;
            return request.fulfill({ status: 503 });
          });
        const saves: unknown[] = [];
        let finishSave!: () => void;
        await page.route('**/marketplace-browser/listings/price/save', async (route) => {
          saves.push(route.request().postDataJSON());
          if (saves.length === 1) return route.fulfill({ json: { status: 'unconfirmed' } });
          if (saves.length > 3) return route.fulfill({ json: { status: 'confirmed' } });
          await new Promise<void>((resolve) => {
            finishSave = resolve;
          });
          return route.fulfill({ json: { status: 'confirmed' } });
        });
        await page.goto(detailPath);
        const detail = page.locator('app-vinted-listing-detail');
        const opener = detail.getByRole('button', { name: 'Preis ändern', exact: true });
        await opener.click();
        const dialog = page.getByRole('dialog', { name: 'Preis ändern', exact: true });
        const input = dialog.getByRole('spinbutton', { name: 'Neuer Verkaufspreis', exact: true });
        await expect(input).toHaveValue('29.90');
        await expect(input).toBeEnabled();
        expect(reads).toBe(0);
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(opener).toBeFocused();
        await opener.click();
        await input.fill('24.5');
        await screenshot(page, `vinted-price-dialog-${width}-${theme}`);
        await input.press('Enter');
        await expect(dialog).not.toBeVisible();
        await expect(
          detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }),
        ).toBeFocused();
        await expect(detail).toContainText('29,90');
        const runningActions = page.getByRole('button', { name: /Laufende Aktionen/ });
        await runningActions.click();
        await expect(
          page.getByText('Preisänderung · Jacke für Preisänderung', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText(/Vinted hat die Änderung nicht eindeutig bestätigt/),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await opener.click();
        await input.fill('24.50');
        for (const key of ['Tab', 'Shift+Tab']) {
          for (let step = 0; step < 5; step++) {
            await page.keyboard.press(key);
            await expect(dialog.locator(':focus')).toHaveCount(1);
          }
        }
        await page.evaluate(axe.source);
        expect(
          (
            await page.evaluate(() =>
              (window as unknown as { axe: typeof axe }).axe.run('app-modal-shell'),
            )
          ).violations,
        ).toEqual([]);
        await dialog.getByRole('button', { name: 'Preis speichern', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(
          detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }),
        ).toBeFocused();
        expect(saves).toHaveLength(2);
        await runningActions.click();
        await expect(page.getByText('Preis wird geändert …', { exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        finishSave();
        await expect(detail).toContainText('24,50');
        await expect(page.locator('app-toast-container')).toContainText(
          'Preis erfolgreich geändert',
        );
        await expect(detail).not.toContainText('Der neue Preis wurde bei Vinted bestätigt.');
        expect(saves).toEqual(
          [1, 2].map(() => ({
            workspaceId,
            connectionId: accountIds[0],
            entryId,
            expectedPriceCents: 2990,
            priceCents: 2450,
          })),
        );
        expect(reads).toBe(0);
        await detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
        await expect(page.locator('app-vinted-listings')).not.toContainText(
          'Der neue Preis wurde bei Vinted bestätigt.',
        );
        await expect(
          page.getByRole('link', { name: 'Inserat Jacke für Preisänderung öffnen', exact: true }),
        ).toContainText('24,50');
        const wardrobe = page.locator('app-vinted-listings');
        const quickPrice = wardrobe.getByRole('button', {
          name: 'Preis für Jacke für Preisänderung ändern',
          exact: true,
        });
        await quickPrice.click();
        await expect(input).toHaveValue('24.50');
        await page.keyboard.press('Escape');
        await expect(quickPrice).toBeFocused();
        await wardrobe.getByRole('button', { name: 'Listenansicht', exact: true }).click();
        await expect(wardrobe.getByRole('columnheader')).toHaveText([
          'Artikel',
          'Alter',
          'Aufrufe',
          'Favoriten',
          'Preis',
          'Aktionen',
        ]);
        await expect(
          wardrobe
            .locator('[data-listing-row] td')
            .last()
            .getByRole('button', { name: 'Preis für Jacke für Preisänderung ändern', exact: true }),
        ).toBeVisible();
        await quickPrice.click();
        await input.fill('22');
        await input.press('Enter');
        await expect(dialog).not.toBeVisible();
        await expect(wardrobe.locator('[data-listing-row][aria-busy="true"]')).toHaveCount(1);
        await expect(
          wardrobe.getByRole('status').filter({ hasText: 'Preis wird geändert' }),
        ).toBeVisible();
        await screenshot(page, `vinted-price-running-list-${width}-${theme}`, wardrobe);
        await wardrobe.getByRole('button', { name: 'Rasteransicht', exact: true }).click();
        // Die Tabellenzeile bleibt bis zum Rendern der Rasterkarte kurz im DOM.
        const busyCard = wardrobe.locator('article[data-listing-row][aria-busy="true"]');
        await expect(busyCard.locator('app-product-thumbnail')).toBeVisible();
        await expect(busyCard.getByRole('status')).toBeVisible();
        const imageBox = await busyCard.locator('app-product-thumbnail').boundingBox();
        const statusBox = await busyCard.getByRole('status').boundingBox();
        expect(imageBox).not.toBeNull();
        expect(statusBox).not.toBeNull();
        expect(
          Math.abs(statusBox!.y + statusBox!.height / 2 - (imageBox!.y + imageBox!.height / 2)),
        ).toBeLessThan(2);
        await screenshot(page, `vinted-price-running-grid-${width}-${theme}`, wardrobe);
        await wardrobe.getByRole('button', { name: 'Listenansicht', exact: true }).click();
        finishSave();
        await expect(wardrobe.locator('[data-listing-row][aria-busy="true"]')).toHaveCount(0);
        await expect(wardrobe).toContainText('22,00');
        await expect(page).toHaveURL(/\/vinted\/listings$/);
        expect(saves[2]).toEqual({
          workspaceId,
          connectionId: accountIds[0],
          entryId,
          expectedPriceCents: 2450,
          priceCents: 2200,
        });
        expect(reads).toBe(0);
        await page.evaluate(axe.source);
        expect(
          (
            await page.evaluate(() =>
              (window as unknown as { axe: typeof axe }).axe.run('app-vinted-listings'),
            )
          ).violations,
        ).toEqual([]);
        await checkPage(page, errors);
      });
    });
  }

for (const width of [1440, 390]) {
  test(`Bestehendes Inserat vollständig bearbeiten und nur nach Vinted-Bestätigung übernehmen bei ${width}px @marketplace-preview`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await prepareListing(page, {
      title: 'Meine Schuhe',
      text: 'Sehr gut erhalten.',
      textState: 'loaded',
      price: 20.5,
      storedContent: listingCurrentContentFixture().content,
      imageUrls: listingCurrentContentFixture().photoUrls,
    });
    const listing = { ...listingCurrentContentFixture(), externalAccountId: '100' };
    const reads: unknown[] = [],
      saves: Record<string, unknown>[] = [];
    await page.route('**/marketplace-browser/listings/content/read', (route) => {
      reads.push(route.request().postDataJSON());
      return route.fulfill({ json: { listing } });
    });
    await page.route('**/marketplace-browser/listings/content/save', (route) => {
      saves.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fulfill({ json: { status: saves.length === 1 ? 'conflict' : 'confirmed' } });
    });
    await page.goto(detailPath);
    const detail = page.locator('app-vinted-listing-detail');
    await detail.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await expect(detail.getByRole('heading', { name: 'Inserat bearbeiten' })).toBeVisible();
    expect(reads).toEqual([]);
    await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Meine Schuhe');
    await expect(detail.getByLabel('Verkaufspreis')).toHaveValue('20,50');
    // Farben sind eine Auswahlbox wie bei der Artikel-Erstellung, keine Checkbox-Liste.
    const colors = detail.getByRole('combobox', { name: 'Farben (höchstens 2)' });
    await expect(detail.getByRole('button', { name: 'Blau entfernen' })).toBeVisible();
    await expect(detail.getByRole('checkbox')).toHaveCount(0);
    await colors.click();
    // Zwei Farben sind bereits gewählt; eine dritte lässt Vinted nicht zu.
    await expect(detail.getByRole('option', { name: 'Rot', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await detail.getByRole('button', { name: 'Gelb entfernen' }).click();
    await detail.getByRole('option', { name: 'Rot', exact: true }).click();
    await expect(detail.getByRole('button', { name: 'Rot entfernen' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Das zweite Foto wird Titelbild; gespeichert wird die neue Reihenfolge der vorhandenen Fotos.
    // Derselbe Bild-Baustein wie auf der Produktseite; hinzufügen und zuschneiden entfallen noch.
    const photos = detail.locator('app-product-media-editor');
    await expect(photos.locator('li')).toHaveCount(2);
    await expect(photos.locator('[data-add-media]')).toHaveCount(0);
    await photos.getByRole('button', { name: 'Bild 2: Foto 2, Details öffnen' }).click();
    const photoDetails = page.getByRole('dialog');
    await expect(photoDetails.getByRole('button', { name: 'Zuschneiden' })).toHaveCount(0);
    await expect(photoDetails.getByRole('textbox', { name: 'Bildname' })).toHaveCount(0);
    await page.evaluate(axe.source);
    // Während des Einblendens misst die Prüfung Zwischenfarben; gewertet wird das fertige Fenster.
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (
            await (window as unknown as { axe: typeof axe }).axe.run(
              document.querySelector('[role="dialog"]')!,
            )
          ).violations.map((violation) => violation.id),
        ),
      )
      .toEqual([]);
    await photoDetails.getByRole('combobox', { name: 'Position in der Galerie' }).click();
    await photoDetails.getByRole('option', { name: '1 · Hauptbild' }).click();
    await photoDetails.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await detail.getByRole('textbox', { name: 'Titel' }).fill('Neue Schuhe');
    await detail.getByLabel('Verkaufspreis').fill('18');
    // Nach dem Schließen des Bilddialogs startet die vorhandene Formular-Einblendung neu.
    // Kontraste am vollständig eingeblendeten Formular messen, ohne die Animation abzuschalten.
    await expect(detail.locator('app-entry-page-layout > div')).toHaveCSS('opacity', '1');
    await page.evaluate(axe.source);
    const violations = await page.evaluate(async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-vinted-listing-detail')!,
        )
      ).violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    );
    expect(violations).toEqual([]);
    await screenshot(page, `vinted-listing-edit-${width}`);
    const save = detail.getByRole('button', { name: 'Bei Vinted speichern', exact: true });
    expect(reads).toEqual([]);
    await save.click();
    expect(reads).toEqual([{ workspaceId, connectionId: accountIds[0], entryId }]);
    await expect(detail.getByRole('alert')).toContainText('inzwischen bei Vinted geändert');
    await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Neue Schuhe');
    await save.click();
    await expect(page.locator('app-toast-container')).toContainText('Inserat erfolgreich geändert');
    await expect(detail).not.toContainText('Die Änderung wurde bei Vinted bestätigt.');
    await expect(detail.getByRole('heading', { name: 'Neue Schuhe' })).toBeVisible();
    const base = listingCurrentContentFixture().content;
    expect(saves).toHaveLength(2);
    expect(saves[1]).toEqual({
      workspaceId,
      connectionId: accountIds[0],
      entryId,
      base,
      content: {
        ...base,
        title: 'Neue Schuhe',
        priceCents: 1800,
        colorIds: [1, 3],
        colorLabels: ['Blau', 'Rot'],
      },
      photos: {
        base: listingCurrentContentFixture().photoUrls,
        desired: [...listingCurrentContentFixture().photoUrls].reverse(),
      },
    });
    await checkPage(page, errors);
  });
}

for (const width of [390, 1440])
  for (const theme of ['light', 'dark'] as const)
    test.describe(`Relist-Editor ${width} ${theme}`, () => {
      test.use({ hasTouch: width === 390 });
      test.use({ hasTouch: width < 1024 });
      test(`Relisten und Vorlage bewahren Originale und übernehmen vollständige Daten bei ${width}px ${theme} @marketplace-preview`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const errors = await prepareListing(page, {
          title: 'Meine Schuhe',
          text: 'Sehr gut erhalten.',
          textState: 'loaded',
          imageUrls: ['https://images1.vinted.net/tc/relistTest/f800/1788288106.jpg'],
          price: null,
        });
        await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
        const original = Buffer.from(
          await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 200;
            const context = canvas.getContext('2d')!;
            context.fillStyle = '#b6d5e8';
            context.fillRect(0, 0, 160, 200);
            return canvas.toDataURL('image/jpeg').split(',')[1];
          }),
          'base64',
        );
        const metadata = Buffer.from('Exif\0\0Flipbase-Metadaten-Test', 'utf8');
        const segment = Buffer.alloc(metadata.length + 4);
        segment[0] = 255;
        segment[1] = 225;
        segment.writeUInt16BE(metadata.length + 2, 2);
        metadata.copy(segment, 4);
        const photo = Buffer.concat([original.subarray(0, 2), segment, original.subarray(2)]);
        const listing = {
          ...listingCurrentContentFixture(),
          externalAccountId: '100',
          photoUrls: ['https://images1.vinted.net/tc/relistTest/f800/1788288106.jpg'],
        };
        let providerReads = 0;
        let providerAvailable = false;
        let releaseProvider!: () => void;
        const blockedProvider = new Promise<void>((resolve) => {
          releaseProvider = resolve;
        });
        await page.route('**/marketplace-browser/listings/content/read', async (route) => {
          providerReads++;
          if (!providerAvailable) {
            await blockedProvider;
            return route.fulfill({ json: { listing: null } });
          }
          return route.fulfill({ json: { listing } });
        });
        await page.route('https://images1.vinted.net/tc/relistTest/f800/1788288106.jpg', (route) =>
          route.fulfill({
            contentType: 'image/jpeg',
            body: photo,
          }),
        );
        await page.route('**/marketplace-browser/listings/photo/read', (route) => {
          expect(route.request().postDataJSON()).toEqual({
            workspaceId,
            connectionId: accountIds[0],
            entryId,
            photoUrl: listing.photoUrls[0],
          });
          return route.fulfill({ contentType: 'image/jpeg', body: photo });
        });
        await page.route('**/rest/v1/vinted_selling_category_snapshots*', (route) =>
          route.fulfill({
            json: {
              external_account_id: new URL(route.request().url()).searchParams
                .get('external_account_id')
                ?.slice(3),
              observed_at: '2026-11-04T12:00:00Z',
              categories: [
                {
                  id: 2738,
                  parentId: null,
                  title: 'Fußballschuhe',
                  path: 'Fußballschuhe',
                  isLeaf: true,
                },
              ],
            },
          }),
        );
        await page.goto('/marketplaces/vinted/listings');
        const wardrobe = page.locator('app-vinted-listings');
        await expect(
          wardrobe.getByRole('button', { name: 'Preis für Meine Schuhe ändern', exact: true }),
        ).toBeDisabled();
        const gridActionsBefore = await wardrobe
          .locator('[data-listing-actions]')
          .evaluate((bar) => {
            const card = bar.closest('article')!.getBoundingClientRect();
            const bounds = bar.getBoundingClientRect();
            return { height: bounds.height, offset: bounds.y - card.y, cardHeight: card.height };
          });
        if (width === 1440) {
          await wardrobe
            .getByRole('button', { name: 'Preis für Meine Schuhe ändern', exact: true })
            .hover();
          await screenshot(
            page,
            `vinted-wardrobe-card-${width}-${theme}`,
            wardrobe.locator('article').first(),
          );
        }
        await screenshot(page, `vinted-wardrobe-grid-${width}-${theme}`, wardrobe);
        await wardrobe.getByRole('button', { name: 'Listenansicht', exact: true }).click();
        const sourceActions = wardrobe.locator('[data-listing-row] td').last();
        await expect(sourceActions.getByRole('button')).toHaveCount(4);
        const listActionsBefore = await sourceActions
          .locator('[data-listing-actions]')
          .boundingBox();
        const listRowBefore = await wardrobe.locator('[data-listing-row]').boundingBox();
        const actionBounds = await sourceActions.boundingBox();
        for (const button of await sourceActions.getByRole('button').all()) {
          const bounds = await button.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(actionBounds!.x);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
            actionBounds!.x + actionBounds!.width,
          );
        }
        await screenshot(page, `vinted-wardrobe-actions-${width}-${theme}`, wardrobe);
        await wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }).click();
        const editor = page.locator('app-vinted-listing-editor');
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          'Meine Schuhe',
        );
        await expect(editor.locator('app-card')).toHaveCount(0);
        await expect(
          editor.getByRole('region', { name: 'Bildbearbeitung', exact: true }),
        ).toBeVisible();
        await expect(
          editor.getByRole('region', { name: 'Veröffentlichung', exact: true }),
        ).toBeVisible();
        await expect(
          editor.getByRole('textbox', { name: 'Beschreibung', exact: true }),
        ).toHaveValue('Sehr gut erhalten.');
        expect(providerReads).toBe(0);
        await expect(editor.getByLabel('Marke', { exact: true })).toHaveCount(0);
        await expect(
          editor.getByRole('textbox', { name: 'Verkaufspreis', exact: true }),
        ).toHaveCount(0);
        await expect(
          editor.getByRole('button', { name: 'Daten übernehmen', exact: true }),
        ).toHaveCount(0);
        await expect(
          editor.getByRole('button', { name: 'Entwurf speichern', exact: true }),
        ).toHaveCount(0);
        await expect(
          page
            .getByRole('dialog', { name: 'Artikel relisten', exact: true })
            .locator('footer')
            .getByRole('button', { name: 'Relisten', exact: true }),
        ).toBeVisible();
        const preview = editor.locator('app-vinted-listing-photo-preview img');
        await expect(preview).toBeVisible();
        await expect(preview).toHaveJSProperty('naturalHeight', 200);
        await screenshot(
          page,
          `vinted-relist-details-${width}-${theme}`,
          page.locator('[data-modal-surface]'),
        );
        // Ein nicht erreichbarer Anbieter darf erst nach dem ausdrücklichen Auftrag stören.
        await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('Mein neuer Titel');
        await page
          .getByRole('dialog', { name: 'Artikel relisten', exact: true })
          .locator('footer')
          .getByRole('button', { name: 'Relisten', exact: true })
          .click();
        await expect.poll(() => providerReads).toBe(1);
        await expect(editor).toHaveCount(0);
        await expect(page.locator('[data-action-overview-spinner]')).toBeVisible();
        await expect(sourceActions.getByRole('button')).toHaveCount(4);
        for (const button of await sourceActions.getByRole('button').all())
          await expect(button).toBeDisabled();
        const preparingActions = await sourceActions
          .locator('[data-listing-actions]')
          .boundingBox();
        expect(preparingActions!.height).toBe(listActionsBefore!.height);
        expect((await wardrobe.locator('[data-listing-row]').boundingBox())!.height).toBe(
          listRowBefore!.height,
        );
        releaseProvider();
        await expect(page.locator('[data-action-overview-error]')).toBeVisible();
        await expect(page.locator('[data-action-overview-spinner]')).toHaveCount(0);
        providerAvailable = true;
        await wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }).click();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          'Meine Schuhe',
        );
        expect(providerReads).toBe(1);
        await expect(
          editor.getByRole('combobox', { name: 'Auflösung', exact: true }),
        ).toContainText('Keine Änderung');
        await expect(editor.getByRole('checkbox', { name: 'Bildauflösung anpassen' })).toHaveCount(
          0,
        );
        const outputPreview = editor.locator('app-vinted-listing-photo-preview img');
        await expect(outputPreview).toBeVisible();
        await editor.getByRole('combobox', { name: 'Filter', exact: true }).click();
        await page.getByRole('option', { name: 'Heller', exact: true }).click();
        await editor.getByRole('combobox', { name: 'Weißer Rahmen', exact: true }).click();
        await page.getByRole('option', { name: 'Mittel', exact: true }).click();
        await editor.getByRole('combobox', { name: 'Auflösung', exact: true }).click();
        await page.getByRole('option', { name: '1600 Pixel', exact: true }).click();
        await expect(outputPreview).toBeVisible();
        await expect(outputPreview).toHaveJSProperty('naturalHeight', 1600);
        await editor
          .getByRole('combobox', { name: 'Veröffentlichungszeitpunkt', exact: true })
          .click();
        await page.getByRole('option', { name: 'Verzögert relisten', exact: true }).click();
        await editor.getByRole('combobox', { name: 'Wartezeit', exact: true }).click();
        await page.getByRole('option', { name: '10 Min.', exact: true }).click();
        await editor
          .getByRole('combobox', { name: 'Veröffentlichungszeitpunkt', exact: true })
          .click();
        await page.getByRole('option', { name: 'Relisting planen', exact: true }).click();
        await expect(editor.getByRole('textbox', { name: 'Uhrzeit', exact: true })).toBeVisible();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          'Meine Schuhe',
        );
        await page.evaluate(axe.source);
        expect(
          (
            await page.evaluate(() =>
              (window as unknown as { axe: typeof axe }).axe.run('app-vinted-listing-editor'),
            )
          ).violations,
        ).toEqual([]);
        await screenshot(
          page,
          `vinted-relist-${width}-${theme}`,
          page.locator('[data-modal-surface]'),
        );
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Seite verlassen', exact: true }).click();
        await expect(editor).toHaveCount(0);
        await wardrobe
          .getByRole('button', {
            name: 'Meine Schuhe als Vorlage für neues Inserat verwenden',
            exact: true,
          })
          .click();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          listing.content.title,
        );
        await expect(
          page
            .getByRole('dialog', { name: 'Als Vorlage für neues Inserat verwenden', exact: true })
            .locator('footer')
            .getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }),
        ).toBeVisible();
        await expect(editor.getByText(/zuerst Dein bestehendes Inserat gelöscht/)).toHaveCount(0);
        await screenshot(
          page,
          `vinted-template-${width}-${theme}`,
          page.locator('[data-modal-surface]'),
        );
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Seite verlassen', exact: true }).click();
        const originalSource = {
          id: '40',
          workspaceId,
          connectionId: accountIds[0],
          revision: 1,
          content: listing.content,
          images: [
            {
              id: '41',
              storagePath: `${workspaceId}/40/25000000-0000-4000-8000-000000000041.jpg`,
              fileName: 'camera-original.jpg',
              mimeType: 'image/jpeg',
              byteSize: photo.length,
            },
          ],
          inventoryItemId: null,
          createdAt: '2026-11-02T00:00:00Z',
          updatedAt: '2026-11-02T00:00:00Z',
        };
        await page.route('**/rest/v1/rpc/marketplace_read_listing_photo_sources', (route) =>
          route.fulfill({
            json: {
              items: route.request().postDataJSON().p_external_ids.includes('98765')
                ? [{ externalId: '98765', draft: originalSource }]
                : [],
            },
          }),
        );
        await page.route('**/storage/v1/**', (route) =>
          route.request().method() === 'POST'
            ? route.fulfill({
                json: (route.request().postDataJSON().paths as string[]).map((path) => ({
                  path,
                  signedURL: `/object/sign/marketplace-listing-media/${path}?token=original`,
                  error: null,
                })),
              })
            : route.fulfill({ contentType: 'image/jpeg', body: photo }),
        );
        // Vinted liefert inzwischen eine bearbeitete Ausgabe; Flipbase muss die private Quelle laden.
        await page.route('https://images1.vinted.net/tc/relistTest/f800/1788288106.jpg', (route) =>
          route.fulfill({
            contentType: 'image/jpeg',
            body: original,
          }),
        );
        // Der reguläre Flipbase-Abgleich legt Originaladressen und vollständige Details lokal ab.
        await page.reload();
        const readsBeforeCachedRelist = providerReads;
        await wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }).click();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          'Meine Schuhe',
        );
        expect(providerReads).toBe(readsBeforeCachedRelist);
        await expect(editor.locator('app-vinted-listing-photo-preview img')).toHaveAttribute(
          'src',
          /storage\/v1\/object\/sign\/marketplace-listing-media\//,
        );
        await expect(editor.locator('app-vinted-listing-photo-preview img')).toHaveJSProperty(
          'naturalHeight',
          200,
        );
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Seite verlassen', exact: true }).click();
        const createdAt = new Date().toISOString();
        let plannedDraft = {
          id: '20',
          workspaceId,
          connectionId: accountIds[0],
          relistExternalId: '98765',
          revision: 1,
          content: { ...listing.content, aiPhoto: listing.aiPhoto },
          photoOptions: { resize: null, crops: {}, filter: 'darker', border: 'small' },
          images: [
            {
              id: '21',
              storagePath: `${workspaceId}/20/25000000-0000-4000-8000-000000000041.jpg`,
              fileName: 'foto.jpg',
              mimeType: 'image/jpeg',
              byteSize: photo.length,
            },
          ],
          inventoryItemId: null,
          createdAt,
          updatedAt: createdAt,
        };
        let plannedJob = {
          id: '30',
          workspaceId,
          connectionId: accountIds[0],
          draftId: '20',
          draftRevision: 1,
          relistExternalId: '98765',
          relistDeletedAt: createdAt,
          relistDelaySeconds: 0,
          itemTitle: listing.content.title,
          externalAccountId: '100',
          executionMode: 'cloud',
          action: 'publish',
          state: 'queued',
          version: 1,
          scheduledAt: new Date(Date.now() + 300000).toISOString(),
          timeZone: 'Europe/Berlin',
          latePolicy: 'pause_after_30_minutes',
          errorCode: null as string | null,
          externalId: null as string | null,
          providerState: null as 'active' | 'processing' | null,
          verifiedAt: null as string | null,
          createdAt,
          updatedAt: createdAt,
          replacesJobId: null as string | null,
        };
        const edits: boolean[] = [];
        const enqueues: Record<string, unknown>[] = [];
        let acceptedDraft = plannedDraft;
        let planVisible = true;
        await page.route('**/rest/v1/rpc/marketplace_read_relisting_plans', (route) =>
          route.fulfill({
            json: { items: planVisible ? [{ job: plannedJob, draft: acceptedDraft }] : [] },
          }),
        );
        await page.route('**/rest/v1/rpc/marketplace_read_listing_jobs', (route) =>
          route.fulfill({ json: { items: [plannedJob] } }),
        );
        await page.route('**/rest/v1/rpc/marketplace_read_listing_draft', (route) =>
          route.fulfill({ json: plannedDraft }),
        );
        await page.route('**/rest/v1/rpc/marketplace_save_listing_draft', (route) => {
          const body = route.request().postDataJSON();
          plannedDraft = {
            ...plannedDraft,
            content: body.p_content,
            revision: plannedDraft.revision + 1,
          };
          return route.fulfill({ json: plannedDraft });
        });
        await page.route('**/rest/v1/rpc/marketplace_set_listing_photo_options', (route) => {
          plannedDraft = {
            ...plannedDraft,
            photoOptions: route.request().postDataJSON().p_options,
            revision: plannedDraft.revision + 1,
          };
          return route.fulfill({ json: plannedDraft });
        });
        await page.route('**/rest/v1/rpc/marketplace_edit_relisting_plan', (route) => {
          const body = route.request().postDataJSON();
          edits.push(body.p_editing);
          plannedJob = {
            ...plannedJob,
            state: body.p_editing ? 'paused' : 'queued',
            errorCode: body.p_editing ? 'editing' : null,
            version: plannedJob.version + 1,
          };
          return route.fulfill({ json: plannedJob });
        });
        await page.route('**/rest/v1/rpc/marketplace_enqueue_relisting', (route) => {
          const body = route.request().postDataJSON();
          enqueues.push(body);
          acceptedDraft = plannedDraft;
          plannedJob = {
            ...plannedJob,
            id: '31',
            state: 'queued',
            errorCode: null,
            draftRevision: plannedDraft.revision,
            itemTitle: plannedDraft.content.title,
            scheduledAt: body.p_scheduled_at,
            timeZone: body.p_time_zone,
            version: 1,
            replacesJobId: '30',
          };
          return route.fulfill({ json: plannedJob });
        });
        await page.route('**/rest/v1/rpc/marketplace_read_listing_permission', (route) =>
          route.fulfill({
            json: { allowed: true, authorizationVersion: 1, executionMode: 'cloud' },
          }),
        );
        await page.route('**/functions/v1/vinted-brand-search', (route) =>
          route.fulfill({ json: { brands: [{ id: 254956, name: 'Jako' }] } }),
        );
        await page.route('**/marketplace-browser/healthz', (route) =>
          route.fulfill({
            json: { ok: true, readOnly: false, apiVersion: 2, listingPublishingEnabled: true },
          }),
        );
        await page.route('**/storage/v1/**', (route) =>
          route.request().method() === 'POST'
            ? route.fulfill({
                json: (route.request().postDataJSON().paths as string[]).map((path) => ({
                  path,
                  signedURL: `/object/sign/marketplace-listing-media/${path}?token=fixture`,
                  error: null,
                })),
              })
            : route.fulfill({ contentType: 'image/jpeg', body: photo }),
        );
        await page.clock.install();
        const importedResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/marketplace_read_snapshot') &&
            response.request().postDataJSON()?.p_connection_id === accountIds[0],
        );
        await page.goto('/marketplaces/vinted/listings');
        const imported = await (await importedResponse).json();
        const plan = wardrobe
          .locator('[data-relisting-plan]')
          .filter({ hasText: /Meine Schuhe|Neu geprüfte Schuhe/ });
        await expect(plan).toContainText('Wird in 5 Minuten relistet');
        await expect(plan.getByRole('button')).toHaveCount(4);
        const planImageBox = await plan.locator('app-product-thumbnail').boundingBox();
        const planStatusBox = await plan.getByRole('status').boundingBox();
        expect(Math.abs(planStatusBox!.y - planImageBox!.y - 8)).toBeLessThan(2);
        const plannedGridActions = await plan.locator('[data-listing-actions]').evaluate((bar) => {
          const card = bar.closest('article')!.getBoundingClientRect();
          const bounds = bar.getBoundingClientRect();
          return { height: bounds.height, offset: bounds.y - card.y, cardHeight: card.height };
        });
        expect(plannedGridActions).toEqual(gridActionsBefore);
        await expect(plan.locator('app-loading-indicator')).toHaveCount(0);
        await screenshot(page, `vinted-relist-countdown-${width}-${theme}`, wardrobe);
        await page.clock.fastForward(180000);
        await expect(plan).toContainText('Wird in 2 Minuten relistet');
        await page.clock.fastForward(120000);
        await expect(plan).toContainText('Wartet auf den Start');
        await expect(plan.locator('app-loading-indicator')).toHaveCount(0);
        plannedJob = { ...plannedJob, state: 'writing' };
        await page.clock.fastForward(5000);
        await expect(plan).toContainText('Wird inseriert');
        await expect(plan.locator('app-loading-indicator')).toBeVisible();
        for (const button of await plan.getByRole('button').all())
          await expect(button).toBeDisabled();
        expect((await plan.locator('[data-listing-actions]').boundingBox())!.height).toBe(
          gridActionsBefore.height,
        );
        await screenshot(page, `vinted-relist-running-${width}-${theme}`, wardrobe);
        plannedJob = {
          ...plannedJob,
          state: 'queued',
          scheduledAt: new Date((await page.evaluate(() => Date.now())) + 300000).toISOString(),
        };
        await page.clock.fastForward(5000);
        await expect(plan).toContainText('Wird in 5 Minuten relistet');
        await expect(
          wardrobe.getByRole('heading', {
            name: 'Noch keine Artikel im Kleiderschrank',
            exact: true,
          }),
        ).toHaveCount(0);
        await expect(
          wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }),
        ).toHaveCount(0);
        await wardrobe.getByRole('button', { name: 'Listenansicht', exact: true }).click();
        await expect(plan).toContainText('Wird in 5 Minuten relistet');
        await expect(wardrobe.locator('app-vinted-listings-table')).toBeVisible();
        await expect(plan.locator('[data-listing-actions]')).toBeVisible();
        expect((await plan.locator('[data-listing-actions]').boundingBox())!.height).toBe(
          listActionsBefore!.height,
        );
        expect((await plan.boundingBox())!.height).toBe(listRowBefore!.height);
        await test.info().attach('relist-action-layout', {
          contentType: 'application/json',
          body: JSON.stringify({
            width,
            theme,
            gridBefore: gridActionsBefore,
            gridPlanned: plannedGridActions,
            listActionHeightBefore: listActionsBefore!.height,
            listActionHeightPlanned: (await plan.locator('[data-listing-actions]').boundingBox())!
              .height,
            listRowHeightBefore: listRowBefore!.height,
            listRowHeightPlanned: (await plan.boundingBox())!.height,
          }),
        });
        await expect(
          wardrobe.getByRole('heading', {
            name: 'Noch keine Artikel im Kleiderschrank',
            exact: true,
          }),
        ).toHaveCount(0);
        await plan
          .getByRole('button', {
            name: `Planung für ${listing.content.title} bearbeiten`,
            exact: true,
          })
          .click();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          listing.content.title,
        );
        await page.keyboard.press('Escape');
        await expect(editor).toHaveCount(0);
        expect(edits).toEqual([true, false]);
        await plan
          .getByRole('button', {
            name: `Planung für ${listing.content.title} bearbeiten`,
            exact: true,
          })
          .click();
        await editor
          .getByRole('textbox', { name: 'Titel', exact: true })
          .fill('Neu geprüfte Schuhe');
        await expect(editor.getByRole('combobox', { name: 'Filter', exact: true })).toContainText(
          'Dunkler',
        );
        await expect(
          editor.getByRole('combobox', { name: 'Weißer Rahmen', exact: true }),
        ).toContainText('Klein');
        await editor.getByRole('combobox', { name: 'Filter', exact: true }).click();
        await page.getByRole('option', { name: 'Weicher', exact: true }).click();
        await editor.getByRole('combobox', { name: 'Weißer Rahmen', exact: true }).click();
        await page.getByRole('option', { name: 'Groß', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Geplantes Relisting', exact: true })
          .getByRole('button', { name: 'Änderungen speichern', exact: true })
          .click();
        await expect(editor).toHaveCount(0);
        expect(plannedDraft.content.priceCents).toBe(listing.content.priceCents);
        expect(plannedDraft.content.title).toBe('Neu geprüfte Schuhe');
        expect(plannedDraft.photoOptions).toMatchObject({ filter: 'soft', border: 'large' });
        expect(enqueues).toHaveLength(1);
        expect(enqueues[0]).toMatchObject({
          p_draft_id: '20',
          p_replaces_job_id: '30',
          p_delay_seconds: 0,
          p_time_zone: await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
        });
        await screenshot(page, `vinted-relist-planned-${width}-${theme}`, wardrobe);
        await checkPage(page, errors);
        plannedJob = {
          ...plannedJob,
          state: 'confirmed',
          externalId: '45678',
          providerState: 'active',
          verifiedAt: new Date().toISOString(),
        };
        await expect(plan).toContainText('Veröffentlicht', { timeout: 15000 });
        await expect(
          wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }),
        ).toHaveCount(0);
        let releaseImport!: () => void;
        const importReady = new Promise<void>((resolve) => {
          releaseImport = resolve;
        });
        await page.route('**/rest/v1/rpc/marketplace_read_snapshot', async (route) => {
          await importReady;
          return route.fulfill({
            json: {
              ...imported,
              publications: {
                items: [
                  {
                    ...imported.publications.items[0],
                    id: 'publication-new',
                    externalId: '45678',
                    title: 'Neu veröffentlicht',
                    price: 25.9,
                  },
                ],
                total: 1,
                nextCursor: null,
              },
            },
          });
        });
        const pendingImport = page.waitForRequest(
          (request) =>
            request.url().endsWith('/rpc/marketplace_read_snapshot') &&
            request.postDataJSON()?.p_connection_id === accountIds[0],
        );
        planVisible = false;
        await pendingImport;
        await expect(plan).toContainText('Veröffentlicht');
        await expect(
          wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }),
        ).toHaveCount(0);
        releaseImport();
        await expect(
          wardrobe.getByRole('button', { name: 'Neu veröffentlicht relisten', exact: true }),
        ).toBeVisible();
        await expect(plan).toHaveCount(0);
        await checkPage(page, errors);
      });
    });

for (const width of [390, 1440])
  for (const theme of ['light', 'dark'] as const) {
    test(`Inserat löschen wahrt Bestätigung und zeigt den Fortschritt bei ${width}px ${theme} @marketplace-preview`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const errors = await prepareListing(page, {
        title: 'Meine Schuhe',
        text: 'Sehr gut erhalten.',
        textState: 'loaded',
      });
      await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
      let calls = 0;
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => {
        finish = resolve;
      });
      await page.route('**/marketplace-browser/listings/delete', async (route) => {
        calls++;
        expect(route.request().postDataJSON()).toEqual({
          workspaceId,
          connectionId: accountIds[0],
          entryId,
        });
        if (calls === 1) return route.fulfill({ json: { status: 'outcome_unknown' } });
        await gate;
        return route.fulfill({ json: { status: 'confirmed' } });
      });
      await page.goto('/marketplaces/vinted/listings');
      const wardrobe = page.locator('app-vinted-listings');
      await expect(wardrobe.locator('app-listing-transfer-action')).toHaveCount(0);
      const remove = wardrobe.getByRole('button', { name: 'Meine Schuhe löschen', exact: true });
      await remove.click();
      const dialog = page.getByRole('dialog', { name: 'Inserat löschen?', exact: true });
      await screenshot(page, `vinted-delete-confirm-${width}-${theme}`, dialog);
      await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      expect(calls).toBe(0);
      await remove.click();
      await dialog.getByRole('button', { name: 'Löschen', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(remove).toBeVisible();
      await expect.poll(() => calls).toBe(1);
      const overview = page.locator('app-vinted-action-overview-menu');
      await expect(overview.getByRole('button', { name: /Laufende Aktionen/ })).toBeVisible();
      await expect(overview.locator('[data-action-overview-error]')).toHaveCount(1);
      await overview.getByRole('button', { name: /Laufende Aktionen/ }).click();
      await expect(page.getByText('Löschung · Meine Schuhe', { exact: true })).toBeVisible();
      await expect(
        page.getByText('Die Löschung wurde nicht bestätigt. Prüfe das Inserat bei Vinted.', {
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await remove.click();
      await dialog.getByRole('button', { name: 'Löschen', exact: true }).click();
      await expect(
        wardrobe.getByRole('status').filter({ hasText: 'Inserat wird gelöscht' }),
      ).toBeVisible();
      await screenshot(page, `vinted-delete-running-${width}-${theme}`, wardrobe);
      finish();
      await expect(remove).toHaveCount(0);
      expect(calls).toBe(2);
      await checkPage(page, errors);
    });
  }

test('Relist-Auftrag schließt das Modal und übernimmt Originale bis zur verzögerten Veröffentlichung @marketplace-preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const errors = await prepareListing(page, {
    title: 'Meine Schuhe',
    text: 'Sehr gut erhalten.',
    textState: 'loaded',
    imageUrls: ['https://images1.vinted.net/tc/relistTest/f800/1788288106.jpg'],
  });
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: {
        id: '25000000-0000-4000-8000-000000000001',
        email: 'marketplace@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: { flipbase_action_overview: true },
        created_at: '2026-09-26T00:00:00Z',
      },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_action_overview', (route) =>
    route.fulfill({
      json: {
        ok: true,
        workspaceId,
        connectionId: route.request().postDataJSON().p_connection_id,
        actions: [],
      },
    }),
  );
  const original = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#b6d5e8';
      context.fillRect(0, 0, 160, 200);
      return canvas.toDataURL('image/jpeg').split(',')[1];
    }),
    'base64',
  );
  const metadata = Buffer.from('Exif\0\0Flipbase-Relist-Original-Bytes', 'utf8');
  const segment = Buffer.alloc(metadata.length + 4);
  segment[0] = 255;
  segment[1] = 225;
  segment.writeUInt16BE(metadata.length + 2, 2);
  metadata.copy(segment, 4);
  const photo = Buffer.concat([original.subarray(0, 2), segment, original.subarray(2)]);
  const originalPath = `${workspaceId}/40/25000000-0000-4000-8000-000000000041.jpg`;
  const uploadPath = `${workspaceId}/70/25000000-0000-4000-8000-000000000071.jpg`;
  const createdAt = new Date().toISOString();
  const source: VintedListingDraft = {
    id: '40',
    workspaceId,
    connectionId: accountIds[0],
    revision: 1,
    content: { ...listingCurrentContentFixture().content, aiPhoto: false },
    images: [
      {
        id: '41',
        storagePath: originalPath,
        fileName: 'camera-original.jpg',
        mimeType: 'image/jpeg',
        byteSize: photo.length,
      },
    ],
    inventoryItemId: null,
    createdAt,
    updatedAt: createdAt,
  };
  let draft: VintedListingDraft = { ...source, id: '70', relistExternalId: '98765', images: [] };
  let job: VintedListingJob | null = null;
  const providerCalls: string[] = [];
  const uploadedPhotos: Buffer[] = [];
  const creations: Record<string, unknown>[] = [];
  const enqueues: Record<string, unknown>[] = [];
  let releaseCreation!: () => void;
  const blockedCreation = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  const currentListing = listingCurrentContentFixture();
  await page.route('**/marketplace-browser/listings/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    providerCalls.push(path);
    if (path.endsWith('/content/read'))
      return route.fulfill({
        json: {
          listing: {
            ...currentListing,
            externalAccountId: '100',
            aiPhoto: false,
            content: {
              ...currentListing.content,
              attributes: {
                accessory_department: '575',
                accessory_department_label: 'Herren',
              },
            },
            schema: {
              ...currentListing.schema,
              aiPhoto: false,
              fields: [
                ...currentListing.schema.fields,
                {
                  field: 'accessory_department',
                  sizeGroupId: null,
                  choices: [
                    {
                      id: 575,
                      label: 'Herren',
                      selected: true,
                      disabled: false,
                      sizeGroupId: null,
                    },
                  ],
                },
              ],
            },
          },
        },
      });
    return route.fulfill({ status: 500, json: { error: 'Ungeplanter Anbieterzugriff im Test' } });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_listing_photo_sources', (route) => {
    const body = route.request().postDataJSON();
    expect(body.p_workspace_id).toBe(workspaceId);
    return route.fulfill({
      json: {
        items:
          body.p_connection_id === accountIds[0] && body.p_external_ids.includes('98765')
            ? [{ externalId: '98765', draft: source }]
            : [],
      },
    });
  });
  await page.route('**/storage/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': '*' };
    if (request.method() === 'POST' && path.includes('/object/sign/'))
      return route.fulfill({
        headers,
        json: (request.postDataJSON().paths as string[]).map((path) => ({
          path,
          signedURL: `/object/sign/marketplace-listing-media/${path}?token=original`,
          error: null,
        })),
      });
    if (request.method() === 'GET')
      return route.fulfill({ headers, contentType: 'image/jpeg', body: photo });
    expect(request.method()).toBe('POST');
    expect(path).toBe(`/storage/v1/object/marketplace-listing-media/${uploadPath}`);
    const bytes = request.postDataBuffer();
    expect(bytes).not.toBeNull();
    const upload = new Request('http://fixture.test/upload', {
      method: 'POST',
      headers: { 'content-type': request.headers()['content-type'] },
      body: new Uint8Array(bytes!),
    });
    const form = await upload.formData();
    const file = Array.from(form.values()).find((value) => typeof value !== 'string');
    if (!file || typeof file === 'string') throw new Error('Privates Original fehlt im Upload.');
    const uploaded = Buffer.from(await file.arrayBuffer());
    expect(uploaded).toEqual(photo);
    uploadedPhotos.push(uploaded);
    return route.fulfill({ headers, json: { Key: `marketplace-listing-media/${uploadPath}` } });
  });
  await page.route('**/rest/v1/rpc/marketplace_create_relisting_draft', async (route) => {
    const body = route.request().postDataJSON();
    creations.push(body);
    expect(body).toMatchObject({
      p_workspace_id: workspaceId,
      p_connection_id: accountIds[0],
      p_external_id: '98765',
    });
    draft = { ...draft, content: body.p_content };
    await blockedCreation;
    return route.fulfill({ json: draft });
  });
  await page.route('**/rest/v1/rpc/marketplace_reserve_listing_image', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      p_draft_id: '70',
      p_file_name: 'camera-original.jpg',
      p_mime_type: 'image/jpeg',
      p_byte_size: photo.length,
    });
    return route.fulfill({ json: { id: '71', storagePath: uploadPath } });
  });
  await page.route('**/rest/v1/rpc/marketplace_commit_listing_image', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      p_draft_id: '70',
      p_expected_revision: 1,
      p_image_id: '71',
    });
    draft = {
      ...draft,
      images: [{ ...source.images[0], id: '71', storagePath: uploadPath }],
      revision: 2,
    };
    return route.fulfill({ json: draft });
  });
  await page.route('**/rest/v1/rpc/marketplace_set_listing_photo_options', (route) => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      p_draft_id: '70',
      p_expected_revision: 2,
      p_options: { resize: 1200, crops: {}, filter: 'soft', border: 'small' },
    });
    draft = { ...draft, photoOptions: body.p_options, revision: 3 };
    return route.fulfill({ json: draft });
  });
  await page.route('**/rest/v1/rpc/marketplace_read_listing_permission', (route) =>
    route.fulfill({ json: { allowed: true, authorizationVersion: 1, executionMode: 'cloud' } }),
  );
  await page.route('**/functions/v1/vinted-brand-search', (route) =>
    route.fulfill({ json: { brands: [{ id: 254956, name: 'Jako' }] } }),
  );
  await page.route('**/marketplace-browser/healthz', (route) =>
    route.fulfill({
      json: { ok: true, readOnly: false, apiVersion: 2, listingPublishingEnabled: true },
    }),
  );
  await page.route('**/rest/v1/rpc/marketplace_read_listing_jobs', (route) =>
    route.fulfill({ json: { items: job ? [job] : [] } }),
  );
  await page.route('**/rest/v1/rpc/marketplace_enqueue_relisting', (route) => {
    const body = route.request().postDataJSON();
    enqueues.push(body);
    expect(body).toEqual({
      p_draft_id: '70',
      p_expected_revision: 3,
      p_request_id: creations[0]['p_request_id'],
      p_ai_photo: false,
      p_delay_seconds: 300,
    });
    job = {
      id: '80',
      workspaceId,
      connectionId: accountIds[0],
      draftId: '70',
      draftRevision: draft.revision,
      relistExternalId: '98765',
      relistDeletedAt: null,
      relistDelaySeconds: 300,
      itemTitle: draft.content.title,
      externalAccountId: '100',
      executionMode: 'cloud',
      action: 'publish',
      state: 'queued',
      version: 1,
      scheduledAt: null,
      timeZone: null,
      latePolicy: 'pause_after_30_minutes',
      errorCode: null,
      externalId: null,
      providerState: null,
      verifiedAt: null,
      createdAt,
      updatedAt: createdAt,
      replacesJobId: null,
    };
    return route.fulfill({ json: job });
  });
  await page.goto('/marketplaces/vinted/listings');
  const wardrobe = page.locator('app-vinted-listings');
  const cover = wardrobe.locator('app-product-thumbnail img');
  await expect(cover).toHaveAttribute('src', new RegExp(originalPath));
  await wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }).click();
  const editor = page.locator('app-vinted-listing-editor');
  await expect(editor.getByRole('textbox', { name: 'Beschreibung', exact: true })).toHaveValue(
    'Sehr gut erhalten.',
  );
  expect(providerCalls).toEqual([]);
  expect(creations).toEqual([]);
  await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('Neu geprüfte Schuhe');
  await editor
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill('Vor dem Relisten angepasster Text.');
  for (const [label, option] of [
    ['Auflösung', '1200 Pixel'],
    ['Filter', 'Weicher'],
    ['Weißer Rahmen', 'Klein'],
    ['Veröffentlichungszeitpunkt', 'Verzögert relisten'],
    ['Wartezeit', '5 Min.'],
  ]) {
    await editor.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  await expect(editor.locator('app-vinted-listing-photo-preview img')).toHaveJSProperty(
    'naturalHeight',
    1200,
  );
  await page
    .getByRole('dialog', { name: 'Artikel relisten', exact: true })
    .locator('footer')
    .getByRole('button', { name: 'Relisten', exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => creations.length).toBe(1);
  expect(uploadedPhotos).toEqual([]);
  expect(enqueues).toEqual([]);
  await expect(wardrobe.locator('article[aria-busy="true"]')).toContainText(
    'Relisting wird vorbereitet',
  );
  await expect(page.locator('[data-action-overview-spinner]')).toBeVisible();
  await page
    .locator('app-vinted-action-overview-menu')
    .getByRole('button', { name: /Laufende Aktionen/ })
    .click();
  await expect(page.getByText('Relisting · Meine Schuhe', { exact: true })).toBeVisible();
  releaseCreation();
  await expect.poll(() => enqueues.length).toBe(1);
  const overview = page.locator('app-vinted-listing-action-overview');
  await expect(overview).toContainText('Neu geprüfte Schuhe');
  await expect(overview).toContainText('Wird vorbereitet');
  await expect(page.locator('[data-action-overview-error]')).toHaveCount(0);
  expect(draft.content).toMatchObject({
    title: 'Neu geprüfte Schuhe',
    description: 'Vor dem Relisten angepasster Text.',
    attributes: {
      accessory_department: '575',
      accessory_department_label: 'Herren',
      flipbaseListingForm: '1',
    },
  });
  expect(uploadedPhotos).toHaveLength(1);
  expect(uploadedPhotos[0]).toEqual(photo);
  expect(uploadedPhotos[0].includes(metadata)).toBe(true);
  expect(source.images[0].storagePath).toBe(originalPath);
  await expect(cover).toHaveAttribute('src', new RegExp(originalPath));
  expect(providerCalls).toEqual(['/marketplace-browser/listings/content/read']);
  await checkPage(page, errors);
});

import axe from 'axe-core';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  accountIds,
  emptyPage,
  mockMarketplace,
  workspaceId,
} from './support/marketplace-account-fixture';
import { listingCurrentContentFixture } from '../services/marketplace-worker/test/fixtures/vinted-listing-current-content';
import { emptyVintedListingContent } from '../src/app/features/marketplaces/models/vinted-listing-content';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', hasTouch: true });

const entryId = 'publication-1';
const images = [
  'https://images.example.test/listing-portrait.svg',
  'https://images.example.test/listing-landscape.svg',
  'https://images.example.test/listing-broken.svg',
];
const detailPath = `/marketplaces/vinted/listings/${accountIds[0]}/${entryId}`;

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
      await expect(detail).toContainText('Die Änderung wurde bei Vinted bestätigt.');
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
  title: string;
  text: string | null;
  textState: 'loaded' | 'not_loaded';
  occurredAt?: string | null;
  createdAt?: string | null;
  publicationState?: 'active' | 'reserved' | 'draft' | 'hidden' | 'ended' | 'unknown';
  imageUrls?: readonly string[];
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
  const entry = {
    id: entryId,
    externalId: '98765',
    publicationState: 'active',
    ...listing,
    price: 29.9,
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
      await page.route('**/rest/v1/rpc/marketplace_read_listing_metric_changes', (route) =>
        route.fulfill({
          json: {
            workspaceId,
            connectionId: accountIds[0],
            periodMinutes: 5,
            items: [
              {
                entryId,
                observedAt: '2026-10-15T12:00:00Z',
                baselineAt: '2026-10-15T11:55:00Z',
                views: 12,
                favorites: 3,
              },
            ],
          },
        }),
      );
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
      await page.locator('app-vinted-listing-detail summary').click();
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

test('Fehlende Beschreibung lädt nur das gewählte Inserat und bleibt beim Wiederöffnen im Sitzungscache @marketplace-preview @core-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const title = 'Inserat mit separat geladener Beschreibung';
  const errors = await prepareListing(page, { title, text: null, textState: 'not_loaded' });
  const reads: Record<string, unknown>[] = [];
  let release!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/marketplace-browser/listings/edit/read', async (route) => {
    reads.push(route.request().postDataJSON() as Record<string, unknown>);
    await responseReady;
    await route.fulfill({
      json: {
        fields: { title, description: 'Gezielt geladener Beschreibungstext.', price: '29.90' },
        cache: 'pending',
      },
    });
  });
  await page.goto(detailPath);
  const detail = page.locator('app-vinted-listing-detail');
  await expect(detail).toContainText('Beschreibung wird von Vinted geladen');
  await expect(detail.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeEnabled();
  expect(reads).toEqual([{ workspaceId, connectionId: accountIds[0], entryId }]);
  release();
  await expect(detail).toContainText('Gezielt geladener Beschreibungstext.');
  await expect(detail).toContainText('Ihre dauerhafte Speicherung steht noch aus.');
  await detail.getByRole('link', { name: 'Zurück zu Inseraten', exact: true }).click();
  await page.getByRole('link', { name: `Inserat ${title} öffnen`, exact: true }).click();
  await expect(detail).toContainText('Gezielt geladener Beschreibungstext.');
  await expect(detail).toContainText('Ihre dauerhafte Speicherung steht noch aus.');
  await expect(detail).not.toContainText('Beschreibung wird von Vinted geladen');
  expect(reads).toHaveLength(1);
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
        const busyCard = wardrobe.locator('[data-listing-row][aria-busy="true"]');
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
    expect(reads).toEqual([{ workspaceId, connectionId: accountIds[0], entryId }]);
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
    await save.click();
    await expect(detail.getByRole('alert')).toContainText('inzwischen bei Vinted geändert');
    await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Neue Schuhe');
    await save.click();
    await expect(detail).toContainText('Die Änderung wurde bei Vinted bestätigt.');
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
        await page.route('**/marketplace-browser/listings/content/read', (route) =>
          route.fulfill({ json: { listing } }),
        );
        await page.route('https://images1.vinted.net/tc/relistTest/f800/1788288106.jpg', (route) =>
          route.fulfill({
            contentType: 'image/jpeg',
            headers: { 'access-control-allow-origin': '*' },
            body: photo,
          }),
        );
        await page.route('**/rest/v1/vinted_category_syncs*', (route) =>
          route.fulfill({
            json: {
              id: 1,
              refreshed_at: '2026-11-02T00:00:00Z',
              requested_at: null,
              last_attempt_at: null,
              category_count: 1,
              last_error: null,
            },
          }),
        );
        await page.route('**/rest/v1/vinted_categories*', (route) =>
          route.fulfill({
            json:
              Number(new URL(route.request().url()).searchParams.get('offset') ?? 0) > 0
                ? []
                : [{ id: 2738, parent_id: null, title: 'Fußballschuhe', path: 'Fußballschuhe' }],
          }),
        );
        await page.goto('/marketplaces/vinted/listings');
        const wardrobe = page.locator('app-vinted-listings');
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
          listing.content.title,
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
        ).toHaveValue(listing.content.description);
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
            .locator('header')
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
          listing.content.title,
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
          editor.getByRole('button', { name: 'Jetzt veröffentlichen', exact: true }),
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
            headers: { 'access-control-allow-origin': '*' },
            body: original,
          }),
        );
        await wardrobe.getByRole('button', { name: 'Meine Schuhe relisten', exact: true }).click();
        await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveValue(
          listing.content.title,
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
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
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
        await expect(plan).toContainText('Veröffentlichung geplant für');
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
        await expect(plan).toContainText('Veröffentlichung geplant für');
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

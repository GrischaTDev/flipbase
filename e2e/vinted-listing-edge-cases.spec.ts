import axe from 'axe-core';
import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  accountIds,
  emptyPage,
  mockMarketplace,
  workspaceId,
} from './support/marketplace-account-fixture';
import { listingCurrentContentFixture } from '../services/marketplace-worker/test/fixtures/vinted-listing-current-content';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

const entryId = 'publication-1';
const images = [
  'https://images.example.test/listing-portrait.svg',
  'https://images.example.test/listing-landscape.svg',
  'https://images.example.test/listing-broken.svg',
];
const detailPath = `/marketplaces/vinted/listings/${accountIds[0]}/${entryId}`;

interface ListingFixture {
  title: string;
  text: string | null;
  textState: 'loaded' | 'not_loaded';
  externalId?: string;
}

async function prepareListing(page: Page, listing: ListingFixture) {
  await mockMarketplace(page, true, false, false, false, []);
  const entry = {
    id: entryId,
    ...listing,
    price: 29.9,
    currency: 'EUR',
    imageUrl: images[0],
    imageUrls: images,
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
  await page.route('**/rest/v1/marketplace_account_entries**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('workspace_id')).toBe(`eq.${workspaceId}`);
    expect(query.get('connection_id')).toBe(`eq.${accountIds[0]}`);
    expect(query.get('kind')).toBe('eq.publication');
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

async function screenshot(page: Page, name: string) {
  const directory = process.env['MARKETPLACE_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
}

async function checkPage(page: Page, runtimeErrors: string[]) {
  await expect(page).toHaveTitle(/Flipbase/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(runtimeErrors).toEqual([]);
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
    const photo = detail.locator('app-product-thumbnail').first();
    const frame = photo.locator(':scope > span');
    const image = photo.locator('img');
    for (const [number, expectedWidth, expectedHeight] of [
      [1, 300, 1200],
      [2, 1200, 300],
    ]) {
      await detail.getByRole('button', { name: `Foto ${number} anzeigen`, exact: true }).click();
      await expect(image).toHaveAttribute('src', images[number - 1]);
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBe(expectedWidth);
      expect(await image.evaluate((node) => (node as HTMLImageElement).naturalHeight)).toBe(
        expectedHeight,
      );
      expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe('contain');
      const bounds = await frame.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThanOrEqual(360);
      expect(bounds!.height).toBe(width < 640 ? 260 : 420);
      await checkPage(page, errors);
      await screenshot(page, `vinted-listing-${width}-${number === 1 ? 'portrait' : 'landscape'}`);
    }
    const previousBounds = await frame.boundingBox();
    await detail.getByRole('button', { name: 'Foto 3 anzeigen', exact: true }).click();
    await expect(photo.locator('[data-product-placeholder]')).toHaveAttribute('aria-label', title);
    await expect(image).toHaveCount(0);
    const failedBounds = await frame.boundingBox();
    expect(failedBounds!.width).toBe(previousBounds!.width);
    expect(failedBounds!.height).toBe(previousBounds!.height);
    await checkPage(page, errors);
    await screenshot(page, `vinted-listing-${width}-image-fallback`);
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
  await expect(detail.getByRole('button', { name: 'Bearbeiten', exact: true })).toBeDisabled();
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

for (const width of [1440, 390]) {
  test(`Bestehendes Inserat vollständig bearbeiten und nur nach Vinted-Bestätigung übernehmen bei ${width}px @marketplace-preview`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await prepareListing(page, {
      title: 'Meine Schuhe',
      text: 'Sehr gut erhalten.',
      textState: 'loaded',
      externalId: '98765',
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
    await expect(detail.getByLabel('Titel')).toHaveValue('Meine Schuhe');
    await expect(detail.getByLabel('Preis in Euro')).toHaveValue('20,50');
    const colors = detail.getByRole('group', { name: 'Farben' });
    await expect(colors.getByRole('checkbox', { name: 'Blau' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Zwei Farben sind bereits gewählt; eine dritte lässt Vinted nicht zu.
    await expect(colors.getByRole('checkbox', { name: 'Rot' })).toBeDisabled();
    await colors.getByRole('checkbox', { name: 'Gelb' }).click();
    await colors.getByRole('checkbox', { name: 'Rot' }).click();
    await detail.getByLabel('Titel').fill('Neue Schuhe');
    await detail.getByLabel('Preis in Euro').fill('18');
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () =>
      (
        await (window as Window & { axe: typeof axe }).axe.run(
          document.querySelector('app-vinted-listing-detail')!,
        )
      ).violations.map((violation) => violation.id),
    );
    expect(violations).toEqual([]);
    await screenshot(page, `vinted-listing-edit-${width}`);
    const save = detail.getByRole('button', { name: 'Bei Vinted speichern', exact: true });
    await save.click();
    await expect(detail.getByRole('alert')).toContainText('inzwischen bei Vinted geändert');
    await expect(detail.getByLabel('Titel')).toHaveValue('Neue Schuhe');
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
    });
    await checkPage(page, errors);
  });
}

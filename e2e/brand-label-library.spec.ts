import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page, type Locator } from '@playwright/test';
import axe from 'axe-core';
import {
  assertLocalSupabaseUrl,
  createAnonClient,
  createLocalAdminClient,
  createUserClient,
  supabaseUrl,
} from './support/local-supabase';
import { AUTH_STORAGE_KEY } from './support/test-account';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

const apiUrl = assertLocalSupabaseUrl(process.env['BRAND_LABEL_TEST_API_URL'] ?? supabaseUrl);
const mediaUrl = process.env['BRAND_LABEL_TEST_MEDIA_URL'];
if (mediaUrl) assertLocalSupabaseUrl(mediaUrl);

async function captureReferenceScreenshot(page: Page, filename: string): Promise<void> {
  const directory = process.env['BRAND_LABEL_SCREENSHOT_DIR'];
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, filename), fullPage: true });
}

function forwardLocalFetch(): () => void {
  const original = globalThis.fetch;
  if (apiUrl === supabaseUrl) return () => undefined;
  globalThis.fetch = (input, init) => {
    const source = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (source.origin === new URL(supabaseUrl).origin) {
      source.protocol = new URL(apiUrl).protocol;
      source.host = new URL(apiUrl).host;
      return original(input instanceof Request ? new Request(source, input) : source, init);
    }
    return original(input, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}
async function forwardPage(page: Page) {
  if (apiUrl === supabaseUrl && !mediaUrl) return;
  await page.route(new URL(supabaseUrl).origin + '/**', async (route) => {
    const source = new URL(route.request().url());
    const target =
      source.pathname === '/functions/v1/brand-label-media' && mediaUrl
        ? new URL(mediaUrl)
        : new URL(apiUrl);
    assertLocalSupabaseUrl(target.href);
    target.pathname = source.pathname;
    target.search = source.search;
    const response = await route.fetch({ url: target.href });
    await route.fulfill({ response });
  });
}
function syntheticPng(): Buffer {
  const crc = (buffer: Buffer) => {
    let value = 0xffffffff;
    for (const byte of buffer) {
      value ^= byte;
      for (let index = 0; index < 8; index++)
        value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, content: Buffer) => {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(content.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(Buffer.concat([name, content])));
    return Buffer.concat([length, name, content, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8, 0);
  header.writeUInt32BE(8, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(8 * (1 + 8 * 3));
  for (let row = 0; row < 8; row++) {
    const offset = row * 25;
    for (let column = 0; column < 8; column++) {
      pixels[offset + 1 + column * 3] = 80;
      pixels[offset + 2 + column * 3] = 120;
      pixels[offset + 3 + column * 3] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
async function chooseOption(page: Page, combobox: Locator, label: string) {
  await combobox.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function expectLoadedImage(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
}
async function checkAccessibility(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (selector) => {
    const runtime = window as Window & { axe: typeof axe };
    const result = await runtime.axe.run(document.querySelector(selector) ?? document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target),
    }));
  }, selector);
  expect(violations).toEqual([]);
}

test('pflegt und veröffentlicht echte Label- und Größenreferenzen mit freigegebenen Bildern @core-smoke', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(300000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  if (!baseURL) throw new Error('Local app URL required');
  assertLocalSupabaseUrl(baseURL);
  const restoreFetch = forwardLocalFetch();
  const suffix = randomUUID().slice(0, 8);
  const name = 'E2E Referenzmarke ' + suffix;
  const slug = 'e2e-referenz-' + suffix;
  const title = 'Synthetisches Referenzlabel ' + suffix;
  const sizeTitle = 'Synthetische Hosengrößen ' + suffix;
  const line = 'Testlinie ' + suffix;
  const password = 'Local-reference-' + randomUUID();
  const admin = createLocalAdminClient();
  let readerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    const createAccount = async (role: 'operator' | 'reader') => {
      const email = `reference-${role}-${suffix}@flipbase.local`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      const user = created.data.user;
      if (!user) throw new Error('Local test user missing');
      if (role === 'operator')
        expect(
          (await admin.from('platform_operators').insert({ user_id: user.id })).error,
        ).toBeNull();
      const membership = await admin
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();
      expect(membership.error).toBeNull();
      if (!membership.data) throw new Error('Local workspace missing');
      expect(
        (
          await admin
            .from('workspaces')
            .update({ setup_completed_at: new Date().toISOString() })
            .eq('id', membership.data.workspace_id)
        ).error,
      ).toBeNull();
      const login = await createAnonClient().auth.signInWithPassword({ email, password });
      expect(login.error).toBeNull();
      if (!login.data.session) throw new Error('Local session missing');
      return { session: login.data.session, workspaceId: String(membership.data.workspace_id) };
    };
    const operator = await createAccount('operator');
    const reader = await createAccount('reader');
    const operatorClient = createUserClient(operator.session.access_token);
    const closed = await operatorClient.rpc('set_label_library_enabled', {
      p_enabled: false,
      p_request_id: randomUUID(),
    });
    expect(closed.error).toBeNull();
    await forwardPage(page);
    await page.addInitScript(
      ({ key, session, workspaceId }) => {
        localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem('flipbase_active_workspace_id', workspaceId);
      },
      { key: AUTH_STORAGE_KEY, ...operator },
    );
    page.on('dialog', (dialog) => void dialog.accept());
    await test.step('Marke und Linie über die echte Redaktion anlegen', async () => {
      await page.goto('/tools/brand-labels/admin/brands');
      await page.getByRole('button', { name: 'Marke hinzufügen', exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
      await page
        .getByRole('textbox', { name: 'Kurzbezeichnung für Links', exact: true })
        .fill(slug);
      await page.getByRole('button', { name: 'Speichern', exact: true }).click();
      const row = page.getByRole('row').filter({ hasText: name });
      await expect(row).toBeVisible();
      await row
        .getByRole('button', { name: 'Markenlinie für ' + name + ' hinzufügen', exact: true })
        .click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(line);
      await page.getByRole('button', { name: 'Speichern', exact: true }).click();
      await expect(row).toContainText(line);
    });
    await test.step('Echtes synthetisches PNG verarbeiten und Bildrechte bestätigen', async () => {
      await page.goto('/tools/brand-labels/admin/images');
      await page.locator('input[type=file]').setInputFiles({
        name: 'synthetic-reference.png',
        mimeType: 'image/png',
        buffer: syntheticPng(),
      });
      await page
        .getByRole('textbox', { name: 'Bildnachweis', exact: true })
        .fill('E2E eigene synthetische Aufnahme ' + suffix);
      await page
        .getByRole('textbox', { name: 'Erlaubte Verwendung', exact: true })
        .fill('E2E Referenztest; eigene synthetische Grafik');
      await page.getByRole('button', { name: 'Bild mit Freigabe hinzufügen', exact: true }).click();
      await expect(page.getByText('Bildänderung gespeichert.', { exact: true })).toBeVisible();
      await expectLoadedImage(page.locator('app-label-images img').first());
    });
    await test.step('Vollständigen Labelentwurf speichern, prüfen und veröffentlichen', async () => {
      await page.goto('/tools/brand-labels/admin');
      await chooseOption(
        page,
        page.getByRole('combobox', { name: 'Marke für neues Label', exact: true }),
        name,
      );
      await page.getByRole('button', { name: 'Label anlegen', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/labels\/\d+$/);
      await page.getByRole('textbox', { name: 'Titel', exact: true }).fill(title);
      await chooseOption(
        page,
        page.getByRole('combobox', { name: 'Markenlinie', exact: true }),
        line,
      );
      await chooseOption(
        page,
        page.getByRole('combobox', { name: 'Labelart', exact: true }),
        'Nackenlabel',
      );
      await page
        .getByRole('textbox', { name: 'Zusammenfassung der Datierung', exact: true })
        .fill('Nicht datiert; synthetische E2E-Referenz');
      await page
        .getByRole('textbox', { name: 'Merkmale (ein Merkmal pro Zeile)', exact: true })
        .fill('Synthetische blaue Fläche');
      await page
        .getByRole('textbox', {
          name: 'Grenzen und Unsicherheiten (eine Angabe pro Zeile)',
          exact: true,
        })
        .fill('Keine historische Datierung; nur synthetische Testreferenz');
      await page
        .getByRole('textbox', { name: 'Prüfdatum (JJJJ-MM-TT)', exact: true })
        .fill('2026-10-08');
      await page.getByRole('button', { name: 'Quelle hinzufügen', exact: true }).click();
      await page.getByRole('textbox', { name: 'Quellenkennung', exact: true }).fill('testquelle');
      await page
        .getByRole('textbox', { name: 'Titel der Quelle', exact: true })
        .fill('Synthetische E2E-Quelle');
      await page.getByRole('textbox', { name: 'Herausgeber', exact: true }).fill('E2E');
      await page
        .getByRole('textbox', { name: 'Quellen-URL', exact: true })
        .fill('https://example.com/reference');
      await page
        .getByRole('textbox', { name: 'Abrufdatum (JJJJ-MM-TT)', exact: true })
        .fill('2026-10-08');
      await page
        .getByRole('textbox', { name: 'Fundstelle / Seite', exact: true })
        .fill('Synthetische Testseite 1');
      await page.getByRole('button', { name: 'Prüfhilfe hinzufügen', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Prüfhinweis', exact: true })
        .fill('Vergleiche den synthetischen Farbton.');
      await page
        .getByRole('textbox', { name: 'Quellenkennungen (eine pro Zeile)', exact: true })
        .fill('testquelle');
      await page
        .getByRole('combobox', { name: 'Freigegebenes Bild zuordnen', exact: true })
        .click();
      await page
        .getByRole('option')
        .filter({ hasText: 'E2E eigene synthetische Aufnahme ' + suffix })
        .click();
      await page.getByRole('button', { name: 'Bild zuordnen', exact: true }).click();
      await page
        .getByRole('textbox', { name: 'Bildunterschrift', exact: true })
        .fill('Synthetische Referenzaufnahme');
      await page
        .getByRole('textbox', { name: 'Alternativtext', exact: true })
        .fill('Synthetisches blaues Testetikett');
      await page
        .getByRole('textbox', { name: 'Referenzstück', exact: true })
        .fill('Synthetisches Teststück');
      await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
      await expect(page.getByText('Auftrag bestätigt.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Zur Prüfung geben', exact: true }).click();
      await expect(page.getByText(/Entwurfversion \d+ · In Prüfung/)).toBeVisible();
      await page.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
      await expect(page.getByText(/Veröffentlichung vorhanden/)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Bearbeitung beginnen', exact: true }),
      ).toBeVisible();
    });
    await test.step('Größentabelle als Entwurf und anschließend ausdrücklich veröffentlichen', async () => {
      await page.goto('/tools/brand-labels/admin/sizes');
      await page.getByRole('button', { name: 'Tabelle anlegen', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Titel', exact: true }).fill(sizeTitle);
      await chooseOption(
        page,
        dialog.getByRole('combobox', { name: 'Referenzmarke', exact: true }),
        name,
      );
      await dialog
        .getByRole('textbox', { name: 'Spaltenüberschriften', exact: true })
        .fill('EU; Bundumfang (cm); Innenbeinlänge (cm)');
      await dialog
        .getByRole('textbox', { name: 'Tabellenwerte', exact: true })
        .fill('34; 72-76; 81\n36; 76-80; 82');
      await dialog
        .getByRole('textbox', { name: 'Hinweise und Grenzen', exact: true })
        .fill('Synthetische Größenwerte, keine allgemeine Umrechnung.');
      await dialog
        .getByRole('textbox', { name: 'Quelle', exact: true })
        .fill('Synthetische E2E-Größenquelle');
      await dialog
        .getByRole('textbox', { name: 'Quellenlink', exact: true })
        .fill('https://example.com/sizes');
      await dialog
        .getByRole('textbox', { name: 'Redaktionell geprüft am', exact: true })
        .fill('2026-10-08');
      await dialog.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const card = page
        .locator('app-card')
        .filter({ has: page.getByRole('heading', { name: sizeTitle, exact: true }) })
        .first();
      await expect(card).toContainText('Entwurf');
      await card.getByRole('button', { name: 'Größentabelle bearbeiten', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Veröffentlichen', exact: true })
        .click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(card).toContainText('Veröffentlicht');
    });
    readerContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
      serviceWorkers: 'block',
    });
    const readerPage = await readerContext.newPage();
    readerPage.on('pageerror', (error) => pageErrors.push(error.message));
    await forwardPage(readerPage);
    await readerPage.addInitScript(
      ({ key, session, workspaceId }) => {
        localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem('flipbase_active_workspace_id', workspaceId);
      },
      { key: AUTH_STORAGE_KEY, ...reader },
    );
    await test.step('Leserbereich bleibt bis zur ausdrücklichen Öffnung geschlossen', async () => {
      await readerPage.goto('/tools/brand-labels');
      await expect(
        readerPage.getByRole('heading', {
          name: 'Labelbibliothek noch nicht verfügbar',
          exact: true,
        }),
      ).toBeVisible();
      await page.goto('/tools/brand-labels/admin');
      await page.getByRole('button', { name: 'Für Leser öffnen', exact: true }).click();
      await expect(page.getByText('Bibliothek für Leser geöffnet.', { exact: true })).toBeVisible();
      await readerPage.getByRole('button', { name: 'Erneut prüfen', exact: true }).click();
      await expect(readerPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    });
    await test.step('Leser sehen echte Bilder, Quellen, Größenfilter und zugängliche mobile Seiten', async () => {
      await chooseOption(
        readerPage,
        readerPage.getByRole('combobox', { name: 'Marke', exact: true }),
        name,
      );
      await readerPage.getByRole('button', { name: 'Suchen', exact: true }).click();
      await expectLoadedImage(readerPage.locator('app-label-library img').first());
      await readerPage.getByRole('link', { name: title + ' ansehen', exact: true }).click();
      await expect(readerPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expectLoadedImage(
        readerPage.getByRole('img', { name: 'Synthetisches blaues Testetikett', exact: true }),
      );
      await expect(
        readerPage.getByRole('link', { name: 'Synthetische E2E-Quelle', exact: true }),
      ).toBeVisible();
      await expect(
        readerPage.getByRole('link', { name: 'Quelle testquelle', exact: true }),
      ).toHaveAttribute('href', /\/tools\/brand-labels\/[^#]+#label-source-testquelle$/);
      const detailPathname = new URL(readerPage.url()).pathname;
      await readerPage.getByRole('link', { name: 'Quelle testquelle', exact: true }).click();
      await expect(readerPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect
        .poll(() => {
          const sourceUrl = new URL(readerPage.url());
          return { pathname: sourceUrl.pathname, fragment: sourceUrl.hash };
        })
        .toEqual({ pathname: detailPathname, fragment: '#label-source-testquelle' });
      await expect(readerPage.locator('#label-source-testquelle')).toBeVisible();
      await captureReferenceScreenshot(readerPage, 'local-reference-reader-label.png');
      await readerPage.setViewportSize({ width: 390, height: 844 });
      await readerPage
        .getByRole('button', {
          name: 'Referenzbild vergrößern: Synthetisches blaues Testetikett',
          exact: true,
        })
        .click();
      const imageDialog = readerPage.getByRole('dialog', { name: 'Referenzbild', exact: true });
      await expect(imageDialog).toBeVisible();
      await expectLoadedImage(
        imageDialog.getByRole('img', { name: 'Synthetisches blaues Testetikett', exact: true }),
      );
      await checkAccessibility(readerPage, '[role="dialog"]');
      expect(
        await readerPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await imageDialog.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(imageDialog).not.toBeVisible();
      await checkAccessibility(readerPage, 'app-label-detail');
      expect(
        await readerPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      await readerPage.goto('/tools/brand-labels/sizes');
      await expect(readerPage.getByRole('heading', { name: sizeTitle, exact: true })).toBeVisible();
      await chooseOption(
        readerPage,
        readerPage.getByRole('combobox', { name: 'Kategorie', exact: true }),
        'Schuhe',
      );
      await expect(
        readerPage.getByRole('heading', { name: sizeTitle, exact: true }),
      ).not.toBeVisible();
      await chooseOption(
        readerPage,
        readerPage.getByRole('combobox', { name: 'Kategorie', exact: true }),
        'Hosen',
      );
      await chooseOption(
        readerPage,
        readerPage.getByRole('combobox', { name: 'Marke', exact: true }),
        name,
      );
      await expect(readerPage.getByRole('heading', { name: sizeTitle, exact: true })).toBeVisible();
      await checkAccessibility(readerPage, 'app-size-library');
      await captureReferenceScreenshot(readerPage, 'local-reference-reader-sizes.png');
      expect(
        await readerPage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
    });
    await test.step('Widerruf des Bildrechts entfernt betroffene Labels aus der Leseransicht', async () => {
      await page.goto('/tools/brand-labels/admin/images');
      const card = page
        .locator('app-card')
        .filter({
          has: page.getByRole('heading', {
            name: 'E2E eigene synthetische Aufnahme ' + suffix,
            exact: true,
          }),
        })
        .first();
      await card.getByRole('button', { name: 'Bildfreigabe widerrufen', exact: true }).click();
      await expect(card).toContainText('Widerrufen');
      await readerPage.goto('/tools/brand-labels?brand=' + slug);
      await expect(
        readerPage.getByRole('heading', {
          name: 'Keine veröffentlichten Labels gefunden',
          exact: true,
        }),
      ).toBeVisible();
      await expect(readerPage.getByRole('heading', { name: title, exact: true })).not.toBeVisible();
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await readerContext?.close();
    restoreFetch();
  }
});

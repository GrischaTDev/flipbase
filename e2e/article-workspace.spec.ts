import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

async function checkAccessibility(page: Page, selector: string): Promise<void> {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (selector) => {
    const target = document.querySelector(selector);
    if (!target) throw new Error('Prüfbereich fehlt');
    return (await (window as unknown as { axe: typeof axe }).axe.run(target)).violations;
  }, selector);
  expect(violations).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`Artikel öffnen, bearbeiten und zum Bestand wechseln ${theme} ${width}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await startDemoMode(page);
      await page.goto('/catalog');
      const navigation = page.getByRole('navigation', { name: 'Artikelansichten' });
      await expect(
        navigation.getByRole('link', { name: 'Alle Artikel', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await page.getByRole('link', { name: 'Artikel erstellen', exact: true }).click();
      const dialog = page.locator('app-product-detail');
      await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Prüfkonsole');
      await dialog.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
      await expect(page).toHaveURL(/\/catalog\/[^/?]+$/);
      const detail = page.locator('app-product-detail');
      await expect(detail.getByRole('heading', { name: 'Prüfkonsole', exact: true })).toBeVisible();
      const before = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('flipbase_local_catalog_products') ?? '[]') as {
            id: string;
            title: string;
          }[],
      );
      await detail
        .getByRole('textbox', { name: 'Name', exact: true })
        .fill('Prüfkonsole aktualisiert');
      await detail
        .getByRole('textbox', { name: 'Beschreibung', exact: true })
        .fill('Beschreibung bleibt nach dem erneuten Öffnen erhalten.');
      await detail.getByRole('button', { name: 'Speichern', exact: true }).click();
      await expect(
        detail.getByRole('heading', { name: 'Prüfkonsole aktualisiert', exact: true }),
      ).toBeVisible();
      await expect(detail.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
      const after = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('flipbase_local_catalog_products') ?? '[]') as {
            id: string;
            title: string;
            description?: string;
          }[],
      );
      expect(after).toHaveLength(before.length);
      expect(after.find((product) => product.title === 'Prüfkonsole aktualisiert')).toMatchObject({
        id: before.find((product) => product.title === 'Prüfkonsole')?.id,
        description: 'Beschreibung bleibt nach dem erneuten Öffnen erhalten.',
      });
      await checkAccessibility(page, 'app-product-detail');
      await page.screenshot({ path: testInfo.outputPath(`article-detail-${theme}-${width}.png`) });
      await navigation.getByRole('link', { name: 'Alle Artikel', exact: true }).click();
      const search = page.getByRole('searchbox', { name: 'Artikel durchsuchen', exact: true });
      await search.fill('Prüfkonsole');
      const articleLink = page.getByRole('link', { name: 'Prüfkonsole aktualisiert', exact: true });
      await articleLink.focus();
      await articleLink.press('Enter');
      await expect(detail.getByRole('textbox', { name: 'Beschreibung', exact: true })).toHaveValue(
        'Beschreibung bleibt nach dem erneuten Öffnen erhalten.',
      );
      await detail.getByRole('link', { name: 'Zur Artikelliste', exact: true }).click();
      await expect(search).toHaveValue('Prüfkonsole');
      await search.clear();
      await checkAccessibility(page, 'app-catalog');
      await navigation.getByRole('link', { name: 'Bestand', exact: true }).click();
      await expect(page).toHaveURL(/\/inventory$/);
      await expect(navigation.getByRole('link', { name: 'Bestand', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(
        page.getByRole('button', { name: 'Produkt erstellen', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Einkauf erfassen', exact: true })).toBeVisible();
      if (width === 1440) {
        await expect(
          page.getByRole('columnheader', { name: 'Nach Auf Lager sortieren', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('columnheader', { name: 'Verfügbar', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('columnheader', { name: 'Reserviert', exact: true }),
        ).toBeVisible();
        for (const name of ['Herkunft', 'Kosten pro Stück', 'Bestandswert', 'Verkauf']) {
          await expect(page.getByRole('columnheader', { name, exact: true })).toHaveCount(0);
        }
        await expect(
          page.locator('app-sidebar').getByRole('link', { name: 'Artikel', exact: true }),
        ).toHaveAttribute('aria-current', 'page');
      } else {
        await expect(
          page.locator('app-bottom-nav').getByRole('link', { name: 'Artikel', exact: true }),
        ).toHaveAttribute('aria-current', 'page');
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await checkAccessibility(page, 'app-inventory');
      await page.screenshot({ path: testInfo.outputPath(`article-stock-${theme}-${width}.png`) });
      expect(errors).toEqual([]);
    });
  }
}

test('ungespeicherte Artikeländerung lässt sich beim Weggehen behalten', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/catalog');
  await page.getByRole('link', { name: 'Artikel erstellen', exact: true }).click();
  const dialog = page.locator('app-product-detail');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Unveränderte Konsole');
  await dialog.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
  const field = page
    .locator('app-product-detail')
    .getByRole('textbox', { name: 'Name', exact: true });
  await field.fill('Noch nicht gespeichert');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('navigation', { name: 'Artikelansichten' })
    .getByRole('link', { name: 'Bestand', exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalog\/[^/?]+$/);
  await expect(field).toHaveValue('Noch nicht gespeichert');
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(field).toHaveValue('Unveränderte Konsole');
});

test('Bestandsartikel öffnet denselben Artikel und erhält die Bestandssuche', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/inventory');
  const search = page.getByRole('searchbox', { name: 'Suche', exact: true });
  await search.fill('USB-C Ladegerät');
  await page.getByRole('link', { name: 'USB-C Ladegerät 30 W', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/catalog-demo-usb-c-charger\?view=stock$/);
  const stock = page.getByRole('region', { name: 'Bestand des Artikels', exact: true });
  await expect(stock).toBeVisible();
  await expect(stock.getByRole('heading', { name: 'Bestand', exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Artikelbereich' })
    .getByRole('button', { name: 'Details', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'USB-C Ladegerät 30 W',
  );
  await page
    .getByRole('group', { name: 'Artikelbereich' })
    .getByRole('button', { name: 'Bestand', exact: true })
    .click();
  await page.getByRole('link', { name: 'Zur Artikelliste', exact: true }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(search).toHaveValue('USB-C Ladegerät');
});

test('eigenständiges Stück bleibt aus allen Artikeln mit Rückweg erreichbar', async ({ page }) => {
  await startDemoMode(page);
  await page.goto('/catalog');
  const search = page.getByRole('searchbox', { name: 'Artikel durchsuchen', exact: true });
  await search.fill('SNES Original');
  await page
    .getByRole('link', { name: 'Super Nintendo SNES Original Controller', exact: true })
    .click();
  await expect(page).toHaveURL(/\/inventory\/item-demo-4\?returnTo=%2Fcatalog$/);
  await page.getByRole('link', { name: 'Zurück zu allen Artikeln', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(search).toHaveValue('SNES Original');
});

test('Reservierung und Freigabe ergeben in allen Artikelansichten dieselben Mengen', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.evaluate(() => {
    const key = 'flipbase_local_stock_movements';
    const movements = JSON.parse(localStorage.getItem(key) ?? '[]');
    const base = { workspace_id: 'ws-1', stock_lot_id: 'stock-lot-demo-usb-c-charger' };
    movements.push(
      {
        ...base,
        id: 'reservation-review',
        direction: 'out',
        quantity: 2,
        reason: 'reservation',
        created_at: '2026-09-01T10:00:00Z',
      },
      {
        ...base,
        id: 'release-review',
        direction: 'in',
        quantity: 1,
        reason: 'reservation_release',
        created_at: '2026-09-02T10:00:00Z',
      },
    );
    localStorage.setItem(key, JSON.stringify(movements));
  });
  await page.goto('/inventory');
  const row = page.getByRole('row').filter({ hasText: 'USB-C Ladegerät 30 W' });
  await expect(row.getByRole('cell').nth(2)).toHaveText('5');
  await expect(row.getByRole('cell').nth(3)).toHaveText('4');
  await expect(row.getByRole('cell').nth(4)).toHaveText('1');
  await row.getByRole('link', { name: 'USB-C Ladegerät 30 W', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Bestand des Artikels' }).locator('dl').first();
  await expect(summary.locator('dd')).toHaveText(['5', '4', '1']);
  await page
    .getByRole('navigation', { name: 'Artikelansichten' })
    .getByRole('link', { name: 'Alle Artikel', exact: true })
    .click();
  const catalogRow = page.getByRole('row').filter({ hasText: 'USB-C Ladegerät 30 W' });
  await expect(catalogRow.getByRole('cell').nth(2)).toHaveText('4 Stück');
});

test('Umbenennen erhält den hinterlegten Preis eines nicht veröffentlichten Artikels', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.evaluate(() => {
    const key = 'flipbase_local_catalog_products';
    const products = JSON.parse(localStorage.getItem(key) ?? '[]');
    const product = products.find(
      (entry: { id: string }) => entry.id === 'catalog-demo-usb-c-charger',
    );
    product.is_public_store = false;
    product.listing_price = 99;
    localStorage.setItem(key, JSON.stringify(products));
  });
  await page.goto('/catalog/catalog-demo-usb-c-charger');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Neuer interner Name');
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Neuer interner Name', exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('flipbase_local_catalog_products') ?? '[]').find(
      (entry: { id: string }) => entry.id === 'catalog-demo-usb-c-charger',
    ),
  );
  expect(saved).toMatchObject({
    title: 'Neuer interner Name',
    listing_price: 99,
    is_public_store: false,
  });
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
    'Neuer interner Name',
  );
});

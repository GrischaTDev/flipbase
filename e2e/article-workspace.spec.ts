import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

test('ungespeicherte Artikeländerung lässt sich beim Weggehen behalten', async ({ page }) => {
  await openDashboard(page);
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
  await page.getByRole('link', { name: 'Zur Artikelliste', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/[^/?]+$/);
  await expect(field).toHaveValue('Noch nicht gespeichert');
  await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
  await expect(field).toHaveValue('Unveränderte Konsole');
});

test('zeigt auf dem Tablet vollständige Suchfotos und ein kleines Löschsymbol', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.route('**/rpc/is_platform_operator', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );
  await openDashboard(page);
  await page.goto('/catalog/new');

  const editor = page.locator('app-product-detail');
  await expect(editor.getByRole('button', { name: 'EAN online suchen' })).toHaveCount(0);
  await expect(editor.getByText('Zustand', { exact: true })).toBeVisible();
  await expect(editor.getByRole('combobox', { name: 'Zustand des Artikels' })).toBeVisible();
  await editor.getByRole('button', { name: 'KI-Produktsuche mit Foto' }).click();

  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 300;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas-Kontext fehlt');
    context.fillStyle = '#e11d48';
    context.fillRect(0, 0, 100, 100);
    context.fillStyle = '#fff';
    context.fillRect(0, 100, 100, 100);
    context.fillStyle = '#2563eb';
    context.fillRect(0, 200, 100, 100);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  if (!photo) throw new Error('Testfoto fehlt');

  const search = page.locator('app-modal-shell');
  await search.locator('input[type="file"][capture]').setInputFiles({
    name: 'etikett.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64'),
  });
  const preview = search.getByRole('img', { name: /^Vorschau: etikett\./ });
  await expect(preview).toBeVisible();
  const previewStyle = await preview.evaluate((image) => {
    const rect = image.getBoundingClientRect();
    return { width: rect.width, height: rect.height, fit: getComputedStyle(image).objectFit };
  });
  expect(previewStyle.fit).toBe('contain');
  expect(previewStyle.height).toBeGreaterThan(previewStyle.width * 2);

  const remove = search.getByRole('button', { name: /^Foto etikett\..* entfernen$/ });
  const removeStyle = await remove.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return { width: rect.width, height: rect.height, background: style.backgroundColor };
  });
  expect(removeStyle.width).toBeLessThanOrEqual(32);
  expect(removeStyle.height).toBeLessThanOrEqual(32);
  expect(removeStyle.background).toBe('rgb(255, 255, 255)');
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-modal-shell') as HTMLElement,
        )
      ).violations,
  );
  expect(violations).toEqual([]);
  await remove.click();
  await expect(preview).toHaveCount(0);
});

import { mockArticleArea, productId, itemId } from './support/article-design-fixture';

test.describe('Artikelgestaltung auf vorhandenen Seiten', () => {
  test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

  async function auditArticle(page: import('@playwright/test').Page, selector: string) {
    await page.evaluate(() =>
      Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      ),
    );
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(
      async (selector) =>
        (
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector(selector) as HTMLElement,
          )
        ).violations,
      selector,
    );
    expect(violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  }

  for (const width of [1440, 834, 390])
    for (const theme of ['light', 'dark'] as const) {
      test.describe(width + 'px ' + theme, () => {
        test.use({ viewport: { width, height: 1000 }, hasTouch: width !== 1440 });
        test('Artikelgestaltung erhält Auswahl, Bearbeitung, Bestand und Dialogfokus', async ({
          page,
        }) => {
          const errors: string[] = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.addInitScript(() =>
            Object.defineProperty(navigator, 'mediaDevices', {
              configurable: true,
              value: {
                getUserMedia: async () => {
                  throw new DOMException('Kamera verweigert', 'NotAllowedError');
                },
                enumerateDevices: async () => [],
              },
            }),
          );
          const fixture = await mockArticleArea(page);
          await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
          await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
          await page.goto('/catalog');
          const search = page.getByRole('searchbox', { name: 'Artikel durchsuchen', exact: true });
          await search.fill('Sneaker');
          await expect(
            page.getByRole('link', { name: 'Sneaker · New Balance', exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole('link', { name: 'Leinenhemd · Salbeigrün', exact: true }),
          ).toHaveCount(0);
          await search.fill('');
          await auditArticle(page, 'app-catalog');

          await page.goto('/catalog/' + productId);
          const editor = page.locator('app-product-detail');
          await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toBeEnabled();
          const fieldGeometry = await editor.evaluate((root) => {
            const name = root.querySelector('app-text-field input') as HTMLInputElement;
            const brand = root.querySelector('app-brand-picker input') as HTMLInputElement;
            const labels = Array.from(root.querySelectorAll('app-form-field label'));
            const sections = Array.from(root.querySelectorAll('app-card h2')).map((heading) => {
              const rect = heading.getBoundingClientRect();
              return { title: heading.textContent?.trim(), x: rect.x, y: rect.y };
            });
            return {
              nameHeight: name.getBoundingClientRect().height,
              brandHeight: brand.getBoundingClientRect().height,
              font: getComputedStyle(name).fontSize,
              labelWeights: [...new Set(labels.map((label) => getComputedStyle(label).fontWeight))],
              sections,
            };
          });
          expect(fieldGeometry.brandHeight).toBe(fieldGeometry.nameHeight);
          expect(fieldGeometry.nameHeight).toBe(width === 1440 ? 28 : 44);
          expect(fieldGeometry.font).toBe(width === 1440 ? '13px' : '16px');
          expect(fieldGeometry.labelWeights).toEqual(['500']);
          expect(fieldGeometry.sections.map((section) => section.title)).toEqual(
            expect.arrayContaining([
              'Grunddaten',
              'Bilder',
              'Varianten',
              'Suchmaschineneintrag',
              'Eigenschaften',
            ]),
          );
          if (width === 1440) {
            const basic = fieldGeometry.sections.find((section) => section.title === 'Grunddaten')!;
            const properties = fieldGeometry.sections.find(
              (section) => section.title === 'Eigenschaften',
            )!;
            expect(properties.x).toBeGreaterThan(basic.x);
            expect(properties.y).toBeCloseTo(basic.y, 0);
            for (const title of ['Bilder', 'Varianten', 'Suchmaschineneintrag']) {
              expect(
                fieldGeometry.sections.find((section) => section.title === title)!.x,
              ).toBeCloseTo(basic.x, 0);
            }
          }

          await editor
            .getByRole('textbox', { name: 'Beschreibung', exact: true })
            .fill('Geprüfte Artikelbeschreibung');
          await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
          await expect(
            editor.getByRole('button', { name: 'Speichern', exact: true }),
          ).toBeDisabled();
          expect(
            fixture.writes.some(
              (write) =>
                write.method === 'PATCH' &&
                (write.body as { description?: string }).description ===
                  'Geprüfte Artikelbeschreibung',
            ),
          ).toBe(true);
          await page.reload();
          await expect(
            editor.getByRole('textbox', { name: 'Beschreibung', exact: true }),
          ).toHaveValue('Geprüfte Artikelbeschreibung');
          // Werte sind schon vor Abschluss der Bestands-/Variantenabfragen sichtbar.
          // Die Kontrastprüfung erst nach Freigabe des gesamten Formulars starten.
          await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toBeEnabled();
          await expect(
            editor.getByRole('checkbox', { name: 'Im Shop anzeigen', exact: true }),
          ).toBeEnabled();
          await auditArticle(page, 'app-product-detail');

          const variantTrigger = page.getByRole('button', {
            name: 'Variante hinzufügen',
            exact: true,
          });

          await variantTrigger.hover();
          await page.evaluate(() =>
            Promise.allSettled(
              document
                .getAnimations()
                .filter((a) => a.effect?.getTiming().iterations !== Infinity)
                .map((a) => a.finished),
            ),
          );
          const hoverShadow = await variantTrigger.evaluate(
            (button) => getComputedStyle(button).boxShadow,
          );
          await page.mouse.down();
          await expect
            .poll(() => variantTrigger.evaluate((button) => getComputedStyle(button).boxShadow))
            .not.toBe(hoverShadow);
          await page.mouse.move(0, 0);
          await page.mouse.up();
          await variantTrigger.click();
          const variant = page.getByRole('dialog', { name: 'Variante hinzufügen', exact: true });
          await expect(variant).toBeVisible();
          await auditArticle(page, 'app-modal-shell');
          await page.keyboard.press('Escape');
          await expect(variant).toHaveCount(0);
          await expect(variantTrigger).toBeFocused();

          const stock = page.getByRole('button', { name: 'Bestand', exact: true });
          await stock.click();
          await expect(stock).toHaveAttribute('aria-pressed', 'true');
          await expect(
            page.getByRole('region', { name: 'Bestand des Artikels', exact: true }),
          ).toBeVisible();
          await auditArticle(page, 'app-product-detail');

          await page.goto('/inventory/' + itemId + '?returnTo=%2Fcatalog');
          await expect(
            page.getByRole('heading', { name: 'Beschreibung', exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText('Weiche Lederjacke mit schöner Patina.', { exact: true }),
          ).toBeVisible();
          await auditArticle(page, 'app-item-detail');
          const edit = page.getByRole('button', { name: 'Bearbeiten', exact: true });
          await edit.click();
          const modal = page.getByRole('dialog', { name: 'Artikel bearbeiten', exact: true });
          await expect(
            modal.getByRole('textbox', { name: 'Beschreibung', exact: true }),
          ).toHaveValue('Weiche Lederjacke mit schöner Patina.');
          await expect(
            modal.getByRole('textbox', { name: 'Notiz zum Zustand', exact: true }),
          ).toBeVisible();
          expect(
            await modal
              .locator('label[for="itemTitle"]')
              .evaluate((label) => getComputedStyle(label).fontWeight),
          ).toBe('500');
          await modal.getByRole('button', { name: 'Barcode', exact: true }).click();
          const scanner = page.locator('app-barcode-scanner');
          await scanner
            .getByRole('textbox', { name: 'Oder EAN / Barcode manuell eingeben', exact: true })
            .fill('4005317316719');
          const iconLayout = await scanner
            .getByRole('button', { name: 'Übernehmen', exact: true })
            .evaluate((button) => {
              const icon = button.querySelector('svg')?.getBoundingClientRect();
              const text = button.querySelector('span')?.getBoundingClientRect();
              if (!icon || !text) throw new Error('Icon oder Text fehlt');
              return {
                centerDifference: Math.abs((icon.top + icon.bottom - text.top - text.bottom) / 2),
                iconRight: icon.right,
                textLeft: text.left,
              };
            });
          expect(iconLayout.centerDifference).toBeLessThan(2);
          expect(iconLayout.iconRight).toBeLessThanOrEqual(iconLayout.textLeft);
          await page.keyboard.press('Escape');
          await expect(scanner).toHaveCount(0);

          expect(
            await modal
              .locator('input#itemTitle')
              .evaluate((input) => (input as HTMLInputElement).labels?.length),
          ).toBe(1);
          await auditArticle(page, 'app-modal-shell');
          await page.keyboard.press('Escape');
          await expect(modal).toHaveCount(0);
          await expect(edit).toBeFocused();

          await page.goto('/catalog/new');
          await expect(editor.getByRole('textbox', { name: 'Name', exact: true })).toBeEmpty();
          await auditArticle(page, 'app-product-detail');
          const brand = editor.getByRole('combobox', { name: 'Marke', exact: true });
          await brand.fill('Arket');
          await brand.press('ArrowDown');
          await brand.press('Enter');
          await expect(brand).toHaveValue('Arket');
          await expect(
            editor.getByRole('button', { name: 'Marke entfernen', exact: true }),
          ).toBeVisible();
          await editor.getByRole('button', { name: 'Marke entfernen', exact: true }).click();
          await expect(brand).toBeEmpty();
          const material = editor
            .locator('app-attribute-picker')
            .filter({ has: page.getByText('Material', { exact: true }) });
          await material.getByRole('combobox').fill('Leinen');
          await material.getByRole('combobox').press('ArrowDown');
          await material.getByRole('combobox').press('Enter');
          await expect(
            material.getByRole('button', { name: 'Leinen entfernen', exact: true }),
          ).toBeVisible();
          await material.getByRole('button', { name: 'Leinen entfernen', exact: true }).click();
          await expect(
            material.getByRole('button', { name: 'Leinen entfernen', exact: true }),
          ).toHaveCount(0);
          expect(errors).toEqual([]);
        });
      });
    }

  for (const theme of ['light', 'dark'] as const)
    test.describe('Touch-Löschflächen ' + theme, () => {
      test.use({ viewport: { width: 834, height: 1000 }, hasTouch: true });
      test('lässt den Eingabetext neben Marken- und Kategorie-Löschflächen frei', async ({
        page,
      }) => {
        const fixture = await mockArticleArea(page);
        // Historische Zuordnung bleibt auch erhalten, wenn der Kategoriebaum sie noch nicht aufgelöst hat.
        (fixture.products[0] as { category_id: string | null }).category_id = 'retained-category';
        await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/catalog/' + productId);
        await page
          .getByRole('combobox', { name: 'Marke', exact: true })
          .fill('Eine sehr lange Markenbezeichnung zum Prüfen');
        for (const selector of ['app-brand-picker', 'app-category-picker']) {
          const reserve = await page.locator(selector).evaluate((root) => {
            const field = root.querySelector('input, button') as HTMLElement;
            const clear = root.querySelector('button[aria-label$="entfernen"]') as HTMLElement;
            if (!clear) throw new Error('Löschfläche fehlt');
            return {
              reserved: parseFloat(getComputedStyle(field).paddingRight),
              occupied: field.getBoundingClientRect().right - clear.getBoundingClientRect().left,
            };
          });
          expect(reserve.reserved, selector).toBeGreaterThanOrEqual(reserve.occupied);
        }
        await page.getByRole('button', { name: 'Marke entfernen', exact: true }).click();
        await expect(page.getByRole('combobox', { name: 'Marke', exact: true })).toBeEmpty();
        await page.getByRole('button', { name: 'Kategorie entfernen', exact: true }).click();
        await expect(
          page.getByRole('button', { name: 'Kategorie entfernen', exact: true }),
        ).toHaveCount(0);
      });
    });

  for (const theme of ['light', 'dark'] as const)
    test('Artikelbearbeitung bei 200 Prozent Browservergrößerung ' + theme, async ({ page }) => {
      await mockArticleArea(page);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
      await page.goto('/catalog/' + productId);
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeEnabled();
      await page.evaluate(() => (document.documentElement.style.zoom = '2'));
      await auditArticle(page, 'app-product-detail');
      const field = page.getByRole('textbox', { name: 'Name', exact: true });
      await field.fill('Vergrößert bearbeitet');
      await page.getByRole('button', { name: 'Verwerfen', exact: true }).click();
      await expect(field).toHaveValue('Leinenhemd · Salbeigrün');
      await page.getByRole('button', { name: 'Variante hinzufügen', exact: true }).click();
      const modal = page.getByRole('dialog', { name: 'Variante hinzufügen', exact: true });
      await expect(modal).toBeVisible();
      const box = await modal.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= 1440).toBe(true);
      await page.keyboard.press('Escape');
    });

  test('leere Artikelliste und nicht vorhandener Artikel bleiben verständlich', async ({
    page,
  }) => {
    const fixture = await mockArticleArea(page);
    fixture.products.splice(0);
    await page.route('**/rest/v1/inventory_items?**', (route) => route.fulfill({ json: [] }));
    await page.route('**/rest/v1/stock_lots?**', (route) => route.fulfill({ json: [] }));
    await page.goto('/catalog');
    await expect(page.getByText('Keine Artikel gefunden', { exact: true })).toBeVisible();
    await page.goto('/catalog/' + productId);
    await expect(
      page.getByRole('heading', { name: 'Artikel nicht gefunden', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zur Artikelliste', exact: true })).toBeVisible();
  });
});

test('lange Einzelartikeltexte bleiben auf schmalem Bildschirm vollständig lesbar', async ({
  page,
}) => {
  const fixture = await mockArticleArea(page);
  const description = 'https://beispiel.de/' + 'artikelbeschreibung'.repeat(30);
  fixture.item['description'] = description;
  fixture.item['condition_notes'] = 'Zustandsnotiz'.repeat(30);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inventory/' + itemId);
  const text = page.getByText(description, { exact: true });
  await expect(text).toBeVisible();
  expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const note = page.getByText('Zustandsnotiz'.repeat(30), { exact: true });
  expect(await note.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

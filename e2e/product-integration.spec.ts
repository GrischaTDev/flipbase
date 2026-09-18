import { type Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function createProduct(page: Page, title: string, image = false) {
  await page.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Artikel auswählen' });
  await expect(picker.getByRole('button', { name: 'Produkt erstellen', exact: true })).toHaveCount(
    1,
  );
  await picker.getByRole('button', { name: 'Produkt erstellen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Produkt erstellen', exact: true });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(title);
  await checkAxe(page, 'app-product-dialog');
  if (image)
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'bild.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2V6kAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  await dialog.getByRole('button', { name: 'Produkt erstellen', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(picker).toHaveCount(0);
}

async function checkAxe(page: Page, selector: string) {
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
}

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390]) {
    test(`Produktanlage und kompakte Positionen ${theme} ${width}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.addInitScript((themePreference) => {
        localStorage.setItem('flipbase_theme', themePreference);
      }, theme);
      await openDashboard(page);
      await page.goto('/purchases/new');
      await expect
        .poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark')))
        .toBe(theme === 'dark');
      const background = await page
        .locator('.fb-admin')
        .evaluate((element) => getComputedStyle(element).getPropertyValue('--fb-bg-app').trim());
      expect(background).toBe(theme === 'dark' ? '#1f1f1f' : '#f1f1f1');
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const title = 'SehrLangerProduktnameOhneTrennzeichenFürDieMobileEinkaufserfassung';
      await createProduct(page, title);
      const editor = page.locator('app-purchase-line-editor');
      await expect(editor.getByText(/Mengenartikel|Einzelstück erfassen/)).toHaveCount(0);
      await editor.getByRole('spinbutton', { name: 'Menge für ' + title, exact: true }).fill('3');
      const price = editor.getByRole('spinbutton', {
        name: 'Stückpreis für ' + title,
        exact: true,
      });
      await expect(price).toBeVisible();
      await price.fill('12');
      await expect(editor.locator('tbody tr')).toContainText('36,00');
      await price.fill('0.12');
      await expect(editor.locator('tbody tr')).toContainText('0,36');
      await price.fill('0.123');
      await expect(editor.locator('tbody tr')).toContainText('0,37');
      await price.fill('-1');
      await expect(editor.getByRole('alert')).toContainText('Gültigen Centbetrag');
      await price.fill('0');
      await expect(editor.locator('tbody tr')).toContainText('0,00');
      await price.fill('');
      await expect(editor.locator('tbody tr')).toContainText('Offen');
      await editor.getByRole('spinbutton', { name: 'Menge für ' + title, exact: true }).fill('12');
      const remove = editor.getByRole('button', {
        name: 'Artikel ' + title + ' entfernen',
        exact: true,
      });
      const bounds = await editor.boundingBox();
      const removeBounds = await remove.boundingBox();
      expect(
        bounds && removeBounds && removeBounds.x + removeBounds.width <= bounds.x + bounds.width,
      ).toBe(true);
      const searchBounds = await editor
        .getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true })
        .boundingBox();
      expect(searchBounds?.height).toBe(36);
      await checkAxe(page, 'app-purchase-line-editor');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`product-lines-${theme}-${width}.png`),
        fullPage: true,
      });
      await editor.getByRole('button', { name: title + ' – Details', exact: true }).click();
      const detail = page.getByRole('dialog', { name: title, exact: true });
      await detail.getByRole('combobox', { name: 'Zustand', exact: true }).click();
      const option = detail.getByRole('option', { name: 'Defekt / Ersatzteil', exact: true });
      await expect(option).toBeVisible();
      await option.click();
      await checkAxe(page, 'app-purchase-line-editor');
      await page.screenshot({
        path: testInfo.outputPath(`product-details-${theme}-${width}.png`),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);
      await editor
        .getByRole('button', { name: 'Artikel ' + title + ' entfernen', exact: true })
        .click();
      await expect(
        editor.getByRole('button', { name: 'Artikel suchen oder hinzufügen', exact: true }),
      ).toBeFocused();
      expect(errors).toEqual([]);
    });
  }

test('Produktbild bleibt nach erneutem Laden sichtbar und unbekannter Scan öffnet den Picker @pr-smoke', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await openDashboard(page);
  await page.goto('/purchases/new');
  await createProduct(page, 'Produkt mit Bild', true);
  await expect(page.locator('app-purchase-line-editor app-product-thumbnail img')).toBeVisible();
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Artikel', exact: true }))
    .toBeVisible()
    .catch((error) => {
      throw new Error(String(error) + '\nLaufzeitfehler: ' + errors.join('\n'));
    });
  expect(errors).toEqual([]);
  const productImage = page
    .locator('tr')
    .filter({ hasText: 'Produkt mit Bild' })
    .locator('app-product-thumbnail img');
  await expect(productImage).toBeVisible();
  await page.reload();
  await expect(productImage).toBeVisible();
  expect(await productImage.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(
    true,
  );
  await page.goto('/purchases/new');
  await page.getByRole('button', { name: 'Barcode scannen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Barcode scannen oder eingeben' }).fill('unbekannt');
  await page.getByRole('textbox', { name: 'Barcode scannen oder eingeben' }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Artikel auswählen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Produkt erstellen', exact: true })).toBeVisible();
});

test('CSV verlangt bewusste Zuordnung und übernimmt erst nach Bestätigung', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await createProduct(page, 'CSV-Produkt');
  const editor = page.locator('app-purchase-line-editor');
  await editor.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: 'produkte.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'title,quantity,condition,unit_purchase_price\nCSV-Produkt,12,defective,0.12\nCSV-Produkt,1,,0',
    ),
  });
  const preview = page.getByRole('dialog', { name: 'CSV-Vorschau' });
  await expect(preview.getByRole('button', { name: 'Import übernehmen' })).toBeDisabled();
  await preview.getByRole('combobox', { name: 'Produkt für CSV-Zeile 2' }).click();
  await preview.getByRole('option', { name: 'CSV-Produkt', exact: true }).click();
  await preview.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(editor.locator('tbody tr')).toHaveCount(1);
});

test('verweigerte Kamera lässt Hardwareeingabe und Picker erreichbar', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.getByRole('button', { name: 'Barcode scannen', exact: true }).click();
  await page.getByRole('button', { name: 'Kamera', exact: true }).click();
  await expect(
    page.getByText('Kamerazugriff verweigert. Bitte Berechtigung im Browser erteilen.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('app-barcode-scanner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kamera', exact: true })).toBeFocused();
  const input = page.getByRole('textbox', { name: 'Barcode scannen oder eingeben' });
  await input.fill('unbekannt');
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Artikel auswählen' })).toBeVisible();
});

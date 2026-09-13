import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { startDemoMode } from './support/demo';

async function photo(page: Page, name: string, color: string) {
  const base64 = await page.evaluate((color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext('2d')!;
    context.fillStyle = color;
    context.fillRect(0, 0, 320, 240);
    context.fillStyle = 'white';
    context.fillRect(80, 60, 160, 120);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function accessibility(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async (selector) =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(selector, {
          runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        })
      ).violations,
    selector,
  );
  expect(violations).toEqual([]);
}

for (const width of [1440, 390]) {
  test(`Artikel mit Galerie, Zuschnitt und Suchvorschau erstellen ${width}${width === 1440 ? ' @pr-smoke' : ''}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await startDemoMode(page);
    await page.goto('/catalog');
    await page.getByRole('link', { name: 'Artikel erstellen', exact: true }).click();
    await expect(page).toHaveURL(/\/catalog\/new$/);
    const editor = page.locator('app-product-detail');
    await editor.getByRole('textbox', { name: 'Name', exact: true }).fill('Kamera mit Zubehör');
    await editor
      .getByRole('textbox', { name: 'Beschreibung', exact: true })
      .fill('Geprüfte Kamera mit Tasche und Ladegerät.');
    await editor.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
    await editor
      .getByRole('textbox', { name: 'Seitentitel', exact: true })
      .fill('Gebrauchte Kamera mit Zubehör');
    await editor
      .getByRole('textbox', { name: 'Meta-Beschreibung', exact: true })
      .fill('Die Kamera im Detail: Tasche, Ladegerät und geprüfte Funktion.');
    const gallery = editor.locator('app-product-media-editor');
    await gallery
      .locator('input[type=file]')
      .setInputFiles([
        await photo(page, 'front.png', '#2460b0'),
        await photo(page, 'back.png', '#a02650'),
      ]);
    await expect(
      gallery.getByRole('list', { name: 'Produktbilder' }).getByRole('listitem'),
    ).toHaveCount(2);
    await gallery.getByRole('button', { name: 'Bild 1 zuschneiden', exact: true }).click();
    const crop = page.getByRole('dialog');
    const frame = crop.locator('.ngx-ic-cropper');
    await expect(frame).toBeVisible();
    const corner = await crop.locator('.ngx-ic-resize.ngx-ic-bottomright').boundingBox();
    if (!corner) throw new Error('Zuschnittgriff fehlt');
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x - 35, corner.y - 25, { steps: 5 });
    await page.mouse.up();
    await frame.focus();
    await frame.press('ArrowRight');
    await accessibility(page, '[role=dialog]');
    await page.screenshot({ path: testInfo.outputPath(`crop-${width}.png`) });
    await crop.getByRole('button', { name: 'Bild übernehmen', exact: true }).click();
    await expect(crop).toHaveCount(0);
    await expect(gallery.getByText('front.jpg', { exact: true })).toBeVisible();
    await gallery.getByRole('button', { name: 'Bild 2 als Hauptbild', exact: true }).click();
    await expect(gallery.getByRole('listitem').first()).toContainText('back.png');
    await editor.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
    await expect(page).not.toHaveURL(/\/catalog\/new$/);
    await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    const path = new URL(page.url()).pathname;
    await page.reload();
    await expect(gallery.getByRole('listitem').first()).toContainText('back.png');
    await expect(gallery.getByRole('listitem')).toHaveCount(2);
    await expect(editor.getByText('Gebrauchte Kamera mit Zubehör', { exact: true })).toBeVisible();
    await expect(editor.getByText(/\/kamera-mit-zubehoer$/)).toBeVisible();
    await gallery.getByRole('button', { name: 'Bild 2 entfernen', exact: true }).click();
    await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    await page.reload();
    await expect(gallery.getByRole('listitem')).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(path + '$'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await accessibility(page, 'app-product-detail');
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('Shop zeigt den freigegebenen Katalogartikel mit Galerie und echten Metadaten @pr-smoke', async ({
  page,
}, testInfo) => {
  await startDemoMode(page);
  await page.goto('/catalog/catalog-demo-usb-c-charger');
  const editor = page.locator('app-product-detail');
  await editor
    .getByRole('textbox', { name: 'Beschreibung', exact: true })
    .fill('Kompaktes Ladegerät mit USB-C.');
  await editor.getByRole('checkbox', { name: 'Im Shop anzeigen', exact: true }).check();
  await editor.getByRole('spinbutton', { name: 'Shoppreis', exact: true }).fill('29.90');
  await editor.getByRole('button', { name: 'Eintrag bearbeiten', exact: true }).click();
  await editor
    .getByRole('textbox', { name: 'Seitentitel', exact: true })
    .fill('USB-C Ladegerät kaufen');
  await editor
    .getByRole('textbox', { name: 'Meta-Beschreibung', exact: true })
    .fill('Kompaktes Ladegerät mit 30 W im Detail.');
  await editor
    .getByRole('textbox', { name: 'URL-Bezeichnung', exact: true })
    .fill('usb-c-ladegeraet');
  await editor
    .locator('app-product-media-editor input[type=file]')
    .setInputFiles([
      await photo(page, 'charger.png', '#304aaa'),
      await photo(page, 'connector.png', '#509055'),
    ]);
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await editor.getByRole('link', { name: 'Im Shop ansehen', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/item\/catalog-demo-usb-c-charger\/usb-c-ladegeraet$/);
  const detail = page.locator('app-store-item-detail');
  await expect(
    detail.getByRole('heading', { name: 'USB-C Ladegerät 30 W', exact: true }),
  ).toBeVisible();
  await expect(detail.getByText('Kompaktes Ladegerät mit USB-C.', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('USB-C Ladegerät kaufen');
  await expect(page.locator('meta[name=description]')).toHaveAttribute(
    'content',
    'Kompaktes Ladegerät mit 30 W im Detail.',
  );
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', page.url());
  const mainImage = detail.getByRole('img', { name: 'USB-C Ladegerät 30 W', exact: true });
  await expect(mainImage).toBeVisible();
  const first = await mainImage.getAttribute('src');
  await detail.getByRole('button', { name: 'Bild 2 von 2 anzeigen', exact: true }).click();
  await expect(mainImage).not.toHaveAttribute('src', first!);
  await accessibility(page, 'app-store-item-detail');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('store-product.png'), fullPage: true });
  await page.getByRole('link', { name: 'Zurück zum Sortiment', exact: true }).click();
  await expect(
    page.locator('meta[name=description][content="Kompaktes Ladegerät mit 30 W im Detail."]'),
  ).toHaveCount(0);
  await expect(page.locator('link[rel=canonical]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Händler-Cockpit', exact: true }).click();
  await page.locator('app-sidebar').getByRole('link', { name: 'Artikel', exact: true }).click();
  await page.getByRole('link', { name: 'USB-C Ladegerät 30 W', exact: true }).click();
  await editor.getByRole('button', { name: 'Bild 2 als Hauptbild', exact: true }).click();
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await editor.getByRole('link', { name: 'Im Shop ansehen', exact: true }).click();
  await expect(mainImage).not.toHaveAttribute('src', first!);
  const newPrimary = await mainImage.getAttribute('src');
  await page.getByRole('link', { name: 'Zurück zum Sortiment', exact: true }).click();
  await expect(
    page
      .locator('app-store-catalog #catalog-section')
      .getByRole('img', { name: 'USB-C Ladegerät 30 W', exact: true }),
  ).toHaveAttribute('src', newPrimary!);
  await page.goto('/catalog/catalog-demo-usb-c-charger');
  await editor.getByRole('checkbox', { name: 'Im Shop anzeigen', exact: true }).click();
  await expect(
    editor.getByRole('checkbox', { name: 'Im Shop anzeigen', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await page.goto('/shop/item/catalog-demo-usb-c-charger');
  await expect(
    detail.getByRole('heading', { name: 'USB-C Ladegerät 30 W', exact: true }),
  ).toHaveCount(0);
});

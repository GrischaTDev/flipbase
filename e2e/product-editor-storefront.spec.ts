import { type Page } from '@playwright/test';
import axe from 'axe-core';
import { expect, openDashboard, test } from './support/fixtures';

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
    await openDashboard(page);
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
    const imageTiles = gallery.locator('li[cdkdrag]');
    await gallery
      .locator('input[type=file]')
      .setInputFiles([
        await photo(page, 'front.png', '#2460b0'),
        await photo(page, 'back.png', '#a02650'),
      ]);
    await expect(imageTiles).toHaveCount(2);
    await gallery.getByRole('button', { name: /Hauptbild: front.png, Details öffnen/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Zuschneiden' }).click();
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
    await gallery.getByRole('button', { name: /Bild 2: back.png, Details öffnen/ }).click();
    const details = page.getByRole('dialog');
    await details.getByRole('textbox', { name: 'Bildname' }).fill('Rückseite');
    await details.getByRole('textbox', { name: 'Alternativtext' }).fill('Rückseite der Kamera');
    await details.getByRole('combobox', { name: 'Position in der Galerie' }).click();
    await details.getByRole('option', { name: '1 · Hauptbild' }).click();
    await details.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(imageTiles.first().getByRole('button')).toHaveAttribute(
      'aria-label',
      /Hauptbild: Rückseite/,
    );
    await editor.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
    await expect(page).not.toHaveURL(/\/catalog\/new$/);
    await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    const path = new URL(page.url()).pathname;
    await page.reload();
    await expect(imageTiles.first().getByRole('button')).toHaveAttribute(
      'aria-label',
      /Hauptbild: Rückseite/,
    );
    await expect(imageTiles).toHaveCount(2);
    await expect(editor.getByText('Gebrauchte Kamera mit Zubehör', { exact: true })).toBeVisible();
    await expect(editor.getByText(/\/kamera-mit-zubehoer$/)).toBeVisible();
    await imageTiles.nth(1).getByRole('button').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Bild löschen' }).click();
    await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    await page.reload();
    await expect(imageTiles).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(path + '$'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await accessibility(page, 'app-product-detail');
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

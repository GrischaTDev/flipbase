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
  await page
    .getByRole('navigation', { name: 'Artikelansichten' })
    .getByRole('link', { name: 'Bestand', exact: true })
    .click();
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

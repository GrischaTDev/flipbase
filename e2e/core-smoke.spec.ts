import { expect, openDashboard, test } from './support/fixtures';

// Lokale Supabase mit frischem Test-Workspace; kein Ersatz für Auth/RLS-Tests.
test('öffnet die App und zentrale Arbeitsbereiche @core-smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDashboard(page);

  for (const path of ['/purchases', '/catalog', '/sales']) {
    await page.locator(`app-sidebar a[href="${path}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('main h1').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('speichert einen Artikel mit Bild und lädt ihn erneut @core-smoke', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openDashboard(page);
  await page.goto('/catalog/new');
  const editor = page.locator('app-product-detail');
  const title = editor.getByRole('textbox', { name: 'Name', exact: true });
  await title.fill('Smoke-Test Artikel');

  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas-Kontext fehlt');
    context.fillRect(0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/png').split(',')[1];
    if (!data) throw new Error('Bilddaten fehlen');
    return data;
  });
  const gallery = editor.locator('app-product-media-editor');
  const imageTiles = gallery.locator('li[cdkdrag]');
  await gallery.locator('input[type=file]').setInputFiles({
    name: 'smoke.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  });
  await expect(imageTiles).toHaveCount(1);
  await editor.getByRole('button', { name: 'Artikel erstellen', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/(?!new$)[^/]+$/);
  await expect(editor.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();

  await page.reload();
  await expect(title).toHaveValue('Smoke-Test Artikel');
  await expect(imageTiles).toHaveCount(1);
  await expect(imageTiles.first().getByRole('button')).toHaveAttribute(
    'aria-label',
    /Hauptbild: smoke.png/,
  );
  await expect
    .poll(() =>
      gallery.locator('img').evaluateAll((images) =>
        images.some((image) => {
          const preview = image as HTMLImageElement;
          return preview.complete && preview.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

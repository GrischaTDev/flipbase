import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, openDashboard, test } from './support/fixtures';

test('Artikel-Auswahlfelder bleiben beim Scrollen und erneuten Öffnen bedienbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await openDashboard(page);
  await page.goto('/catalog/new');
  await expect(page.getByRole('heading', { name: 'Artikel erstellen' })).toBeVisible();

  const category = page.locator('app-category-picker');
  const categoryTrigger = category.locator('button[aria-haspopup="dialog"]');
  const triggerBox = await categoryTrigger.boundingBox();
  await categoryTrigger.click();
  const categoryPanel = category.getByRole('dialog');
  await expect(categoryPanel).toBeVisible();
  const panelBox = await categoryPanel.boundingBox();
  expect(triggerBox && panelBox && Math.abs(triggerBox.y - panelBox.y) < 16).toBe(true);
  await expect(categoryPanel.getByRole('combobox', { name: 'Kategorie suchen' })).toBeFocused();
  const categoryList = categoryPanel.locator('.category-picker-list');
  await page.screenshot({ path: join(tmpdir(), 'flipbase-article-category-before.png') });
  await expect(categoryPanel.getByRole('option').first()).toBeVisible();
  const pageScroll = await page.evaluate(() => window.scrollY);
  await categoryList.hover();
  await page.mouse.wheel(0, 1600);
  await expect.poll(() => categoryList.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(0, 1600);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  await expect(categoryPanel).toBeVisible();
  const searchBox = await categoryPanel.getByRole('combobox').boundingBox();
  const scrolledPanelBox = await categoryPanel.boundingBox();
  expect(searchBox && scrolledPanelBox && searchBox.y >= scrolledPanelBox.y).toBe(true);
  await page.screenshot({ path: join(tmpdir(), 'flipbase-article-category-after.png') });
  await categoryList.evaluate((list) => (list.scrollTop = 0));
  await categoryPanel.getByRole('option').first().click();
  await expect(categoryPanel).toBeVisible();
  await categoryPanel.getByRole('combobox', { name: 'Kategorie suchen' }).fill('High Heels');
  const leaf = categoryPanel.getByRole('option', { name: /Fersen/ });
  await leaf.hover();
  await expect(leaf.locator('svg')).toHaveCSS('opacity', '1');
  await categoryPanel.getByRole('combobox', { name: 'Kategorie suchen' }).press('Escape');

  const color = page.locator('app-attribute-picker').filter({ has: page.getByText('Farbe') });
  await color.getByRole('combobox').click();
  await color.getByRole('option', { name: 'Grün' }).click();
  await color.getByRole('combobox').click();
  await expect(color.getByRole('option', { name: 'Blau' })).toBeVisible();
  await color.getByRole('combobox').press('Escape');

  const condition = page.locator('app-custom-select[triggerId="product-condition"]');
  await condition.getByRole('combobox').click();
  const conditionPanel = condition.getByRole('listbox');
  await conditionPanel.hover();
  const scrollBeforeCondition = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 1000);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeCondition);
  await expect(conditionPanel).toBeVisible();
  await condition.getByRole('combobox').press('Escape');

  const material = page.locator('app-attribute-picker').filter({ has: page.getByText('Material') });
  await material.getByRole('combobox').click();
  await material.getByRole('option', { name: 'Leder', exact: true }).click();
  await expect(
    material.locator('.linear-input').getByRole('button', { name: 'Leder entfernen' }),
  ).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), 'flipbase-article-material-after.png') });
  await material.getByRole('button', { name: 'Leder entfernen' }).click();
  await expect(material.getByRole('button', { name: 'Leder entfernen' })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Testartikel');
  const unsaved = page.getByText('Nicht gespeicherte Änderungen');
  const scan = page.getByRole('button', { name: 'EAN scannen' });
  await expect(unsaved).toBeVisible();
  const statusBox = await unsaved.boundingBox();
  const scanBox = await scan.boundingBox();
  expect(statusBox && scanBox && statusBox.x < scanBox.x).toBe(true);
  expect(browserErrors).toEqual([]);
});

test('Kategorieauswahl bleibt auf schmalem Bildschirm im sichtbaren Bereich', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await page.goto('/catalog/new');

  const category = page.locator('app-category-picker');
  await category.locator('button[aria-haspopup="dialog"]').click();
  const panel = category.getByRole('dialog');
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390).toBe(true);
  await expect(panel.getByRole('combobox', { name: 'Kategorie suchen' })).toBeVisible();
  await expect(panel.getByRole('option').first()).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), 'flipbase-article-category-mobile.png') });
});

import axe from 'axe-core';
import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';

test('can select a purchase date outside its card @pr-smoke', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  const date = page.getByRole('textbox', { name: 'Kaufdatum', exact: true });
  await date.fill('15.09.2026');
  const trigger = page.getByRole('button', { name: 'Kalender öffnen', exact: true });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Datum wählen', exact: true });
  const day = calendar.locator('[data-date="2026-09-22"]');
  await expect(day).toBeVisible();
  // Ein sichtbares DOM-Element kann trotzdem von der Karte abgeschnitten sein.
  await expect
    .poll(() =>
      calendar.evaluate((panel) =>
        [...panel.querySelectorAll('button')].every((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
          );
        }),
      ),
    )
    .toBe(true);
  await day.click();
  await expect(calendar).toHaveCount(0);
  await expect(date).toHaveValue('22.09.2026');
  await expect(trigger).toBeFocused();
});

for (const width of [390, 768, 1440]) {
  test(`keeps the draft calendar usable within the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDashboard(page);
    await page.goto('/purchases/new');
    await selectDefaultPurchaseSeller(page);
    await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Kalenderprüfung');
    const date = page.getByRole('textbox', { name: 'Kaufdatum', exact: true });
    await date.fill('15.09.2026');
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await page.locator('[data-purchase-row]').first().click();
    await expect(date).toHaveValue('15.09.2026');
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle('dark', dark),
      width === 768,
    );
    const trigger = page.getByRole('button', { name: 'Kalender öffnen', exact: true });
    await trigger.scrollIntoViewIfNeeded();
    const calendar = page.getByRole('dialog', { name: 'Datum wählen', exact: true });
    // ArrowDown direkt nach der Navigation auf die Detailseite öffnete den Kalender bei
    // 390px vereinzelt nicht (die eigene afterNextRender-Öffnung des Kalenders kollidierte
    // mit dem gerade erst montierten Formular). toPass wiederholt den Tastendruck, bis der
    // Kalender sichtbar ist, statt eine feste Wartezeit zu raten.
    await expect(async () => {
      if (await calendar.count()) return;
      await trigger.press('ArrowDown');
      await expect(calendar).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await expect(calendar.locator('[data-date="2026-09-15"]')).toBeFocused();
    const bounds = await calendar.boundingBox();
    if (!bounds) throw new Error('Kalender fehlt');
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(692);
    await page.keyboard.press('ArrowRight');
    await expect(calendar.locator('[data-date="2026-09-16"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(calendar).toHaveCount(0);
    await expect(date).toHaveValue('16.09.2026');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await calendar.getByRole('button', { name: 'Nächster Monat' }).click();
    await page.keyboard.press('Escape');
    await expect(calendar).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // Nach dem Blättern/Schließen muss der ausgewählte Tag wieder erreichbar sein.
    await trigger.click();
    await expect(calendar.locator('[data-date="2026-09-16"]')).toBeFocused();
    await page.setViewportSize({ width: width + 20, height: 720 });
    await expect(calendar).toHaveCount(0);
    await trigger.click();
    await expect(calendar).toBeVisible();
    await date.click();
    await page.getByRole('textbox', { name: 'Beschreibung' }).click();
    await expect(calendar).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Beschreibung' })).toBeFocused();
  });
}

test('exposes an accessible open calendar in both themes', async ({ page }) => {
  // Ohne reduzierte Bewegung lief AXE manchmal mitten in der 0,25s-Öffnen-Animation
  // des Kalenders und maß die Textfarbe bei Teil-Deckkraft als Kontrastverstoß.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.addScriptTag({ content: axe.source });
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark);
    await page.getByRole('button', { name: 'Kalender öffnen', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Datum wählen', exact: true })).toBeVisible();
    const violations = await page.evaluate(async () =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run('app-date-picker', {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target),
      })),
    );
    expect(violations).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('closes the calendar when scrolling moves its purchase field', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openDashboard(page);
  await page.goto('/purchases/new');
  const trigger = page.getByRole('button', { name: 'Kalender öffnen', exact: true });
  // scrollIntoViewIfNeeded lässt Playwright das Layout erst festigen; ein sofortiger Klick
  // direkt nach der Navigation traf sonst manchmal den noch nicht verdrahteten Knopf.
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Datum wählen', exact: true });
  await expect(calendar).toBeVisible();
  const before = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy(0, 100));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  await expect(calendar).toHaveCount(0);
});

test('preserves date selection in the sales form', async ({ page }) => {
  await openDashboard(page);
  await page.goto('/sales/new');
  const trigger = page.getByRole('button', { name: 'Kalender öffnen', exact: true });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Datum wählen', exact: true });
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: 'Heute', exact: true }).click();
  await expect(calendar).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('#sale-date')).not.toHaveValue('');
});

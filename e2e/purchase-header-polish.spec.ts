import { expect, openDashboard, selectDefaultPurchaseSeller, test } from './support/fixtures';

test('aligns purchase navigation and keeps compact actions with the primary action last', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openDashboard(page);
  await page.goto('/purchases/new');
  await selectDefaultPurchaseSeller(page);
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Kopfzeilen-Test');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await page.locator('[data-purchase-description]').filter({ hasText: 'Kopfzeilen-Test' }).click();
  const header = page.locator('app-entry-page-layout header');
  await expect(header.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(header.locator('app-badge')).toHaveText('Entwurf');
  const centers = await Promise.all(
    [
      header.getByRole('button', { name: 'Zurück zur Einkaufsübersicht' }),
      header.getByRole('heading', { level: 1 }),
      header.locator('app-badge'),
    ].map(async (element) => {
      const box = await element.boundingBox();
      expect(box).not.toBeNull();
      return box ? box.y + box.height / 2 : 0;
    }),
  );
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);

  const actions = header.locator('[entry-header-actions]');
  await expect(actions.getByRole('button', { name: 'Löschen', exact: true })).toBeVisible();
  const geometry = await actions.locator('button, a').evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim(),
      height: element.getBoundingClientRect().height,
      primary: element.classList.contains('linear-btn-primary'),
      background: getComputedStyle(element).backgroundColor,
    })),
  );
  expect(geometry.length).toBeGreaterThan(2);
  expect(geometry.every((action) => action.height === 28)).toBe(true);
  expect(geometry.at(-1)?.primary).toBe(true);
  expect(
    new Set(geometry.filter((action) => !action.primary).map((action) => action.background)).size,
  ).toBe(1);
});

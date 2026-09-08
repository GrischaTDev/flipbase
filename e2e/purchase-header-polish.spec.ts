import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('aligns purchase navigation and keeps compact actions with the primary action last', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await startDemoMode(page);
  await page.goto('/purchases/new');
  await page.getByRole('textbox', { name: 'Beschreibung (optional)' }).fill('Kopfzeilen-Test');
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

test('opens legacy purchases without offering a cost repair flow', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'flipbase_local_purchases') {
        const purchases: { id: string; entry_status: string }[] = JSON.parse(value);
        const purchase = purchases.find((entry) => entry.id === 'pur-demo-4');
        if (purchase) purchase.entry_status = 'draft';
        value = JSON.stringify(purchases);
      }
      setItem.call(this, key, value);
    };
  });
  await startDemoMode(page);
  await page.goto('/purchases/pur-demo-4');
  await expect(page.locator('app-purchase-entry-form')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bearbeiten', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Kostenübersicht', exact: true })).toBeVisible();
  await expect(page.getByText('Kostenangaben aus Altbestand prüfen', { exact: true })).toHaveCount(
    0,
  );
});

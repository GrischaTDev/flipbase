import { expect, openDashboard, test } from './support/fixtures';

test('can save a draft after dismissing an open cost selector and cancelling the dialog', async ({
  page,
}) => {
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  const trigger = page.getByRole('combobox', { name: 'Anpassung 1', exact: true });
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await trigger.press('Escape');
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Kostenübersicht verwalten' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Kosten bearbeiten', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Bezeichnung (optional)' }).fill('Dropdown-Abbruch-Test');
  await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await expect(
    page.locator('[data-purchase-description]').filter({ hasText: 'Dropdown-Abbruch-Test' }),
  ).toBeVisible();
});

test('keeps cost options above the modal footer and preserves keyboard dismissal @pr-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kostenübersicht verwalten' });
  const trigger = dialog.getByRole('combobox', { name: 'Anpassung 1', exact: true });
  await trigger.click();
  const option = dialog.getByRole('option', { name: 'Auslandstransaktionsgebühr', exact: true });
  await expect(option).toBeVisible();
  // Sichtbarkeit allein erkennt Clipping nicht: Der Punkt muss tatsächlich die Option treffen.
  await expect
    .poll(() =>
      option.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    )
    .toBe(true);
  await option.click();
  await expect(trigger).toContainText('Auslandstransaktionsgebühr');
  await trigger.click();
  await trigger.press('Escape');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await trigger.press('End');
  await trigger.press('Enter');
  await expect(trigger).toContainText('Sonstiges');
  await trigger.click();
  const selected = dialog.getByRole('option', { name: 'Sonstiges', exact: true });
  await expect
    .poll(() =>
      selected.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    )
    .toBe(true);
  await trigger.press('Escape');
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('keeps the menu within a small viewport and closes it when the viewport changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await openDashboard(page);
  await page.goto('/purchases/new');
  await page.getByRole('button', { name: 'Kosten bearbeiten', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Kostenübersicht verwalten' });
  const trigger = dialog.getByRole('combobox', { name: 'Anpassung 1', exact: true });
  await trigger.click();
  const listbox = dialog.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const bounds = await listbox.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('Dropdown fehlt');
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(382);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(592);
  await page.setViewportSize({ width: 420, height: 650 });
  await expect(listbox).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

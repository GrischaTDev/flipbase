import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

test('filtert das Dashboard über den Shared Select und zeigt den Chart-Tooltip', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startDemoMode(page);

  const platform = page.getByRole('combobox', { name: 'Plattform filtern' });
  await platform.click();
  await page.getByRole('option', { name: 'ebay' }).click();
  await expect(platform).toHaveText('ebay');
  await expect(page.getByText('1 bestätigte Verkäufe im gewählten Zeitraum')).toBeVisible();

  const chart = page.getByRole('img', {
    name: 'Umsatz, Ausgaben und realisierter Gewinn im gewählten Zeitraum',
  });
  await expect(chart).toBeVisible();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();

  const tooltip = page.getByRole('status').filter({ hasText: 'Umsatz:' });
  // 14.08. ist Punkt 14 von 30; 45,5 % trifft ihn inklusive der sichtbaren
  // Achsenränder, ohne Chart- oder Canvas-Interna auszulesen.
  await page.mouse.move(box!.x + box!.width * 0.455, box!.y + box!.height / 2);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('14.08.');
  await expect(tooltip).toContainText(/Umsatz: 379,00\s€/);
  await expect(tooltip).toContainText(/Realisierter Gewinn: 95,62\s€/);
});

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
  await page.mouse.move(0, 0);
  const withoutTooltip = await chart.screenshot();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect.poll(async () => (await chart.screenshot()).equals(withoutTooltip)).toBe(false);
});

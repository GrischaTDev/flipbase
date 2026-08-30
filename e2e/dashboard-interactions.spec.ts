import { expect, test } from '@playwright/test';

import { startDemoMode } from './support/demo';

test.use({ timezoneId: 'Europe/Berlin' });

test('filtert das Dashboard über den Shared Select und zeigt den Chart-Tooltip', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
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
  let targetFound = false;
  for (let step = 0; step <= 60 && !targetFound; step += 1) {
    await page.mouse.move(
      box!.x + box!.width * (0.05 + (step / 60) * 0.9),
      box!.y + box!.height / 2,
    );
    targetFound = (await tooltip.textContent().catch(() => null))?.includes('14.08.') ?? false;
  }

  expect(targetFound).toBe(true);
  await expect(tooltip).toContainText('14.08.');
  await expect(tooltip).toContainText(/Umsatz: 379,00\s€/);
  await expect(tooltip).toContainText(/Realisierter Gewinn: 95,62\s€/);
});

test('erkundet die Diagrammdaten vollstaendig mit der Tastatur', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startDemoMode(page);

  const navigator = page.getByRole('slider', {
    name: 'Datenpunkt im Zahlungsstrom-Diagramm auswählen',
  });
  const tooltip = page.getByRole('status').filter({ hasText: 'Umsatz:' });
  await navigator.focus();
  await expect(navigator).toBeFocused();
  await expect(navigator).toHaveAttribute('aria-valuenow', '1');
  await expect(navigator).toHaveAttribute('aria-valuetext', /01\.08\.: Umsatz 0,00\s€/);

  await navigator.press('End');
  await expect(navigator).toHaveAttribute('aria-valuenow', '30');
  await expect(navigator).toHaveAttribute('aria-valuetext', /30\.08\.: Umsatz 0,00\s€/);
  await expect(tooltip).toContainText('30.08.');

  await navigator.press('ArrowLeft');
  await expect(navigator).toHaveAttribute('aria-valuenow', '29');
  await expect(tooltip).toContainText('29.08.');

  await navigator.press('Escape');
  await expect(tooltip).toHaveCount(0);
});

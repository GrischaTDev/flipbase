import { expect, openDashboard, test } from './support/fixtures';

test.use({ timezoneId: 'Europe/Berlin' });

test('erkundet die Diagrammdaten vollstaendig mit der Tastatur @pr-smoke', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await page.getByRole('button', { name: 'Dieser Monat' }).click();
  await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();

  const navigator = page.getByRole('slider', {
    name: 'Datenpunkt im Zahlungsstrom-Diagramm auswählen',
  });
  const tooltip = page.getByRole('status').filter({ hasText: 'Umsatz:' });
  await navigator.focus();
  await expect(navigator).toBeFocused();
  await expect(navigator).toHaveAttribute('aria-valuenow', '1');
  await expect(navigator).toHaveAttribute(
    'aria-valuetext',
    /01\.08\.: Umsatz 0,00\s€, Ausgaben gesamt 0,00\s€, Cashflow 0,00\s€/,
  );

  await navigator.press('End');
  await expect(navigator).toHaveAttribute('aria-valuenow', '30');
  await expect(navigator).toHaveAttribute(
    'aria-valuetext',
    /30\.08\.: Umsatz 0,00\s€, Ausgaben gesamt 0,00\s€, Cashflow 0,00\s€/,
  );
  await expect(tooltip).toContainText('30.08.');

  await navigator.press('ArrowLeft');
  await expect(navigator).toHaveAttribute('aria-valuenow', '29');
  await expect(tooltip).toContainText('29.08.');

  await navigator.press('Escape');
  await expect(tooltip).toHaveCount(0);
});

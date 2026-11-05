import { expect, openDashboard, test } from './support/fixtures';

test.use({ timezoneId: 'Europe/Berlin' });

test('erkundet die Diagrammdaten vollstaendig mit der Tastatur @pr-smoke', async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-08-30T12:00:00+02:00'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  await page.getByRole('combobox', { name: 'Zeitraum wählen' }).click();
  await page.getByRole('option', { name: 'Dieser Monat', exact: true }).click();
  await expect(page.locator('app-revenue-chart .apexcharts-svg')).toBeVisible();
  await expect(page.locator('app-revenue-chart .apexcharts-xaxis-label tspan').last()).toHaveText(
    '31.08.',
  );
  await page.screenshot({ path: testInfo.outputPath('dashboard-month-axis.png'), fullPage: true });

  const navigator = page.getByRole('slider', {
    name: 'Datenpunkt im Ergebnisdiagramm auswählen',
  });
  const tooltip = page.getByRole('status').filter({ hasText: 'Umsatz:' });
  await navigator.focus();
  await expect(navigator).toBeFocused();
  await expect(navigator).toHaveAttribute('aria-valuenow', '1');
  await expect(navigator).toHaveAttribute(
    'aria-valuetext',
    /01\.08\.: Umsatz 0,00\s€, Ausgaben gesamt 0,00\s€, Gewinn 0,00\s€/,
  );

  await navigator.press('End');
  await expect(navigator).toHaveAttribute('aria-valuenow', '31');
  await expect(navigator).toHaveAttribute(
    'aria-valuetext',
    /31\.08\.: Umsatz 0,00\s€, Ausgaben gesamt 0,00\s€, Gewinn 0,00\s€/,
  );
  await expect(tooltip).toContainText('31.08.');

  await navigator.press('ArrowLeft');
  await expect(navigator).toHaveAttribute('aria-valuenow', '30');
  await expect(tooltip).toContainText('30.08.');

  await navigator.press('Escape');
  await expect(tooltip).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Zeitraum wählen' }).click();
  await page.getByRole('option', { name: 'Dieses Jahr', exact: true }).click();
  await expect(navigator).toHaveAttribute('aria-valuemax', '12');
  await expect(page.locator('app-revenue-chart .apexcharts-xaxis-label tspan').last()).toHaveText(
    /^Dez\.?$/u,
  );
  await navigator.press('End');
  await expect(navigator).toHaveAttribute('aria-valuenow', '12');
  await expect(tooltip).toContainText('Dez');
  await page.screenshot({ path: testInfo.outputPath('dashboard-year-axis.png'), fullPage: true });

  for (const [label, count] of [
    ['Heute', '1'],
    ['7 Tage', '7'],
  ] as const) {
    await page.getByRole('combobox', { name: 'Zeitraum wählen' }).click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await expect(navigator).toHaveAttribute('aria-valuemax', count);
    await navigator.press('End');
    await expect(navigator).toHaveAttribute('aria-valuenow', count);
    await expect(tooltip).toContainText('30.08.');
  }
});

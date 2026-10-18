import { expect, openDashboard, test } from './support/fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`zeigt die vereinfachte Übersicht ohne Überlauf im ${theme}-Theme`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1664, height: 1100 });
    await openDashboard(page);
    const dashboard = page.locator('app-dashboard');
    await expect(dashboard.locator('[data-kpi]')).toHaveCount(4);
    await expect(dashboard.locator('[data-kpi] svg')).toHaveCount(4);
    await expect(dashboard.getByText('61–90 Tage', { exact: true })).toBeVisible();
    await expect(dashboard.getByText('Zu erledigen', { exact: true })).toHaveCount(0);
    await expect(dashboard.getByText('Bilder optimieren', { exact: true })).toHaveCount(0);
    for (const width of [1664, 1440, 1200, 900, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
          message: `Überlauf bei ${width}px`,
        })
        .toBeLessThanOrEqual(0);
      expect(
        await dashboard.locator('[data-kpi="sales"]').evaluate((element) => {
          const container = element.closest('[aria-label="Kennzahlen"]')!.getBoundingClientRect();
          return element.getBoundingClientRect().right <= container.right + 1;
        }),
      ).toBe(true);
    }
    for (const [name, href] of [
      ['Einkauf erfassen', '/purchases/new'],
      ['Verkauf erfassen', '/sales/new'],
    ])
      await expect(dashboard.getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        href,
      );
    await dashboard.getByRole('button', { name: 'Inserat erstellen', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Inserat erstellen' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Vinted' })).toHaveAttribute(
      'href',
      '/marketplaces/vinted/listings/new',
    );
    await expect(dialog.getByText('Geplant', { exact: true })).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      dashboard.getByRole('button', { name: 'Inserat erstellen', exact: true }),
    ).toBeFocused();
  });
}

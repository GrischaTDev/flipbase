import { expect, openDashboard, test } from './support/fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`richtet Dashboard-Spalten und Kartenköpfe im ${theme}-Theme einheitlich aus`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1664, height: 1100 });
    await openDashboard(page);
    await expect(page.getByText('61–90 Tage im Bestand', { exact: true })).toBeVisible();
    const dashboard = page.locator('app-dashboard');
    await expect(dashboard.locator('.overview-header')).toHaveCount(3);
    await expect(dashboard.locator('.quick-icon svg')).toHaveCount(4);

    for (const width of [1664, 1440, 1200, 900, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      const geometry = await dashboard.evaluate((root) => {
        const bounds = (selector: string) => {
          const element = root.querySelector(selector);
          if (!element) throw new Error(`Dashboard-Element fehlt: ${selector}`);
          const rect = element.getBoundingClientRect();
          return { x: rect.x, width: rect.width };
        };
        return {
          tasks: bounds('.side-stack > app-card:first-child'),
          quick: bounds('.side-stack > app-card:last-child'),
          stock: bounds('[aria-labelledby="inventory-overview-heading"] > app-card'),
          headerHeights: [...root.querySelectorAll('.overview-header')].map(
            (header) =>
              header.closest('app-card')!.firstElementChild!.getBoundingClientRect().height,
          ),
          iconColors: [...root.querySelectorAll('.header-icon, .quick-icon')].map(
            (icon) => getComputedStyle(icon).backgroundColor,
          ),
          iconTextGaps: [...root.querySelectorAll('.quick-tile')].map(
            (tile) =>
              tile.querySelector('.quick-copy')!.getBoundingClientRect().left -
              tile.querySelector('.quick-icon')!.getBoundingClientRect().right,
          ),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });

      for (const card of [geometry.tasks, geometry.quick]) {
        expect(Math.abs(card.x - geometry.stock.x), `Linke Kante bei ${width}px`).toBeLessThan(1);
        expect(
          Math.abs(card.width - geometry.stock.width),
          `Kartenbreite bei ${width}px`,
        ).toBeLessThan(1);
      }
      expect(
        Math.max(...geometry.headerHeights) - Math.min(...geometry.headerHeights),
        `Gleiche Kopfzeilenhöhe bei ${width}px`,
      ).toBeLessThan(1);
      expect(geometry.iconColors).toEqual(Array(7).fill('rgb(252, 198, 1)'));
      expect(geometry.iconTextGaps.every((gap) => gap >= 12)).toBe(true);
      expect(geometry.overflow, `Kein Seitenüberlauf bei ${width}px`).toBeLessThanOrEqual(0);
    }

    const viewAll = dashboard.getByRole('link', { name: 'Alle anzeigen', exact: true });
    await expect(viewAll).toHaveCSS('background-color', 'rgb(252, 198, 1)');
    await expect(viewAll).toHaveAttribute('href', '/sales');
    await expect(dashboard.getByText('Langsam drehend', { exact: true })).toHaveCount(0);
    for (const [label, href] of [
      ['Einkauf erfassen', '/purchases/new'],
      ['Verkauf erfassen', '/sales/new'],
      ['Inserat erstellen', '/listings/new'],
      ['Bilder optimieren', '/image-optimizer'],
    ]) {
      await expect(dashboard.getByRole('link', { name: new RegExp(label) })).toHaveAttribute(
        'href',
        href,
      );
    }
  });
}

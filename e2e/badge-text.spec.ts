import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

for (const width of [1440, 390]) {
  test(`Einkaufsstatus bleibt ein reines Textbadge bei ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await startDemoMode(page);
    await page.goto('/purchases');

    const badges = page.locator('app-badge');
    await expect(badges.first()).toBeVisible();
    const statuses = badges.filter({ hasText: /Entwurf|Erhalten|Angekommen|Unterwegs/ });
    await expect(statuses.first()).toBeVisible();
    await expect(badges.locator('[data-badge-marker], svg, [aria-hidden="true"]')).toHaveCount(0);
    const visibleStatus = statuses.first().locator('span').first();
    await expect(visibleStatus).toHaveCSS('text-transform', 'none');
    await expect(visibleStatus).toHaveCSS('letter-spacing', 'normal');
  });
}

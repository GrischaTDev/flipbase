import { expect, test } from '@playwright/test';
import { startDemoMode } from './support/demo';

test('zeigt den primaeren Einkaufsknopf mit lesbarer Schrift auf dem Markenakzent', async ({
  page,
}) => {
  await startDemoMode(page);
  await page.goto('/purchases');

  const button = page.getByRole('button', { name: 'Neuer Einkauf' });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS('color', 'rgb(26, 26, 26)');
});

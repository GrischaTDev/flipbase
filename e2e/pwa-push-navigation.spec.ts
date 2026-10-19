import { expect, test, Page } from '@playwright/test';
import { mockMarketplace, workspaceId } from './support/marketplace-account-fixture';

const userId = '25000000-0000-4000-8000-000000000001';
const payload = {
  version: 1,
  eventId: '65000000-0000-4000-8000-000000000001',
  workspaceId,
  category: 'test',
  title: 'Flipbase',
  body: 'Eine Benachrichtigung ist verfügbar.',
  target: { kind: 'settings' },
};
async function backend(page: Page) {
  await mockMarketplace(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { origin: 'https://api.flipbase.de', userId },
  );
}
test('a valid closed-app entry opens its authorized settings target', async ({ page }) => {
  await backend(page);
  await page.goto(`/push/open?context=${encodeURIComponent(JSON.stringify(payload))}`);
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  await expect(
    page.getByRole('heading', { name: 'Webhooks & Benachrichtigungen', exact: true }),
  ).toBeVisible();
});
test('a push target without current workspace access stays closed', async ({ page }) => {
  await backend(page);
  await page.goto(
    `/push/open?context=${encodeURIComponent(JSON.stringify({ ...payload, workspaceId: '75000000-0000-4000-8000-000000000001' }))}`,
  );
  await expect(page.locator('app-push-entry [role="status"]')).toContainText(
    'keinen aktuellen Zugang',
  );
  await expect(page).toHaveURL(/\/push\/open/);
});
test('an arbitrary URL is rejected instead of becoming a notification destination', async ({
  page,
}) => {
  await backend(page);
  await page.goto(
    `/push/open?context=${encodeURIComponent(JSON.stringify({ ...payload, target: { kind: 'settings', url: 'https://example.com' } }))}`,
  );
  await expect(page.locator('app-push-entry [role="status"]')).toContainText('kein gültiges Ziel');
  await expect(
    page.locator('app-push-entry').getByRole('button', { name: 'Erneut prüfen' }),
  ).toBeDisabled();
});
test('a controller message preserves an open unsaved purchase @worker', async ({ page }) => {
  await backend(page);
  await page.goto('/purchases/new');
  await page.getByRole('button', { name: 'Eigenbeleg', exact: true }).click();
  await page.getByLabel('Verkäuferangabe, falls bekannt').fill('Offene Eingabe');
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await page.evaluate(
    (payload) =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent('message', {
          source: navigator.serviceWorker.controller,
          data: { type: 'PWA_PUSH_OPEN', payload },
        }),
      ),
    payload,
  );
  await expect(page.getByRole('region', { name: 'Benachrichtigungsziel' })).toContainText(
    'offene Erfassung',
  );
  await expect(page).toHaveURL(/\/purchases\/new$/);
  await expect(page.getByLabel('Verkäuferangabe, falls bekannt')).toHaveValue('Offene Eingabe');
});

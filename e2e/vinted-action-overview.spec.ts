import { expect, test, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';
import { actionOverviewMessagesUrl, mockActionOverview } from './support/action-overview-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

async function checkAccessibility(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(
    async (selector) =>
      (
        await (window as unknown as { axe: typeof axe }).axe.run(selector, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        })
      ).violations,
    selector,
  );
  expect(violations).toEqual([]);
}
async function checkGroups(overview: Locator) {
  for (const title of [
    'Wird ausgeführt',
    'In der Warteschlange',
    'Bitte prüfen',
    'Zuletzt erledigt',
  ]) {
    await expect(overview.getByText(title, { exact: true })).toBeVisible();
  }
  for (const partner of ['Testperson 1', 'Testperson 2', 'Testperson 3', 'Testperson 4']) {
    await expect(overview.locator('li').filter({ hasText: partner })).toBeVisible();
  }
}

for (const width of [1920, 1280, 390, 320]) {
  test.describe(`Aktionsübersicht ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: width <= 1280 });
    for (const theme of ['light', 'dark'] as const) {
      test(`zeigt Statusgruppen und bedienbare Darstellung in ${theme} @marketplace-preview`, async ({
        page,
      }, testInfo) => {
        await mockActionOverview(page);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.goto(actionOverviewMessagesUrl);
        const desktop = page.locator('[data-action-overview-desktop]');
        const trigger = page.getByRole('button', { name: /^Aktionen \(/ });
        if (width === 1920) {
          await expect(desktop).toBeVisible();
          await expect(trigger).toBeHidden();
          await checkGroups(desktop);
          const position = await desktop.boundingBox();
          expect(position?.x).toBeGreaterThan(width / 2);
          await checkAccessibility(page, '[data-action-overview-desktop]');
          if (theme === 'light')
            await page.screenshot({
              path: testInfo.outputPath('actions-desktop.png'),
              fullPage: true,
              animations: 'disabled',
            });
        } else {
          await expect(desktop).toBeHidden();
          await expect(trigger).toHaveAccessibleName(/Aktionen \(\d+\)/);
          if (width <= 1280) await trigger.tap();
          else await trigger.click();
          const dialog = page.getByRole('dialog', { name: 'Aktionen', exact: true });
          await expect(dialog).toBeVisible();
          await checkGroups(dialog);
          if (theme === 'light' && width === 390)
            await page.screenshot({
              path: testInfo.outputPath('actions-mobile.png'),
              fullPage: false,
              animations: 'disabled',
            });
          await expect
            .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
            .toBe(true);
          for (let step = 0; step < 6; step++) {
            await page.keyboard.press('Tab');
            await expect
              .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
              .toBe(true);
          }
          await page.keyboard.press('Shift+Tab');
          await expect
            .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
            .toBe(true);
          const position = await dialog.locator('[data-modal-surface]').boundingBox();
          if (position && width < 640) {
            expect(position.width).toBeLessThanOrEqual(width);
            expect(position.height).toBeLessThanOrEqual(850);
            expect(Math.abs(position.y + position.height - 1000)).toBeLessThanOrEqual(2);
          }
          await checkAccessibility(page, '[role="dialog"]');
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
          await expect(trigger).toBeFocused();
          if (width === 1280) {
            await trigger.tap();
            await page.setViewportSize({ width: 1920, height: 1000 });
            await expect(dialog).toBeHidden();
            await expect(desktop).toBeVisible();
            await expect(
              desktop.getByRole('heading', { name: 'Aktionen', exact: true }),
            ).toBeFocused();
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      });
    }
  });
}

test('standardmäßig aus, persönlich aktivieren und nach Neuladen erhalten @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page, false);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(actionOverviewMessagesUrl);
  await expect(page.locator('app-vinted-messages')).toBeVisible();
  await expect(page.locator('[data-action-overview-desktop]')).toBeHidden();
  await expect(page.locator('[data-action-overview-trigger]')).toBeHidden();
  await page.goto('/settings/app');
  const checkbox = page.getByRole('checkbox', { name: 'Aktionsübersicht anzeigen' });
  await expect(checkbox).not.toBeChecked();
  await expect(
    page.getByText('Zeigt Dir laufende, wartende und kürzlich erledigte Aktionen.'),
  ).toBeVisible();
  await checkAccessibility(page, 'app-app-settings');
  await checkbox.click();
  await expect.poll(fixture.persistedEnabled).toBe(true);
  await page.reload();
  await expect(checkbox).toBeChecked();
  await page.goto(actionOverviewMessagesUrl);
  await expect(page.locator('[data-action-overview-desktop]')).toBeVisible();
  expect(fixture.saves).toEqual([true]);
});

test('zeigt Speicherfehler und wiederholt die persönliche Einstellung @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page, false);
  fixture.rejectSave(true);
  await page.goto('/settings/app');
  const checkbox = page.getByRole('checkbox', { name: 'Aktionsübersicht anzeigen' });
  await checkbox.click();
  await expect(page.getByRole('alert')).toContainText('konnte nicht gespeichert werden');
  expect(fixture.persistedEnabled()).toBe(false);
  fixture.rejectSave(false);
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect.poll(fixture.persistedEnabled).toBe(true);
  await expect(page.getByRole('alert')).toBeHidden();
  await page.reload();
  await expect(checkbox).toBeChecked();
});

test('stellt beauftragte Annahme nach Neuladen wieder her und trennt Abruffehler vom Auftragsstatus @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page);
  fixture.queueOffer();
  await page.setViewportSize({ width: 1920, height: 1000 });
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().includes('marketplace_enqueue_negotiation')) writes++;
  });
  await page.goto(actionOverviewMessagesUrl);
  const offer = page.locator('app-vinted-offer-actions');
  await expect(offer).toContainText('Annahme beauftragt');
  await expect(offer).not.toContainText('siehe Aktionen rechts');
  await expect(offer.getByRole('button', { name: 'Annehmen', exact: true })).toBeHidden();
  await page.reload();
  await expect(offer).toContainText('Annahme beauftragt');
  fixture.rejectRead(true);
  const overview = page.locator('[data-action-overview-desktop]');
  await overview.getByRole('button', { name: 'Aktionsübersicht aktualisieren' }).click();
  await expect(overview.getByRole('alert')).toContainText('nicht geladen');
  await expect(overview.locator('[data-action-state="queued"]')).toHaveCount(2);
  await expect(offer).toContainText('Annahme beauftragt');
  expect(writes).toBe(0);
});

test('bietet bei fehlgeschlagener erster Wiederherstellung nur erneutes Lesen an @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page, false);
  fixture.queueOffer();
  fixture.rejectRead(true);
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().includes('marketplace_enqueue_negotiation')) writes++;
  });
  await page.goto(actionOverviewMessagesUrl);
  const offer = page.locator('app-vinted-offer-actions');
  await expect(offer.getByRole('alert')).toContainText('nicht geladen');
  await expect(offer.getByRole('button', { name: 'Annehmen', exact: true })).toBeHidden();
  fixture.rejectRead(false);
  await offer.getByRole('button', { name: 'Aktionsstatus erneut laden' }).click();
  await expect(offer).toContainText('Annahme beauftragt');
  expect(writes).toBe(0);
});

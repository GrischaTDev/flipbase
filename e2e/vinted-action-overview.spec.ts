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
async function checkRunningActions(overview: Locator) {
  await expect(overview.locator('[data-action-state="running"]')).toHaveCount(1);
  await expect(overview.getByText('Angebot wird angenommen', { exact: true })).toBeVisible();
  await expect(overview.getByText('Testperson 1 · 20,00 €', { exact: true })).toBeVisible();
  await expect(
    overview.locator('[data-action-state="running"] app-loading-indicator'),
  ).toBeVisible();
  await expect(
    overview.locator('[data-action-state]:not([data-action-state="running"])'),
  ).toHaveCount(0);
  for (const hidden of [
    'Testperson 2',
    'Testperson 3',
    'Testperson 4',
    'Zuletzt erledigt',
    'In der Warteschlange',
  ])
    await expect(overview.getByText(hidden, { exact: false })).toHaveCount(0);
}
for (const width of [1920, 1280, 390, 320]) {
  test.describe(`Aktionsübersicht ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: width <= 1280 });
    for (const theme of ['light', 'dark'] as const) {
      test(`öffnet nur laufende Aktionen am Header-Icon in ${theme} @marketplace-preview`, async ({
        page,
      }, testInfo) => {
        await mockActionOverview(page);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.goto(actionOverviewMessagesUrl);
        const trigger = page.getByRole('button', { name: 'Laufende Aktionen (1)', exact: true });
        await expect(trigger).toBeVisible();
        await expect(page.locator('[data-action-overview-spinner]')).toBeVisible();
        await expect(page.locator('[data-action-overview-spinner] svg path').first()).toHaveCSS(
          'animation-name',
          'spin',
        );
        await expect(trigger).toBeEnabled();
        await expect(page.locator('[data-action-overview-desktop]')).toHaveCount(0);
        await expect(page.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
        await expect(page.locator('[data-action-overview-panel]')).toHaveCount(0);
        const bell = page.getByRole('button', { name: 'Benachrichtigungen', exact: true });
        const actionPosition = await trigger.boundingBox();
        const bellPosition = await bell.boundingBox();
        expect(actionPosition?.y).toBe(bellPosition?.y);
        expect(actionPosition?.x).toBeLessThan(bellPosition?.x ?? 0);
        if (width <= 1280) await trigger.tap();
        else await trigger.click();
        const overview =
          width < 640
            ? page.getByRole('dialog', { name: 'Laufende Aktionen', exact: true })
            : page.getByRole('region', { name: 'Laufende Aktionen', exact: true });
        await expect(overview).toBeVisible();
        await checkRunningActions(overview);
        if (width < 640) {
          await expect
            .poll(() =>
              overview.locator('[data-action-state="running"]').evaluate((row) => {
                const bounds = row.getBoundingClientRect();
                const navigation = document.querySelector<HTMLElement>('[data-shell-bottom-nav]');
                const wasInert = navigation?.inert;
                // Inert blendet überlagernde Elemente nur aus dem Treffertest aus, nicht aus dem Bild.
                try {
                  if (navigation) navigation.inert = false;
                  return row.contains(
                    document.elementFromPoint(bounds.x + bounds.width / 2, bounds.bottom - 2),
                  );
                } finally {
                  if (navigation) navigation.inert = wasInert ?? false;
                }
              }),
            )
            .toBe(true);
          const position = await overview.locator('[data-modal-surface]').boundingBox();
          if (!position) throw new Error('Mobile Aktionsansicht fehlt');
          expect(position.width).toBeLessThanOrEqual(width);
          expect(position.height).toBeLessThanOrEqual(850);
          expect(Math.abs(position.y + position.height - 1000)).toBeLessThanOrEqual(2);
          for (let step = 0; step < 6; step++) {
            await page.keyboard.press('Tab');
            await expect
              .poll(() => overview.evaluate((element) => element.contains(document.activeElement)))
              .toBe(true);
          }
        }
        await checkAccessibility(
          page,
          width < 640 ? '[role="dialog"]' : '[data-action-overview-panel]',
        );
        if (theme === 'light' && (width === 1920 || width === 390))
          await page.screenshot({
            path: testInfo.outputPath(`actions-${width}.png`),
            fullPage: false,
            animations: 'disabled',
          });
        await page.keyboard.press('Escape');
        await expect(overview).toBeHidden();
        await expect(trigger).toBeFocused();
        if (width === 1280) {
          await trigger.tap();
          await page.setViewportSize({ width: 390, height: 1000 });
          await expect(page.locator('[data-action-overview-panel]')).toBeHidden();
          await expect(trigger).toBeFocused();
          await trigger.tap();
          await expect(
            page.getByRole('dialog', { name: 'Laufende Aktionen', exact: true }),
          ).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      });
    }
  });
}

test('zeigt Vinted-Veröffentlichungen zentral und bricht wartende Aufträge ab @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page);
  const job = {
    id: '99',
    workspaceId: '25000000-0000-4000-8000-000000000011',
    connectionId: '25000000-0000-4000-8000-000000000021',
    draftId: '9007199254740999',
    draftRevision: 1,
    executionMode: 'cloud',
    externalAccountId: '123',
    action: 'publish',
    state: 'queued',
    version: 1,
    scheduledAt: null,
    timeZone: null,
    latePolicy: 'pause_after_30_minutes',
    errorCode: null,
    externalId: null,
    providerState: null,
    verifiedAt: null,
    createdAt: '2026-10-27T20:00:00Z',
    updatedAt: '2026-10-27T20:00:00Z',
    replacesJobId: null,
  };
  fixture.setListingJobs([job]);
  await page.goto(actionOverviewMessagesUrl);
  const trigger = page.getByRole('button', { name: 'Laufende Aktionen (2)' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const overview = page.getByRole('region', { name: 'Laufende Aktionen', exact: true });
  const publications = overview.locator('app-vinted-listing-action-overview');
  await expect(publications.getByText('Veröffentlichung beauftragt')).toBeVisible();
  await expect(publications.getByText('Testkonto A')).toBeVisible();
  await publications.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(publications).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Laufende Aktionen (1)' })).toBeVisible();
});

test('standardmäßig aus und erst nach Speichern appweit aktiv, auch nach Neuladen @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page, false);
  await page.goto('/settings/app');
  const checkbox = page.getByRole('checkbox', { name: 'Aktionsübersicht anzeigen' });
  const save = page.getByRole('button', { name: 'Änderungen speichern', exact: true });
  const trigger = page.getByRole('button', { name: /^Laufende Aktionen \(/ });
  await expect(checkbox).not.toBeChecked();
  await expect(save).toBeDisabled();
  await expect(trigger).toBeHidden();
  await checkbox.click();
  expect(fixture.saves).toEqual([]);
  await expect(trigger).toBeHidden();
  await expect(save).toBeEnabled();
  await checkAccessibility(page, 'app-app-settings');
  await save.click();
  await expect.poll(fixture.persistedEnabled).toBe(true);
  await expect(save).toBeDisabled();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await checkRunningActions(page.getByRole('region', { name: 'Laufende Aktionen', exact: true }));
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(checkbox).toBeChecked();
  await expect(trigger).toBeVisible();
  await page.goto(actionOverviewMessagesUrl);
  await expect(trigger).toBeVisible();
  await expect(page.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  expect(fixture.saves).toEqual([true]);
  await page.goto('/settings/app');
  await checkbox.click();
  await expect(trigger).toBeVisible();
  await save.click();
  await expect(trigger).toBeHidden();
  expect(fixture.saves).toEqual([true, false]);
});

test('behält den Entwurf bei Speicherfehler und speichert auf erneuten Klick @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page, false);
  fixture.rejectSave(true);
  await page.goto('/settings/app');
  const checkbox = page.getByRole('checkbox', { name: 'Aktionsübersicht anzeigen' });
  const save = page.getByRole('button', { name: 'Änderungen speichern', exact: true });
  await checkbox.click();
  await save.click();
  await expect(page.getByRole('alert')).toContainText('konnte nicht gespeichert werden');
  await expect(checkbox).toBeChecked();
  expect(fixture.persistedEnabled()).toBe(false);
  fixture.rejectSave(false);
  await save.click();
  await expect.poll(fixture.persistedEnabled).toBe(true);
  await expect(page.getByRole('alert')).toBeHidden();
  await page.reload();
  await expect(checkbox).toBeChecked();
});

test('zeigt Abschlüsse automatisch mit grünem Haken und behält das aktivierte Icon @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page);
  await page.goto('/settings/app');
  await page.getByRole('button', { name: 'Laufende Aktionen (1)', exact: true }).click();
  const overview = page.getByRole('region', { name: 'Laufende Aktionen', exact: true });
  await checkRunningActions(overview);
  fixture.finishActions();
  await expect(
    overview.getByRole('button', { name: 'Aktionsübersicht aktualisieren' }),
  ).toHaveCount(0);
  await expect(overview.locator('[data-action-state="succeeded"]')).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(
    overview.locator('[data-action-state="succeeded"] app-action-status-indicator svg'),
  ).toBeVisible();
  await expect(overview.locator('[data-action-state="running"]')).toHaveCount(0);
  await expect(page.locator('[data-action-overview-spinner]')).toHaveCount(0);
  await checkAccessibility(page, '#header-action-overview');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const completedCheck = overview.locator(
    '[data-action-state="succeeded"] app-action-status-indicator svg',
  );
  await expect(completedCheck).toHaveCSS('animation-name', 'none');
  await expect(completedCheck).toHaveCSS('stroke-dashoffset', '0px');
  await expect(
    page.getByRole('button', { name: 'Laufende Aktionen (0)', exact: true }),
  ).toBeVisible();
});

test('stellt Annahme nach Neuladen wieder her und trennt Abruffehler vom Chatstatus @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page);
  fixture.queueOffer();
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().includes('marketplace_enqueue_negotiation')) writes++;
  });
  await page.goto(actionOverviewMessagesUrl);
  const offer = page.locator('app-vinted-offer-actions');
  await expect(offer).toContainText('Annahme beauftragt');
  await expect(offer).not.toContainText('siehe Aktionen rechts');
  await expect(offer.getByRole('button', { name: 'Annehmen', exact: true })).toBeHidden();
  await expect(page.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  await page.reload();
  await expect(offer).toContainText('Annahme beauftragt');
  await page.getByRole('button', { name: 'Laufende Aktionen (0)', exact: true }).click();
  const overview = page.getByRole('region', { name: 'Laufende Aktionen', exact: true });
  await expect(overview.getByText('Gerade läuft keine Aktion.')).toBeVisible();
  fixture.rejectRead(true);
  await expect(overview.getByRole('alert')).toContainText('nicht aktualisiert', {
    timeout: 15_000,
  });
  await expect(offer).toContainText('Annahme beauftragt');
  await expect(page.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
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

for (const width of [1440, 390, 320]) {
  test.describe(`Workspace-Auswahl ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: width < 640 });
    test('speichert das Ausblenden erst ausdrücklich und stellt die Auswahl wieder her @marketplace-preview', async ({
      page,
    }) => {
      const fixture = await mockActionOverview(page, false);
      await page.addInitScript(
        (theme) => localStorage.setItem('flipbase_theme', theme),
        width === 320 ? 'dark' : 'light',
      );
      await page.goto('/settings/app');
      const checkbox = page.getByRole('checkbox', { name: 'Workspace-Auswahl im Header anzeigen' });
      const selector = page.locator('app-header button[aria-controls="header-workspace-menu"]');
      const save = page.getByRole('button', { name: 'Änderungen speichern', exact: true });
      await expect(checkbox).toBeChecked();
      await expect(selector).toBeVisible();
      await checkbox.click();
      await expect(selector).toBeVisible();
      expect(fixture.workspaceSaves).toEqual([]);
      if (width === 1440) fixture.rejectSave(true);
      await save.click();
      if (width === 1440) {
        await expect(page.getByRole('alert')).toContainText('konnte nicht gespeichert werden');
        fixture.rejectSave(false);
        await save.click();
      }
      await expect.poll(fixture.persistedWorkspaceSwitcherEnabled).toBe(false);
      await expect(selector).toBeHidden();
      await expect(
        page.getByRole('button', { name: 'Benachrichtigungen', exact: true }),
      ).toBeVisible();
      expect(fixture.persistedEnabled()).toBe(false);
      expect(fixture.saves).toEqual([]);
      await page.reload();
      await expect(checkbox).not.toBeChecked();
      await expect(selector).toBeHidden();
      await checkAccessibility(page, 'app-app-settings');
      await checkAccessibility(page, 'app-header');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await checkbox.click();
      await expect(selector).toBeHidden();
      await save.click();
      await expect.poll(fixture.persistedWorkspaceSwitcherEnabled).toBe(true);
      await expect(selector).toBeVisible();
      expect(fixture.workspaceSaves).toEqual([false, true]);
      expect(fixture.saves).toEqual([]);
    });
  });
}

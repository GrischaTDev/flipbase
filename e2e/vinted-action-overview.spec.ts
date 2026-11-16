import { expect, test, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';
import { actionOverviewMessagesUrl, mockActionOverview } from './support/action-overview-fixture';
import type { VintedAccountAction } from '../src/app/features/marketplaces/models/vinted-account-action';
import { accountIds, workspaceId } from './support/marketplace-account-fixture';

test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
for (const width of [390, 1440])
  for (const theme of ['light', 'dark'] as const) {
    const actionTest = test.extend({
      hasTouch: width < 768,
      isMobile: width < 768,
      timezoneId: 'Europe/Berlin',
    });
    actionTest(
      `Gespeicherte Cloud-Aktionen warten nach Neuladen, lassen sich abbrechen und prüfen ${width}px ${theme} @marketplace-preview`,
      async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await mockActionOverview(page, false);
        await page.addInitScript((value) => localStorage.setItem('flipbase_theme', value), theme);
        const queued: VintedAccountAction = {
          id: '60000000-0000-4000-8000-000000000001',
          requestId: '60000000-0000-4000-8000-000000000002',
          workspaceId,
          connectionId: accountIds[0],
          kind: 'price_save',
          entryId: '60000000-0000-4000-8000-000000000003',
          title: 'Wartende Hose',
          imageUrl: 'https://images.example.test/hose.svg',
          state: 'queued',
          version: 1,
          waitReason: 'pool_busy',
          errorCode: null,
          result: null,
          blockedByActionId: null,
          historyPurged: false,
          resultExpired: false,
          createdAt: '2026-11-15T16:25:23Z',
          updatedAt: '2026-11-15T16:26:03Z',
          startedAt: null,
          finishedAt: null,
        };
        let actions: VintedAccountAction[] = [
          queued,
          {
            ...queued,
            id: '60000000-0000-4000-8000-000000000004',
            requestId: '60000000-0000-4000-8000-000000000005',
            entryId: '60000000-0000-4000-8000-000000000006',
            title: 'Unklares Inserat',
            state: 'outcome_unknown',
            waitReason: null,
          },
          {
            ...queued,
            id: '60000000-0000-4000-8000-000000000008',
            kind: 'listing_content_read',
            state: 'running',
          },
          {
            ...queued,
            id: '60000000-0000-4000-8000-000000000009',
            kind: 'conversations_read',
            state: 'failed',
            errorCode: 'browser_unavailable',
          },
        ];
        const cancellations: unknown[] = [],
          reconciliations: unknown[] = [],
          writes: string[] = [];
        page.on('request', (request) => {
          if (/\/marketplace-browser\/listings\/.+\/save$/.test(new URL(request.url()).pathname))
            writes.push(request.url());
        });
        // Produktbild hinter dem Status; ein buntes Motiv macht die Abdunklung sichtbar.
        await page.route('https://images.example.test/**', (route) =>
          route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" fill="#fcc601"/><rect x="14" y="8" width="28" height="44" rx="6" fill="#006b73"/></svg>',
          }),
        );
        await page.route('**/rest/v1/rpc/marketplace_account_actions_read', (route) =>
          route.fulfill({ json: { actions } }),
        );
        await page.route('**/rest/v1/rpc/marketplace_account_action_cancel', (route) => {
          const body: unknown = route.request().postDataJSON();
          cancellations.push(body);
          actions = actions.map((action) =>
            action.id === queued.id
              ? { ...action, state: 'cancelled', waitReason: null, version: action.version + 1 }
              : action,
          );
          return route.fulfill({ json: { action: actions[0] } });
        });
        await page.route('**/rest/v1/rpc/marketplace_account_action_reconcile', (route) => {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          reconciliations.push(body);
          if (typeof body['p_request_id'] !== 'string') return route.fulfill({ status: 400 });
          const check: VintedAccountAction = {
            ...queued,
            id: '60000000-0000-4000-8000-000000000007',
            requestId: body['p_request_id'],
            kind: 'outcome_reconcile',
            state: 'queued',
            entryId: null,
            title: null,
          };
          actions = [...actions, check];
          return route.fulfill({ json: { action: check } });
        });
        await page.goto('/settings/app');
        const trigger = page.getByRole('button', { name: /Laufende Aktionen \(/ });
        await trigger.click();
        const overview = actionDrawer(page);
        // Wartende Aktion läuft noch, die unklare gehört bereits in den Verlauf.
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(1);
        await showTab(overview, 'Vergangen');
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(1);
        await showTab(overview, 'Laufend');
        await expect(overview.getByText('Inserat lesen', { exact: true })).toHaveCount(0);
        await expect(overview.getByText('Gespräch aktualisieren', { exact: true })).toHaveCount(0);
        const timestamp = overview.locator('[data-account-action-id="' + queued.id + '"] time');
        await expect(timestamp).toHaveText('15.11.2026, 17:26');
        await expect(timestamp).toHaveAttribute('datetime', queued.updatedAt);
        await expect(page.locator('[data-account-action-id="' + queued.id + '"]')).toContainText(
          'Alle Browserplätze sind belegt',
        );
        const preview = overview.locator(
          '[data-account-action-id="' + queued.id + '"] app-action-status-thumbnail',
        );
        await expect(preview.locator('img')).toHaveJSProperty('complete', true);
        await expect(preview.locator('[data-action-thumbnail-shade]')).toBeVisible();
        await expect(preview.locator('app-action-status-indicator')).toBeVisible();
        if (theme === 'light')
          await page.screenshot({
            path: testInfo.outputPath(`action-drawer-${width}.png`),
            fullPage: false,
            animations: 'disabled',
          });
        await page.reload();
        await trigger.click();
        const waiting = page.locator('[data-account-action-id="' + queued.id + '"]');
        await expect(waiting).toContainText('Wartende Hose');
        await waiting.getByRole('button', { name: 'Abbrechen', exact: true }).click();
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(0);
        await showTab(overview, 'Vergangen');
        await expect(waiting).toContainText('Abgebrochen');
        expect(cancellations).toHaveLength(1);
        await page.getByRole('button', { name: 'Ergebnis nachprüfen', exact: true }).click();
        await expect.poll(() => reconciliations.length).toBe(1);
        // Die laufende Nachprüfung wandert zurück in die Warteschlange.
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(1);
        await showTab(overview, 'Laufend');
        expect(writes).toEqual([]);
        await expect(overview.getByText('Ergebnis wird geprüft', { exact: true })).toBeVisible();
        await page.reload();
        await trigger.click();
        await expect(overview.getByText('Ergebnis wird geprüft', { exact: true })).toBeVisible();
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(1);
        await expect(
          overview.getByRole('button', { name: 'Ergebnis nachprüfen', exact: true }),
        ).toBeDisabled();
        actions = actions.map((action) =>
          action.kind === 'outcome_reconcile'
            ? {
                ...action,
                state: 'failed',
                errorCode: 'browser_unavailable',
                version: action.version + 1,
                updatedAt: '2026-11-15T16:27:17Z',
              }
            : action,
        );
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(0);
        await showTab(overview, 'Vergangen');
        await expect(
          overview.getByText(/Nachprüfung fehlgeschlagen: Der Cloud-Browser/),
        ).toBeVisible();
        await expect(overview.locator('[data-account-action-id]')).toHaveCount(2);
        const unknown = overview.locator('[data-account-action-state="outcome_unknown"]');
        await expect(unknown.locator('time')).toHaveText('15.11.2026, 17:27');
        actions = actions.map((action) =>
          action.state === 'outcome_unknown' || action.kind === 'outcome_reconcile'
            ? { ...action, state: 'succeeded', waitReason: null, version: action.version + 1 }
            : action,
        );
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(
          page.getByRole('button', { name: 'Ergebnis nachprüfen', exact: true }),
        ).toHaveCount(0);
        await expect(page.locator('[data-action-overview-error]')).toHaveCount(0);
        await checkAccessibility(page, '[role="dialog"]');
        await page.screenshot({
          path: testInfo.outputPath(`action-dates-${width}-${theme}.png`),
          fullPage: false,
        });
      },
    );
  }
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
function actionDrawer(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Aktionen', exact: true });
}
async function showTab(overview: Locator, name: 'Laufend' | 'Vergangen') {
  const tab = overview.getByRole('tab', { name: new RegExp(`^${name}`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}
async function checkRunningActions(overview: Locator) {
  await showTab(overview, 'Laufend');
  await expect(overview.locator('[data-action-state="running"]')).toHaveCount(1);
  await expect(overview.getByText('Angebot wird angenommen', { exact: true })).toBeVisible();
  await expect(
    overview.getByText('Testkonto A · Testperson 1 · 20,00 €', { exact: true }),
  ).toBeVisible();
  await expect(
    overview.locator('[data-action-state="running"] app-loading-indicator'),
  ).toBeVisible();
  await expect(overview.locator('[data-action-state="queued"]')).toContainText(
    'Konto ist beschäftigt',
  );
  // Die Warteschlange ist nummeriert; die zuletzt gestartete Aktion steht oben.
  const numbers = overview.locator('[data-queue-number]');
  await expect(numbers.first()).toContainText(String(await numbers.count()));
  await expect(numbers.last()).toContainText('1');
  await expect(
    overview.locator(
      '[data-action-state]:not([data-action-state="running"]):not([data-action-state="queued"])',
    ),
  ).toHaveCount(0);
  // Ein unbestätigter Vorgang bleibt im Verlauf stehen, bis er weggeklickt wird.
  await showTab(overview, 'Vergangen');
  const unconfirmed = overview.locator('[data-action-state="outcome_unknown"]');
  await expect(unconfirmed).toHaveCount(1);
  await expect(unconfirmed).toContainText('Annahme nicht bestätigt');
  await expect(unconfirmed.getByRole('button', { name: 'Meldung ausblenden' })).toBeVisible();
  for (const hidden of ['Testperson 4', 'Zuletzt erledigt', 'In der Warteschlange'])
    await expect(overview.getByText(hidden, { exact: false })).toHaveCount(0);
  await showTab(overview, 'Laufend');
}
for (const width of [1920, 1280, 390, 320]) {
  test.describe(`Aktionsübersicht ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, hasTouch: width <= 1280 });
    for (const theme of ['light', 'dark'] as const) {
      test(`zeigt wartende und laufende Aktionen am Header-Icon in ${theme} @marketplace-preview`, async ({
        page,
      }, testInfo) => {
        await mockActionOverview(page);
        await page.addInitScript((theme) => localStorage.setItem('flipbase_theme', theme), theme);
        await page.goto(actionOverviewMessagesUrl);
        const trigger = page.getByRole('button', { name: 'Laufende Aktionen (2)', exact: true });
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
        const overview = actionDrawer(page);
        await expect(overview).toBeVisible();
        await checkRunningActions(overview);
        // Seitenleiste rechts über die volle Höhe; auf schmalen Bildschirmen die ganze Breite.
        const position = await overview.locator('[data-modal-surface]').boundingBox();
        if (!position) throw new Error('Aktionsleiste fehlt');
        expect(Math.abs(position.x + position.width - width)).toBeLessThanOrEqual(2);
        expect(position.width).toBeLessThanOrEqual(width);
        expect(Math.abs(position.height - 1000)).toBeLessThanOrEqual(2);
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
        for (let step = 0; step < 6; step++) {
          await page.keyboard.press('Tab');
          await expect
            .poll(() => overview.evaluate((element) => element.contains(document.activeElement)))
            .toBe(true);
        }
        await checkAccessibility(page, '[role="dialog"]');
        if (theme === 'light' && (width === 1920 || width === 390))
          await page.screenshot({
            path: testInfo.outputPath(`actions-${width}.png`),
            fullPage: false,
            animations: 'disabled',
          });
        await page.keyboard.press('Escape');
        await expect(overview).toBeHidden();
        await expect(trigger).toBeFocused();
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
  const trigger = page.getByRole('button', { name: 'Laufende Aktionen (3)' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const overview = actionDrawer(page);
  const publications = overview.locator('app-vinted-listing-action-overview');
  await expect(publications.getByText('Anzeige wird veröffentlicht')).toBeVisible();
  await expect(publications.getByText('Testkonto A')).toBeVisible();
  await publications.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(publications).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Laufende Aktionen (2)' })).toBeVisible();
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
  await checkRunningActions(actionDrawer(page));
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(checkbox).toBeChecked();
  await expect(trigger).toBeVisible();
  await page.goto(actionOverviewMessagesUrl);
  await expect(trigger).toBeVisible();
  await expect(page.locator('[data-conversation-sync]')).toContainText('Synchronisiert');
  await trigger.click();
  await expect(page.getByText('Gespräch aktualisieren', { exact: true })).toHaveCount(0);
  await checkRunningActions(actionDrawer(page));
  await page.keyboard.press('Escape');
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

test('meldet Aktionsabschlüsse per Toast und beendet Kontoabgleiche still @marketplace-preview', async ({
  page,
}) => {
  const fixture = await mockActionOverview(page);
  await page.goto('/settings/app');
  await page.getByRole('button', { name: 'Laufende Aktionen (2)', exact: true }).click();
  const overview = actionDrawer(page);
  await checkRunningActions(overview);
  fixture.finishActions();
  await expect(
    overview.getByRole('button', { name: 'Aktionsübersicht aktualisieren' }),
  ).toHaveCount(0);
  // Nur beobachtete Abschlüsse werden einmalig gemeldet, ohne dauerhafte Erfolgszeilen.
  const toasts = page.locator('app-toast-container');
  await expect(toasts).toContainText('Angebot angenommen', {
    timeout: 15_000,
  });
  await expect(overview.locator('[data-action-state="succeeded"]')).toHaveCount(0);
  await expect(overview.locator('[data-action-state="running"]')).toHaveCount(0);
  await expect(page.locator('[data-action-overview-spinner]')).toHaveCount(0);
  await checkAccessibility(page, '[role="dialog"]');
  await expect(toasts).not.toContainText('Angebot angenommen', { timeout: 6_000 });
  await expect(
    page.getByRole('button', { name: 'Laufende Aktionen (0)', exact: true }),
  ).toBeVisible();
  // Automatische Kontoabgleiche erscheinen nicht unter „Laufende Aktionen“.
  fixture.startAccountSync();
  await page.waitForResponse('**/rest/v1/rpc/marketplace_read_action_overview');
  await page.waitForResponse('**/rest/v1/rpc/marketplace_read_action_overview');
  await expect(overview.getByText('Kontodaten werden aktualisiert', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-action-overview-spinner]')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Laufende Aktionen (0)', exact: true }),
  ).toBeVisible();
  fixture.finishActions();
  await expect(
    page.getByRole('button', { name: 'Laufende Aktionen (0)', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-action-overview-spinner]')).toHaveCount(0);
  await expect(toasts).not.toContainText('Kontodaten aktualisiert');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Laufende Aktionen (0)', exact: true }),
  ).toBeVisible();
  await expect(toasts).not.toContainText('Angebot angenommen');
  await expect(toasts).not.toContainText('Kontodaten aktualisiert');
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
  await page.getByRole('button', { name: 'Laufende Aktionen (2)', exact: true }).click();
  const overview = actionDrawer(page);
  await showTab(overview, 'Vergangen');
  await overview
    .locator('[data-action-state="outcome_unknown"]')
    .getByRole('button', { name: 'Meldung ausblenden' })
    .click();
  await showTab(overview, 'Laufend');
  await expect(overview.locator('[data-action-state="queued"]')).toHaveCount(2);
  await expect(
    overview.locator('[data-action-state="queued"] app-action-status-indicator svg').first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Laufende Aktionen (2)', exact: true }).click();
  await expect(overview.locator('[data-action-state="queued"]')).toHaveCount(2);
  await showTab(overview, 'Vergangen');
  await expect(overview.locator('[data-action-state="outcome_unknown"]')).toHaveCount(0);
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

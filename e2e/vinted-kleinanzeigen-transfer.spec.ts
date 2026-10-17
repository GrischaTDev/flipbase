import { expect, test, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mockKleinanzeigenTransfer } from './support/kleinanzeigen-transfer-fixture';
test.use({ hasTouch: true, storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function expectSingleVisibleError(dialog: Locator, message: RegExp) {
  const error = dialog.getByRole('alert').filter({ hasText: message });
  await expect(error).toHaveCount(1);
  await expect(error).toBeInViewport();
}
async function open(page: Page, waitForPreview = true) {
  await page.goto('/marketplaces/overview');
  await page.getByRole('button', { name: 'Inserate von Testkonto A anzeigen', exact: true }).tap();
  const action = page.getByRole('button', {
    name: 'A Jacke 01 inserieren',
    exact: true,
  });
  await action.tap();
  const dialog = page.getByRole('dialog', { name: 'Inserieren' });
  await dialog.getByRole('combobox', { name: 'Plattform', exact: true }).click();
  await page.getByRole('option', { name: 'Kleinanzeigen', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Konto', exact: true }).click();
  await page.getByRole('option', { name: 'Kleinanzeigen Privatkonto', exact: true }).click();
  if (waitForPreview)
    await expect(dialog.getByLabel('Titel auf Kleinanzeigen', { exact: true })).toBeVisible();
  return { dialog, action };
}
async function ready(page: Page) {
  const result = await open(page);
  const { dialog } = result;
  await dialog.getByLabel('Postleitzahl', { exact: true }).fill('10115');
  await dialog
    .getByRole('button', { name: /Kleinanzeigen-Kategorie Kategorie suchen oder auswählen/u })
    .tap();
  const category = page.getByRole('dialog', { name: 'Kleinanzeigen-Kategorie', exact: true });
  await category
    .getByRole('combobox', { name: 'Kategorie suchen', exact: true })
    .fill('herren shirts');
  await category.getByRole('option').filter({ hasText: 'Shirts' }).tap();
  await dialog.getByRole('combobox', { name: 'Zustand', exact: true }).click();
  await page.getByRole('option', { name: 'Gut', exact: true }).click();
  return result;
}
test('Der vollständige Kategoriebaum bleibt ohne Erweiterung lokal durchsuchbar @core-smoke', async ({
  page,
}, testInfo) => {
  const f = await mockKleinanzeigenTransfer(page, { extensionAvailable: false });
  const { dialog } = await open(page);
  await dialog
    .getByRole('button', { name: /Kleinanzeigen-Kategorie Kategorie suchen oder auswählen/u })
    .tap();
  const picker = page.getByRole('dialog', { name: 'Kleinanzeigen-Kategorie', exact: true });
  await expect(picker.getByRole('option')).toHaveCount(15);
  await picker.getByRole('option').filter({ hasText: 'Mode & Beauty' }).tap();
  await picker.getByRole('option').filter({ hasText: 'Herrenbekleidung' }).tap();
  await expect(picker.getByRole('option').filter({ hasText: 'Hemden' })).toBeVisible();
  expect(f.savedSchemaRequests).toHaveLength(0);
  expect(
    f.bridgeRequests.filter((value) => value['type'] === 'FLIPBASE_KLEINANZEIGEN_FORM_SCHEMA'),
  ).toHaveLength(0);
  expect(f.sourceCalls).toEqual([]);
  await picker
    .getByRole('combobox', { name: 'Kategorie suchen', exact: true })
    .fill('damen jacken');
  await expect(picker.getByRole('option').filter({ hasText: 'Jacken & Mäntel' })).toBeVisible();
  await page.evaluate(axe.source);
  expect(
    await picker.evaluate(
      async (element) =>
        (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
    ),
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('kleinanzeigen-category-picker.png'),
    animations: 'disabled',
  });
});
for (const theme of ['light', 'dark'] as const)
  for (const width of [320, 390, 834, 1440])
    test(
      'Vinted-Übertragung bleibt bei ' +
        width +
        'px im ' +
        theme +
        '-Theme sicher bedienbar @core-smoke',
      async ({ page }, testInfo) => {
        const f = await mockKleinanzeigenTransfer(page);
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        const { dialog, action } = await ready(page);
        await page.evaluate(
          (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
          theme,
        );
        await expect(dialog.getByLabel('Preis in Euro', { exact: true })).toHaveValue(/0/);
        await expect(dialog.getByLabel('Titel auf Kleinanzeigen', { exact: true })).toHaveValue(
          'Vinted-Jacke vollständig',
        );
        await expect(
          dialog.getByLabel('Beschreibung auf Kleinanzeigen', { exact: true }),
        ).toHaveValue('Vollständige Beschreibung aus Vinted.');
        await expect(
          dialog.getByRole('img', { name: 'Bild 1 aus Vinted', exact: true }),
        ).toHaveCount(1);
        expect(f.calls.filter((value) => value['action'] === 'prepare_transfer')).toHaveLength(1);
        expect(f.calls.some((value) => value['action'] === 'save_transfer')).toBe(false);
        expect(f.savedSchemaRequests).toHaveLength(0);
        expect(
          f.bridgeRequests.filter((value) =>
            /FLIPBASE_VINTED_|KLEINANZEIGEN_QUOTA|KLEINANZEIGEN_PUBLISH_JOB/u.test(
              String(value['type']),
            ),
          ),
        ).toEqual([]);
        expect(f.sourceCalls).toEqual([]);
        const publish = dialog.getByRole('button', { name: 'Inserieren', exact: true });
        await expect(publish).toBeEnabled();
        await publish.focus();
        await page.keyboard.press('Enter');
        await expect(
          dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true }),
        ).toBeInViewport();
        expect(f.calls.filter((value) => value['action'] === 'listing_enqueue')).toHaveLength(1);
        expect(f.providerCalls).toBe(1);
        expect(f.job?.externalId).toBe('999');
        await expect(
          dialog.getByRole('button', { name: 'Inserieren', exact: true }),
        ).toBeDisabled();
        await expect(
          dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }),
        ).toHaveCount(0);
        expect(
          f.bridgeRequests.filter(
            (value) => value['type'] === 'FLIPBASE_KLEINANZEIGEN_FORM_SCHEMA',
          ),
        ).toHaveLength(2);
        expect(
          f.bridgeRequests.filter(
            (value) =>
              value['type'] === 'FLIPBASE_KLEINANZEIGEN_PUBLISH_JOB' && value['mode'] === 'publish',
          ),
        ).toHaveLength(1);
        expect(f.sourceCalls).toEqual([]);
        await page.evaluate(axe.source);
        expect(
          await dialog.evaluate(
            async (element) =>
              (await (window as unknown as { axe: typeof axe }).axe.run(element)).violations,
          ),
        ).toEqual([]);
        expect(
          await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        ).toBe(true);
        expect(
          await dialog.locator('p').evaluateAll((paragraphs) =>
            paragraphs
              .filter((paragraph) => paragraph.getClientRects().length > 0)
              .filter((paragraph) => paragraph.scrollWidth > paragraph.clientWidth + 1)
              .map((paragraph) => ({
                text: paragraph.textContent,
                width: paragraph.clientWidth,
                contentWidth: paragraph.scrollWidth,
                whiteSpace: getComputedStyle(paragraph).whiteSpace,
              })),
          ),
        ).toEqual([]);
        if ((width === 320 || width === 1440) && theme === 'light')
          await page.screenshot({
            path: testInfo.outputPath('transfer-confirmed.png'),
            animations: 'disabled',
          });
        await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().tap();
        await expect(dialog).not.toBeVisible();
        await expect(action).toBeFocused();
      },
    );
for (const quotaUsed of [100, 101])
  test(
    'Offizielles Kontingent ' + quotaUsed + ' stoppt vor Auftragsannahme @core-smoke',
    async ({ page }) => {
      const f = await mockKleinanzeigenTransfer(page, { quotaUsed });
      const { dialog } = await ready(page);
      await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
      await expectSingleVisibleError(dialog, /Das kostenlose Kontingent ist ausgeschöpft/);
      expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
      expect(f.providerCalls).toBe(0);
    },
  );

test('Unbekanntes Kontingent stoppt vor Auftragsannahme @core-smoke', async ({ page }) => {
  const f = await mockKleinanzeigenTransfer(page, { quotaUnknown: true });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expectSingleVisibleError(dialog, /Kontingent konnte nicht aktuell bestätigt/);
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});

test('Ein Zielwechsel verwirft die verspätete Quellantwort @core-smoke', async ({ page }) => {
  const f = await mockKleinanzeigenTransfer(page, { secondTarget: true });
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let firstRequested = false;
  await page.route('**/functions/v1/kleinanzeigen-account', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (
      body['action'] === 'prepare_transfer' &&
      body['targetConnectionId'] === '9007199254740993'
    ) {
      firstRequested = true;
      await delayed;
    }
    await route.fallback();
  });
  const { dialog } = await open(page, false);
  await expect.poll(() => firstRequested).toBe(true);
  await dialog.getByRole('combobox', { name: 'Konto', exact: true }).click();
  await page.getByRole('option', { name: 'Zweites Kleinanzeigen-Konto', exact: true }).click();
  await expect(dialog.getByLabel('Titel auf Kleinanzeigen', { exact: true })).toHaveValue(
    'Jacke für zweites Konto',
  );
  const firstResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith('/functions/v1/kleinanzeigen-account')) return false;
    const body = response.request().postDataJSON() as Record<string, unknown>;
    return (
      body['action'] === 'prepare_transfer' && body['targetConnectionId'] === '9007199254740993'
    );
  });
  release();
  await firstResponse;
  await dialog.getByRole('button', { name: 'Für später speichern', exact: true }).click();
  await expect(
    dialog.getByText('Deine Inseratsangaben und Bilder sind gesichert.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Titel auf Kleinanzeigen', { exact: true })).toHaveValue(
    'Jacke für zweites Konto',
  );
  expect(f.calls.filter((value) => value['action'] === 'save_transfer')).toEqual([
    expect.objectContaining({
      targetConnectionId: '9007199254740994',
      content: expect.objectContaining({ title: 'Jacke für zweites Konto' }),
    }),
  ]);
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});

test('Fehlende gespeicherte Angaben bleiben zur Korrektur sichtbar @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { missingSourceValues: true });
  const { dialog } = await ready(page);
  await expect(dialog.getByLabel('Beschreibung auf Kleinanzeigen', { exact: true })).toHaveValue(
    '',
  );
  await expect(dialog.getByLabel('Preis in Euro', { exact: true })).toHaveValue('');
  await expect(
    dialog.getByRole('heading', { name: '0 Bilder aus Vinted', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expectSingleVisibleError(dialog, /fehlenden Angaben/);
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
  expect(f.sourceCalls).toEqual([]);
});

test('Noch nicht unterstützte Plattformen bieten keine Veröffentlichung an @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page);
  const { dialog } = await open(page);
  for (const platform of ['Vinted', 'eBay']) {
    await dialog.getByRole('combobox', { name: 'Plattform', exact: true }).click();
    await page.getByRole('option', { name: platform, exact: true }).click();
    await expect(
      dialog.getByRole('status').filter({ hasText: /steht noch nicht zur Verfügung/ }),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Inserieren', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('combobox', { name: 'Konto', exact: true })).toHaveCount(0);
  }
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});
test('Gebühren stoppen den Auftrag ohne Erfolgsmeldung @core-smoke', async ({ page }) => {
  const f = await mockKleinanzeigenTransfer(page, { result: 'fees' });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expect(
    dialog.getByText('Kleinanzeigen zeigt Gebühren. Die Veröffentlichung wurde gestoppt.', {
      exact: true,
    }),
  ).toBeInViewport();
  await expect(dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true })).toHaveCount(
    0,
  );
  expect(f.job?.state).toBe('needs_user_action');
});
test('Unklarer Ausgang wird nur abgeglichen und nicht erneut inseriert @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { result: 'unknown' });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expect(dialog.getByText('Ergebnis noch unklar', { exact: true })).toBeInViewport();
  await expect(
    dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Status prüfen', exact: true }).click();
  await expect(dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true })).toBeVisible();
  expect(f.calls.filter((value) => value['action'] === 'listing_enqueue')).toHaveLength(1);
  expect(f.providerCalls).toBe(2);
});
test('Verarbeitung bleibt von einer bestätigten Veröffentlichung unterscheidbar @core-smoke', async ({
  page,
}) => {
  await mockKleinanzeigenTransfer(page, { result: 'processing' });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expect(
    dialog.getByText('Wird von Kleinanzeigen geprüft', { exact: true }),
  ).toBeInViewport();
  await expect(dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true })).toHaveCount(
    0,
  );
});
test('Lange Quelltexte bleiben ungekürzt zur Korrektur erhalten @core-smoke', async ({ page }) => {
  await mockKleinanzeigenTransfer(page, { longSource: true });
  const { dialog } = await open(page);
  await expect(dialog.getByLabel('Titel auf Kleinanzeigen', { exact: true })).toHaveValue(
    'L'.repeat(100),
  );
  await expect(dialog.getByLabel('Beschreibung auf Kleinanzeigen', { exact: true })).toHaveValue(
    'Langtext '.repeat(600),
  );
  await dialog.getByRole('button', { name: 'Für später speichern', exact: true }).click();
  await expectSingleVisibleError(dialog, /Prüfe Titel, Beschreibung und Preis/);
});
test('Unvollständige Bilder blockieren die Veröffentlichung @core-smoke', async ({ page }) => {
  const f = await mockKleinanzeigenTransfer(page, { imagesComplete: false });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expect(
    dialog.getByText(
      'Deine Inseratsangaben sind gespeichert; die Bildübernahme ist noch unvollständig.',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});

test('Zentrale Übersicht zeigt echte Kleinanzeigen-Konten und den bestätigten Zielbestand @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page);
  await page.goto('/marketplaces/overview');
  const target = page.getByRole('region', { name: 'Kleinanzeigen', exact: true });
  await expect(
    target.getByRole('heading', { name: 'Kleinanzeigen Privatkonto', exact: true }),
  ).toBeVisible();
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expect(dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click();
  await target
    .getByRole('button', { name: 'Inserate von Kleinanzeigen Privatkonto anzeigen', exact: true })
    .click();
  await expect(
    target.getByRole('link', {
      name: 'Vinted-Jacke vollständig auf Kleinanzeigen ansehen',
      exact: true,
    }),
  ).toHaveAttribute('href', 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2');
  expect(f.job?.externalId).toBe('999');
});

test('Eine verlorene Annahmeantwort wird ohne zweiten Auftrag fortgesetzt @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { lostEnqueueReply: true });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expectSingleVisibleError(dialog, /Auftrag konnte noch nicht bestätigt/);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expect(dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true })).toBeVisible();
  expect(f.calls.filter((value) => value['action'] === 'listing_enqueue')).toHaveLength(1);
  expect(f.providerCalls).toBe(1);
});
test('Ein gewechseltes Browserkonto stoppt vor der Auftragsannahme @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { wrongBindingOnPublish: true });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expectSingleVisibleError(dialog, /Browserprofil/);
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});
test('Ohne passende Erweiterung bleibt die automatische Veröffentlichung gesperrt @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { extensionAvailable: false });
  const { dialog } = await open(page);
  await dialog.getByRole('button', { name: 'Für später speichern', exact: true }).click();
  await expect(
    dialog.getByText('Deine Inseratsangaben und Bilder sind gesichert.', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Inserieren', exact: true }).click();
  await expectSingleVisibleError(dialog, /Erweiterung/);
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});

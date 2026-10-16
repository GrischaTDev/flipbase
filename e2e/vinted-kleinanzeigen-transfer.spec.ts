import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';
import { mockKleinanzeigenTransfer } from './support/kleinanzeigen-transfer-fixture';
test.use({ hasTouch: true, storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
async function open(page: Page) {
  await page.goto('/marketplaces/overview');
  await page.getByRole('button', { name: 'Inserate von Testkonto A anzeigen', exact: true }).tap();
  const action = page.getByRole('button', {
    name: 'A Jacke 01 auf Kleinanzeigen inserieren',
    exact: true,
  });
  await action.tap();
  const dialog = page.getByRole('dialog', { name: 'Auf Kleinanzeigen inserieren' });
  await dialog.getByRole('combobox', { name: 'Kleinanzeigen-Zielkonto', exact: true }).click();
  await page.getByRole('option', { name: 'Kleinanzeigen Privatkonto', exact: true }).click();
  await dialog.getByRole('button', { name: 'Vinted-Daten übernehmen', exact: true }).tap();
  await expect(dialog.getByLabel('Titel auf Kleinanzeigen', { exact: true })).toBeVisible();
  return { dialog, action };
}
async function ready(page: Page) {
  const result = await open(page);
  const { dialog } = result;
  await dialog.getByLabel('Postleitzahl', { exact: true }).fill('10115');
  await dialog.getByRole('button', { name: 'Kategorie auswählen', exact: true }).tap();
  for (const name of ['Mode & Beauty …', 'Herrenbekleidung …', 'Shirts']) {
    await dialog.getByRole('combobox', { name: 'Unterkategorie auswählen', exact: true }).click();
    await page.getByRole('option', { name, exact: true }).click();
  }
  await dialog.getByRole('combobox', { name: 'Zustand', exact: true }).click();
  await page.getByRole('option', { name: 'Gut', exact: true }).click();
  await dialog.getByRole('button', { name: 'Entwurf speichern', exact: true }).tap();
  await expect(
    dialog.getByText('Entwurf und alle Bilder sind gesichert.', { exact: true }),
  ).toBeVisible();
  return result;
}
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
        const publish = dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true });
        await expect(publish).toBeEnabled();
        await publish.focus();
        await page.keyboard.press('Enter');
        await expect(
          dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true }),
        ).toBeVisible();
        expect(f.calls.filter((value) => value['action'] === 'listing_enqueue')).toHaveLength(1);
        expect(f.providerCalls).toBe(1);
        expect(f.job?.externalId).toBe('999');
        await expect(
          dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }),
        ).toHaveCount(0);
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
        if (width === 1440 && theme === 'light')
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
      await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
      await expect(dialog.getByText(/Das kostenlose Kontingent ist ausgeschöpft/)).toBeVisible();
      expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
      expect(f.providerCalls).toBe(0);
    },
  );
test('Gebühren stoppen den Auftrag ohne Erfolgsmeldung @core-smoke', async ({ page }) => {
  const f = await mockKleinanzeigenTransfer(page, { result: 'fees' });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
  await expect(
    dialog.getByText('Kleinanzeigen zeigt Gebühren. Die Veröffentlichung wurde gestoppt.', {
      exact: true,
    }),
  ).toBeVisible();
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
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
  await expect(dialog.getByText('Ergebnis noch unklar', { exact: true })).toBeVisible();
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
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
  await expect(dialog.getByText('Wird von Kleinanzeigen geprüft', { exact: true })).toBeVisible();
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
  await dialog.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(dialog.getByText(/Prüfe Titel, Beschreibung und Preis/)).toBeVisible();
});
test('Unvollständige Bilder blockieren die Veröffentlichung @core-smoke', async ({ page }) => {
  await mockKleinanzeigenTransfer(page, { imagesComplete: false });
  const { dialog } = await open(page);
  await dialog.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(
    dialog.getByText('Der Entwurf ist gespeichert; die Bildübernahme ist noch unvollständig.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }),
  ).toBeDisabled();
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
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
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
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
  await expect(
    dialog.getByRole('alert').filter({ hasText: /Auftrag konnte noch nicht bestätigt/ }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
  await expect(dialog.getByText('Bei Kleinanzeigen veröffentlicht', { exact: true })).toBeVisible();
  expect(f.calls.filter((value) => value['action'] === 'listing_enqueue')).toHaveLength(1);
  expect(f.providerCalls).toBe(1);
});
test('Ein gewechseltes Browserkonto stoppt vor der Auftragsannahme @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { wrongBindingOnPublish: true });
  const { dialog } = await ready(page);
  await dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: /Browserprofil/ })).toBeVisible();
  expect(f.calls.some((value) => value['action'] === 'listing_enqueue')).toBe(false);
  expect(f.providerCalls).toBe(0);
});
test('Ohne passende Erweiterung bleibt die automatische Veröffentlichung gesperrt @core-smoke', async ({
  page,
}) => {
  const f = await mockKleinanzeigenTransfer(page, { extensionAvailable: false });
  const { dialog } = await open(page);
  await dialog.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
  await expect(
    dialog.getByText('Entwurf und alle Bilder sind gesichert.', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Kostenlos inserieren', exact: true }),
  ).toBeDisabled();
  expect(f.providerCalls).toBe(0);
});

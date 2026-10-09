import type { Page } from 'playwright';
import type {
  VintedListingCategoryFields,
  VintedListingChoiceField,
  VintedListingChoiceSnapshot,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  collectVintedListingChoices,
  collectVintedListingFormMetadata,
  parseVintedListingChoices,
} from './vinted-listing-contracts.ts';

function assertListingForm(page: Page): void {
  const url = new URL(page.url());
  if (
    url.origin !== 'https://www.vinted.de' ||
    !/^\/items\/(?:new|[1-9][0-9]*\/edit)$/.test(url.pathname)
  )
    throw new Error('Vinted-Formular nicht verfügbar.');
}

async function readPopup(
  page: Page,
  field: VintedListingChoiceField,
  categoryPath: readonly number[] = [],
): Promise<VintedListingChoiceSnapshot> {
  if (field === 'package')
    return parseVintedListingChoices(
      field,
      await page.evaluate(collectVintedListingChoices, field),
    );
  const input = page.locator(`#${field}`);
  if (!(await input.isVisible()) || !(await input.isEnabled()))
    throw new Error('Dieses Vinted-Merkmal ist nicht verfügbar.');
  try {
    await input.click({ timeout: 5000 });
    if (field === 'category') {
      for (const parentId of categoryPath) {
        // Kategoriegruppen öffnen; Endkategorien niemals zur bloßen Prüfung auswählen.
        await page
          .getByRole('button')
          .and(page.locator(`#catalog-${parentId}`))
          .click({ timeout: 5000 });
      }
    }
    // Erst die sichtbare Auswahl abwarten; keine Kennungen aus einem früheren Popup benutzen.
    const selector =
      field === 'size'
        ? '[role="checkbox"][data-testid^="size-group-"]'
        : field === 'category'
          ? '[role="radio"][id^="catalog-"]'
          : field === 'brand'
            ? '[role="radio"][id^="brand-"],[role="radio"][id^="suggested-brand-"],[role="radio"]#empty-brand'
            : `[role="${field === 'color' || field === 'material' ? 'checkbox' : 'radio'}"][id^="${field}-"]`;
    await page
      .locator(selector)
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
    return parseVintedListingChoices(
      field,
      await page.evaluate(collectVintedListingChoices, field),
    );
  } finally {
    await page.keyboard.press('Escape');
  }
}

/** Liest Auswahl und Sperren. Öffnen/Schließen eines Popups speichert nichts bei Vinted. */
export async function readVintedListingChoices(
  page: Page,
  accountId: string,
  expectedCategoryId: number | null,
  field: VintedListingChoiceField,
  categoryPath: readonly number[] = [],
): Promise<VintedListingChoiceSnapshot> {
  assertListingForm(page);
  if (
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    (expectedCategoryId !== null &&
      (!Number.isSafeInteger(expectedCategoryId) || expectedCategoryId <= 0)) ||
    !Array.isArray(categoryPath) ||
    categoryPath.length > 30 ||
    categoryPath.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(categoryPath).size !== categoryPath.length
  )
    throw new Error('Vinted-Formularangaben ungültig.');
  if ((await readVintedAccountIdentity(page))?.id !== accountId)
    throw new Error('Vinted-Konto stimmt nicht überein.');
  const category = await readPopup(page, 'category', categoryPath);
  const categoryId = category.choices.find((choice) => choice.selected)?.id ?? null;
  if (categoryId !== expectedCategoryId)
    throw new Error('Die Vinted-Kategorie wurde inzwischen geändert.');
  const result = field === 'category' ? category : await readPopup(page, field);
  assertListingForm(page);
  if ((await readVintedAccountIdentity(page))?.id !== accountId)
    throw new Error('Vinted-Konto wurde inzwischen geändert.');
  return result;
}

/** Kategoriegebundene Auswahl aus dem aktuellen Formular; unbekannte Merkmale bleiben ausdrücklich sichtbar. */
export async function readVintedListingCategoryFields(
  page: Page,
  accountId: string,
  expectedCategoryId: number,
  categoryPath: readonly number[],
): Promise<VintedListingCategoryFields> {
  await readVintedListingChoices(page, accountId, expectedCategoryId, 'category', categoryPath);
  await page.locator('#condition').waitFor({ state: 'visible', timeout: 5000 });
  const { presentFields, ...metadata } = await page.evaluate(collectVintedListingFormMetadata);
  const fields: VintedListingChoiceSnapshot[] = [];
  for (const field of presentFields) fields.push(await readPopup(page, field));
  // Während des Abrufs können Kategorie oder Konto wechseln. Keine gemischte Auswahl zurückgeben.
  await readVintedListingChoices(page, accountId, expectedCategoryId, 'category', categoryPath);
  return { categoryId: expectedCategoryId, fields, ...metadata };
}

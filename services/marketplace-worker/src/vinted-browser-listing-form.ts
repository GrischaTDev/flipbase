import type { Page } from 'playwright';
import type {
  VintedListingCategoryFields,
  VintedListingChoiceField,
  VintedListingChoiceSnapshot,
  VintedListingContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { VintedListingReadError } from './vinted-listing-read-error.ts';
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

async function readVisibleListingChoices(
  page: Page,
  field: VintedListingChoiceField,
  allowEmptyBrandChoices = false,
): Promise<VintedListingChoiceSnapshot | null> {
  try {
    const collected = await page.evaluate(collectVintedListingChoices, field);
    if (field === 'package' && Array.isArray(collected)) {
      if (collected.length === 0) throw new VintedListingReadError('package_options');
      if (collected.some((choice) => typeof choice.label === 'string' && !choice.label.trim()))
        throw new VintedListingReadError('package_label');
    }
    if (
      field === 'brand' &&
      allowEmptyBrandChoices &&
      Array.isArray(collected) &&
      collected.length === 0
    )
      return null;
    return parseVintedListingChoices(field, collected);
  } catch (error) {
    if (field === 'package')
      throw error instanceof VintedListingReadError
        ? error
        : new VintedListingReadError('package_parse');
    if (field === 'brand') throw new VintedListingReadError('brand_parse');
    throw error;
  }
}

/** Öffnet eine aktuelle Auswahl; der Aufrufer schließt sie auch bei Fehlern mit Escape. */
export async function openVintedListingChoices(
  page: Page,
  field: VintedListingChoiceField,
  categoryPath: readonly number[] = [],
  options: {
    brand?: Pick<VintedListingContent, 'brandId' | 'brandLabel'>;
    targetCategoryId?: number;
  } = {},
): Promise<VintedListingChoiceSnapshot> {
  if (
    options.targetCategoryId !== undefined &&
    (!Number.isSafeInteger(options.targetCategoryId) || options.targetCategoryId <= 0)
  )
    throw new Error('Vinted-Kategorie ungültig.');
  if (field === 'package') {
    const choices = await readVisibleListingChoices(page, field);
    if (!choices) throw new VintedListingReadError('package_parse');
    return choices;
  }
  const input = page.locator(`#${field}`);
  try {
    // Die Markenauswahl wird nach einem Kategorienwechsel sichtbar, bevor ihre Daten geladen sind.
    await input.click({ timeout: field === 'brand' ? 15_000 : 5000 });
  } catch (error) {
    if (field === 'brand') throw new VintedListingReadError('brand_open');
    throw new Error('Dieses Vinted-Merkmal ist nicht verfügbar.', { cause: error });
  }
  if (field === 'category') {
    for (const parentId of categoryPath) {
      // Kategoriegruppen öffnen; Endkategorien niemals zur bloßen Prüfung auswählen.
      await page
        .getByRole('button')
        .and(page.locator(`#catalog-${parentId}`))
        .click({ timeout: 5000 });
    }
  }
  const brand = options.brand;
  const canSearchBrand = field === 'brand' && brand !== undefined && brand.brandId !== null;
  const brandSearchSelector = 'input#brand-search-input[data-testid="brand-search--input"]';
  // Eine leere Markensuche braucht keinen zufälligen populären Treffer als Startbedingung.
  const selector =
    field === 'size'
      ? '[role="checkbox"][data-testid^="size-group-"]'
      : field === 'category'
        ? options.targetCategoryId === undefined
          ? '[role="radio"][id^="catalog-"]'
          : `[role="radio"]#catalog-${options.targetCategoryId},[role="radio"]#catalog-suggestion-${options.targetCategoryId}`
        : field === 'brand'
          ? '[role="radio"][id^="brand-"],[role="radio"][id^="suggested-brand-"],[role="radio"]#empty-brand' +
            (canSearchBrand ? ',' + brandSearchSelector : '')
          : field === 'color'
            ? '[role="checkbox"][id^="color-"],[role="checkbox"][data-testid^="filter-grid-option-"]:has([data-testid^="color-"])'
            : `[role="${field === 'material' ? 'checkbox' : 'radio'}"][id^="${field}-"]`;
  try {
    await page
      .locator(selector)
      .filter({ visible: true })
      .first()
      // Auch nach dem bedienbaren Markenfeld lädt Vinted die Optionen erst nach.
      .waitFor({ state: 'visible', timeout: field === 'brand' ? 15_000 : 5000 });
  } catch (error) {
    if (field === 'brand') throw new VintedListingReadError('brand_options');
    if (field === 'category')
      throw new Error('Die Vinted-Kategorie ist nicht verfügbar.', { cause: error });
    throw error;
  }
  let choices = await readVisibleListingChoices(page, field, canSearchBrand);
  if (
    field === 'brand' &&
    brand &&
    brand.brandId !== null &&
    !choices?.choices.some((choice) => choice.id === brand.brandId)
  ) {
    if (
      !Number.isSafeInteger(brand.brandId) ||
      brand.brandId <= 0 ||
      !brand.brandLabel.trim() ||
      brand.brandLabel.length > 2000 ||
      [...brand.brandLabel].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      throw new VintedListingReadError('brand_search');
    const search = page.locator(brandSearchSelector);
    if ((await search.count()) !== 1) throw new VintedListingReadError('brand_search');
    try {
      await search.fill(brand.brandLabel, { timeout: 15_000 });
      // Der gewünschte Treffer fehlte zuvor. Damit reicht kein alter Vorschlag als Suchbeleg.
      await page
        .locator(
          `[role="radio"]#brand-${brand.brandId},[role="radio"]#suggested-brand-${brand.brandId}`,
        )
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      throw new VintedListingReadError('brand_search');
    }
    choices = await readVisibleListingChoices(page, field);
  }
  if (!choices) throw new VintedListingReadError('brand_parse');
  return choices;
}

async function readPopup(
  page: Page,
  field: VintedListingChoiceField,
  categoryPath: readonly number[] = [],
  options: {
    brand?: Pick<VintedListingContent, 'brandId' | 'brandLabel'>;
    targetCategoryId?: number;
    authorize?: () => Promise<void>;
  } = {},
): Promise<VintedListingChoiceSnapshot> {
  try {
    await options.authorize?.();
    const result = await openVintedListingChoices(page, field, categoryPath, options);
    await options.authorize?.();
    return result;
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
  options: {
    allowRememberedCategory?: boolean;
    targetCategoryId?: number;
    brand?: Pick<VintedListingContent, 'brandId' | 'brandLabel'>;
    /**
     * Beim Bearbeiten öffnet Vinted die Kategorieauswahl ganz oben im Katalog und markiert die
     * gewählte Kategorie dort nicht. Die Kennung kommt dann aus dem Inserat selbst.
     */
    readCategoryId?: () => Promise<number | null>;
  } = {},
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
  const category = options.readCategoryId
    ? undefined
    : await readPopup(page, 'category', categoryPath, {
        targetCategoryId: options.targetCategoryId ?? expectedCategoryId ?? undefined,
      });
  const categoryId = options.readCategoryId
    ? await options.readCategoryId()
    : (category?.choices.find((choice) => choice.selected)?.id ?? null);
  if (
    categoryId !== expectedCategoryId &&
    !(
      options.allowRememberedCategory === true &&
      expectedCategoryId === null &&
      field === 'category'
    )
  )
    throw new Error('Die Vinted-Kategorie wurde inzwischen geändert.');
  const result =
    field === 'category'
      ? (category ?? (await readPopup(page, 'category', categoryPath)))
      : await readPopup(page, field, [], options);
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
  options: {
    brand?: Pick<VintedListingContent, 'brandId' | 'brandLabel'>;
    authorize?: () => Promise<void>;
    readCategoryId?: () => Promise<number | null>;
    onReadField?: (field: VintedListingChoiceField | 'metadata') => void;
  } = {},
): Promise<VintedListingCategoryFields> {
  const category = options.readCategoryId ? { readCategoryId: options.readCategoryId } : {};
  options.onReadField?.('category');
  await options.authorize?.();
  await readVintedListingChoices(
    page,
    accountId,
    expectedCategoryId,
    'category',
    categoryPath,
    category,
  );
  await options.authorize?.();
  options.onReadField?.('condition');
  await page.locator('#condition').waitFor({ state: 'visible', timeout: 5000 });
  options.onReadField?.('metadata');
  const { presentFields, ...metadata } = await page.evaluate(collectVintedListingFormMetadata);
  const fields: VintedListingChoiceSnapshot[] = [];
  for (const field of presentFields) {
    options.onReadField?.(field);
    fields.push(await readPopup(page, field, [], options));
  }
  // Während des Abrufs können Kategorie oder Konto wechseln. Keine gemischte Auswahl zurückgeben.
  options.onReadField?.('category');
  await readVintedListingChoices(
    page,
    accountId,
    expectedCategoryId,
    'category',
    categoryPath,
    category,
  );
  return { categoryId: expectedCategoryId, fields, ...metadata };
}

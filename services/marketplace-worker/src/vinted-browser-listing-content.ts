import type { Page } from 'playwright';
import type {
  VintedListingChoice,
  VintedListingChoiceField,
  VintedListingCurrentContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import {
  readVintedAccountIdentity,
  VintedInteractionRequiredError,
  VintedVerificationRequiredError,
} from './vinted-browser-reader.ts';
import { VintedListingReadError, type VintedListingReadStep } from './vinted-listing-read-error.ts';
import { readVintedListingCategoryFields } from './vinted-browser-listing-form.ts';
import {
  collectVintedListingFormValues,
  collectVintedListingPhotoState,
  parseVintedListingCategoryFields,
  parseVintedListingCurrentContent,
  type VintedListingFormValues,
  type VintedListingPhotoState,
} from './vinted-listing-contracts.ts';

function invalid(): Error {
  return new Error('Das Vinted-Inserat konnte nicht vollständig gelesen werden.');
}

/** Liest einen Preis, wie ihn das Preisfeld der Maske zeigt, als Cent-Betrag. */
export function parseVintedListingPriceCents(input: string): number {
  return priceCents(input);
}

function priceCents(input: string): number {
  let price = input.replace(/[€\s]/gu, '');
  if (price.includes('.') && price.includes(',')) {
    if (!/^[0-9]{1,3}(?:\.[0-9]{3})+,[0-9]{1,2}$/.test(price)) throw invalid();
    price = price.replaceAll('.', '');
  }
  const match = /^([0-9]{1,9})(?:[,.]([0-9]{1,2}))?$/.exec(price);
  if (!match) throw invalid();
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  if (cents <= 0) throw invalid();
  return cents;
}

/** Fotoraster der Maske, sobald alle Bilder geladen sind; ein halb geladenes Raster ist ein Fehler. */
export async function readLoadedVintedListingPhotos(page: Page): Promise<VintedListingPhotoState> {
  return loadedPhotos(page);
}

async function loadedPhotos(page: Page): Promise<VintedListingPhotoState> {
  // Bilder laden nach dem Formular; ein halb geladenes Raster wäre kein vollständiger Iststand.
  for (let attempt = 0; ; attempt++) {
    const photos = await page.evaluate(collectVintedListingPhotoState);
    if (!photos.valid) throw invalid();
    if (photos.items.length > 0 && photos.items.every((item) => item.ready)) return photos;
    if (attempt >= 40) throw invalid();
    await page.waitForTimeout(250);
  }
}

/** Angaben, die Vinteds Bearbeitungsmaske nicht markiert anzeigt. */
export interface VintedListingItemReference {
  categoryId: number;
  brandId: number | null;
  brandLabel: string;
}

/**
 * Kategorie und Marke eines bestehenden Inserats aus der Schnittstelle, die auch Vinteds
 * Bearbeitungsmaske bedient. Die Maske markiert die gewählte Kategorie nicht und zeigt eine
 * seltene Marke erst nach einer Suche. Ein fremdes oder unlesbares Inserat ergibt `null`.
 */
export async function readVintedListingItemReference(
  page: Page,
  externalId: string,
): Promise<VintedListingItemReference | null> {
  if (!/^[1-9][0-9]{0,31}$/.test(externalId)) return null;
  const address = new URL(page.url());
  if (
    address.origin !== 'https://www.vinted.de' ||
    address.pathname !== '/items/' + externalId + '/edit'
  )
    return null;
  let value: unknown;
  try {
    value = await page.evaluate(async (itemId) => {
      const response = await fetch('/api/v2/item_upload/items/' + itemId, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok || new URL(response.url).origin !== 'https://www.vinted.de') return null;
      const body: unknown = await response.json();
      const item =
        body && typeof body === 'object' && 'item' in body && body.item ? body.item : null;
      if (!item || typeof item !== 'object' || !('id' in item) || !('catalog_id' in item))
        return null;
      const brand =
        'brand_dto' in item && item.brand_dto && typeof item.brand_dto === 'object'
          ? item.brand_dto
          : null;
      return {
        id: item.id,
        categoryId: item.catalog_id,
        brandId: 'brand_id' in item ? item.brand_id : null,
        brandLabel: brand && 'title' in brand ? brand.title : null,
      };
    }, externalId);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !('id' in value) || !('categoryId' in value))
    return null;
  const { id, categoryId } = value;
  if (
    String(id) !== externalId ||
    typeof categoryId !== 'number' ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0
  )
    return null;
  const brandId = 'brandId' in value ? value.brandId : null;
  const brandLabel = 'brandLabel' in value ? value.brandLabel : null;
  const hasBrand =
    typeof brandId === 'number' &&
    Number.isSafeInteger(brandId) &&
    brandId > 0 &&
    typeof brandLabel === 'string' &&
    brandLabel.trim().length > 0 &&
    brandLabel.length <= 2000;
  return {
    categoryId,
    brandId: hasBrand ? brandId : null,
    brandLabel: hasBrand ? brandLabel.trim() : '',
  };
}

/**
 * Liest die bereits geöffnete Bearbeitungsmaske. Öffnet und schließt nur Auswahllisten;
 * der Aufrufer bestimmt Seite, Navigation und die Prüfung von Konto und Rechten.
 */
export async function readOpenVintedListingContent(
  page: Page,
  accountId: string,
  externalId: string,
  check: () => Promise<void>,
  /** Meldet den jeweils begonnenen Schritt, damit ein Abbruch eingeordnet werden kann. */
  onStep: (step: VintedListingReadStep) => void = () => undefined,
): Promise<VintedListingCurrentContent> {
  onStep('values');
  const before = await page.evaluate(collectVintedListingFormValues);
  if (!before) throw invalid();
  onStep('photos');
  const photosBefore = await loadedPhotos(page);
  if (photosBefore.items.some((item) => item.url === null)) throw invalid();
  await check();
  onStep('category');
  // Die Kategorieauswahl der Bearbeitungsmaske markiert die gewählte Kategorie nicht. Kennung
  // aus dem Inserat, Bezeichnung aus dem sichtbaren Feld.
  const readCategoryId = async () =>
    (await readVintedListingItemReference(page, externalId))?.categoryId ?? null;
  const item = await readVintedListingItemReference(page, externalId);
  const categoryLabel = (await page.locator('#category').inputValue({ timeout: 5_000 })).trim();
  if (!item || !categoryLabel || categoryLabel.length > 200) throw invalid();
  const selectedCategory = { id: item.categoryId, label: categoryLabel };
  await check();
  onStep('fields');
  const schema = parseVintedListingCategoryFields(
    await readVintedListingCategoryFields(page, accountId, selectedCategory.id, [], {
      authorize: check,
      readCategoryId,
      // Eine Marke außerhalb der Vorschlagsliste erscheint erst nach der Suche.
      ...(item.brandId === null
        ? {}
        : { brand: { brandId: item.brandId, brandLabel: item.brandLabel } }),
    }),
    selectedCategory.id,
  );
  await check();
  onStep('changed');
  // Das Öffnen der Auswahllisten darf nichts verändert haben; sonst keinen gemischten Stand liefern.
  const after = await page.evaluate(collectVintedListingFormValues);
  const photosAfter = await page.evaluate(collectVintedListingPhotoState);
  if (!sameValues(before, after) || !samePhotos(photosBefore, photosAfter)) throw invalid();
  onStep('parse');
  const selected = (field: VintedListingChoiceField): readonly VintedListingChoice[] =>
    schema.fields
      .find((entry) => entry.field === field)
      ?.choices.filter((choice) => choice.selected) ?? [];
  const brand = selected('brand')[0];
  const size = selected('size')[0];
  const condition = selected('condition')[0];
  const colors = selected('color');
  const materials = selected('material');
  const result: VintedListingCurrentContent = {
    externalId,
    externalAccountId: accountId,
    content: {
      title: before.title,
      description: before.description,
      priceCents: priceCents(before.price),
      currency: 'EUR',
      categoryId: selectedCategory.id,
      categoryLabel: selectedCategory.label,
      brandId: brand?.id ?? null,
      brandLabel: brand?.label ?? '',
      sizeId: size?.id ?? null,
      sizeLabel: size?.label ?? '',
      conditionId: condition?.id ?? null,
      conditionLabel: condition?.label ?? '',
      colorIds: colors.map((choice) => choice.id as number),
      colorLabels: colors.map((choice) => choice.label),
      materialIds: materials.map((choice) => choice.id as number),
      materialLabels: materials.map((choice) => choice.label),
      packageSizeId: selected('package')[0]?.id ?? null,
      attributes: {},
    },
    aiPhoto: before.ai_photo,
    bump: before.bump,
    photoUrls: photosBefore.items.map((item) => item.url as string),
    schema,
  };
  await check();
  return parseVintedListingCurrentContent(result, accountId, externalId);
}

/**
 * Liest ein bestehendes Inserat ausschließlich auf einer neu reservierten Seite und schließt
 * diese danach. Auswahllisten werden nur geöffnet und wieder geschlossen; gespeichert wird nichts.
 */
export async function readVintedListingCurrentContent(
  page: Page,
  accountId: string,
  externalId: string,
  authorize: () => Promise<void>,
): Promise<VintedListingCurrentContent> {
  if (
    typeof accountId !== 'string' ||
    typeof externalId !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    !/^[1-9][0-9]{0,31}$/.test(externalId)
  )
    throw invalid();
  // Eine Seite mit Benutzerarbeit wird weder verwendet noch geschlossen.
  if (page.url() !== 'about:blank') throw new VintedListingReadError('reserve');
  const target = 'https://www.vinted.de/items/' + externalId + '/edit';
  let step: VintedListingReadStep = 'navigate';
  let authorizationFailed = false;
  // Ein Rechteverlust bleibt als solcher erkennbar und wird nicht als Lesefehler gemeldet.
  const authorized = async () => {
    try {
      await authorize();
    } catch (error) {
      authorizationFailed = true;
      throw error;
    }
  };
  try {
    await authorized();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    step = 'form';
    await page
      .locator('#content input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const check = async () => {
      const current = step;
      await authorized();
      step = 'identity';
      if (page.url() !== target || (await readVintedAccountIdentity(page))?.id !== accountId)
        throw invalid();
      step = current;
      await authorized();
    };
    await check();
    return await readOpenVintedListingContent(page, accountId, externalId, check, (next) => {
      step = next;
    });
  } catch (error) {
    if (
      error instanceof VintedInteractionRequiredError ||
      error instanceof VintedVerificationRequiredError
    )
      throw error;
    // Ein Rechteverlust wird als eigener Schritt gemeldet, nicht als Fehler der Maske.
    throw new VintedListingReadError(authorizationFailed ? 'authorize' : step);
  } finally {
    await page.close();
  }
}

function sameValues(
  before: VintedListingFormValues,
  after: VintedListingFormValues | null,
): boolean {
  return (
    after !== null &&
    after.title === before.title &&
    after.description === before.description &&
    after.price === before.price &&
    after.ai_photo === before.ai_photo &&
    after.bump === before.bump
  );
}

function samePhotos(before: VintedListingPhotoState, after: VintedListingPhotoState): boolean {
  return (
    after.valid &&
    after.items.length === before.items.length &&
    after.items.every(
      (item, index) => item.ready && item.url !== null && item.url === before.items[index]?.url,
    )
  );
}

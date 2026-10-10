import type { Page } from 'playwright';
import type {
  VintedListingChoice,
  VintedListingChoiceField,
  VintedListingCurrentContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  readVintedListingCategoryFields,
  readVintedListingChoices,
} from './vinted-browser-listing-form.ts';
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

/**
 * Liest die bereits geöffnete Bearbeitungsmaske. Öffnet und schließt nur Auswahllisten;
 * der Aufrufer bestimmt Seite, Navigation und die Prüfung von Konto und Rechten.
 */
export async function readOpenVintedListingContent(
  page: Page,
  accountId: string,
  externalId: string,
  check: () => Promise<void>,
): Promise<VintedListingCurrentContent> {
  const before = await page.evaluate(collectVintedListingFormValues);
  const photosBefore = await loadedPhotos(page);
  if (!before || photosBefore.items.some((item) => item.url === null)) throw invalid();
  await check();
  const category = (
    await readVintedListingChoices(page, accountId, null, 'category', [], {
      allowRememberedCategory: true,
    })
  ).choices.filter((choice) => choice.selected);
  const selectedCategory = category[0];
  if (category.length !== 1 || !selectedCategory || selectedCategory.id === null) throw invalid();
  await check();
  const schema = parseVintedListingCategoryFields(
    await readVintedListingCategoryFields(page, accountId, selectedCategory.id, [], {
      authorize: check,
    }),
    selectedCategory.id,
  );
  await check();
  // Das Öffnen der Auswahllisten darf nichts verändert haben; sonst keinen gemischten Stand liefern.
  const after = await page.evaluate(collectVintedListingFormValues);
  const photosAfter = await page.evaluate(collectVintedListingPhotoState);
  if (!sameValues(before, after) || !samePhotos(photosBefore, photosAfter)) throw invalid();
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
  if (page.url() !== 'about:blank') throw new Error('Die Inseratseite ist nicht neu reserviert.');
  const target = 'https://www.vinted.de/items/' + externalId + '/edit';
  try {
    await authorize();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page
      .locator('#content input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const check = async () => {
      await authorize();
      if (page.url() !== target || (await readVintedAccountIdentity(page))?.id !== accountId)
        throw invalid();
      await authorize();
    };
    await check();
    return await readOpenVintedListingContent(page, accountId, externalId, check);
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

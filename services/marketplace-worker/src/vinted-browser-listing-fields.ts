import type { Page, Locator } from 'playwright';
import type {
  VintedListingContent,
  VintedListingPhotoMetadata,
  VintedListingCategoryFields,
  VintedListingChoiceField,
  VintedListingChoiceSnapshot,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  readVintedListingCategoryFields,
  readVintedListingChoices,
  openVintedListingChoices,
} from './vinted-browser-listing-form.ts';
import { validateVintedListingSubmission } from './vinted-listing-contracts.ts';

function invalid(): Error {
  return new Error('Die Vinted-Inseratangaben konnten nicht übernommen werden.');
}
function assertNewForm(page: Page): void {
  const url = new URL(page.url());
  if (url.origin !== 'https://www.vinted.de' || url.pathname !== '/items/new') throw invalid();
}
function wanted(
  content: VintedListingContent,
  field: VintedListingChoiceField,
): readonly (number | null)[] {
  switch (field) {
    case 'brand':
      return [content.brandId];
    case 'size':
      return [content.sizeId];
    case 'condition':
      return [content.conditionId];
    case 'package':
      return [content.packageSizeId];
    case 'color':
      return content.colorIds;
    case 'material':
      return content.materialIds;
    default:
      throw invalid();
  }
}
function choiceLocator(
  page: Page,
  field: VintedListingChoiceField,
  id: number | null,
  group: number | null,
): Locator {
  if (field === 'package') return page.getByRole('button').and(page.locator('#package-size-' + id));
  if (field === 'brand')
    return page.locator(
      id === null
        ? '[role="radio"]#empty-brand'
        : `[role="radio"]#brand-${id},[role="radio"]#suggested-brand-${id}`,
    );
  if (field === 'size')
    return page
      .getByRole('checkbox')
      .and(page.getByTestId(`size-group-${group}-grid-option-${id}`));
  if (field === 'category')
    return page.locator(`[role="radio"]#catalog-${id},[role="radio"]#catalog-suggestion-${id}`);
  return page.locator(
    `[role="${field === 'color' || field === 'material' ? 'checkbox' : 'radio'}"]#${field}-${id}`,
  );
}
async function clickEnabled(locator: Locator): Promise<void> {
  const choices = await locator.filter({ visible: true }).all();
  for (const choice of choices) {
    if ((await choice.isEnabled()) && (await choice.getAttribute('aria-disabled')) !== 'true') {
      await choice.click({ timeout: 5000 });
      return;
    }
  }
  throw invalid();
}
function selectedMatches(
  field: VintedListingChoiceSnapshot,
  ids: readonly (number | null)[],
): boolean {
  const selected = field.choices.filter((choice) => choice.selected).map((choice) => choice.id);
  return selected.length === ids.length && selected.every((id) => ids.includes(id));
}
async function selectField(
  page: Page,
  expected: VintedListingChoiceSnapshot,
  ids: readonly (number | null)[],
  check: () => Promise<void>,
): Promise<void> {
  for (let step = 0; step < 8; step++) {
    await check();
    try {
      const brand =
        expected.field === 'brand'
          ? expected.choices.find((choice) => ids.includes(choice.id))
          : undefined;
      const actual = await openVintedListingChoices(page, expected.field, [], {
        brand: brand ? { brandId: brand.id, brandLabel: brand.label } : undefined,
      });
      if (
        actual.sizeGroupId !== expected.sizeGroupId ||
        ids.some((id) => {
          const previous = expected.choices.find((choice) => choice.id === id),
            current = actual.choices.find((choice) => choice.id === id);
          return !previous || !current || previous.label !== current.label;
        })
      )
        throw invalid();
      if (selectedMatches(actual, ids)) return;
      const multiple = expected.field === 'color' || expected.field === 'material';
      const change =
        (multiple
          ? actual.choices.find((choice) => choice.selected && !ids.includes(choice.id))
          : undefined) ??
        actual.choices.find((choice) => ids.includes(choice.id) && !choice.selected);
      if (!change || change.disabled) throw invalid();
      await check();
      await clickEnabled(choiceLocator(page, expected.field, change.id, actual.sizeGroupId));
      if (expected.field === 'brand')
        await page.waitForFunction(
          (label) => {
            const input = document.querySelector('#content #brand');
            return input instanceof HTMLInputElement && input.value === label;
          },
          change.label,
          { timeout: 5000 },
        );
    } finally {
      if (expected.field !== 'package') await page.keyboard.press('Escape');
    }
  }
  throw invalid();
}
function priceMatches(text: string, cents: number): boolean {
  let value = text.replace(/[€\s]/gu, '');
  if (value.includes('.') && value.includes(',')) {
    if (!/^[0-9]{1,3}(?:\.[0-9]{3})+,[0-9]{1,2}$/.test(value)) return false;
    value = value.replaceAll('.', '');
  }
  const match = /^([0-9]+)(?:[,.]([0-9]{1,2}))?$/.exec(value);
  return (
    !!match &&
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0') === BigInt(cents)
  );
}

/** Bereitet eine leere Neuanlagemaske vor; ruft weder Upload noch Speichern auf. */
export async function prepareVintedListingFields(
  page: Page,
  accountId: string,
  content: VintedListingContent,
  photos: readonly VintedListingPhotoMetadata[],
  categoryPath: readonly number[],
  authorize: () => Promise<void>,
  /** Nur für eine vom Ausführer frisch geöffnete, exklusiv reservierte Maske. */
  options: { allowRememberedChoices?: boolean } = {},
): Promise<VintedListingCategoryFields> {
  if (
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    !Number.isSafeInteger(content.categoryId) ||
    !content.categoryId ||
    content.categoryId < 0 ||
    categoryPath.length > 30 ||
    categoryPath.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(categoryPath).size !== categoryPath.length
  )
    throw invalid();
  const categoryBinding: { text?: string } = {};
  const check = async () => {
    assertNewForm(page);
    await authorize();
    if ((await readVintedAccountIdentity(page))?.id !== accountId) throw invalid();
    assertNewForm(page);
    if (
      categoryBinding.text !== undefined &&
      (await page.locator('#content #category').inputValue()) !== categoryBinding.text
    )
      throw invalid();
  };
  await check();
  for (const selector of [
    'input[name="title"]',
    'textarea[name="description"]',
    'input[name="price"]',
    '#category',
    '#brand',
    '#size',
    '#condition',
    '#color',
    '#material',
  ]) {
    const input = page.locator('#content ' + selector);
    if ((await input.count()) > 1) throw invalid();
    if (
      (await input.count()) === 1 &&
      (await input.inputValue()).trim() &&
      !(options.allowRememberedChoices === true && selector.startsWith('#'))
    )
      throw invalid();
  }
  if ((await page.locator('#content [data-testid^="image-wrapper-"]').count()) > 0) throw invalid();
  const category = await readVintedListingChoices(page, accountId, null, 'category', categoryPath, {
    allowRememberedCategory: options.allowRememberedChoices === true,
  });
  const target = category.choices.find((choice) => choice.id === content.categoryId);
  if (!target || target.disabled) throw invalid();
  await check();
  try {
    if (!target.selected) {
      await page.locator('#category').click({ timeout: 5000 });
      for (const parentId of categoryPath)
        await page
          .getByRole('button')
          .and(page.locator('#catalog-' + parentId))
          .click({ timeout: 5000 });
      await check();
      await clickEnabled(choiceLocator(page, 'category', content.categoryId, null));
    }
  } finally {
    await page.keyboard.press('Escape');
  }
  categoryBinding.text = await page.locator('#content #category').inputValue();
  if (!categoryBinding.text.trim()) throw invalid();
  await check();
  const schema = await readVintedListingCategoryFields(
    page,
    accountId,
    content.categoryId,
    categoryPath,
    { brand: content },
  );
  if (validateVintedListingSubmission(content, photos, schema).length > 0) throw invalid();
  await check();
  await page.locator('#content input[name="title"]').fill(content.title);
  await check();
  await page.locator('#content textarea[name="description"]').fill(content.description);
  await check();
  const price = content.priceCents!;
  await page
    .locator('#content input[name="price"]')
    .fill(Math.floor(price / 100) + ',' + String(price % 100).padStart(2, '0'));
  for (const field of schema.fields)
    await selectField(page, field, wanted(content, field.field), check);
  await check();
  const final = await readVintedListingCategoryFields(
    page,
    accountId,
    content.categoryId,
    categoryPath,
    { brand: content },
  );
  if (
    validateVintedListingSubmission(content, photos, final).length > 0 ||
    final.fields.some((field) => !selectedMatches(field, wanted(content, field.field))) ||
    (await page.locator('#content input[name="title"]').inputValue()) !== content.title ||
    (await page.locator('#content textarea[name="description"]').inputValue()) !==
      content.description ||
    !priceMatches(await page.locator('#content input[name="price"]').inputValue(), price)
  )
    throw invalid();
  await check();
  return final;
}

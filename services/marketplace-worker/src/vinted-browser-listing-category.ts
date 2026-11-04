import type { Page, Locator } from 'playwright';
import type { VintedListingCategoryFields } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  VintedInteractionRequiredError,
  VintedVerificationRequiredError,
} from './vinted-browser-reader.ts';
import { VintedListingReadError, type VintedListingReadStep } from './vinted-listing-read-error.ts';
import {
  vintedListingFormSelector,
  parseVintedListingCategoryFields,
  parseVintedListingChoices,
  collectVintedListingChoices,
} from './vinted-listing-contracts.ts';
import {
  readVintedListingCategoryFields,
  readVintedListingChoices,
  openVintedListingChoices,
} from './vinted-browser-listing-form.ts';
import {
  vintedListingControlValue,
  vintedListingFormControl,
  waitForVintedListingControlValue,
} from './vinted-listing-form-controls.ts';

function invalid(): Error {
  return new Error('Die Vinted-Kategorie konnte nicht sicher ausgewählt werden.');
}
/** Wählt nur die Kategorie in einer leeren Neuanlagemaske; keine Artikeltexte, Fotos oder Speicherung. */
export async function selectVintedListingNewCategory(
  page: Page,
  accountId: string,
  categoryId: number,
  categoryPath: readonly number[],
  authorize: () => Promise<void>,
  options: {
    allowRememberedChoices?: boolean;
    categoryLabel?: string;
    existingExternalId?: string;
  } = {},
): Promise<string> {
  if (
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0 ||
    !Array.isArray(categoryPath) ||
    categoryPath.length > 30 ||
    categoryPath.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(categoryPath).size !== categoryPath.length ||
    categoryPath.includes(categoryId)
  )
    throw invalid();
  const check = async () => {
    const url = new URL(page.url());
    if (options.existingExternalId && !/^[1-9][0-9]{0,31}$/.test(options.existingExternalId))
      throw invalid();
    const expectedPath = options.existingExternalId
      ? `/items/${options.existingExternalId}/edit`
      : '/items/new';
    if (url.origin !== 'https://www.vinted.de' || url.pathname !== expectedPath) throw invalid();
    await authorize();
    if ((await readVintedAccountIdentity(page))?.id !== accountId) throw invalid();
    const current = new URL(page.url());
    if (current.origin !== url.origin || current.pathname !== url.pathname) throw invalid();
  };
  await check();
  if (!options.existingExternalId) {
    for (const selector of [
      'input[name="title"]',
      'textarea[name="description"]',
      'input[name="price"]',
    ]) {
      const input = page.locator(vintedListingFormSelector + ' ' + selector);
      if ((await input.count()) > 1) throw invalid();
      if (
        (await input.count()) === 1 &&
        (await input.inputValue()).trim() &&
        !(options.allowRememberedChoices === true && selector.startsWith('#'))
      )
        throw invalid();
    }
    for (const field of [
      'category',
      'accessory_department',
      'brand',
      'size',
      'condition',
      'color',
      'material',
    ] as const) {
      const control = await vintedListingFormControl(page, field, true);
      if (control && control.value && options.allowRememberedChoices !== true) throw invalid();
    }
    if (
      (await page.locator(vintedListingFormSelector + ' [data-testid^="image-wrapper-"]').count()) >
      0
    )
      throw invalid();
  }
  const category = await readVintedListingChoices(page, accountId, null, 'category', categoryPath, {
    allowRememberedCategory:
      options.allowRememberedChoices === true || !!options.existingExternalId,
    targetCategoryId: categoryId,
    categoryLabel: options.categoryLabel,
  });
  const target = category.choices.find((choice) => choice.id === categoryId);
  if (!target || target.disabled) throw invalid();
  await check();
  try {
    if (!target.selected) {
      await openVintedListingChoices(page, 'category', categoryPath, {
        targetCategoryId: categoryId,
        categoryLabel: options.categoryLabel,
        authorize: check,
      });
      await check();
      await page
        .locator(
          `[role="radio"]#catalog-${categoryId},[role="radio"]#catalog-suggestion-${categoryId},[role="radio"]#catalog-search-${categoryId}-result`,
        )
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
      const candidates = await page
        .locator(
          `[role="radio"]#catalog-${categoryId},[role="radio"]#catalog-suggestion-${categoryId},[role="radio"]#catalog-search-${categoryId}-result`,
        )
        .filter({ visible: true })
        .all();
      const current = parseVintedListingChoices(
        'category',
        await page.evaluate(collectVintedListingChoices, 'category' as const),
      );
      const currentTarget = current.choices.find((choice) => choice.id === categoryId);
      if (!currentTarget || currentTarget.disabled || currentTarget.label !== target.label)
        throw invalid();
      // Gleiche Vorschläge mit gleicher Kennung/Bezeichnung sind bereits gemeinsam geprüft.
      const enabled: Locator[] = [];
      for (const choice of candidates)
        if ((await choice.isEnabled()) && (await choice.getAttribute('aria-disabled')) !== 'true')
          enabled.push(choice);
      if (enabled.length === 0) throw invalid();
      await enabled[0]!.click({ timeout: 5000 });
      await waitForVintedListingControlValue(page, 'category', target.label);
    }
  } finally {
    await page.keyboard.press('Escape');
  }
  const text = await vintedListingControlValue(page, 'category');
  if (!text.trim()) throw invalid();
  await check();
  await readVintedListingChoices(page, accountId, categoryId, 'category', categoryPath);
  await check();
  return text;
}

/** Liest Anbieterwerte ausschließlich auf einer neuen reservierten Seite und schließt diese danach. */
export async function readVintedListingNewCategory(
  page: Page,
  accountId: string,
  categoryId: number,
  categoryPath: readonly number[],
  authorize: () => Promise<void>,
  categoryLabel?: string,
): Promise<VintedListingCategoryFields> {
  if (page.url() !== 'about:blank') throw new Error('Die Inseratseite ist nicht neu reserviert.');
  let step: VintedListingReadStep = 'authorize';
  try {
    await authorize();
    step = 'navigate';
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    step = 'form';
    await page
      .locator(vintedListingFormSelector + ' input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    step = 'category';
    const text = await selectVintedListingNewCategory(
      page,
      accountId,
      categoryId,
      categoryPath,
      authorize,
      { allowRememberedChoices: true, categoryLabel },
    );
    const check = async () => {
      await authorize();
      if (
        page.url() !== 'https://www.vinted.de/items/new' ||
        (await readVintedAccountIdentity(page))?.id !== accountId ||
        (await vintedListingControlValue(page, 'category')) !== text
      )
        throw invalid();
    };
    step = 'identity';
    await check();
    const fields = await readVintedListingCategoryFields(
      page,
      accountId,
      categoryId,
      categoryPath,
      {
        authorize: check,
        onReadField: (field) => {
          step = field;
        },
      },
    );
    step = 'changed';
    await check();
    step = 'parse';
    return parseVintedListingCategoryFields(fields, categoryId);
  } catch (error) {
    if (
      error instanceof VintedInteractionRequiredError ||
      error instanceof VintedVerificationRequiredError
    )
      throw error;
    throw new VintedListingReadError(step);
  } finally {
    await page.close();
  }
}

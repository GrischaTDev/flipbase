import type { Page, Locator } from 'playwright';
import type { VintedListingCategoryFields } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  parseVintedListingCategoryFields,
  parseVintedListingChoices,
  collectVintedListingChoices,
} from './vinted-listing-contracts.ts';
import {
  readVintedListingCategoryFields,
  readVintedListingChoices,
} from './vinted-browser-listing-form.ts';

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
  options: { allowRememberedChoices?: boolean } = {},
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
    if (url.origin !== 'https://www.vinted.de' || url.pathname !== '/items/new') throw invalid();
    await authorize();
    if ((await readVintedAccountIdentity(page))?.id !== accountId) throw invalid();
    const current = new URL(page.url());
    if (current.origin !== url.origin || current.pathname !== url.pathname) throw invalid();
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
  const target = category.choices.find((choice) => choice.id === categoryId);
  if (!target || target.disabled) throw invalid();
  await check();
  try {
    if (!target.selected) {
      await page.locator('#category').click({ timeout: 5000 });
      for (const parentId of categoryPath) {
        await check();
        await page
          .getByRole('button')
          .and(page.locator('#catalog-' + parentId))
          .click({ timeout: 5000 });
      }
      await check();
      const candidates = await page
        .locator(
          `[role="radio"]#catalog-${categoryId},[role="radio"]#catalog-suggestion-${categoryId}`,
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
    }
  } finally {
    await page.keyboard.press('Escape');
  }
  const text = await page.locator('#content #category').inputValue();
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
): Promise<VintedListingCategoryFields> {
  if (page.url() !== 'about:blank') throw new Error('Die Inseratseite ist nicht neu reserviert.');
  try {
    await authorize();
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page
      .locator('#content input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const text = await selectVintedListingNewCategory(
      page,
      accountId,
      categoryId,
      categoryPath,
      authorize,
      { allowRememberedChoices: true },
    );
    const check = async () => {
      await authorize();
      if (
        page.url() !== 'https://www.vinted.de/items/new' ||
        (await readVintedAccountIdentity(page))?.id !== accountId ||
        (await page.locator('#content #category').inputValue()) !== text
      )
        throw invalid();
    };
    await check();
    const fields = await readVintedListingCategoryFields(
      page,
      accountId,
      categoryId,
      categoryPath,
      { authorize: check },
    );
    await check();
    return parseVintedListingCategoryFields(fields, categoryId);
  } finally {
    await page.close();
  }
}

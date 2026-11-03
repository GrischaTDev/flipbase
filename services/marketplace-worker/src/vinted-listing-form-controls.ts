import type { Locator, Page } from 'playwright';
import {
  collectVintedListingFormControl,
  type VintedListingControlField,
} from './vinted-listing-contracts.ts';

export class VintedListingControlError extends Error {
  readonly reason: 'missing' | 'multiple' | 'failed';
  constructor(reason: 'missing' | 'multiple' | 'failed') {
    super('Das Vinted-Formularfeld konnte nicht eindeutig gelesen werden.');
    this.reason = reason;
  }
}

/** Nur beobachtete feste Felder; React-Kennungen oder Begleitinputwerte bestimmen keine Klickziele. */
export async function vintedListingFormControl(
  page: Page,
  field: VintedListingControlField,
  optional = false,
): Promise<{ locator: Locator; value: string } | null> {
  let result = await page.evaluate(collectVintedListingFormControl, field);
  if (result.state === 'missing' && optional) return null;
  // Wie beim nativen Klick darf ein Feld erst nach dem sichtbaren Formular nachladen.
  const deadline = performance.now() + (field === 'brand' ? 15_000 : 5_000);
  while (result.state === 'missing' && performance.now() < deadline) {
    await page.waitForTimeout(100);
    result = await page.evaluate(collectVintedListingFormControl, field);
  }
  if (result.state !== 'ready')
    throw new VintedListingControlError(
      result.state === 'missing' || result.state === 'multiple' ? result.state : 'failed',
    );
  if (typeof result.value !== 'string' || result.value.length > 10_000)
    throw new VintedListingControlError('failed');
  if (result.kind === 'input')
    return {
      locator: page.locator((result.scoped ? '#content ' : '') + 'input#' + field),
      value: result.value,
    };
  if (
    result.kind !== 'button' ||
    !result.scoped ||
    typeof result.testId !== 'string' ||
    !/^(?:(?:catalog|brand|color)-select-dropdown-input|category-(?:size-single-grid|condition-single-list|material-multi-list)-input)$/.test(
      result.testId,
    )
  )
    throw new VintedListingControlError('failed');
  return {
    locator: page
      .locator('#content')
      .getByTestId(result.testId)
      .and(page.locator('button[type="button"]')),
    value: result.value,
  };
}

export async function vintedListingControlValue(
  page: Page,
  field: VintedListingControlField,
): Promise<string> {
  return (await vintedListingFormControl(page, field))!.value;
}

export async function waitForVintedListingControlValue(
  page: Page,
  field: VintedListingControlField,
  expected: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    if ((await vintedListingControlValue(page, field)) === expected) return;
    if (attempt >= 20) throw new VintedListingControlError('failed');
    await page.waitForTimeout(250);
  }
}

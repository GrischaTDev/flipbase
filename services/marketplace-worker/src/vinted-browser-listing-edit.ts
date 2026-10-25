import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { confirmVintedEdit } from './vinted-edit-confirmation.ts';
import { VintedListingReadError } from './vinted-listing-read-error.ts';
import { fillVintedListingPrice } from './vinted-browser-listing-price-input.ts';
import { parseVintedListingPriceCents } from './vinted-browser-listing-content.ts';

export interface VintedListingEditFields {
  title: string;
  description: string;
  price: string;
}

export type VintedEditResult = 'confirmed' | 'unconfirmed' | 'conflict';

const vintedOrigin = 'https://www.vinted.de';

async function openEdit(page: Page, itemId: string, accountId: string): Promise<void> {
  const identity = await readVintedAccountIdentity(page);
  if (!identity || identity.id !== accountId) throw new VintedListingReadError('identity');
  try {
    await page.goto(`${vintedOrigin}/items/${itemId}/edit`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
  } catch {
    throw new VintedListingReadError('navigate');
  }
  if (
    new URL(page.url()).origin !== vintedOrigin ||
    new URL(page.url()).pathname !== `/items/${itemId}/edit`
  )
    throw new VintedListingReadError('navigate');
  try {
    await page.locator('input[name="title"]').waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new VintedListingReadError('form');
  }
  if (
    !(await page.locator('textarea[name="description"]').isVisible()) ||
    !(await page.locator('input[name="price"]').isVisible())
  )
    throw new VintedListingReadError('values');
}

async function fields(page: Page): Promise<VintedListingEditFields> {
  return {
    title: await page.locator('input[name="title"]').inputValue(),
    description: await page.locator('textarea[name="description"]').inputValue(),
    price: await page.locator('input[name="price"]').inputValue(),
  };
}

export async function readVintedListingEdit(
  page: Page,
  itemId: string,
  accountId: string,
): Promise<VintedListingEditFields> {
  await openEdit(page, itemId, accountId);
  return fields(page);
}

export async function updateVintedListing(
  page: Page,
  itemId: string,
  accountId: string,
  desired: VintedListingEditFields,
  authorize: () => Promise<void>,
): Promise<VintedEditResult> {
  await openEdit(page, itemId, accountId);
  await page.locator('input[name="title"]').fill(desired.title);
  await page.locator('textarea[name="description"]').fill(desired.description);
  await fillVintedListingPrice(page.locator('input[name="price"]'), desired.price);
  const save = page.getByRole('button', { name: 'Speichern', exact: true });
  if (!(await save.isVisible()) || !(await save.isEnabled()))
    throw new Error('Speichern nicht verfügbar');
  await authorize();
  try {
    await save.click({ timeout: 10_000 });
    // Die Bestätigungsabfrage darf Vinteds noch laufenden Speichervorgang nicht wegnavigieren.
    await page.waitForURL(
      (url) => url.origin === vintedOrigin && url.pathname !== `/items/${itemId}/edit`,
      { timeout: 15_000 },
    );
  } catch {
    // Der Klick kann bereits gespeichert haben; ein automatischer Wiederholungsversuch wäre unsicher.
    return 'unconfirmed';
  }
  return confirmVintedEdit(
    () => readVintedListingEdit(page, itemId, accountId),
    (saved) =>
      saved.title === desired.title &&
      saved.description === desired.description &&
      parseVintedListingPriceCents(saved.price) === parseVintedListingPriceCents(desired.price),
  );
}

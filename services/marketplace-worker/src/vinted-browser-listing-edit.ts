import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';

export interface VintedListingEditFields {
  title: string;
  description: string;
  price: string;
}

export type VintedEditResult = 'confirmed' | 'unconfirmed';

const vintedOrigin = 'https://www.vinted.de';

async function openEdit(page: Page, itemId: string, accountId: string): Promise<void> {
  const identity = await readVintedAccountIdentity(page);
  if (!identity || identity.id !== accountId) throw new Error('Vinted-Konto stimmt nicht überein');
  await page.goto(`${vintedOrigin}/items/${itemId}/edit`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  if (
    new URL(page.url()).origin !== vintedOrigin ||
    new URL(page.url()).pathname !== `/items/${itemId}/edit`
  )
    throw new Error('Bearbeitungsseite nicht verfügbar');
  await page.locator('input[name="title"]').waitFor({ state: 'visible', timeout: 15_000 });
  if (
    !(await page.locator('textarea[name="description"]').isVisible()) ||
    !(await page.locator('input[name="price"]').isVisible())
  )
    throw new Error('Bearbeitungsformular unvollständig');
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
  await page.locator('input[name="price"]').fill(desired.price);
  const save = page.getByRole('button', { name: 'Speichern', exact: true });
  if (!(await save.isVisible()) || !(await save.isEnabled()))
    throw new Error('Speichern nicht verfügbar');
  await authorize();
  await save.click({ timeout: 10_000 });
  try {
    await page.waitForTimeout(1200);
    await openEdit(page, itemId, accountId);
    const saved = await fields(page);
    return saved.title === desired.title &&
      saved.description === desired.description &&
      Number(saved.price.replace(',', '.')) === Number(desired.price.replace(',', '.'))
      ? 'confirmed'
      : 'unconfirmed';
  } catch {
    // Der Klick kann bereits gespeichert haben; ein automatischer Wiederholungsversuch wäre unsicher.
    return 'unconfirmed';
  }
}

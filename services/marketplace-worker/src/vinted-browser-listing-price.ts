import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  readVintedListingEdit,
  type VintedEditResult,
  type VintedListingEditFields,
} from './vinted-browser-listing-edit.ts';
import { parseVintedListingPriceCents } from './vinted-browser-listing-content.ts';
import { collectVintedListingFormValues } from './vinted-listing-contracts.ts';
import { confirmVintedEdit } from './vinted-edit-confirmation.ts';
import { fillVintedListingPrice } from './vinted-browser-listing-price-input.ts';
import {
  vintedListingUpdateFailure,
  type VintedListingUpdateStep,
} from './vinted-browser-listing-update.ts';

export interface VintedListingPriceResult {
  status: VintedEditResult;
  fields?: VintedListingEditFields;
  priceCents?: number;
}

/** Eine reservierte Seite, nur ein Preisfeld, genau ein Speicherklick. */
export async function updateVintedListingPrice(
  page: Page,
  itemId: string,
  accountId: string,
  expectedPriceCents: number,
  priceCents: number,
  authorize: () => Promise<void>,
  timeoutMs = 20_000,
): Promise<VintedListingPriceResult> {
  if (page.url() !== 'about:blank') throw new Error('Die Inseratseite ist nicht neu reserviert.');
  let step: VintedListingUpdateStep = 'authorize';
  let authorizationFailed = false;
  const checkAuthorization = async () => {
    try {
      await authorize();
    } catch (error) {
      authorizationFailed = true;
      throw error;
    }
  };
  try {
    if (
      ![itemId, accountId].every((id) => /^[1-9][0-9]{0,31}$/.test(id)) ||
      ![expectedPriceCents, priceCents].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= 99_999_999,
      )
    )
      throw new Error('Ungültiger Verkaufspreis.');
    await checkAuthorization();
    step = 'open';
    const target = 'https://www.vinted.de/items/' + itemId + '/edit';
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page
      .locator('#content input[name="price"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const check = async () => {
      await checkAuthorization();
      if (page.url() !== target || (await readVintedAccountIdentity(page))?.id !== accountId)
        throw new Error('Die Kontozuordnung hat sich geändert.');
    };
    await check();
    step = 'read';
    const base = await page.evaluate(collectVintedListingFormValues);
    if (!base || base.bump)
      throw new Error('Das Vinted-Formular konnte nicht sicher gelesen werden.');
    const currentPriceCents = parseVintedListingPriceCents(base.price);
    const price = Math.floor(priceCents / 100) + ',' + String(priceCents % 100).padStart(2, '0');
    const fields = { title: base.title, description: base.description, price };
    // Ein unbestätigter früherer Klick kann den Zielpreis bereits gespeichert haben.
    if (priceCents === currentPriceCents) return { status: 'confirmed', fields };
    if (currentPriceCents !== expectedPriceCents)
      return { status: 'conflict', priceCents: currentPriceCents };
    const input = page.locator('#content input[name="price"]');
    step = 'text';
    await fillVintedListingPrice(input, price);
    await check();
    step = 'verify';
    const prepared = await page.evaluate(collectVintedListingFormValues);
    if (
      !prepared ||
      prepared.title !== base.title ||
      prepared.description !== base.description ||
      prepared.ai_photo !== base.ai_photo ||
      prepared.bump ||
      parseVintedListingPriceCents(prepared.price) !== priceCents
    )
      throw new Error('Der neue Preis wurde nicht in das Vinted-Formular übernommen.');
    const save = page.locator('#content').getByRole('button', { name: 'Speichern', exact: true });
    if ((await save.count()) !== 1 || !(await save.isEnabled()))
      throw new Error('Speichern nicht verfügbar.');
    await check();
    step = 'save';
    try {
      await save.click({ timeout: 10_000 });
      // Erst nach Vinteds Seitenwechsel erneut öffnen, sonst könnte die Speicherung abgebrochen werden.
      await page.waitForURL(
        (url) =>
          url.origin === 'https://www.vinted.de' && url.pathname !== '/items/' + itemId + '/edit',
        { timeout: 15_000 },
      );
    } catch {
      return { status: 'unconfirmed' };
    }
    step = 'confirm';
    const status = await confirmVintedEdit(
      () => readVintedListingEdit(page, itemId, accountId),
      (saved) =>
        saved.title === fields.title &&
        saved.description === fields.description &&
        parseVintedListingPriceCents(saved.price) === priceCents,
      timeoutMs,
    );
    return status === 'confirmed' ? { status, fields } : { status };
  } catch {
    throw vintedListingUpdateFailure(authorizationFailed ? 'authorize' : step);
  } finally {
    await page.close();
  }
}

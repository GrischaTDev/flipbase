import { beforeVintedWrite } from './vinted-write-authorization.ts';
import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import type { VintedEditResult, VintedListingEditFields } from './vinted-browser-listing-edit.ts';
import { parseVintedListingPriceCents } from './vinted-browser-listing-content.ts';
import {
  vintedListingFormSelector,
  collectVintedListingFormValues,
} from './vinted-listing-contracts.ts';
import { confirmVintedSave, vintedSaveConfirmationMs } from './vinted-edit-confirmation.ts';
import {
  parseVintedListingItemPriceCents,
  readVintedListingPriceCents,
} from './vinted-browser-listing-item.ts';
import { observeVintedListingSave } from './vinted-listing-save-response.ts';
import { fillVintedListingPrice } from './vinted-browser-listing-price-input.ts';
import {
  vintedListingUpdateFailure,
  type VintedListingUpdateStep,
} from './vinted-browser-listing-update.ts';

/** Fester Grund ohne Inhalte, warum ein Speicherklick nicht bestätigt werden konnte. */
export type VintedListingPriceUnconfirmedReason =
  'save_click' | 'save_rejected' | 'item_unreadable' | 'price_pending';

export interface VintedListingPriceResult {
  status: VintedEditResult;
  fields?: VintedListingEditFields;
  priceCents?: number;
  reason?: VintedListingPriceUnconfirmedReason;
}

/** Eine reservierte Seite, nur ein Preisfeld, genau ein Speicherklick. */
export async function updateVintedListingPrice(
  page: Page,
  itemId: string,
  accountId: string,
  expectedPriceCents: number,
  priceCents: number,
  authorize: () => Promise<void>,
  timeoutMs = vintedSaveConfirmationMs,
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
      .locator(vintedListingFormSelector + ' input[name="price"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const check = async () => {
      await checkAuthorization();
      if (page.url() !== target || (await readVintedAccountIdentity(page))?.id !== accountId)
        throw new Error('Die Kontozuordnung hat sich geändert.');
    };
    await check();
    step = 'read';
    const base = await page.evaluate(collectVintedListingFormValues, {
      allowMissingAiPhoto: true,
      allowMissingBump: true,
    });
    if (!base || base.bump)
      throw new Error('Das Vinted-Formular konnte nicht sicher gelesen werden.');
    const currentPriceCents = parseVintedListingPriceCents(base.price);
    const price = Math.floor(priceCents / 100) + ',' + String(priceCents % 100).padStart(2, '0');
    const fields = { title: base.title, description: base.description, price };
    // Ein unbestätigter früherer Klick kann den Zielpreis bereits gespeichert haben.
    if (priceCents === currentPriceCents) return { status: 'confirmed', fields };
    if (currentPriceCents !== expectedPriceCents)
      return { status: 'conflict', priceCents: currentPriceCents };
    const input = page.locator(vintedListingFormSelector + ' input[name="price"]');
    step = 'text';
    await fillVintedListingPrice(input, price);
    await check();
    step = 'verify';
    const prepared = await page.evaluate(collectVintedListingFormValues, {
      allowMissingAiPhoto: true,
      allowMissingBump: true,
    });
    if (
      !prepared ||
      prepared.title !== base.title ||
      prepared.description !== base.description ||
      prepared.ai_photo !== base.ai_photo ||
      prepared.bump ||
      parseVintedListingPriceCents(prepared.price) !== priceCents
    )
      throw new Error('Der neue Preis wurde nicht in das Vinted-Formular übernommen.');
    const save = page
      .locator(vintedListingFormSelector)
      .getByRole('button', { name: 'Speichern', exact: true });
    if ((await save.count()) !== 1 || !(await save.isEnabled()))
      throw new Error('Speichern nicht verfügbar.');
    await check();
    // Vor dem Klick anmelden, damit Vinteds Antwort auf genau diesen Speicheraufruf mitgelesen wird.
    const response = await observeVintedListingSave(page, itemId, timeoutMs);
    try {
      step = 'save';
      try {
        await beforeVintedWrite(authorize);
        await save.click({ timeout: 10_000 });
      } catch {
        return { status: 'unconfirmed', reason: 'save_click' };
      }
      step = 'confirm';
      let readable = false;
      const { status, evidence } = await confirmVintedSave({
        response: response.result,
        responseMatches: (item) => parseVintedListingItemPriceCents(item, itemId) === priceCents,
        // Nur Kennung und Preis: Andere Felder dürfen die Bestätigung nicht blockieren, und
        // die Abfrage lädt die Seite nicht neu, während Vinted noch speichert.
        readSaved: async () => {
          await checkAuthorization();
          if ((await readVintedAccountIdentity(page))?.id !== accountId)
            throw new Error('Die Kontozuordnung hat sich geändert.');
          const saved = await readVintedListingPriceCents(page, itemId);
          if (saved !== null) readable = true;
          return saved;
        },
        matches: (saved) => saved === priceCents,
        timeoutMs,
      });
      if (status === 'confirmed') return { status, fields };
      return {
        status,
        reason:
          evidence === 'rejected'
            ? 'save_rejected'
            : readable
              ? 'price_pending'
              : 'item_unreadable',
      };
    } finally {
      await response.close();
    }
  } catch {
    throw vintedListingUpdateFailure(authorizationFailed ? 'authorize' : step);
  } finally {
    await page.close();
  }
}

import type { Page } from 'playwright';
import type {
  MarketplaceListingAction,
  MarketplaceListingResult,
  MarketplaceListingSnapshot,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';
import { prepareVintedListingFields } from './vinted-browser-listing-fields.ts';
import { readVintedListingCategoryFields } from './vinted-browser-listing-form.ts';
import { uploadVintedListingPhotos } from './vinted-browser-listing-photos.ts';
import {
  readVintedListingActiveState,
  verifyVintedListingSavedContent,
} from './vinted-browser-listing-result.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import {
  collectVintedListingFormValues,
  collectVintedListingPhotoState,
  parseVintedListingSnapshot,
  vintedListingFormMatches,
  vintedListingPhotosMatch,
} from './vinted-listing-contracts.ts';

/** Verwendet ausschließlich eine neue, reservierte about:blank-Seite und schließt sie danach. */
export async function submitVintedListing(
  page: Page,
  accountId: string,
  action: MarketplaceListingAction,
  input: MarketplaceListingSnapshot,
  beforeWrite: () => Promise<void>,
  authorize: () => Promise<void>,
  loadPhoto: (imageId: string) => Promise<MarketplaceListingPhoto>,
  categoryPath: readonly number[],
  options: { saveTimeoutMs?: number } = {},
): Promise<MarketplaceListingResult> {
  // Eine bestehende Benutzerseite darf weder überschrieben noch geschlossen werden.
  if (page.url() !== 'about:blank') throw new Error('Die Inseratseite ist nicht neu reserviert.');
  try {
    // Ergebnisroute/Kennung nativer Entwürfe sind noch nicht anhand eines echten Falls geprüft.
    if (action !== 'publish') return { outcome: 'failed', errorCode: 'unsupported' };
    const timeout = options.saveTimeoutMs ?? 15_000;
    if (
      typeof accountId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(accountId) ||
      !Number.isSafeInteger(timeout) ||
      timeout < 200 ||
      timeout > 15_000
    )
      throw new Error('Inseratversuch ungültig.');
    const workspaceId = input.images[0]?.storagePath.split('/')[0] ?? '';
    const snapshot = parseVintedListingSnapshot(input, workspaceId, input.connectionId);
    await authorize();
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page
      .locator('#content input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    const check = async () => {
      await authorize();
      if (
        page.url() !== 'https://www.vinted.de/items/new' ||
        (await readVintedAccountIdentity(page))?.id !== accountId
      )
        throw new Error('Die Vinted-Neuanlage oder das Konto wurde geändert.');
      await authorize();
    };
    await check();
    await prepareVintedListingFields(
      page,
      accountId,
      snapshot.content,
      snapshot.images,
      categoryPath,
      check,
      { allowRememberedChoices: true },
    );
    // Zusatzoptionen müssen bereits vor dem ersten Upload eindeutig vorhanden sein.
    const initial = await page.evaluate(collectVintedListingFormValues);
    if (!initial || initial.bump !== false)
      throw new Error('Vinted-Zusatzoptionen nicht verfügbar.');
    const uploaded = await uploadVintedListingPhotos(
      page,
      accountId,
      snapshot.images,
      loadPhoto,
      beforeWrite,
      check,
    );
    await check();
    await page
      .locator('#content input#ai_photo[type="checkbox"]')
      .setChecked(snapshot.aiPhoto, { timeout: 5000 });
    await check();
    const schema = await readVintedListingCategoryFields(
      page,
      accountId,
      snapshot.content.categoryId!,
      categoryPath,
      { brand: snapshot.content },
    );
    await check();
    if (
      !vintedListingFormMatches(
        snapshot.content,
        snapshot.images,
        schema,
        await page.evaluate(collectVintedListingFormValues),
        snapshot.aiPhoto,
      ) ||
      !vintedListingPhotosMatch(
        uploaded,
        await page.evaluate(collectVintedListingPhotoState),
        snapshot.images.map((image) => image.id),
      )
    )
      return { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' };
    const button = page.locator('#content [data-testid="upload-form-save-button"]');
    if ((await button.count()) !== 1 || !(await button.isVisible()) || !(await button.isEnabled()))
      return { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' };
    await check();
    try {
      // Keine geratenen API-Aufrufe und keine Wiederholung bei Antwortverlust.
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.origin === 'https://www.vinted.de' &&
            !url.search &&
            !url.hash &&
            /^\/items\/[1-9][0-9]{0,31}(?:-[^\s/?#]*)?$/.test(url.pathname),
          { timeout, waitUntil: 'domcontentloaded' },
        ),
        button.click({ timeout: 5000 }),
      ]);
      const savedUrl = new URL(page.url()),
        externalId = /^\/items\/([1-9][0-9]{0,31})(?:-[^\s/?#]*)?$/.exec(savedUrl.pathname)?.[1];
      if (
        !externalId ||
        savedUrl.origin !== 'https://www.vinted.de' ||
        savedUrl.search ||
        savedUrl.hash ||
        !(await verifyVintedListingSavedContent(
          page,
          accountId,
          externalId,
          snapshot,
          uploaded,
          categoryPath,
          authorize,
        )) ||
        !(await readVintedListingActiveState(
          page,
          accountId,
          externalId,
          snapshot.content.title,
          authorize,
        ))
      )
        return { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' };
      return {
        outcome: 'confirmed',
        action: 'publish',
        externalId,
        externalAccountId: accountId,
        providerState: 'active',
        verifiedAt: new Date().toISOString(),
      };
    } catch {
      return { outcome: 'outcome_unknown', errorCode: 'provider_unconfirmed' };
    }
  } finally {
    await page.close();
  }
}

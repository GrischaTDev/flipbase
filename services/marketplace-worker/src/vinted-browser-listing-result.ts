import type { Page } from 'playwright';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { hasVintedActiveListingEvidence } from './vinted-listing-contracts.ts';
import {
  collectVintedListingFormValues,
  collectVintedListingPhotoState,
  vintedListingFormMatches,
  vintedListingPhotosMatch,
} from './vinted-listing-contracts.ts';
import { readVintedListingCategoryFields } from './vinted-browser-listing-form.ts';
import type { MarketplaceListingSnapshot } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { VintedUploadedListingPhoto } from './vinted-browser-listing-photos.ts';

/** Öffnet eine bekannte ID frisch zur Inhaltsprüfung. Speichert nichts und beweist allein keine Neuanlage. */
export async function verifyVintedListingSavedContent(
  page: Page,
  accountId: string,
  externalId: string,
  snapshot: MarketplaceListingSnapshot,
  uploaded: readonly VintedUploadedListingPhoto[],
  categoryPath: readonly number[],
  authorize: () => Promise<void>,
): Promise<boolean> {
  if (
    typeof accountId !== 'string' ||
    typeof externalId !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    !/^[1-9][0-9]{0,31}$/.test(externalId) ||
    !snapshot.content.categoryId
  )
    throw invalid();
  const target = 'https://www.vinted.de/items/' + externalId + '/edit';
  const check = async (exact: boolean) => {
    await authorize();
    if (
      new URL(page.url()).origin !== 'https://www.vinted.de' ||
      (exact && page.url() !== target) ||
      (await readVintedAccountIdentity(page))?.id !== accountId
    )
      throw invalid();
    await authorize();
  };
  await check(false);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.locator('#content input[name="title"]').waitFor({ state: 'visible', timeout: 15_000 });
  await check(true);
  const schema = await readVintedListingCategoryFields(
    page,
    accountId,
    snapshot.content.categoryId,
    categoryPath,
  );
  await check(true);
  const values = await page.evaluate(collectVintedListingFormValues);
  const photos = await page.evaluate(collectVintedListingPhotoState);
  const matches =
    vintedListingFormMatches(snapshot.content, snapshot.images, schema, values, snapshot.aiPhoto) &&
    vintedListingPhotosMatch(
      uploaded,
      photos,
      snapshot.images.map((image) => image.id),
    );
  await check(true);
  return matches;
}

function invalid(): Error {
  return new Error('Der aktive Vinted-Inseratstatus konnte nicht gelesen werden.');
}

/** Liest auf einer reservierten Seite nur den Aktiv-Status; belegt weder Neuanlage noch vollständigen Inhalt. */
export async function readVintedListingActiveState(
  page: Page,
  accountId: string,
  externalId: string,
  title: string,
  authorize: () => Promise<void>,
): Promise<boolean> {
  if (
    typeof accountId !== 'string' ||
    typeof externalId !== 'string' ||
    !/^[1-9][0-9]{0,31}$/.test(accountId) ||
    !/^[1-9][0-9]{0,31}$/.test(externalId) ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 20000
  )
    throw invalid();
  const check = async () => {
    await authorize();
    if (
      new URL(page.url()).origin !== 'https://www.vinted.de' ||
      (await readVintedAccountIdentity(page))?.id !== accountId
    )
      throw invalid();
    await authorize();
  };
  await check();
  await page.goto('https://www.vinted.de/member/' + accountId, {
    waitUntil: 'domcontentloaded',
    timeout: 15_000,
  });
  await page
    .getByTestId('closet-seller-filters-active')
    .waitFor({ state: 'visible', timeout: 15_000 });
  await check();
  if (
    (await page.getByTestId('closet-seller-filters-active').getAttribute('aria-pressed')) !== 'true'
  ) {
    const loading = page.getByRole('progressbar');
    // Eine kurze Ladeanzeige kann zwischen zwei Prüfungen verschwinden. Die alte
    // Kachel bleibt dagegen als konkreter DOM-Verweis erkennbar, auch nach Ersatz.
    const oldItems = page.locator(
      '#content [data-testid^="product-item-id-"][data-testid$="--overlay-link"]',
    );
    const previous =
      (await oldItems.count()) > 0 ? await oldItems.first().elementHandle({ timeout: 5000 }) : null;
    await page.getByTestId('closet-seller-filters-active').click({ timeout: 5000 });
    try {
      if (previous) await previous.waitForElementState('hidden', { timeout: 15_000 });
    } finally {
      await previous?.dispose();
    }
    await loading.waitFor({ state: 'hidden', timeout: 15_000 });
  }
  await check();
  const evidence = await page.evaluate(hasVintedActiveListingEvidence, {
    accountId,
    externalId,
    title,
  });
  await check();
  return evidence;
}

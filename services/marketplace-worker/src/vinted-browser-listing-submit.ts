import type { Page } from 'playwright';
import { observeVintedListingCreation } from './vinted-browser-listing-save.ts';
import { resolveFlipbaseVintedListingContent } from './vinted-listing-form-mapping.ts';
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
  VintedInteractionRequiredError,
  VintedVerificationRequiredError,
} from './vinted-browser-reader.ts';
import {
  VintedListingReadError,
  vintedListingReadSteps,
  type VintedListingReadStep,
} from './vinted-listing-read-error.ts';
import {
  collectVintedListingFormValues,
  collectVintedListingFormMetadata,
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
  let step: VintedListingReadStep = 'parse';
  let writeAttempted = false;
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
    let snapshot = parseVintedListingSnapshot(input, workspaceId, input.connectionId);
    step = 'authorize';
    await authorize();
    step = 'navigate';
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    step = 'form';
    await page
      .locator('#content input[name="title"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    // Vorbereitung und Fotoupload prüfen das Konto selbst; Freigabe und exakte URL bleiben hier.
    const authorizeNewForm = async () => {
      await authorize();
      if (page.url() !== 'https://www.vinted.de/items/new')
        throw new VintedListingReadError('form');
    };
    const check = async () => {
      const previousStep = step;
      step = 'authorize';
      await authorize();
      step = 'identity';
      if (
        page.url() !== 'https://www.vinted.de/items/new' ||
        (await readVintedAccountIdentity(page))?.id !== accountId
      )
        throw new Error('Die Vinted-Neuanlage oder das Konto wurde geändert.');
      step = 'authorize';
      await authorize();
      step = previousStep;
    };
    step = 'identity';
    await check();
    const prepared = await prepareVintedListingFields(
      page,
      accountId,
      snapshot.content,
      snapshot.images,
      categoryPath,
      authorizeNewForm,
      {
        allowRememberedChoices: true,
        onPrepareStep: (currentStep) => {
          step = currentStep;
        },
      },
    );
    snapshot = {
      ...snapshot,
      content: resolveFlipbaseVintedListingContent(snapshot.content, prepared),
    };
    // Ohne Fotos fehlen die Foto-Zusatzfelder bei Vinted noch. Bezahlte Extras bleiben gesperrt;
    // die vollständigen Werte werden nach dem Upload geprüft.
    step = 'metadata';
    const initial = await page.evaluate(collectVintedListingFormMetadata);
    const uniquePhotoOptions = await page.evaluate(() => {
      const roots = document.querySelectorAll('#content');
      return (
        roots.length === 1 &&
        ['ai_photo', 'bump'].every(
          (id) => roots[0]!.querySelectorAll(`input#${id}[type="checkbox"]`).length <= 1,
        )
      );
    });
    if (!uniquePhotoOptions || initial.bump === true)
      throw new Error('Vinted-Zusatzoptionen nicht verfügbar.');
    step = 'photos';
    const uploaded = await uploadVintedListingPhotos(
      page,
      accountId,
      snapshot.images,
      loadPhoto,
      async () => {
        writeAttempted = true;
        await beforeWrite();
      },
      authorizeNewForm,
    );
    await check();
    step = 'metadata';
    const aiPhoto = page.locator('#content input#ai_photo[type="checkbox"]');
    const aiPhotoCount = await aiPhoto.count();
    if (aiPhotoCount === 1) {
      await aiPhoto.setChecked(snapshot.aiPhoto, { timeout: 5000 });
    } else if (aiPhotoCount !== 0 || snapshot.aiPhoto) {
      throw new VintedListingReadError('metadata');
    }
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
        await page.evaluate(collectVintedListingFormValues, { allowMissingAiPhoto: true }),
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
    // Nur feste Prüfschritte speichern; Anbieterantworten und Artikeldaten bleiben im Browser.
    let confirmationStep = 'save_response';
    const unconfirmed = (): MarketplaceListingResult => ({
      outcome: 'outcome_unknown',
      errorCode: 'provider_unconfirmed_' + confirmationStep,
    });
    try {
      // Die echte Formularantwort beobachten, keinen eigenen API-Schreibaufruf auslösen.
      // Vinted leitet eine Neuanlage auch zum eigenen Profil statt zur Artikeladresse weiter.
      const landed = page
        .waitForURL(
          (url) =>
            url.origin === 'https://www.vinted.de' &&
            !url.search &&
            !url.hash &&
            (url.pathname === '/member/' + accountId ||
              /^\/items\/[1-9][0-9]{0,31}(?:-[^\s/?#]*)?$/.test(url.pathname)),
          { timeout, waitUntil: 'domcontentloaded' },
        )
        .then(
          () => true,
          () => false,
        );
      const observer = await observeVintedListingCreation(page, timeout);
      let externalId: string | null;
      try {
        [externalId] = await Promise.all([observer.result, button.click({ timeout: 5000 })]);
      } finally {
        await observer.close();
      }
      if (!externalId) return unconfirmed();
      confirmationStep = 'save_navigation';
      if (!(await landed)) return unconfirmed();
      const savedUrl = new URL(page.url());
      const landedId = /^\/items\/([1-9][0-9]{0,31})(?:-[^\s/?#]*)?$/.exec(savedUrl.pathname)?.[1];
      confirmationStep = 'saved_url';
      if (
        savedUrl.origin !== 'https://www.vinted.de' ||
        savedUrl.search ||
        savedUrl.hash ||
        (savedUrl.pathname !== '/member/' + accountId && landedId !== externalId) ||
        !(await verifyVintedListingSavedContent(
          page,
          accountId,
          externalId,
          snapshot,
          uploaded,
          categoryPath,
          authorize,
          (step) => {
            confirmationStep = 'saved_' + step;
          },
        )) ||
        !(await readVintedListingActiveState(
          page,
          accountId,
          externalId,
          snapshot.content.title,
          authorize,
          (step) => {
            confirmationStep = 'active_' + step;
          },
        ))
      )
        return unconfirmed();
      return {
        outcome: 'confirmed',
        action: 'publish',
        externalId,
        externalAccountId: accountId,
        providerState: 'active',
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof VintedListingReadError && vintedListingReadSteps.includes(error.step))
        confirmationStep += '_' + error.step;
      return unconfirmed();
    }
  } catch (error) {
    if (
      writeAttempted ||
      error instanceof VintedInteractionRequiredError ||
      error instanceof VintedVerificationRequiredError ||
      error instanceof VintedListingReadError
    )
      throw error;
    // Nur feste Schrittnamen verlassen die Browsergrenze, keine Anbieterantworten.
    throw new VintedListingReadError(step);
  } finally {
    await page.close();
  }
}

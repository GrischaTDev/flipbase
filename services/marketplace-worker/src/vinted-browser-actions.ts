import type { Page } from 'playwright';
import { setTimeout } from 'node:timers/promises';
import type {
  BrowserInfo,
  BrowserConnection,
  BrowserDragPoint,
  BrowserDesktop,
} from './gologin-cloud-browser.ts';
import { readVintedAccountImport } from './vinted-account-import.ts';
import { waitForOpenVintedSessionRenewals } from './vinted-session-renewal.ts';
import { readVintedAccountIdentity } from './vinted-browser-reader.ts';
import { submitVintedLogin } from './vinted-browser-login.ts';
import { submitVintedVerificationCode } from './vinted-browser-verification.ts';
import { readVintedListingEdit, updateVintedListing } from './vinted-browser-listing-edit.ts';
import { submitVintedListing } from './vinted-browser-listing-submit.ts';
import { readVintedListingNewCategory } from './vinted-browser-listing-category.ts';
import { readVintedListingCurrentContent } from './vinted-browser-listing-content.ts';
import { updateVintedListingContent } from './vinted-browser-listing-update.ts';
import { VintedListingReadError } from './vinted-listing-read-error.ts';
import { readVintedProfileAbout, updateVintedProfileAbout } from './vinted-browser-profile-edit.ts';
import { sendVintedNegotiation } from './vinted-browser-negotiation.ts';
import { sendVintedMessage } from './vinted-browser-messages.ts';
import {
  sendVintedFavoriteMessage,
  sendVintedFavoriteOffer,
  readVintedFavoriteEvents,
} from './vinted-browser-favorites.ts';

export function currentVintedPage(connection: BrowserConnection): Page {
  const page = connection
    .contexts?.()
    .flatMap((context) => context.pages())
    .at(-1);
  if (!page) throw new Error('Browserseite fehlt');
  return page;
}

export async function replayBrowserDrag(page: Page, points: BrowserDragPoint[]): Promise<void> {
  const firstPoint = points.at(0);
  if (!firstPoint) throw new Error('Ziehbewegung fehlt');
  const size =
    page.viewportSize() ??
    (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })));
  if (size.width <= 0 || size.height <= 0) throw new Error('Browserfenster fehlt');
  await page.mouse.move(
    Math.floor(firstPoint.x * size.width),
    Math.floor(firstPoint.y * size.height),
  );
  try {
    await page.mouse.down();
    const startedAt = performance.now();
    for (const point of points.slice(1)) {
      const remainingMs = point.elapsedMs - (performance.now() - startedAt);
      if (remainingMs > 0) await setTimeout(Math.ceil(remainingMs));
      await page.mouse.move(Math.floor(point.x * size.width), Math.floor(point.y * size.height));
    }
  } finally {
    await page.mouse.up();
  }
}

/** Feste Kurzbeschreibung für ein gescheitertes Laden der Startseite, nur aus Wörtern. */
export function startPageFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const network = /net::ERR_([A-Z]{2,24}(?:_[A-Z]{2,24}){0,5})\b/.exec(message)?.[1];
  if (network) return 'Startseite nicht geladen ' + network.toLowerCase().replaceAll('_', ' ');
  if (error instanceof Error && error.name === 'TimeoutError')
    return 'Startseite nicht geladen zeitlimit';
  return 'Startseite nicht geladen';
}

export function vintedBrowserActions(
  connection: BrowserConnection,
  desktop?: BrowserDesktop,
): BrowserInfo {
  const currentPage = () => currentVintedPage(connection);
  // Jede Aktion beginnt erst, wenn Vinteds eigene Erneuerung der Anmeldung beendet ist.
  const afterSessionRenewal =
    <Arguments extends unknown[], Result>(
      action: (...argumentsList: Arguments) => Result | Promise<Result>,
    ) =>
    async (...argumentsList: Arguments): Promise<Result> => {
      await waitForOpenVintedSessionRenewals(
        () => connection.contexts?.().flatMap((context) => context.pages()) ?? [],
      );
      return action(...argumentsList);
    };
  return {
    readListingCategory: afterSessionRenewal(
      async (accountId, categoryId, categoryPath, authorize) => {
        await authorize();
        const contexts = connection.contexts?.();
        if (!contexts || contexts.length !== 1) throw new Error('Exklusiver Inseratbrowser fehlt');
        const page = await contexts[0]!.newPage();
        return readVintedListingNewCategory(page, accountId, categoryId, categoryPath, authorize);
      },
    ),
    readListingContent: afterSessionRenewal(async (accountId, externalId, authorize) => {
      try {
        await authorize();
      } catch {
        throw new VintedListingReadError('authorize');
      }
      const contexts = connection.contexts?.();
      if (!contexts || contexts.length !== 1) throw new VintedListingReadError('reserve');
      let page: Page;
      try {
        page = await contexts[0]!.newPage();
      } catch {
        throw new VintedListingReadError('reserve');
      }
      return readVintedListingCurrentContent(page, accountId, externalId, authorize);
    }),
    updateListingContent: afterSessionRenewal(
      async (accountId, externalId, base, desired, authorize) => {
        await authorize();
        const contexts = connection.contexts?.();
        if (!contexts || contexts.length !== 1) throw new Error('Exklusiver Inseratbrowser fehlt');
        const page = await contexts[0]!.newPage();
        return updateVintedListingContent(page, accountId, externalId, base, desired, authorize);
      },
    ),
    submitListing: afterSessionRenewal(
      async (accountId, action, snapshot, beforeWrite, authorize, loadPhoto, categoryPath) => {
        if (action !== 'publish') return { outcome: 'failed', errorCode: 'unsupported' };
        await authorize();
        const contexts = connection.contexts?.();
        if (!contexts || contexts.length !== 1) throw new Error('Exklusiver Inseratbrowser fehlt');
        const page = await contexts[0]!.newPage();
        return submitVintedListing(
          page,
          accountId,
          action,
          snapshot,
          beforeWrite,
          authorize,
          loadPhoto,
          categoryPath,
        );
      },
    ),
    sendNegotiation: afterSessionRenewal(
      (accountId, command, sourceOffer, confirmedOffer, authorize) =>
        sendVintedNegotiation(
          currentPage(),
          accountId,
          command,
          sourceOffer,
          confirmedOffer,
          authorize,
        ),
    ),
    readFavoriteEvents: afterSessionRenewal((accountId, authorize) =>
      readVintedFavoriteEvents(currentPage(), accountId, authorize),
    ),
    sendFavoriteMessage: afterSessionRenewal((accountId, command, authorize) =>
      sendVintedFavoriteMessage(currentPage(), accountId, command, authorize),
    ),
    sendFavoriteOffer: afterSessionRenewal((accountId, command, authorize, confirmPrice) =>
      sendVintedFavoriteOffer(currentPage(), accountId, command, authorize, confirmPrice),
    ),
    sendMessage: afterSessionRenewal((accountId, command, authorize) =>
      sendVintedMessage(currentPage(), accountId, command, authorize),
    ),
    version: () => connection.version(),
    initialize: async () => {
      try {
        await currentPage().goto('https://www.vinted.de/', {
          waitUntil: 'domcontentloaded',
          timeout: 20000,
        });
      } catch (error) {
        // Nur die feste Fehlerart des Browsers weitergeben, nie Adresse oder Meldungstext.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(startPageFailure(error));
      }
    },
    capture: () =>
      desktop?.capture() ??
      currentPage().screenshot({
        type: 'jpeg',
        quality: 65,
        scale: 'css',
        animations: 'disabled',
        timeout: 5_000,
      }),
    click: async (xRatio, yRatio) => {
      if (desktop) return desktop.click(xRatio, yRatio);
      const page = currentPage();
      const size =
        page.viewportSize() ??
        (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })));
      if (size.width <= 0 || size.height <= 0) throw new Error('Browserfenster fehlt');
      await page.mouse.click(Math.floor(xRatio * size.width), Math.floor(yRatio * size.height));
    },
    drag: (points) => desktop?.drag(points) ?? replayBrowserDrag(currentPage(), points),
    type: (value) => desktop?.type(value) ?? currentPage().keyboard.insertText(value),
    press: (key) => desktop?.press(key) ?? currentPage().keyboard.press(key),
    identify: () => readVintedAccountIdentity(currentPage()),
    importAccount: (authorize, onStage, previousConversations, requestedConversation) =>
      readVintedAccountImport(
        currentPage(),
        authorize,
        onStage,
        previousConversations,
        requestedConversation,
      ),
    login: (credentials, authorize) => submitVintedLogin(currentPage(), credentials, authorize),
    verify: (code, authorize) => submitVintedVerificationCode(currentPage(), code, authorize),
    readListingEdit: afterSessionRenewal((itemId, accountId) =>
      readVintedListingEdit(currentPage(), itemId, accountId),
    ),
    updateListing: afterSessionRenewal((itemId, accountId, fields, authorize) =>
      updateVintedListing(currentPage(), itemId, accountId, fields, authorize),
    ),
    readProfileAbout: afterSessionRenewal((accountId) =>
      readVintedProfileAbout(currentPage(), accountId),
    ),
    updateProfileAbout: afterSessionRenewal((accountId, about, authorize, expectedAbout) =>
      updateVintedProfileAbout(currentPage(), accountId, about, authorize, expectedAbout),
    ),
  };
}

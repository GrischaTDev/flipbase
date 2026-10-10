import {
  isVintedNegotiationCommand,
  isVintedNegotiationOffer,
  isConfirmedNegotiationOffer,
  isVintedNegotiationResult,
  isVintedNegotiationEvent,
} from './vinted-negotiation-contracts.ts';
import type { BrowserInfo, BrowserDragPoint } from './gologin-cloud-browser.ts';
import {
  isVintedListingResult,
  parseVintedListingSnapshot,
  parseVintedListingCategoryFields,
  parseVintedListingCurrentContent,
  parseVintedListingEditContent,
} from './vinted-listing-contracts.ts';
import {
  createVintedListingPhotoSender,
  receiveVintedListingPhoto,
} from './vinted-listing-photo-transfer.ts';
import { isValidVintedMessageCommand } from './vinted-browser-messages.ts';
import type {
  MarketplaceMessageCommand,
  MarketplaceFavoriteMessageCommand,
  MarketplaceFavoriteOfferCommand,
} from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';
import {
  VintedImportReadError,
  VintedImportRequestError,
  type VintedAccountImport,
} from './vinted-account-import.ts';
import {
  VintedInteractionRequiredError,
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
} from './vinted-browser-reader.ts';

export const browserCommandLimit = 8 * 1024 * 1024;
export type BrowserActionName = Exclude<keyof BrowserInfo, 'version'>;
export interface BrowserAction {
  name: BrowserActionName;
  arguments: unknown[];
}
export type BrowserActionEvent =
  | { kind: 'wait' }
  | { kind: 'authorize'; sequence: number }
  | { kind: 'offer_price'; sequence: number; original: number; offered: number }
  | { kind: 'listing_begin'; sequence: number }
  | { kind: 'listing_photo'; sequence: number; imageId: string; offset: number }
  | {
      kind: 'stage';
      sequence: number;
      stage: 'profile' | 'publications' | 'conversations' | 'sales';
    }
  | { kind: 'result'; value: unknown }
  | {
      kind: 'error';
      code: string;
      stage?: string;
      reason?: string;
      retryAfter?: string;
      browserReadFailure?: string;
    };

export function commandRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültiger Browserauftrag');
  return input as Record<string, unknown>;
}
function required<T>(operation: T | undefined): T {
  if (operation === undefined) throw new Error('Browseraktion fehlt');
  return operation;
}
function text(input: unknown, limit = 65536): string {
  if (typeof input !== 'string' || input.length > limit) throw new Error('Ungültiger Browsertext');
  return input;
}
function identifier(input: unknown): string {
  const result = text(input, 32);
  if (!/^[1-9][0-9]*$/.test(result)) throw new Error('Ungültige Vinted-Kennung');
  return result;
}
function fields(input: unknown) {
  const result = commandRecord(input);
  if (Object.keys(result).some((key) => !['title', 'description', 'price'].includes(key)))
    throw new Error('Ungültige Inseratfelder');
  return {
    title: text(result.title, 120),
    description: text(result.description, 10000),
    price: text(result.price, 32),
  };
}

function messageCommand(input: unknown): MarketplaceMessageCommand {
  const command = commandRecord(input);
  if (Object.keys(command).length !== 3 || !Object.hasOwn(command, 'attachment'))
    throw new Error('Ungültiger Nachrichtenauftrag');
  let attachment: MarketplaceMessageCommand['attachment'] = null;
  if (command.attachment !== null) {
    const photo = commandRecord(command.attachment);
    if (
      Object.keys(photo).length !== 3 ||
      !['image/png', 'image/jpeg'].includes(String(photo.mimeType))
    )
      throw new Error('Ungültiges Nachrichtenbild');
    attachment = {
      name: text(photo.name, 120),
      mimeType: photo.mimeType as 'image/png' | 'image/jpeg',
      base64: text(photo.base64, 349528),
    };
  }
  const parsed = {
    externalConversationId: identifier(command.externalConversationId),
    text: text(command.text, 5000),
    attachment,
  };
  if (!isValidVintedMessageCommand(parsed)) throw new Error('Ungültiger Nachrichtenauftrag');
  return parsed;
}
function favoriteCommand(input: unknown, offerPhase: false): MarketplaceFavoriteMessageCommand;
function favoriteCommand(input: unknown, offerPhase: true): MarketplaceFavoriteOfferCommand;
function favoriteCommand(
  input: unknown,
  offerPhase: boolean,
): MarketplaceFavoriteMessageCommand | MarketplaceFavoriteOfferCommand {
  const command = commandRecord(input);
  const keys = [
    'recipientId',
    'itemId',
    'text',
    ...(offerPhase ? ['conversationId', 'transactionId', 'externalMessageId', 'offer'] : []),
  ];
  if (
    Object.keys(command).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(command, key))
  )
    throw new Error('Ungültiger Favoritenauftrag');
  const parsed = {
    recipientId: identifier(command.recipientId),
    itemId: identifier(command.itemId),
    text: text(command.text, 2000),
  };
  if (
    !parsed.text.trim() ||
    [...parsed.text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    })
  )
    throw new Error('Ungültiger Favoritentext');
  if (!offerPhase) return parsed;
  const offer = commandRecord(command.offer);
  if (
    Object.keys(offer).length !== 2 ||
    (offer.type !== 'amount' && offer.type !== 'percentage') ||
    typeof offer.value !== 'number' ||
    !Number.isFinite(offer.value) ||
    offer.value <= 0 ||
    (offer.type === 'percentage' && offer.value > 50) ||
    Math.abs(Math.round(offer.value * 100) - offer.value * 100) > 0.000001
  )
    throw new Error('Ungültiges Preisangebot');
  return {
    ...parsed,
    conversationId: identifier(command.conversationId),
    transactionId: identifier(command.transactionId),
    externalMessageId: identifier(command.externalMessageId),
    offer: { type: offer.type, value: offer.value },
  };
}

/** Feste Aktionen statt übertragener Skripte oder zentral ausgewerteter Browserobjekte. */
export async function executeBrowserAction(
  browser: BrowserInfo,
  input: unknown,
  authorize: () => Promise<void>,
  onStage: (stage: 'profile' | 'publications' | 'conversations' | 'sales') => Promise<void>,
  confirmPrice: (original: number, offered: number) => Promise<boolean> = async () => false,
  listing?: {
    beforeWrite: () => Promise<void>;
    readPhotoChunk: (imageId: string, offset: number) => Promise<unknown>;
  },
): Promise<unknown> {
  const action = commandRecord(input);
  if (
    Object.keys(action).some((key) => !['name', 'arguments'].includes(key)) ||
    !Array.isArray(action.arguments)
  )
    throw new Error('Ungültiger Browserauftrag');
  const argumentsList = action.arguments;
  const counts: Record<string, number[]> = {
    initialize: [0],
    capture: [0],
    click: [2],
    drag: [1],
    type: [1],
    press: [1],
    identify: [0],
    importAccount: [2],
    login: [1],
    verify: [1],
    readListingEdit: [2],
    readListingCategory: [3],
    readListingContent: [2],
    updateListingContent: [4],
    updateListing: [3],
    readProfileAbout: [1],
    updateProfileAbout: [3],
    sendNegotiation: [4],
    sendMessage: [2],
    readFavoriteEvents: [1],
    sendFavoriteMessage: [2],
    sendFavoriteOffer: [2],
    submitListing: [4],
  };
  if (
    typeof action.name !== 'string' ||
    !Object.hasOwn(counts, action.name) ||
    !counts[action.name]?.includes(argumentsList.length)
  )
    throw new Error('Nicht erlaubte Browseraktion');
  await authorize();
  switch (action.name) {
    case 'readListingCategory': {
      const categoryId = argumentsList[1],
        parents = argumentsList[2];
      if (
        typeof categoryId !== 'number' ||
        !Number.isSafeInteger(categoryId) ||
        categoryId <= 0 ||
        !Array.isArray(parents) ||
        parents.length > 30 ||
        parents.some(
          (id) =>
            typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || id === categoryId,
        ) ||
        new Set(parents).size !== parents.length
      )
        throw new Error('Vinted-Kategoriebindung ungültig');
      return parseVintedListingCategoryFields(
        await required(browser.readListingCategory)(
          identifier(argumentsList[0]),
          categoryId,
          parents,
          authorize,
        ),
        categoryId,
      );
    }
    case 'readListingContent': {
      const accountId = identifier(argumentsList[0]),
        externalId = identifier(argumentsList[1]);
      return parseVintedListingCurrentContent(
        await required(browser.readListingContent)(accountId, externalId, authorize),
        accountId,
        externalId,
      );
    }
    case 'updateListingContent':
      return required(browser.updateListingContent)(
        identifier(argumentsList[0]),
        identifier(argumentsList[1]),
        parseVintedListingEditContent(argumentsList[2]),
        parseVintedListingEditContent(argumentsList[3]),
        authorize,
      );
    case 'submitListing': {
      if (!listing) throw new Error('Inseratübergabe fehlt');
      const snapshotInput = commandRecord(argumentsList[2]);
      const images = snapshotInput['images'];
      if (!Array.isArray(images) || !images[0]) throw new Error('Originalfotos fehlen');
      const path = commandRecord(images[0])['storagePath'];
      if (typeof path !== 'string' || typeof snapshotInput['connectionId'] !== 'string')
        throw new Error('Inseratbindung ungültig');
      const snapshot = parseVintedListingSnapshot(
        snapshotInput,
        path.split('/')[0]!,
        snapshotInput['connectionId'],
      );
      const kind = argumentsList[1],
        parents = argumentsList[3];
      if (
        !['publish', 'vinted_draft'].includes(String(kind)) ||
        typeof kind !== 'string' ||
        !Array.isArray(parents) ||
        parents.length > 30 ||
        parents.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        new Set(parents).size !== parents.length
      )
        throw new Error('Inseratauftrag ungültig');
      return required(browser.submitListing)(
        identifier(argumentsList[0]),
        kind as 'publish' | 'vinted_draft',
        snapshot,
        listing.beforeWrite,
        authorize,
        (id) => {
          const original = snapshot.images.find((image) => image.id === id);
          if (!original) return Promise.reject(new Error('Originalfoto nicht aufgenommen'));
          return receiveVintedListingPhoto(original, listing.readPhotoChunk);
        },
        parents as number[],
      );
    }
    case 'sendNegotiation': {
      const command = argumentsList[1],
        sourceOffer = argumentsList[2],
        confirmedOffer = argumentsList[3];
      if (
        !isVintedNegotiationCommand(command) ||
        (sourceOffer !== null && !isVintedNegotiationOffer(sourceOffer)) ||
        (confirmedOffer !== null && !isConfirmedNegotiationOffer(confirmedOffer)) ||
        (sourceOffer && confirmedOffer) ||
        (command.kind === 'offer' && (sourceOffer || confirmedOffer)) ||
        (confirmedOffer &&
          command.externalConversationId !== confirmedOffer.command.externalConversationId)
      )
        throw new Error('Ungültiger Verhandlungsauftrag');
      return required(browser.sendNegotiation)(
        identifier(argumentsList[0]),
        command,
        sourceOffer,
        confirmedOffer,
        authorize,
      );
    }
    case 'sendMessage':
      return required(browser.sendMessage)(
        identifier(argumentsList[0]),
        messageCommand(argumentsList[1]),
        authorize,
      );
    case 'readFavoriteEvents':
      return required(browser.readFavoriteEvents)(identifier(argumentsList[0]), authorize);
    case 'sendFavoriteMessage':
      return required(browser.sendFavoriteMessage)(
        identifier(argumentsList[0]),
        favoriteCommand(argumentsList[1], false),
        authorize,
      );
    case 'sendFavoriteOffer':
      return required(browser.sendFavoriteOffer)(
        identifier(argumentsList[0]),
        favoriteCommand(argumentsList[1], true),
        authorize,
        confirmPrice,
      );
    case 'initialize':
      await required(browser.initialize)();
      return null;
    case 'capture':
      return Buffer.from(await required(browser.capture)()).toString('base64');
    case 'click': {
      if (
        argumentsList.some(
          (value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1,
        )
      )
        throw new Error('Ungültige Browserposition');
      await required(browser.click)(argumentsList[0] as number, argumentsList[1] as number);
      return null;
    }
    case 'drag': {
      const points = argumentsList[0];
      if (!Array.isArray(points) || points.length < 1 || points.length > 256)
        throw new Error('Ungültige Browserbewegung');
      const checked: BrowserDragPoint[] = points.map((inputPoint) => {
        const point = commandRecord(inputPoint);
        if (
          Object.keys(point).some((key) => !['x', 'y', 'elapsedMs'].includes(key)) ||
          typeof point.x !== 'number' ||
          typeof point.y !== 'number' ||
          typeof point.elapsedMs !== 'number' ||
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          point.x < 0 ||
          point.x > 1 ||
          point.y < 0 ||
          point.y > 1 ||
          !Number.isSafeInteger(point.elapsedMs) ||
          point.elapsedMs < 0 ||
          point.elapsedMs > 15000
        )
          throw new Error('Ungültige Browserbewegung');
        return { x: point.x, y: point.y, elapsedMs: point.elapsedMs };
      });
      await required(browser.drag)(checked);
      return null;
    }
    case 'type':
      await required(browser.type)(text(argumentsList[0], 4096));
      return null;
    case 'press': {
      const key = text(argumentsList[0], 16);
      if (!['Enter', 'Tab', 'Escape', 'Backspace'].includes(key))
        throw new Error('Ungültige Browsertaste');
      await required(browser.press)(key as 'Enter' | 'Tab' | 'Escape' | 'Backspace');
      return null;
    }
    case 'identify':
      return required(browser.identify)();
    case 'login': {
      const credentials = commandRecord(argumentsList[0]);
      if (Object.keys(credentials).some((key) => !['username', 'password'].includes(key)))
        throw new Error('Ungültige Anmeldung');
      return required(browser.login)(
        { username: text(credentials.username, 1024), password: text(credentials.password, 1024) },
        authorize,
      );
    }
    case 'verify':
      return required(browser.verify)(text(argumentsList[0], 8), authorize);
    case 'readListingEdit':
      return required(browser.readListingEdit)(
        identifier(argumentsList[0]),
        identifier(argumentsList[1]),
      );
    case 'updateListing':
      return required(browser.updateListing)(
        identifier(argumentsList[0]),
        identifier(argumentsList[1]),
        fields(argumentsList[2]),
        authorize,
      );
    case 'readProfileAbout':
      return required(browser.readProfileAbout)(identifier(argumentsList[0]));
    case 'updateProfileAbout':
      return required(browser.updateProfileAbout)(
        identifier(argumentsList[0]),
        text(argumentsList[1], 10000),
        authorize,
        argumentsList[2] === null ? undefined : text(argumentsList[2], 10000),
      );
    case 'importAccount': {
      const previous = argumentsList[0];
      if (!Array.isArray(previous) || previous.length > 500)
        throw new Error('Ungültiger Gesprächscache');
      const versions = previous.map((inputVersion) => {
        const version = commandRecord(inputVersion);
        if (
          Object.keys(version).some(
            (key) =>
              ![
                'externalId',
                'sourceUpdatedAt',
                'detailCheckedAt',
                'text',
                'occurredAt',
                'itemId',
                'itemTitle',
                'itemImageUrl',
                'itemPrice',
                'itemCurrency',
                'transactionStatus',
              ].includes(key),
          )
        )
          throw new Error('Ungültiger Gesprächscache');
        return {
          externalId: identifier(version.externalId),
          sourceUpdatedAt: text(version.sourceUpdatedAt, 64),
          detailCheckedAt: text(version.detailCheckedAt, 64),
          text: version.text === null ? null : text(version.text),
          occurredAt: version.occurredAt === null ? null : text(version.occurredAt, 64),
          ...Object.fromEntries(
            [
              'itemId',
              'itemTitle',
              'itemImageUrl',
              'itemPrice',
              'itemCurrency',
              'transactionStatus',
            ]
              .filter((key) => version[key] !== undefined)
              .map((key) => {
                const value = version[key];
                if (
                  value !== null &&
                  (key === 'itemPrice'
                    ? typeof value !== 'number' || !Number.isFinite(value) || value < 0
                    : typeof value !== 'string' || value.length > 2048)
                )
                  throw new Error('Ungültiger Artikelcache');
                return [key, value];
              }),
          ),
        };
      });
      const target = argumentsList[1] === null ? undefined : commandRecord(argumentsList[1]);
      if (target && Object.keys(target).some((key) => !['accountId', 'externalId'].includes(key)))
        throw new Error('Ungültiger Gesprächsauftrag');
      return required(browser.importAccount)(
        authorize,
        onStage,
        versions,
        target
          ? { externalId: identifier(target.externalId), accountId: identifier(target.accountId) }
          : undefined,
      );
    }
  }
  throw new Error('Nicht erlaubte Browseraktion');
}

export function browserActionError(error: unknown): BrowserActionEvent {
  if (error instanceof VintedImportRequestError)
    return { kind: 'error', code: 'request', reason: error.reason, retryAfter: error.retryAfter };
  for (const [constructor, code] of [
    [VintedInteractionRequiredError, 'interaction_required'],
    [VintedLoginPendingError, 'login_pending'],
    [VintedLoginRejectedError, 'login_rejected'],
    [VintedVerificationRequiredError, 'verification_required'],
  ] as const)
    if (error instanceof constructor) return { kind: 'error', code };
  if (error instanceof VintedImportReadError)
    return {
      kind: 'error',
      code: 'import',
      stage: error.stage,
      ...(error.cause instanceof VintedImportRequestError
        ? {
            reason: error.cause.reason,
            retryAfter: error.cause.retryAfter,
            browserReadFailure: error.cause.browserReadFailure,
          }
        : {}),
    };
  return { kind: 'error', code: 'failed' };
}
function throwBrowserError(event: Record<string, unknown>): never {
  if (event.code === 'interaction_required') throw new VintedInteractionRequiredError();
  if (event.code === 'login_pending') throw new VintedLoginPendingError();
  if (event.code === 'login_rejected') throw new VintedLoginRejectedError();
  if (event.code === 'verification_required') throw new VintedVerificationRequiredError();
  if (event.code === 'import' || event.code === 'request') {
    const stages = [
      'navigation',
      'identity',
      'profile',
      'publications',
      'conversations',
      'messages',
      'transaction',
      'parse',
    ] as const;
    const stage = stages.find((stage) => stage === event.stage);
    const reasons = [
      'unauthorized',
      'forbidden',
      'rate_limited',
      'provider_unavailable',
      'invalid_response',
      'timeout',
      'network',
      'browser_context',
    ] as const;
    const reason = reasons.find((reason) => reason === event.reason);
    const failures = [
      'navigation',
      'navigation_interrupted',
      'navigation_aborted',
      'timeout',
      'network',
      'closed',
      'script',
      'unknown',
    ] as const;
    const failure = failures.find((failure) => failure === event.browserReadFailure);
    if (event.code === 'request') {
      if (!reason) throw new Error('Ungültiger Browserfehler');
      throw new VintedImportRequestError(
        reason,
        event.retryAfter === undefined ? undefined : text(event.retryAfter, 64),
      );
    }
    if (!stage || (event.reason !== undefined && !reason))
      throw new Error('Ungültiger Browserfehler');
    throw new VintedImportReadError(
      stage,
      reason
        ? new VintedImportRequestError(
            reason,
            event.retryAfter === undefined ? undefined : text(event.retryAfter, 64),
            failure,
          )
        : undefined,
    );
  }
  throw new Error('Browseraktion fehlgeschlagen');
}

export interface BrowserCommandTransport {
  request(input: Record<string, unknown>): Promise<unknown>;
}

export function isolatedBrowserActions(transport: BrowserCommandTransport): BrowserInfo {
  async function run(
    name: BrowserActionName,
    argumentsList: unknown[],
    authorize: () => Promise<void> = async () => undefined,
    onStage?: (stage: 'profile' | 'publications' | 'conversations' | 'sales') => Promise<void>,
    confirmPrice?: (original: number, offered: number) => Promise<boolean>,
    listing?: {
      beforeWrite: () => Promise<void>;
      photoChunk: (imageId: string, offset: number) => Promise<unknown>;
    },
  ): Promise<unknown> {
    await authorize();
    const started = commandRecord(
      await transport.request({ action: 'start', operation: { name, arguments: argumentsList } }),
    );
    const id = text(started.id, 36);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Ungültiger Browserauftrag');
    let sequence = 0;
    let payload: unknown;
    const deadline = Date.now() + 12 * 60_000;
    try {
      while (Date.now() < deadline) {
        const event = commandRecord(
          await transport.request({
            action: 'poll',
            id,
            sequence,
            ...(payload === undefined ? {} : { payload }),
          }),
        );
        payload = undefined;
        if (event.kind === 'wait') {
          await authorize();
          continue;
        }
        if (
          event.kind === 'authorize' ||
          event.kind === 'stage' ||
          event.kind === 'offer_price' ||
          event.kind === 'listing_begin' ||
          event.kind === 'listing_photo'
        ) {
          if (event.sequence !== sequence + 1 || sequence >= 10000)
            throw new Error('Ungültige Browserfreigabe');
          await authorize();
          if (event.kind === 'listing_begin') {
            if (name !== 'submitListing' || !listing || Object.keys(event).length !== 2)
              throw new Error('Inseratbeginn ungültig');
            await listing.beforeWrite();
          }
          if (event.kind === 'listing_photo') {
            if (
              name !== 'submitListing' ||
              !listing ||
              Object.keys(event).length !== 4 ||
              typeof event.imageId !== 'string' ||
              !Number.isSafeInteger(event.offset) ||
              Number(event.offset) < 0
            )
              throw new Error('Originalfotoanfrage ungültig');
            payload = await listing.photoChunk(event.imageId, Number(event.offset));
          }
          if (event.kind === 'offer_price') {
            if (
              name !== 'sendFavoriteOffer' ||
              typeof event.original !== 'number' ||
              typeof event.offered !== 'number' ||
              !Number.isSafeInteger(event.original) ||
              !Number.isSafeInteger(event.offered) ||
              event.original <= 0 ||
              event.offered <= 0 ||
              event.offered >= event.original ||
              !(await confirmPrice?.(event.original, event.offered))
            )
              throw new Error('Preisangebot nicht bestätigt');
          }
          if (event.kind === 'stage') {
            const stage = ['profile', 'publications', 'conversations', 'sales'].find(
              (stage) => stage === event.stage,
            );
            if (!stage) throw new Error('Ungültiger Abrufschritt');
            await onStage?.(stage as 'profile' | 'publications' | 'conversations' | 'sales');
          }
          sequence += 1;
          continue;
        }
        // Ein bereits belegtes Ergebnis erteilt keine neue Browserfreigabe.
        if (
          event.kind === 'result' &&
          [
            'sendMessage',
            'sendFavoriteMessage',
            'sendFavoriteOffer',
            'sendNegotiation',
            'submitListing',
          ].includes(name)
        )
          return validateBrowserResult(name, event.value);
        await authorize();
        if (event.kind === 'error') throwBrowserError(event);
        if (event.kind !== 'result') throw new Error('Ungültige Browserantwort');
        return validateBrowserResult(name, event.value);
      }
      throw new Error('Browseraktion abgelaufen');
    } finally {
      await transport.request({ action: 'cancel', id }).catch(() => undefined);
    }
  }
  return {
    version: () => 'isolated-session-v1',
    submitListing: async (
      account,
      action,
      snapshot,
      beforeWrite,
      authorize,
      loadPhoto,
      categoryPath,
    ) => {
      let beginReserved = false,
        beginConfirmed = false;
      const sender = createVintedListingPhotoSender(snapshot.images, loadPhoto, authorize);
      try {
        const result = await run(
          'submitListing',
          [account, action, snapshot, categoryPath],
          authorize,
          undefined,
          undefined,
          {
            beforeWrite: async () => {
              if (beginReserved) throw new Error('Inseratversuch bereits begonnen');
              beginReserved = true;
              await beforeWrite();
              beginConfirmed = true;
            },
            photoChunk: sender.chunk,
          },
        );
        if (
          !isVintedListingResult(result, action, account) ||
          (result.outcome === 'confirmed' && !beginConfirmed)
        )
          throw new Error('Inseratergebnis nicht gebunden');
        return result;
      } finally {
        sender.close();
      }
    },
    sendNegotiation: async (account, command, sourceOffer, confirmedOffer, authorize) =>
      (await run(
        'sendNegotiation',
        [account, command, sourceOffer, confirmedOffer],
        authorize,
      )) as Awaited<ReturnType<NonNullable<BrowserInfo['sendNegotiation']>>>,
    sendMessage: async (account, command, authorize) =>
      (await run('sendMessage', [account, command], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['sendMessage']>>
      >,
    readFavoriteEvents: async (account, authorize) =>
      (await run('readFavoriteEvents', [account], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['readFavoriteEvents']>>
      >,
    sendFavoriteMessage: async (account, command, authorize) =>
      (await run('sendFavoriteMessage', [account, command], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['sendFavoriteMessage']>>
      >,
    sendFavoriteOffer: async (account, command, authorize, confirmPrice) =>
      (await run(
        'sendFavoriteOffer',
        [account, command],
        authorize,
        undefined,
        confirmPrice,
      )) as Awaited<ReturnType<NonNullable<BrowserInfo['sendFavoriteOffer']>>>,
    initialize: async () => {
      await run('initialize', []);
    },
    capture: async () => Buffer.from((await run('capture', [])) as string, 'base64'),
    click: async (x, y) => {
      await run('click', [x, y]);
    },
    drag: async (points) => {
      await run('drag', [points]);
    },
    type: async (value) => {
      await run('type', [value]);
    },
    press: async (key) => {
      await run('press', [key]);
    },
    identify: async () =>
      (await run('identify', [])) as Awaited<ReturnType<NonNullable<BrowserInfo['identify']>>>,
    importAccount: async (authorize, onStage, previous = [], requested) =>
      (await run(
        'importAccount',
        [previous, requested ?? null],
        authorize,
        onStage,
      )) as VintedAccountImport,
    login: async (credentials, authorize) =>
      (await run('login', [credentials], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['login']>>
      >,
    verify: async (code, authorize) =>
      (await run('verify', [code], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['verify']>>
      >,
    readListingEdit: async (itemId, accountId) =>
      (await run('readListingEdit', [itemId, accountId])) as Awaited<
        ReturnType<NonNullable<BrowserInfo['readListingEdit']>>
      >,
    readListingCategory: async (accountId, categoryId, parents, authorize) =>
      parseVintedListingCategoryFields(
        await run('readListingCategory', [accountId, categoryId, parents], authorize),
        categoryId,
      ),
    readListingContent: async (accountId, externalId, authorize) =>
      parseVintedListingCurrentContent(
        await run('readListingContent', [accountId, externalId], authorize),
        accountId,
        externalId,
      ),
    updateListingContent: async (accountId, externalId, base, desired, authorize) =>
      (await run(
        'updateListingContent',
        [accountId, externalId, base, desired],
        authorize,
      )) as Awaited<ReturnType<NonNullable<BrowserInfo['updateListingContent']>>>,
    updateListing: async (itemId, accountId, fields, authorize) =>
      (await run('updateListing', [itemId, accountId, fields], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['updateListing']>>
      >,
    readProfileAbout: async (accountId) => (await run('readProfileAbout', [accountId])) as string,
    updateProfileAbout: async (accountId, about, authorize, expected) =>
      (await run('updateProfileAbout', [accountId, about, expected ?? null], authorize)) as Awaited<
        ReturnType<NonNullable<BrowserInfo['updateProfileAbout']>>
      >,
  };
}

/** Auch ein vollständig übernommener Auswerter darf keine Schreibziele bestimmen. */
export function validateBrowserResult(name: BrowserActionName, input: unknown): unknown {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > browserCommandLimit)
    throw new Error('Browserantwort zu groß');
  if (name === 'submitListing') {
    const value = commandRecord(input);
    const action = value['action'] === 'vinted_draft' ? 'vinted_draft' : 'publish';
    const account =
      typeof value['externalAccountId'] === 'string' ? value['externalAccountId'] : '1';
    if (!isVintedListingResult(input, action, account))
      throw new Error('Ungültiges Inseratergebnis');
    return input;
  }
  if (name === 'sendNegotiation') {
    if (!isVintedNegotiationResult(input)) throw new Error('Ungültiges Verhandlungsergebnis');
    return input;
  }
  if (name === 'readFavoriteEvents') {
    if (!Array.isArray(input) || input.length > 200)
      throw new Error('Ungültige Favoritenereignisse');
    for (const entry of input) {
      const event = commandRecord(entry);
      if (
        Object.keys(event).length !== 4 ||
        typeof event.externalId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.externalId) ||
        !Number.isFinite(Date.parse(text(event.eventAt, 64)))
      )
        throw new Error('Ungültiges Favoritenereignis');
      identifier(event.actorId);
      identifier(event.itemId);
    }
    return input;
  }
  if (name === 'sendMessage' || name === 'sendFavoriteMessage' || name === 'sendFavoriteOffer') {
    const result = commandRecord(input);
    const keys = [
      'outcome',
      'errorCode',
      ...(name === 'sendFavoriteOffer'
        ? ['externalOfferId']
        : [
            'externalMessageId',
            ...(name === 'sendFavoriteMessage' ? ['conversationId', 'transactionId'] : []),
          ]),
    ];
    if (
      Object.keys(result).some((key) => !keys.includes(key)) ||
      ![
        'sent',
        'failed',
        'outcome_unknown',
        ...(name === 'sendMessage' ? [] : ['skipped']),
      ].includes(String(result.outcome))
    )
      throw new Error('Ungültiges Versandergebnis');
    if (result.errorCode !== undefined && !/^[a-z_]{1,64}$/.test(text(result.errorCode, 64)))
      throw new Error('Ungültiger Versandfehler');
    for (const key of keys.filter((key) => key !== 'outcome' && key !== 'errorCode'))
      if (result[key] !== undefined) identifier(result[key]);
    if (result.outcome === 'sent') {
      identifier(result[name === 'sendFavoriteOffer' ? 'externalOfferId' : 'externalMessageId']);
      if (name === 'sendFavoriteMessage') identifier(result.conversationId);
    }
    return result;
  }
  if (['initialize', 'click', 'drag', 'type', 'press'].includes(name)) {
    if (input !== null) throw new Error('Ungültige Browserantwort');
    return null;
  }
  if (name === 'capture') {
    const image = text(input, 1024 * 1024);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(image)) throw new Error('Ungültiges Browserbild');
    return image;
  }
  if (name === 'readProfileAbout') return text(input, 10000);
  if (name === 'readListingEdit') return fields(input);
  if (name === 'readListingCategory') {
    const value = commandRecord(input);
    if (typeof value['categoryId'] !== 'number') throw new Error('Ungültige Vinted-Kategorie');
    return parseVintedListingCategoryFields(input, value['categoryId']);
  }
  if (name === 'readListingContent') {
    const value = commandRecord(input);
    return parseVintedListingCurrentContent(
      input,
      identifier(value['externalAccountId']),
      identifier(value['externalId']),
    );
  }
  if (name === 'login' || name === 'verify') {
    const result = text(input, 32);
    if (
      ![
        'submitted',
        'interaction_required',
        'form_unavailable',
        'submission_unconfirmed',
        ...(name === 'login' ? ['verification_required'] : []),
      ].includes(result)
    )
      throw new Error('Ungültiges Anmeldeergebnis');
    return result;
  }
  if (
    name === 'updateListing' ||
    name === 'updateListingContent' ||
    name === 'updateProfileAbout'
  ) {
    if (typeof input !== 'string' || !['confirmed', 'unconfirmed', 'conflict'].includes(input))
      throw new Error('Ungültiges Speicherergebnis');
    return input;
  }
  function identity(input: unknown) {
    const result = commandRecord(input);
    if (Object.keys(result).some((key) => !['id', 'username'].includes(key)))
      throw new Error('Ungültige Kontoidentität');
    return { id: identifier(result.id), username: text(result.username, 120) };
  }
  if (name === 'identify') return input === null ? null : identity(input);
  const snapshot = commandRecord(input);
  if (
    Object.keys(snapshot).some(
      (key) =>
        ![
          'identity',
          'observedAt',
          'entries',
          'areas',
          'rejectedSaleIds',
          'sourceRequestCount',
          'browserReadFailures',
          'inboxEvents',
        ].includes(key),
    ) ||
    !Array.isArray(snapshot.entries) ||
    snapshot.entries.length > 20000
  )
    throw new Error('Ungültiger Kontoabruf');
  identity(snapshot.identity);
  if (snapshot.inboxEvents !== undefined) {
    const batch = commandRecord(snapshot.inboxEvents);
    if (
      Object.keys(batch).length !== 5 ||
      batch.version !== 1 ||
      typeof batch.complete !== 'boolean' ||
      !Number.isFinite(Date.parse(text(batch.observedAt, 64))) ||
      !Array.isArray(batch.events) ||
      batch.events.length > 600 ||
      !Array.isArray(batch.coveredConversationIds) ||
      batch.coveredConversationIds.length > 3 ||
      Buffer.byteLength(JSON.stringify(batch)) > 200 * 1024
    )
      throw new Error('Ungültige Postfachereignisse');
    batch.coveredConversationIds.forEach(identifier);
    for (const entry of batch.events) {
      const event = commandRecord(entry);
      if (
        Object.keys(event).length !== 5 ||
        typeof event.externalId !== 'string' ||
        !/^(?:message|offer_request_message):[1-9][0-9]{0,31}$/.test(event.externalId) ||
        event.direction !== 'inbound' ||
        event.source !== 'conversation_snapshot' ||
        !Number.isFinite(Date.parse(text(event.occurredAt, 64)))
      )
        throw new Error('Ungültiges Postfachereignis');
      identifier(event.externalConversationId);
    }
  }
  if (!Number.isFinite(Date.parse(text(snapshot.observedAt, 64))))
    throw new Error('Ungültiger Abrufzeitpunkt');
  for (const inputEntry of snapshot.entries) {
    const entry = commandRecord(inputEntry);
    if (
      Object.keys(entry).some(
        (key) => !['kind', 'externalId', 'parentExternalId', 'sortAt', 'body'].includes(key),
      ) ||
      typeof entry.kind !== 'string' ||
      !['profile', 'publication', 'conversation', 'message', 'sale'].includes(entry.kind)
    )
      throw new Error('Ungültiger Abrufeintrag');
    if (typeof entry.externalId !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(entry.externalId))
      throw new Error('Ungültige Eintragskennung');
    if (entry.parentExternalId !== undefined) identifier(entry.parentExternalId);
    if (!Number.isFinite(Date.parse(text(entry.sortAt, 64))))
      throw new Error('Ungültiger Eintragszeitpunkt');
    const body = commandRecord(entry.body);
    if (
      body.negotiationOffer !== undefined &&
      (entry.kind !== 'message' ||
        body.direction !== 'inbound' ||
        !isVintedNegotiationOffer(body.negotiationOffer) ||
        body.negotiationOffer.sellerId !== commandRecord(snapshot.identity).id)
    )
      throw new Error('Ungültiges Verhandlungsangebot');
    if (
      body.negotiationEvent !== undefined &&
      (entry.kind !== 'message' || !isVintedNegotiationEvent(body.negotiationEvent))
    )
      throw new Error('Ungültiges Verhandlungsereignis');
  }
  const areas = commandRecord(snapshot.areas);
  const names = ['profile', 'publications', 'conversations', 'messages', 'sales', 'feedback'];
  if (Object.keys(areas).some((key) => !names.includes(key)))
    throw new Error('Ungültiger Abrufbereich');
  for (const name of names) {
    const area = commandRecord(areas[name]);
    if (
      Object.keys(area).some((key) => !['status', 'failure', 'retryAfter'].includes(key)) ||
      typeof area.status !== 'string' ||
      !['complete', 'partial', 'failed'].includes(area.status)
    )
      throw new Error('Ungültiger Abrufstand');
    if (
      area.failure !== undefined &&
      (typeof area.failure !== 'string' ||
        ![
          'unauthorized',
          'forbidden',
          'rate_limited',
          'provider_unavailable',
          'invalid_response',
          'timeout',
          'network',
          'browser_context',
        ].includes(area.failure))
    )
      throw new Error('Ungültiger Abruffehler');
    if (area.retryAfter !== undefined) text(area.retryAfter, 64);
  }
  if (
    snapshot.sourceRequestCount !== undefined &&
    (typeof snapshot.sourceRequestCount !== 'number' ||
      !Number.isSafeInteger(snapshot.sourceRequestCount) ||
      snapshot.sourceRequestCount < 0)
  )
    throw new Error('Ungültige Abrufanzahl');
  if (snapshot.rejectedSaleIds !== undefined) {
    if (!Array.isArray(snapshot.rejectedSaleIds) || snapshot.rejectedSaleIds.length > 20000)
      throw new Error('Ungültige Verkaufskennungen');
    snapshot.rejectedSaleIds.forEach(identifier);
  }
  if (
    snapshot.browserReadFailures !== undefined &&
    (!Array.isArray(snapshot.browserReadFailures) ||
      snapshot.browserReadFailures.length > 8 ||
      snapshot.browserReadFailures.some(
        (failure) =>
          typeof failure !== 'string' ||
          ![
            'navigation',
            'navigation_interrupted',
            'navigation_aborted',
            'timeout',
            'network',
            'closed',
            'script',
            'unknown',
          ].includes(failure),
      ))
  )
    throw new Error('Ungültige Browserdiagnose');
  return snapshot;
}

import { parseVintedTransferSource } from '../../../supabase/functions/_shared/kleinanzeigen-listing-validation.mts';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { MarketplaceBrowserSessionBroker } from './marketplace-browser-session-broker.ts';
import { MarketplaceBrowserSessionEndedError } from './marketplace-browser-session-broker.ts';
import {
  actionBinding,
  accountActionTarget,
  actionRecord,
  actionUuid,
  type AccountActionClaim,
  type AccountActionStoreOptions,
  SupabaseMarketplaceAccountActionStore,
} from './supabase-marketplace-account-action-store.ts';
import {
  parseVintedListingCategoryFields,
  parseVintedListingCurrentContent,
  parseVintedListingEditContent,
} from './vinted-listing-contracts.ts';
import {
  parseVintedListingPhotoArrangement,
  sameVintedListingPhotos,
} from './vinted-browser-listing-photo-order.ts';
import {
  parseVintedProfileChanges,
  parseVintedProfileDetails,
} from './vinted-profile-contracts.ts';
import { SupabaseVintedListingCache } from './supabase-vinted-listing-cache.ts';
import { SupabaseVintedProfileCache } from './supabase-vinted-profile-cache.ts';
import { SupabaseVintedImportWriter } from './supabase-vinted-import-writer.ts';
import { SupabaseShippingLabelStore } from './supabase-shipping-label-store.ts';
import { shippingCarrierFromSale } from './vinted-shipping-label-contracts.ts';
import { loadMarketplaceListingCategoryPath } from './marketplace-listing-category.ts';
import {
  resolveVintedListingEditIntent,
  resolveVintedListingBasicEditIntent,
  type VintedListingEditIntent,
} from '../../../supabase/functions/_shared/vinted-listing-edit-intent.mjs';
import {
  VintedInteractionRequiredError,
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
} from './vinted-browser-reader.ts';
import { VintedListingReadError } from './vinted-listing-read-error.ts';
import {
  VintedImportReadError,
  VintedImportRequestError,
  type VintedAccountImport,
  type VintedImportAreaResult,
} from './vinted-account-import.ts';

/**
 * Ein Gesprächsabruf liest zwangsläufig das ganze Postfach. Gespeichert werden darf aber nur das
 * angefragte Gespräch: Die Datenbank lehnt auftragsgebundene Importe mit fremden Einträgen ab.
 * Listen gelten deshalb höchstens als Teilstand, sonst würden fehlende Einträge gelöscht.
 */
export function restrictVintedImportToConversation(
  read: VintedAccountImport,
  conversationExternalId: string,
): VintedAccountImport {
  const partial = (area: VintedImportAreaResult): VintedImportAreaResult =>
    area.status === 'complete' ? { ...area, status: 'partial' } : area;
  const conversation = read.entries.find(
    (entry) => entry.kind === 'conversation' && entry.externalId === conversationExternalId,
  );
  const confirmedSaleId =
    conversation?.body['saleTrackingVersion'] === 3 &&
    conversation.body['detailCheckedAt'] === read.observedAt &&
    conversation.body['saleSellerId'] === read.identity.id
      ? conversation.body['saleTransactionId']
      : null;
  const {
    rejectedSaleIds: _rejectedSaleIds,
    favoriteEvents: _favoriteEvents,
    sellingCategories: _sellingCategories,
    categoryFields: _categoryFields,
    inboxEvents,
    ...rest
  } = read;
  return {
    ...rest,
    entries: read.entries.filter(
      (entry) =>
        entry.kind === 'profile' ||
        (entry.kind === 'conversation' && entry.externalId === conversationExternalId) ||
        (entry.kind === 'message' && entry.parentExternalId === conversationExternalId) ||
        (entry.kind === 'sale' &&
          entry.externalId === confirmedSaleId &&
          entry.body['externalConversationId'] === conversationExternalId &&
          entry.body['sellerId'] === read.identity.id),
    ),
    areas: {
      ...read.areas,
      publications: partial(read.areas.publications),
      conversations: partial(read.areas.conversations),
      messages: partial(read.areas.messages),
      sales: partial(read.areas.sales),
    },
    ...(inboxEvents
      ? {
          inboxEvents: {
            ...inboxEvents,
            events: inboxEvents.events.filter(
              (event) => event.externalConversationId === conversationExternalId,
            ),
            complete: false,
            coveredConversationIds: inboxEvents.coveredConversationIds.filter(
              (id) => id === conversationExternalId,
            ),
          },
        }
      : {}),
  };
}

function accountActionFailureCode(error: unknown): string {
  if (error instanceof MarketplaceBrowserSessionEndedError) return 'browser_unavailable';
  const request = error instanceof VintedImportReadError ? error.cause : error;
  if (
    request instanceof VintedImportRequestError &&
    (request.reason === 'network' || request.reason === 'timeout')
  )
    return request.reason;
  return 'provider_failed';
}

function logAccountActionFailure(kind: string, errorCode: string | null, error: unknown): void {
  // Nur Fehlerart und Stufe, keine Inhalte oder Kontodaten.
  const stage = error instanceof VintedImportReadError ? error.stage : undefined;
  const reason =
    error instanceof VintedImportRequestError
      ? error.reason
      : error instanceof VintedImportReadError && error.cause instanceof VintedImportRequestError
        ? error.cause.reason
        : undefined;
  process.stdout.write(
    `${JSON.stringify({
      event: 'marketplace_account_action_failed',
      kind,
      errorCode,
      errorName: error instanceof Error ? error.name : typeof error,
      ...(error instanceof Error && !(error instanceof VintedImportReadError)
        ? { message: error.message.slice(0, 200) }
        : {}),
      ...(stage ? { stage } : {}),
      ...(reason ? { reason } : {}),
    })}
`,
  );
}

export const accountActionRoutes: Readonly<Record<string, string>> = {
  '/marketplace-browser/listings/price/save': 'price_save',
  '/marketplace-browser/listings/delete': 'listing_delete',
  '/marketplace-browser/listings/edit/read': 'listing_edit_read',
  '/marketplace-browser/listings/edit/save': 'listing_edit_save',
  '/marketplace-browser/listings/content/read': 'listing_content_read',
  '/marketplace-browser/listings/content/save': 'listing_content_save',
  '/marketplace-browser/listings/edit/intent': 'listing_edit_intent',
  '/marketplace-browser/listings/category/read': 'listing_category_read',
  '/marketplace-browser/conversations/read': 'conversations_read',
  '/marketplace-browser/profile/details/read': 'profile_details_read',
  '/marketplace-browser/profile/details/save': 'profile_details_save',
  '/marketplace-browser/profile/cities/read': 'profile_cities_read',
  '/marketplace-browser/profile/edit/read': 'profile_edit_read',
  '/marketplace-browser/profile/edit/save': 'profile_edit_save',
  '/marketplace-browser/shipping-labels/request': 'shipping_label_request',
};
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Ungültiger Auftragstext');
  return value;
}
function price(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 99_999_999)
    throw new Error('Ungültiger Preis');
  return value;
}
function editFields(input: unknown) {
  const fields = actionRecord(input);
  const title = text(fields.title, 120).trim(),
    description = text(fields.description, 2000),
    value = text(fields.price, 10);
  if (
    !title ||
    !/^\d{1,6}(?:[,.]\d{1,2})?$/.test(value) ||
    Number(value.replace(',', '.')) <= 0 ||
    Object.keys(fields).some((key) => !['title', 'description', 'price'].includes(key))
  )
    throw new Error('Ungültige Inseratfelder');
  return { title, description, price: value };
}
export function validateAccountActionPayload(
  kind: string,
  input: unknown,
): Record<string, unknown> {
  const payload = actionRecord(input);
  const keys: Record<string, readonly string[]> = {
    price_save: ['entryId', 'expectedPriceCents', 'priceCents'],
    listing_delete: ['entryId'],
    listing_edit_read: ['entryId'],
    listing_content_read: ['entryId', 'saleItemId'],
    listing_edit_save: ['entryId', 'fields'],
    listing_content_save: ['entryId', 'base', 'content', 'photos'],
    listing_edit_intent: ['entryId', 'intent'],
    listing_category_read: ['categoryId', 'categoryLabel'],
    conversations_read: ['conversationId'],
    shipping_label_request: ['saleId'],
    profile_details_read: [],
    profile_edit_read: [],
    profile_details_save: ['changes', 'expected'],
    profile_edit_save: ['about', 'expectedAbout'],
    profile_cities_read: ['query'],
  };
  const allowed = keys[kind];
  if (!allowed || Object.keys(payload).some((key) => !allowed.includes(key)))
    throw new Error('Ungültige Kontoaktion');
  if ((kind.startsWith('listing_') && kind !== 'listing_category_read') || kind === 'price_save')
    actionUuid(payload.entryId);
  if (
    kind === 'listing_content_read' &&
    payload.saleItemId !== undefined &&
    (typeof payload.saleItemId !== 'string' || !/^[1-9][0-9]{0,31}$/.test(payload.saleItemId))
  )
    throw new Error('Ungültiger Verkaufsartikel');
  if (kind === 'conversations_read') actionUuid(payload.conversationId);
  if (kind === 'shipping_label_request') actionUuid(payload.saleId);
  if (kind === 'price_save') {
    price(payload.expectedPriceCents);
    price(payload.priceCents);
  }
  if (kind === 'listing_edit_save') editFields(payload.fields);
  if (kind === 'listing_content_save') {
    parseVintedListingEditContent(payload.base);
    parseVintedListingEditContent(payload.content);
    if (payload.photos !== undefined) parseVintedListingPhotoArrangement(payload.photos);
  }
  if (kind === 'listing_edit_intent') {
    const intent = actionRecord(payload.intent);
    if (
      Object.keys(intent).some(
        (key) =>
          !['base', 'fields', 'initialFields', 'categoryEdit', 'extras', 'photos'].includes(key),
      )
    )
      throw new Error('Ungültige Bearbeitung');
    const fields = actionRecord(intent.fields);
    if (
      Object.keys(fields).some(
        (key) =>
          ![
            'title',
            'description',
            'price',
            'brand',
            'size',
            'condition',
            'package',
            'color',
            'material',
            'accessory_department',
          ].includes(key),
      )
    )
      throw new Error('Unbekanntes Bearbeitungsfeld');
    if (Object.values(fields).some((value) => typeof value !== 'string' || value.length > 2000))
      throw new Error('Ungültige Bearbeitungsfelder');
    editFields({ title: fields.title, description: fields.description, price: fields.price });
    for (const snapshot of [intent.base, intent.categoryEdit])
      if (snapshot !== null) {
        const value = actionRecord(snapshot),
          content = parseVintedListingEditContent(value.content);
        parseVintedListingCategoryFields(value.schema, content.categoryId!);
        parseVintedListingPhotoArrangement({ base: value.photoUrls, desired: value.photoUrls });
      }
    if (intent.photos !== null) parseVintedListingPhotoArrangement(intent.photos);
    if (intent.initialFields !== null) {
      const initial = actionRecord(intent.initialFields);
      if (
        Object.keys(initial).some(
          (key) =>
            ![
              'title',
              'description',
              'price',
              'brand',
              'size',
              'condition',
              'package',
              'color',
              'material',
              'accessory_department',
            ].includes(key),
        ) ||
        Object.values(initial).some((value) => typeof value !== 'string' || value.length > 2000)
      )
        throw new Error('Ungültige ursprüngliche Felder');
    }
    if (intent.extras !== null) {
      const extras = actionRecord(intent.extras);
      if (
        !Number.isSafeInteger(extras.categoryId) ||
        Number(extras.categoryId) < 1 ||
        Object.entries(actionRecord(extras.values)).some(
          ([key, value]) => key.length > 120 || typeof value !== 'string' || value.length > 2000,
        )
      )
        throw new Error('Ungültige Zusatzfelder');
    }
  }
  if (kind === 'listing_category_read') {
    if (
      !Number.isSafeInteger(payload.categoryId) ||
      Number(payload.categoryId) < 1 ||
      Number(payload.categoryId) > 2147483647
    )
      throw new Error('Ungültige Kategorie');
    if (payload.categoryLabel !== undefined && !text(payload.categoryLabel, 2000).trim())
      throw new Error('Ungültige Kategorie');
  }
  if (kind === 'profile_details_save') {
    parseVintedProfileChanges(payload.changes);
    parseVintedProfileDetails(payload.expected);
  }
  if (kind === 'profile_edit_save') {
    text(payload.about, 2000);
    if (payload.expectedAbout !== undefined) text(payload.expectedAbout, 2000);
  }
  if (kind === 'profile_cities_read' && text(payload.query, 80).trim().length < 2)
    throw new Error('Ungültige Stadtsuche');
  return payload;
}
function required<T>(method: T | undefined): T {
  if (!method) throw new Error('Browserfunktion nicht verfügbar');
  return method;
}
class AccountActionAuthorizationError extends Error {}
function sameJson(left: unknown, right: unknown): boolean {
  const normalized = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(normalized)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => [key, normalized(value)]),
          )
        : input;
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}
interface RunnerOptions extends AccountActionStoreOptions {
  publishableKey: string;
  broker: Pick<
    MarketplaceBrowserSessionBroker,
    'open' | 'run' | 'close' | 'discardUnstartedAction'
  >;
  store: SupabaseMarketplaceAccountActionStore;
  runSetup?: (claim: AccountActionClaim) => Promise<void>;
  runSession?: (claim: AccountActionClaim) => Promise<void>;
}
export class MarketplaceAccountActionRunner {
  private readonly listings: SupabaseVintedListingCache;
  private readonly profiles: SupabaseVintedProfileCache;
  private readonly imports: SupabaseVintedImportWriter;
  private readonly labels: SupabaseShippingLabelStore;
  private readonly options: RunnerOptions;
  constructor(options: RunnerOptions) {
    this.options = options;
    this.listings = new SupabaseVintedListingCache(options);
    this.profiles = new SupabaseVintedProfileCache(options);
    this.imports = new SupabaseVintedImportWriter(options);
    this.labels = new SupabaseShippingLabelStore(options);
  }
  async run(claim: AccountActionClaim): Promise<void> {
    if (claim.actionKind === 'cloud_setup_open') return required(this.options.runSetup)(claim);
    if (claim.actionKind === 'cloud_session_open') return required(this.options.runSession)(claim);
    const { broker, store } = this.options,
      scope = claim.scope;
    let sessionId: string | undefined,
      beginAttempted = false,
      beginConfirmed = false,
      stopped = false;
    let state: 'succeeded' | 'failed' | 'outcome_unknown';
    let result: Record<string, unknown> | null = null,
      errorCode: string | null = 'invalid_payload';
    const authorize = Object.assign(
      async () => {
        const check = await store.check(scope);
        if (
          !check ||
          check.target.accountId !== claim.target.accountId ||
          check.target.externalId !== claim.target.externalId
        )
          throw new AccountActionAuthorizationError('Auftragsfreigabe wurde geändert');
      },
      {
        beforeWrite: async () => {
          beginAttempted = true;
          await store.begin(scope);
          beginConfirmed = true;
        },
      },
    );
    try {
      if (claim.actionKind !== 'outcome_reconcile')
        validateAccountActionPayload(claim.actionKind, claim.payload);
      errorCode = 'authorization_revoked';
      await authorize();
      errorCode = 'browser_unavailable';
      sessionId = await broker.open(scope);
      if (sessionId !== scope.accountAction?.sessionId)
        throw new Error('Falsche Auftragsreservierung');
      result = await broker.run(scope, sessionId, async (browser) => {
        try {
          return await this.execute(claim, browser, authorize, sessionId!);
        } catch (error) {
          if (
            error instanceof VintedInteractionRequiredError ||
            error instanceof VintedVerificationRequiredError
          )
            errorCode = 'challenge_required';
          else if (
            error instanceof VintedLoginPendingError ||
            error instanceof VintedLoginRejectedError
          )
            errorCode = 'login_required';
          else if (
            error instanceof VintedListingReadError &&
            ['authorize', 'identity'].includes(error.step)
          )
            errorCode = 'authorization_revoked';
          else if (error instanceof AccountActionAuthorizationError)
            errorCode = 'authorization_revoked';
          throw error;
        }
      });
      state =
        result.status === 'unconfirmed' || result.status === 'outcome_unknown'
          ? 'outcome_unknown'
          : result.status === 'failed' ||
              result.status === 'conflict' ||
              result.outcome === 'failed'
            ? 'failed'
            : 'succeeded';
      if (
        beginAttempted &&
        result.outcome === 'failed' &&
        result.errorCode === 'provider_unavailable'
      )
        state = 'outcome_unknown';
      errorCode = typeof result.errorCode === 'string' ? result.errorCode : null;
      if (beginAttempted && !beginConfirmed) {
        state = 'failed';
        errorCode = 'begin_unconfirmed';
      }
      if (
        state === 'succeeded' &&
        !beginAttempted &&
        (result.status === 'confirmed' ||
          (result.outcome === 'ready' && result.requested === false))
      )
        result.noWriteNeeded = true;
    } catch (error) {
      if (error instanceof MarketplaceBrowserSessionEndedError && error.isSessionClosed)
        stopped = true;
      // Nach erfolgreichem Browserstart ist ein allgemeiner Fehler kein Startproblem: eigener
      // Code statt „browser_unavailable“, damit Ursache und Wiederholungen stimmen.
      if (sessionId && errorCode === 'browser_unavailable')
        errorCode = accountActionFailureCode(error);
      logAccountActionFailure(claim.actionKind, errorCode, error);
      state = beginConfirmed ? 'outcome_unknown' : 'failed';
      if (beginAttempted && !['login_required', 'challenge_required'].includes(errorCode ?? ''))
        errorCode = beginConfirmed ? 'provider_unconfirmed' : 'begin_unconfirmed';
    } finally {
      if (sessionId && !stopped) {
        try {
          await broker.close(scope, sessionId);
          stopped = true;
        } catch {
          stopped = false;
        }
      } else if (!sessionId)
        try {
          await broker.discardUnstartedAction(scope);
          stopped = true;
        } catch {
          stopped = false;
        }
    }
    if (!stopped) throw new Error('Kontoaktion verlangt Browserbereinigung');
    if (
      state === 'failed' &&
      [
        'browser_unavailable',
        'begin_unconfirmed',
        'network',
        'timeout',
        'provider_failed',
      ].includes(errorCode ?? '') &&
      !beginConfirmed
    ) {
      if (
        (await store.rpc('marketplace_account_action_retry', {
          ...actionBinding(scope),
          p_error_code: errorCode,
        })) === true
      )
        return;
    }
    await store.finish(scope, state, result, errorCode);
  }
  private async execute(
    claim: AccountActionClaim,
    browser: BrowserInfo,
    authorize: (() => Promise<void>) & { beforeWrite: () => Promise<void> },
    sessionId: string,
  ): Promise<Record<string, unknown>> {
    const { scope, target, payload: p } = claim,
      account = target.accountId,
      external = target.externalId ?? '';
    if (!account) throw new Error('Kontozuordnung fehlt');
    const updateCache = async (result: Record<string, unknown>, action: () => Promise<unknown>) => {
      if (result.status === 'confirmed') {
        try {
          await authorize();
          if ((await action()) === false) result.cache = 'pending';
        } catch {
          result.cache = 'pending';
        }
      }
      return result;
    };
    switch (claim.actionKind) {
      case 'listing_edit_read':
        return { fields: await required(browser.readListingEdit)(external, account) };
      case 'listing_content_read': {
        if (typeof p.saleItemId === 'string') {
          const source = parseVintedTransferSource(
            await required(browser.readSoldListingSource)(
              account,
              p.saleItemId,
              authorize,
              external,
            ),
            account,
            p.saleItemId,
          );
          if (!source) throw new Error('Der gelesene Artikel passt nicht zum Verkauf.');
          await authorize();
          return { source };
        }
        const listing = parseVintedListingCurrentContent(
          await required(browser.readListingContent)(account, external, authorize),
          account,
          external,
        );
        await authorize();
        await this.listings.saveTransferSource(scope, actionUuid(p.entryId), listing);
        await this.listings.saveCategoryFields(scope, account, listing.schema);
        return { listing };
      }
      case 'listing_category_read': {
        const categoryId = Number(p.categoryId);
        const path = await loadMarketplaceListingCategoryPath(
          {
            url: this.options.url,
            serviceRoleKey: this.options.serviceRoleKey,
            request: this.options.fetch ?? fetch,
          },
          categoryId,
          async () => {
            await authorize();
            return true;
          },
          { workspaceId: scope.workspaceId, connectionId: scope.connectionId, accountId: account },
        );
        const fields = parseVintedListingCategoryFields(
          await required(browser.readListingCategory)(
            account,
            categoryId,
            path,
            authorize,
            p.categoryLabel as string | undefined,
          ),
          categoryId,
        );
        await authorize();
        await this.listings.saveCategoryFields(scope, account, fields);
        return { fields };
      }
      case 'price_save': {
        const result = {
          ...(await required(browser.updateListingPrice)(
            external,
            account,
            price(p.expectedPriceCents),
            price(p.priceCents),
            authorize,
          )),
        };
        return updateCache(result, () =>
          this.listings.save(
            scope,
            actionUuid(p.entryId),
            external,
            result.fields ?? {
              title: '',
              description: '',
              price: String(Number(p.priceCents) / 100),
            },
            true,
          ),
        );
      }
      case 'listing_delete': {
        const result = await required(browser.deleteListing)(account, external, authorize);
        return updateCache({ ...result }, () =>
          this.listings.remove(scope, actionUuid(p.entryId), external),
        );
      }
      case 'listing_edit_save': {
        const fields = editFields(p.fields),
          status = await required(browser.updateListing)(external, account, fields, authorize);
        return updateCache({ status }, () =>
          this.listings.save(scope, actionUuid(p.entryId), external, fields, true),
        );
      }
      case 'listing_content_save': {
        const base = parseVintedListingEditContent(p.base),
          content = parseVintedListingEditContent(p.content);
        const photos =
          p.photos === undefined ? undefined : parseVintedListingPhotoArrangement(p.photos);
        const status = await required(browser.updateListingContent)(
          account,
          external,
          base,
          content,
          authorize,
          photos,
        );
        return updateCache({ status }, () =>
          this.listings.saveContent(scope, actionUuid(p.entryId), external, content),
        );
      }
      case 'listing_edit_intent': {
        const intent = p.intent as VintedListingEditIntent;
        if (!intent.base) {
          const fresh = await required(browser.readListingEdit)(external, account),
            fields = editFields(resolveVintedListingBasicEditIntent(intent, fresh));
          const status = await required(browser.updateListing)(
            external,
            account,
            fields,
            authorize,
          );
          return updateCache({ status }, () =>
            this.listings.save(scope, actionUuid(p.entryId), external, fields, true),
          );
        }
        const live = await required(browser.readListingContent)(account, external, authorize);
        const resolved = resolveVintedListingEditIntent(intent, live);
        const status = await required(browser.updateListingContent)(
          account,
          external,
          resolved.base,
          resolved.content,
          authorize,
          resolved.photos ?? undefined,
        );
        return updateCache({ status }, () =>
          this.listings.saveContent(scope, actionUuid(p.entryId), external, resolved.content),
        );
      }
      case 'profile_details_read':
        return { profile: await required(browser.readProfileDetails)(account) };
      case 'profile_cities_read':
        return { cities: await required(browser.searchProfileCities)(account, text(p.query, 80)) };
      case 'profile_edit_read':
        return { about: await required(browser.readProfileAbout)(account) };
      case 'profile_edit_save': {
        const about = text(p.about, 2000),
          status = await required(browser.updateProfileAbout)(
            account,
            about,
            authorize,
            p.expectedAbout as string | undefined,
          );
        return updateCache({ status }, () => this.profiles.save(scope, account, about));
      }
      case 'profile_details_save': {
        const result = await required(browser.updateProfileDetails)(
          account,
          parseVintedProfileChanges(p.changes),
          parseVintedProfileDetails(p.expected),
          authorize,
        );
        return updateCache(
          { ...result },
          async () =>
            result.status === 'confirmed' &&
            this.profiles.saveDetails(scope, account, result.profile),
        );
      }
      case 'conversations_read': {
        const previous = await this.imports.conversationVersions(scope, sessionId);
        const read = await required(browser.importAccount)(
          authorize,
          undefined,
          previous,
          { accountId: account, externalId: external },
          [],
        );
        if (
          read.identity.id !== account ||
          !read.entries.some(
            (entry) =>
              entry.kind === 'conversation' &&
              entry.externalId === external &&
              entry.body['detailCheckedAt'] === read.observedAt,
          )
        )
          throw new Error('Gespräch nicht bestätigt');
        await authorize();
        await this.imports.write(
          scope,
          sessionId,
          restrictVintedImportToConversation(read, external),
        );
        return { conversationId: p.conversationId, observedAt: read.observedAt };
      }
      case 'shipping_label_request': {
        const conversation = text(target.body?.externalConversationId, 32);
        if (!/^[1-9][0-9]{0,31}$/.test(conversation)) throw new Error('Verkauf nicht bestätigt');
        const result = await required(browser.requestShippingLabel)(
          account,
          conversation,
          external,
          authorize,
        );
        if (result.outcome !== 'ready')
          return {
            outcome: result.outcome,
            requested: result.requested,
            ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          };
        await authorize();
        const label = await this.labels.save(
          scope,
          {
            accountId: account,
            transactionId: external,
            externalConversationId: conversation,
            title: typeof target.body?.title === 'string' ? target.body.title : 'Verkauf',
            shippingCarrier: shippingCarrierFromSale(target.body),
          },
          result,
        );
        return { outcome: 'ready', requested: result.requested, label };
      }
      case 'outcome_reconcile':
        return this.reconcile(claim, browser, authorize);
      default:
        throw new Error('Unbekannte Kontoaktion');
    }
  }
  private async reconcile(
    claim: AccountActionClaim,
    browser: BrowserInfo,
    authorize: () => Promise<void>,
  ): Promise<Record<string, unknown>> {
    const parent = actionRecord(claim.reconciliationContext),
      payload = actionRecord(parent.payload),
      target = accountActionTarget(parent.target);
    if (target.accountId !== claim.target.accountId)
      throw new AccountActionAuthorizationError(
        'Die Nachprüfung gehört nicht zum freigegebenen Konto',
      );
    const account = target.accountId,
      external = target.externalId ?? '';
    if (!account) throw new Error('Kontozuordnung fehlt');
    let resolution: 'succeeded' | 'failed' | null = null;
    let providerResult: Record<string, unknown> | null = null;
    let cacheCommit: (() => Promise<unknown>) | undefined;
    if (parent.kind === 'profile_edit_save') {
      const about = await required(browser.readProfileAbout)(account);
      if (about === payload.about) {
        resolution = 'succeeded';
        providerResult = { status: 'confirmed' };
        cacheCommit = () => this.profiles.save(claim.scope, account, about);
      }
    } else if (parent.kind === 'profile_details_save') {
      const current = await required(browser.readProfileDetails)(account),
        desired = parseVintedProfileChanges(payload.changes);
      if (
        !desired.photo &&
        current.about === desired.about &&
        current.city === desired.city &&
        current.language === desired.language &&
        current.showCity === desired.showCity
      ) {
        resolution = 'succeeded';
        providerResult = { status: 'confirmed', profile: current };
        cacheCommit = () => this.profiles.saveDetails(claim.scope, account, current);
      }
    } else if (parent.kind === 'listing_delete') {
      const presence = await required(browser.readListingPresence)(account, external, authorize);
      if (presence === 'absent') {
        resolution = 'succeeded';
        providerResult = { status: 'confirmed' };
        cacheCommit = () =>
          this.listings.remove(claim.scope, actionUuid(payload.entryId), external);
      }
      if (presence === 'present') {
        resolution = 'failed';
        providerResult = { status: 'failed' };
      }
    } else if (parent.kind === 'shipping_label_request') {
      const conversation = text(target.body?.externalConversationId, 32);
      const label = await required(browser.requestShippingLabel)(
        account,
        conversation,
        external,
        authorize,
        true,
      );
      if (label.outcome === 'ready') {
        resolution = 'succeeded';
        await authorize();
        const stored = await this.labels.save(
          claim.scope,
          {
            accountId: account,
            transactionId: external,
            externalConversationId: conversation,
            title: typeof target.body?.title === 'string' ? target.body.title : 'Verkauf',
            shippingCarrier: shippingCarrierFromSale(target.body),
          },
          label,
        );
        providerResult = { outcome: 'ready', requested: false, label: stored };
      }
    } else if (
      ['price_save', 'listing_edit_save', 'listing_content_save', 'listing_edit_intent'].includes(
        String(parent.kind),
      )
    ) {
      const current = await required(browser.readListingContent)(account, external, authorize);
      if (parent.kind === 'price_save' && current.content.priceCents === payload.priceCents)
        resolution = 'succeeded';
      if (parent.kind === 'listing_edit_save') {
        const fields = editFields(payload.fields);
        if (
          current.content.title === fields.title &&
          current.content.description === fields.description &&
          current.content.priceCents === Math.round(Number(fields.price.replace(',', '.')) * 100)
        )
          resolution = 'succeeded';
      }
      if (
        parent.kind === 'listing_content_save' &&
        sameJson(current.content, parseVintedListingEditContent(payload.content)) &&
        (payload.photos === undefined ||
          sameVintedListingPhotos(
            current.photoUrls,
            parseVintedListingPhotoArrangement(payload.photos).desired,
          ))
      )
        resolution = 'succeeded';
      if (parent.kind === 'listing_edit_intent') {
        const intent = payload.intent as VintedListingEditIntent;
        if (intent.base) {
          const desired = resolveVintedListingEditIntent(intent, {
            ...intent.base,
            externalAccountId: account,
            externalId: external,
            aiPhoto: false,
            bump: false,
          });
          if (
            sameJson(current.content, desired.content) &&
            (!desired.photos || sameVintedListingPhotos(current.photoUrls, desired.photos.desired))
          )
            resolution = 'succeeded';
        } else {
          const fields = editFields(intent.fields);
          if (
            current.content.title === fields.title &&
            current.content.description === fields.description &&
            current.content.priceCents === Math.round(Number(fields.price.replace(',', '.')) * 100)
          )
            resolution = 'succeeded';
        }
      }
      if (resolution === 'succeeded') {
        providerResult =
          parent.kind === 'price_save'
            ? {
                status: 'confirmed',
                fields: {
                  title: current.content.title,
                  description: current.content.description,
                  price: String(current.content.priceCents! / 100),
                },
              }
            : { status: 'confirmed' };
        cacheCommit = () =>
          this.listings.saveContent(
            claim.scope,
            actionUuid(payload.entryId),
            external,
            current.content,
          );
      }
    }
    let cachePending = false;
    if (resolution === 'succeeded' && cacheCommit) {
      try {
        await authorize();
        cachePending = (await cacheCommit()) === false;
      } catch {
        cachePending = true;
      }
    }
    if (cachePending && providerResult) providerResult.cache = 'pending';
    return {
      reconciledActionId: parent.actionId,
      verifiedAt: new Date().toISOString(),
      resolution,
      ...(cachePending ? { cache: 'pending' } : {}),
      ...(providerResult ? { providerResult } : {}),
    };
  }
}

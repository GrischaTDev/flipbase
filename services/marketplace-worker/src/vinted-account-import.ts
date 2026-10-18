import {
  readVintedNegotiationOffer,
  readVintedNegotiationPurchase,
  negotiationProviderTime,
} from './vinted-negotiation-contracts.ts';
import type { Page } from 'playwright';
import {
  parseVintedPublicationAge,
  vintedPublicationAgeLabel,
  type VintedPublicationVersion,
} from './vinted-publication-age.ts';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import {
  isVintedSessionRenewal,
  vintedSessionRenewalWaitMs,
  waitForVintedSessionRenewal,
} from './vinted-session-renewal.ts';
import { parseVintedAccountIdentity, type VintedAccountIdentity } from './vinted-browser-reader.ts';
import { parseVintedInboxEvents } from './vinted-inbox-events.ts';
import type { MarketplaceInboxEventBatch } from '../../../supabase/functions/_shared/marketplace-inbox-event-contracts.d.ts';
import type { VintedFavoriteEvent } from './vinted-browser-favorites.ts';

export type VintedImportKind = 'profile' | 'publication' | 'conversation' | 'message' | 'sale';

export type VintedImportArea =
  'profile' | 'publications' | 'conversations' | 'messages' | 'sales' | 'feedback';
export interface VintedImportAreaResult {
  status: 'complete' | 'partial' | 'failed';
  failure?: VintedRequestFailure;
  retryAfter?: string;
}
export type VintedImportAreas = Record<VintedImportArea, VintedImportAreaResult>;

export interface VintedImportEntry {
  kind: VintedImportKind;
  externalId: string;
  parentExternalId?: string;
  sortAt: string;
  body: Record<string, unknown>;
}

export interface VintedAccountImport {
  identity: VintedAccountIdentity;
  observedAt: string;
  entries: VintedImportEntry[];
  areas: VintedImportAreas;
  rejectedSaleIds?: string[];
  sourceRequestCount?: number;
  /** Nur Feldnamen des ersten Inserats aus Vinteds Liste, keine Werte; dient der Einordnung. */
  publicationFieldNames?: string[];
  browserReadFailures?: VintedBrowserReadFailure[];
  inboxEvents?: MarketplaceInboxEventBatch & { readonly version: 1 };
  favoriteEvents?: VintedFavoriteEvent[];
}

/**
 * Aktueller Stand eines Angebots, wie ihn Vinted an der Angebotsnachricht selbst führt.
 * Gleiche Zuordnung wie in der lokalen Erweiterung, damit beide Abrufwege dasselbe anzeigen.
 */
export function vintedOfferStatus(
  messageType: string | null,
  entity: Record<string, unknown> | null,
): { offerStatus?: string } {
  if (messageType !== 'offer_request_message' && messageType !== 'offer_message') return {};
  const status = entity?.['status'];
  const known: Record<number, string> = {
    10: 'pending',
    20: 'accepted',
    30: 'rejected',
    40: 'cancelled',
  };
  const offerStatus =
    typeof status === 'number' && Number.isSafeInteger(status)
      ? (known[status] ?? string(entity?.['status_title']) ?? String(status))
      : (string(status) ?? string(entity?.['status_title']));
  return offerStatus ? { offerStatus } : {};
}

export interface VintedConversationVersion {
  externalId: string;
  sourceUpdatedAt: string;
  detailCheckedAt: string | null;
  text: string | null;
  occurredAt: string | null;
  itemId?: string | null;
  itemTitle?: string | null;
  itemImageUrl?: string | null;
  itemPrice?: number | null;
  itemCurrency?: string | null;
  transactionStatus?: string | null;
}

export interface VintedConversationReadTarget {
  externalId: string;
  accountId: string;
}

export type VintedImportStage =
  | 'navigation'
  | 'identity'
  | 'profile'
  | 'publications'
  | 'conversations'
  | 'messages'
  | 'transaction'
  | 'parse';

export class VintedImportReadError extends Error {
  readonly stage: VintedImportStage;

  constructor(stage: VintedImportStage, cause?: unknown) {
    super('Vinted-Datenabruf fehlgeschlagen', { cause });
    this.stage = stage;
  }
}

export type VintedRequestFailure =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'timeout'
  | 'network'
  | 'browser_context';

export type VintedBrowserReadFailure =
  | 'navigation'
  | 'navigation_interrupted'
  | 'navigation_aborted'
  | 'timeout'
  | 'network'
  | 'closed'
  | 'script'
  | 'unknown';

function classifyBrowserReadFailure(error: unknown): VintedBrowserReadFailure {
  const message = error instanceof Error ? error.message : '';
  if (
    message.includes('Execution context was destroyed') ||
    message.includes('Cannot find context with specified id')
  )
    return 'navigation';
  if (message.includes('Target page, context or browser has been closed')) return 'closed';
  if (message.includes('interrupted by another navigation')) return 'navigation_interrupted';
  if (message.includes('net::ERR_ABORTED')) return 'navigation_aborted';
  if (message.includes('net::ERR_')) return 'network';
  if (/Timeout(?:Error| \d+ms exceeded)/.test(message)) return 'timeout';
  if (message.includes('ReferenceError') || message.includes('TypeError')) return 'script';
  return 'unknown';
}

export class VintedImportRequestError extends Error {
  readonly reason: VintedRequestFailure;
  readonly retryAfter?: string;
  readonly browserReadFailure?: VintedBrowserReadFailure;

  constructor(
    reason: VintedRequestFailure,
    retryAfter?: string,
    browserFailure?: VintedBrowserReadFailure,
  ) {
    super('Vinted-Datenantwort nicht verfügbar');
    this.reason = reason;
    this.retryAfter = retryAfter;
    this.browserReadFailure = browserFailure;
  }
}

async function atImportStage<T>(stage: VintedImportStage, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    throw new VintedImportReadError(stage, error);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function identifier(value: unknown): string | null {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof id === 'string' && /^[1-9][0-9]{0,31}$/.test(id) ? id : null;
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function decimal(value: unknown): number | null {
  const parsed =
    typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function date(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^[0-9]{10,13}$/.test(value))
    return date(Number(value), fallback);
  if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  if (typeof value === 'number' && Number.isFinite(value) && value > 0)
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  return fallback;
}

function image(value: unknown): string | null {
  const url = string(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Erstellungsdatum des Angebots; keine Foto-, Änderungs- oder Abrufzeit als Ersatz. */
function publicationTime(item: Record<string, unknown>, observedAt: string): string | null {
  for (const value of [item['created_at_ts'], item['created_at']]) {
    let milliseconds: number;
    if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) {
      const numeric = Number(value);
      milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const [year = 0, month = 0, day = 0] = value.slice(0, 10).split('-').map(Number);
      if (
        day < 1 ||
        month < 1 ||
        month > 12 ||
        day > new Date(Date.UTC(year, month, 0)).getUTCDate()
      )
        continue;
      milliseconds = Date.parse(value);
    } else continue;
    if (Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds <= Date.parse(observedAt))
      return new Date(milliseconds).toISOString();
  }
  return null;
}

function price(value: unknown): { amount: number | null; currency: string } {
  const money = record(value);
  return {
    amount: decimal(money?.['amount']),
    currency:
      typeof money?.['currency_code'] === 'string' && /^[A-Z]{3}$/.test(money['currency_code'])
        ? money['currency_code']
        : 'EUR',
  };
}

function messageText(entity: Record<string, unknown> | null): string | null {
  return (
    string(entity?.['body']) ??
    string(entity?.['text']) ??
    string(entity?.['message']) ??
    string(record(entity?.['message'])?.['body'])
  );
}

function offerPriceLabel(entity: Record<string, unknown> | null): string | null {
  const offered = record(entity?.['price']);
  const original = record(entity?.['original_price']);
  const amount = decimal(offered?.['amount'] ?? entity?.['price']);
  const originalAmount = decimal(original?.['amount'] ?? entity?.['original_price']);
  const currency = string(offered?.['currency_code'] ?? original?.['currency_code']);
  if (amount === null || !currency || !/^[A-Z]{3}$/.test(currency))
    return string(entity?.['price_label']);
  const formatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency });
  return (
    formatter.format(amount) +
    (originalAmount !== null &&
    originalAmount > amount &&
    (!original?.['currency_code'] || original['currency_code'] === currency)
      ? ` statt ${formatter.format(originalAmount)}`
      : '')
  );
}

function parseConversationItem(conversation: Record<string, unknown> | null) {
  const item = record(conversation?.['item']);
  const transaction = record(conversation?.['transaction']);
  // Ein privates Angebot ist kein Artikelpreis.
  const rawPrice = item?.['price'];
  const money = record(rawPrice);
  const photos = item?.['photos'] ?? conversation?.['item_photos'];
  const photo = record(Array.isArray(photos) ? photos[0] : null);
  const thumbnails = photo?.['thumbnails'];
  const thumbnail = Array.isArray(thumbnails)
    ? record(thumbnails.find((candidate) => record(candidate)?.['type'] === 'thumb310x430'))
    : null;
  const currency = string(money?.['currency_code']);
  return {
    itemId: identifier(
      conversation?.['item_id'] ??
        item?.['id'] ??
        transaction?.['item_id'] ??
        (Array.isArray(transaction?.['item_ids']) && transaction['item_ids'].length === 1
          ? transaction['item_ids'][0]
          : null),
    ),
    itemTitle: string(
      conversation?.['item_title'] ?? item?.['title'] ?? transaction?.['item_title'],
    ),
    itemImageUrl: image(
      thumbnail?.['url'] ??
        photo?.['url'] ??
        record(conversation?.['item_photo'])?.['url'] ??
        record(item?.['photo'])?.['url'] ??
        record(transaction?.['item_photo'])?.['url'],
    ),
    itemPrice: decimal(money?.['amount'] ?? rawPrice),
    itemCurrency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    transactionStatus: string(transaction?.['status_title']),
  };
}

function parseFeedbacks(rawFeedbacks: unknown[], fallbackDate: string): Record<string, unknown>[] {
  const list: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  for (const raw of rawFeedbacks) {
    const item = record(raw);
    const id = identifier(item?.['id']) ?? (item?.['id'] !== undefined ? String(item['id']) : null);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    const author =
      record(item?.['author']) ?? record(item?.['user']) ?? record(item?.['opposite_user']);
    const authorName =
      string(author?.['login']) ?? string(author?.['username']) ?? string(author?.['name']);
    const isAutoFlag =
      item?.['system_feedback'] === true ||
      item?.['is_automatic'] === true ||
      string(item?.['feedback_type']) === 'automatic';
    const textStr =
      string(item?.['feedback']) ?? string(item?.['body']) ?? string(item?.['comment']) ?? '';
    const isAutomatic = isAutoFlag
      ? true
      : item?.['system_feedback'] === false || item?.['is_automatic'] === false
        ? false
        : null;
    const rawRating = count(item?.['rating']);
    const ratingNum = rawRating !== null && rawRating <= 5 ? rawRating : null;
    const itemObj = record(item?.['item']) ?? record(item?.['transaction']);
    const itemTitle = string(itemObj?.['title']) ?? string(itemObj?.['item_title']);
    list.push({
      id,
      authorName: authorName ?? (isAutomatic ? 'Vinted System' : null),
      authorImageUrl: image(record(author?.['photo'])?.['url']),
      rating: ratingNum,
      text: textStr,
      occurredAt: date(
        item?.['created_at_ts'],
        date(item?.['created_at'] ?? item?.['updated_at'], fallbackDate),
      ),
      isAutomatic,
      itemTitle,
    });
  }
  return list;
}

// Vinteds Verfügbarkeitsstatus gehört in den Verlauf, ist aber keine neue Chataktivität.
function isUnavailableItemText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^(?:(?:(?:dieser|der) )?artikel(?: ist)? nicht(?: mehr)? verfügbar|(?:this )?item (?:is )?(?:no longer available|not available|unavailable))[.!…]*$/u.test(
      value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('de'),
    )
  );
}
function isUnavailableItemNotice(body: Record<string, unknown>): boolean {
  return (
    ['status_message', 'action_message', 'payment_message'].includes(String(body['messageType'])) &&
    (isUnavailableItemText(body['title']) || isUnavailableItemText(body['text']))
  );
}

/** Nur Felder aus den beobachteten Vinted-Antworten verlassen den Browser. */
export function parseVintedAccountImport(
  identity: VintedAccountIdentity,
  profileValue: unknown,
  itemValues: unknown[],
  conversationValues: unknown[],
  detailValues: unknown[],
  observedAt: string,
  previousConversations: VintedConversationVersion[] = [],
  feedbackValues: unknown[] = [],
  areas: VintedImportAreas = {
    profile: { status: 'complete' },
    publications: { status: 'complete' },
    conversations: { status: 'complete' },
    messages: { status: 'partial' },
    sales: { status: 'partial' },
    feedback: { status: 'complete' },
  },
): VintedAccountImport {
  const user = record(record(profileValue)?.['user']);
  if (identifier(user?.['id']) !== identity.id)
    throw new Error('Vinted-Konto stimmt nicht überein');
  const entries: VintedImportEntry[] = [
    {
      kind: 'profile',
      externalId: identity.id,
      sortAt: observedAt,
      body: {
        username: identity.username,
        displayName: string(user?.['name']) ?? identity.username,
        location: string(user?.['city']),
        bio:
          typeof (user?.['about'] ?? user?.['bio']) === 'string'
            ? (user?.['about'] ?? user?.['bio'])
            : null,
        bioState: typeof (user?.['about'] ?? user?.['bio']) === 'string' ? 'loaded' : 'not_loaded',
        imageUrl: image(record(user?.['photo'])?.['url']),
        feedbackCount: count(user?.['feedback_count']),
        feedbackReputation: decimal(user?.['feedback_reputation']),
        positiveFeedbackCount: count(user?.['positive_feedback_count']),
        neutralFeedbackCount: count(user?.['neutral_feedback_count']),
        negativeFeedbackCount: count(user?.['negative_feedback_count']),
        itemCount: count(user?.['item_count']),
        feedbacks: parseFeedbacks(feedbackValues, observedAt),
        observedAt,
      },
    },
  ];
  const publications = new Set<string>();
  for (const raw of itemValues) {
    const item = record(raw);
    const id = identifier(item?.['id']);
    if (!id || publications.has(id) || identifier(item?.['user_id']) !== identity.id) continue;
    if (item?.['is_closed'] === true) continue;
    publications.add(id);
    const money = price(item?.['price']);
    const photos = Array.isArray(item?.['photos']) ? item['photos'] : [];
    const firstPhoto = record(photos[0]);
    const imageUrls = photos
      .slice(0, 20)
      .map((photo) => image(record(photo)?.['url']))
      .filter((url): url is string => url !== null);
    entries.push({
      kind: 'publication',
      externalId: id,
      sortAt: observedAt,
      body: {
        title: string(item?.['title']) ?? 'Inserat',
        occurredAt: publicationTime(item!, observedAt),
        text: typeof item?.['description'] === 'string' ? item['description'] : null,
        textState: typeof item?.['description'] === 'string' ? 'loaded' : 'not_loaded',
        price: money.amount,
        currency: money.currency,
        status: string(item?.['status']),
        imageUrl: image(firstPhoto?.['url']),
        imageUrls,
        promoted: typeof item?.['promoted'] === 'boolean' ? item['promoted'] : null,
        isClosed: typeof item?.['is_closed'] === 'boolean' ? item['is_closed'] : null,
        isReserved: typeof item?.['is_reserved'] === 'boolean' ? item['is_reserved'] : null,
        brand: string(item?.['brand']),
        size: string(item?.['size']),
        metrics: {
          views: count(item?.['view_count']),
          favorites: count(item?.['favourite_count']),
          observedAt,
        },
      },
    });
  }
  const conversations = new Set<string>();
  const previousById = new Map(previousConversations.map((entry) => [entry.externalId, entry]));
  for (const raw of conversationValues) {
    const conversation = record(raw);
    const id = identifier(conversation?.['id']);
    if (!id || conversations.has(id)) continue;
    conversations.add(id);
    const other = record(conversation?.['opposite_user']);
    const sourceUpdatedAt = date(conversation?.['updated_at'], observedAt);
    const previous = previousById.get(id);
    const reusable =
      previous?.sourceUpdatedAt === sourceUpdatedAt &&
      Number.isFinite(Date.parse(previous.detailCheckedAt ?? ''));
    const keepActivity =
      reusable ||
      (isUnavailableItemText(conversation?.['description']) &&
        previous !== undefined &&
        Number.isFinite(Date.parse(previous.occurredAt ?? '')));
    const activityAt = keepActivity ? (previous?.occurredAt ?? sourceUpdatedAt) : sourceUpdatedAt;
    const item = parseConversationItem(conversation);
    entries.push({
      kind: 'conversation',
      externalId: id,
      sortAt: activityAt,
      body: {
        title: string(other?.['login']) ?? 'Gespräch',
        text: keepActivity ? (previous?.text ?? null) : string(conversation?.['description']),
        occurredAt: keepActivity ? (previous?.occurredAt ?? null) : sourceUpdatedAt,
        sourceUpdatedAt,
        detailCheckedAt: reusable ? previous.detailCheckedAt : null,
        unread: typeof conversation?.['unread'] === 'boolean' ? conversation['unread'] : null,
        imageUrl: image(record(other?.['photo'])?.['url']),
        partnerId: identifier(other?.['id']),
        itemId: item.itemId ?? (reusable ? identifier(previous.itemId) : null),
        itemTitle: item.itemTitle ?? (reusable ? string(previous.itemTitle) : null),
        itemImageUrl: item.itemImageUrl ?? (reusable ? image(previous.itemImageUrl) : null),
        itemPrice: item.itemPrice ?? (reusable ? decimal(previous.itemPrice) : null),
        itemCurrency:
          item.itemCurrency ??
          (reusable && /^[A-Z]{3}$/.test(previous.itemCurrency ?? '')
            ? previous.itemCurrency
            : null),
        transactionStatus:
          item.transactionStatus ?? (reusable ? string(previous.transactionStatus) : null),
      },
    });
  }
  const sales = new Set<string>();
  const rejectedSaleIds = new Set<string>();
  const messageIds = new Set<string>();
  for (const raw of detailValues) {
    const detail = record(raw);
    const conversation = record(detail?.['conversation']);
    const conversationId = identifier(conversation?.['id']);
    if (!conversationId || !conversations.has(conversationId)) continue;
    const conversationEntry = entries.find(
      (entry) => entry.kind === 'conversation' && entry.externalId === conversationId,
    );
    if (conversationEntry) {
      conversationEntry.body['partnerId'] =
        identifier(record(conversation?.['opposite_user'])?.['id']) ??
        conversationEntry.body['partnerId'];
      conversationEntry.body['detailCheckedAt'] = observedAt;
      for (const [field, value] of Object.entries(parseConversationItem(conversation))) {
        if (value !== null) conversationEntry.body[field] = value;
      }
    }
    let latestMessageAt: string | null = null;
    const messages = Array.isArray(conversation?.['messages']) ? conversation['messages'] : [];
    const previous = previousById.get(conversationId);
    for (const rawMessage of messages) {
      const message = record(rawMessage);
      const entity = record(message?.['entity']);
      const providerTime = negotiationProviderTime(message?.['created_at_ts'], observedAt);
      const sentAt = providerTime ?? date(message?.['created_at_ts'], observedAt);
      const sourceType = string(message?.['entity_type']);
      const sourceTitle = string(entity?.['title']) ?? sourceType ?? 'Nachricht';
      const sourceText =
        messageText(entity) ?? string(entity?.['title']) ?? string(entity?.['status_title']);
      const isDeliveryNotice =
        (sourceType === 'status_message' || sourceType === 'action_message') &&
        ['Geliefert', 'Sendung zugestellt'].includes(sourceTitle) &&
        sourceText === sourceTitle;
      const messageType = isDeliveryNotice ? 'status_message' : sourceType;
      const title = isDeliveryNotice ? 'Geliefert' : sourceTitle;
      const text = isDeliveryNotice ? 'Geliefert' : sourceText;
      const eventGroup = isDeliveryNotice ? null : string(message?.['event_group']);
      const eventType = isDeliveryNotice ? null : string(message?.['event_type']);
      const isSystemMessage = ['status_message', 'action_message', 'payment_message'].includes(
        messageType ?? '',
      );
      const senderId = identifier(entity?.['user_id']) ?? identifier(entity?.['sender_id']);
      const direction = senderId ? (senderId === identity.id ? 'outbound' : 'inbound') : 'unknown';
      const priceLabel = ['offer_request_message', 'offer_message'].includes(messageType ?? '')
        ? offerPriceLabel(entity)
        : string(entity?.['price_label']);
      const photos = entity?.['photos'];
      const imageUrls = [
        ...new Set(
          entity?.['is_hidden'] !== true && Array.isArray(photos)
            ? photos.slice(0, 20).flatMap((rawPhoto) => {
                const photo = record(rawPhoto);
                if (!photo || photo['is_hidden'] === true || photo['hidden_at'] != null) return [];
                const url = image(photo['url']);
                return url ? [url] : [];
              })
            : [],
        ),
      ];
      const id =
        identifier(message?.['id']) ??
        identifier(entity?.['id']) ??
        (message
          ? `event:${createHash('sha256')
              .update(
                JSON.stringify({
                  conversationId,
                  // Templates und Schaltflächen ändern sich, ohne ein neues Ereignis zu erzeugen.
                  ...(isSystemMessage
                    ? {
                        type: messageType,
                        createdAt: sentAt,
                        eventGroup,
                        eventType,
                        title,
                        text,
                        priceLabel,
                        direction,
                        imageUrls,
                      }
                    : {
                        type: message['entity_type'],
                        createdAt: message['created_at_ts'],
                        eventGroup: message['event_group'],
                        eventType: message['event_type'],
                        entity,
                      }),
                }),
              )
              .digest('hex')}`
          : null);
      if (!id || messageIds.has(id)) continue;
      messageIds.add(id);
      const entry: VintedImportEntry = {
        kind: 'message',
        externalId: id,
        parentExternalId: conversationId,
        sortAt: sentAt,
        body: {
          title,
          text,
          occurredAt: sentAt,
          direction,
          messageType,
          eventType,
          eventGroup,
          priceLabel,
          ...vintedOfferStatus(string(message?.['entity_type']), entity),
          ...(providerTime !== null
            ? (() => {
                const offer = readVintedNegotiationOffer(message, conversation, identity.id);
                return offer ? { negotiationOffer: offer } : {};
              })()
            : {}),
          ...(imageUrls.length ? { imageUrls } : {}),
        },
      };
      entries.push(entry);
      if (isUnavailableItemNotice(entry.body)) {
        if (
          conversationEntry &&
          latestMessageAt === null &&
          previous &&
          typeof previous.occurredAt === 'string' &&
          Number.isFinite(Date.parse(previous.occurredAt))
        ) {
          conversationEntry.body['text'] = previous.text;
          conversationEntry.body['occurredAt'] = previous.occurredAt;
          conversationEntry.sortAt = previous.occurredAt;
        }
        continue;
      }
      if (
        conversationEntry &&
        typeof entry.body['text'] === 'string' &&
        (latestMessageAt === null || sentAt >= latestMessageAt)
      ) {
        conversationEntry.body['text'] = entry.body['text'];
        conversationEntry.body['occurredAt'] = sentAt;
        conversationEntry.sortAt = sentAt;
        latestMessageAt = sentAt;
      }
    }
    const relation = record(conversation?.['transaction']);
    const transaction = record(record(detail?.['transaction'])?.['transaction']);
    const saleId = identifier(transaction?.['id']);
    const purchase = readVintedNegotiationPurchase(
      transaction,
      conversation,
      identity.id,
      observedAt,
    );
    if (purchase)
      entries.push({
        kind: 'message',
        externalId: `event:${createHash('sha256')
          .update('purchase:' + purchase.event.transactionId)
          .digest('hex')}`,
        parentExternalId: conversationId,
        sortAt: purchase.occurredAt,
        body: {
          title: 'Kauf',
          text: null,
          occurredAt: purchase.occurredAt,
          direction: 'unknown',
          messageType: 'purchase',
          priceLabel: null,
          negotiationEvent: purchase.event,
        },
      });
    if (
      saleId &&
      identifier(relation?.['id']) === saleId &&
      identifier(transaction?.['seller_id']) === identity.id &&
      string(transaction?.['status_title']) === 'Angebot'
    )
      rejectedSaleIds.add(saleId);
    if (
      !saleId ||
      sales.has(saleId) ||
      identifier(relation?.['id']) !== saleId ||
      identifier(transaction?.['seller_id']) !== identity.id ||
      !identifier(record(transaction?.['order'])?.['id']) ||
      string(transaction?.['status_title']) !== 'Versendet'
    )
      continue;
    sales.add(saleId);
    const money = price(record(transaction?.['offer'])?.['price']);
    entries.push({
      kind: 'sale',
      externalId: saleId,
      sortAt: date(transaction?.['status_updated_at'], observedAt),
      body: {
        title: string(transaction?.['item_title']) ?? string(transaction?.['title']) ?? 'Verkauf',
        price: money.amount,
        currency: money.currency,
        status: string(transaction?.['status_title']),
        occurredAt: date(transaction?.['status_updated_at'], observedAt),
        shipmentStatus: string(record(transaction?.['shipment'])?.['status_title']),
        imageUrl: image(record(relation?.['item_photo'])?.['url']),
      },
    });
  }
  if (areas.feedback.status === 'failed') delete entries[0]?.body['feedbacks'];
  const publicationFieldNames = vintedFieldNames(itemValues.map(record).find(Boolean) ?? null);
  return {
    identity,
    observedAt,
    entries,
    areas,
    rejectedSaleIds: [...rejectedSaleIds],
    ...(publicationFieldNames.length ? { publicationFieldNames } : {}),
  };
}

/** Feldnamen einer Anbieterantwort bis zur zweiten Ebene; niemals Werte. */
export function vintedFieldNames(value: Record<string, unknown> | null): string[] {
  const names = new Set<string>();
  const valid = (name: string) => /^[a-z0-9_]{1,40}$/.test(name);
  for (const [key, entry] of Object.entries(value ?? {})) {
    if (!valid(key)) continue;
    names.add(key);
    const nested = record(Array.isArray(entry) ? entry[0] : entry);
    for (const inner of Object.keys(nested ?? {})) if (valid(inner)) names.add(key + '.' + inner);
  }
  return [...names].sort().slice(0, 400);
}

interface SourceReadContext {
  count: number;
  blocked?: VintedImportRequestError;
  authorize: () => Promise<void>;
  browserFailures: VintedBrowserReadFailure[];
}

async function vintedJson(
  page: Page,
  path: string,
  context?: SourceReadContext,
  hasRetriedNavigation = false,
): Promise<unknown> {
  if (context?.blocked) throw context.blocked;
  if (context) context.count++;
  let result: unknown;
  try {
    result = await page.evaluate(async (requestPath) => {
      const failure = (reason: VintedRequestFailure) => ({ flipbaseRequestFailure: reason });
      let response: Response;
      try {
        response = await fetch(requestPath, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: requestPath.startsWith('/items/') ? 'text/html' : 'application/json' },
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        });
      } catch (error) {
        return failure(
          error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network',
        );
      }
      if (response.status === 401) return failure('unauthorized');
      if (response.status === 403) return failure('forbidden');
      if (response.status === 429) {
        const raw = response.headers.get('Retry-After');
        const now = Date.now();
        const requested =
          raw && /^\d{1,6}$/.test(raw.trim())
            ? now + Number(raw) * 1000
            : raw
              ? Date.parse(raw)
              : NaN;
        const retryAfter =
          Number.isFinite(requested) &&
          requested > now &&
          requested <= now + 7 * 24 * 60 * 60 * 1000
            ? new Date(requested).toISOString()
            : undefined;
        return { ...failure('rate_limited'), ...(retryAfter ? { retryAfter } : {}) };
      }
      if (response.status >= 500) return failure('provider_unavailable');
      let origin: string;
      try {
        origin = new URL(response.url).origin;
      } catch {
        return failure('invalid_response');
      }
      if (
        !response.ok ||
        origin !== 'https://www.vinted.de' ||
        !response.headers
          .get('content-type')
          ?.includes(requestPath.startsWith('/items/') ? 'text/html' : 'json')
      )
        return failure('invalid_response');
      try {
        if (requestPath.startsWith('/items/')) {
          const html = await response.text();
          if (html.length > 4 * 1024 * 1024) return failure('invalid_response');
          const document = new DOMParser().parseFromString(html, 'text/html');
          const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
          const expectedId = requestPath.slice('/items/'.length);
          const matchesItem = (url: string) => {
            const address = new URL(url, 'https://www.vinted.de');
            return (
              address.origin === 'https://www.vinted.de' &&
              new RegExp('^/items/' + expectedId + '(?:-|$)').test(address.pathname)
            );
          };
          if (!matchesItem(response.url) || !canonical || !matchesItem(canonical))
            return failure('invalid_response');
          const labels = document.querySelectorAll(
            '[data-testid="item-attributes-upload_date"] [itemprop="upload_date"]',
          );
          return {
            publicationAgeLabel: labels.length === 1 ? labels[0]?.textContent?.trim() : null,
          };
        }
        return await response.json();
      } catch {
        return failure('invalid_response');
      }
    }, path);
  } catch (error) {
    const failure = classifyBrowserReadFailure(error);
    if (context && context.browserFailures.length < 8) context.browserFailures.push(failure);
    // Nur unterbrochene GETs im selben angemeldeten Dokument einmal wiederholen.
    if (failure === 'navigation' && !hasRetriedNavigation && !page.isClosed()) {
      await context?.authorize();
      try {
        // Der alte Ladezustand kann vor dem neuen Navigations-Commit noch "geladen" sein.
        const documentReady = await page.waitForFunction(
          () => document.readyState !== 'loading',
          undefined,
          { timeout: 12_000 },
        );
        await documentReady.dispose();
      } catch (loadError) {
        throw new VintedImportRequestError(
          'browser_context',
          undefined,
          classifyBrowserReadFailure(loadError),
        );
      }
      const address = new URL(page.url());
      if (
        address.origin === 'https://www.vinted.de' &&
        !address.pathname.startsWith('/member/login')
      ) {
        await context?.authorize();
        return vintedJson(page, path, context, true);
      }
    }
    throw new VintedImportRequestError('browser_context', undefined, failure);
  }
  const reason = record(result)?.['flipbaseRequestFailure'];
  if (
    reason === 'unauthorized' ||
    reason === 'forbidden' ||
    reason === 'rate_limited' ||
    reason === 'provider_unavailable' ||
    reason === 'invalid_response' ||
    reason === 'timeout' ||
    reason === 'network' ||
    reason === 'browser_context'
  ) {
    const requested = record(result)?.['retryAfter'];
    const retryAfter =
      typeof requested === 'string' &&
      Number.isFinite(Date.parse(requested)) &&
      Date.parse(requested) > Date.now() &&
      Date.parse(requested) <= Date.now() + 7 * 24 * 60 * 60 * 1000
        ? new Date(requested).toISOString()
        : undefined;
    const error = new VintedImportRequestError(reason, retryAfter);
    if (context && (reason === 'rate_limited' || reason === 'forbidden')) context.blocked = error;
    throw error;
  }
  return result;
}

async function pages(
  page: Page,
  path: (number: number) => string,
  key: string,
  authorize: () => Promise<void>,
  stage: VintedImportStage,
  context?: SourceReadContext,
): Promise<{ values: unknown[]; result: VintedImportAreaResult }> {
  const values: unknown[] = [];
  for (let number = 1; number <= 20; number++) {
    await atImportStage(stage, authorize);
    try {
      const response = record(await vintedJson(page, path(number), context));
      const items = response?.[key];
      const totalPages = count(record(response?.['pagination'])?.['total_pages']);
      if (!Array.isArray(items) || items.length > 100 || totalPages === null || totalPages < number)
        throw new VintedImportRequestError('invalid_response');
      values.push(...items);
      // Unbekannte Zeilen bleiben ein Teilstand, selbst wenn die Pagination vollständig ist.
      if (items.some((item) => !identifier(record(item)?.['id'])))
        return { values, result: { status: 'partial', failure: 'invalid_response' } };
      // Vinteds Postfach kündigt bei vollen Seiten fortlaufend eine weitere Seite an,
      // auch nach dem Listenende. Eine gültige leere Gesprächsseite beendet den Abruf.
      if (key === 'conversations' && items.length === 0)
        return { values, result: { status: 'complete' } };
      if (number >= totalPages) return { values, result: { status: 'complete' } };
    } catch (error) {
      return { values, result: sourceFailure(stage, error, number > 1) };
    }
  }
  return { values, result: { status: 'partial', failure: 'invalid_response' } };
}

function sourceFailure(
  stage: VintedImportStage,
  error: unknown,
  partial: boolean,
): VintedImportAreaResult {
  if (!(error instanceof VintedImportRequestError) || error.reason === 'unauthorized')
    throw new VintedImportReadError(stage, error);
  return {
    status: partial ? 'partial' : 'failed',
    failure: error.reason,
    ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
  };
}

export async function readVintedAccountImport(
  page: Page,
  authorize: () => Promise<void>,
  onStage?: (stage: 'profile' | 'publications' | 'conversations' | 'sales') => Promise<void>,
  previousConversations: VintedConversationVersion[] = [],
  requestedConversation?: VintedConversationReadTarget,
  options: {
    sessionRenewalWaitMs?: number;
    previousPublications?: VintedPublicationVersion[];
  } = {},
): Promise<VintedAccountImport> {
  const sessionRenewalWaitMs = options.sessionRenewalWaitMs ?? vintedSessionRenewalWaitMs;
  const reads: SourceReadContext = { count: 0, authorize, browserFailures: [] };
  await atImportStage('navigation', async () => {
    try {
      if (new URL(page.url()).origin === 'https://www.vinted.de') return;
    } catch {
      // Ein leerer Starttab benötigt zuerst die Vinted-Seite.
    }
    await page.goto('https://www.vinted.de/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  });
  const profile = await atImportStage('profile', async () => {
    await onStage?.('profile');
    await authorize();
    // Solange Vinted erneuert, wird nichts abgefragt: Die Abfrage würde abgelehnt, und die
    // Erneuerung soll ungestört zu Ende laufen.
    if (isVintedSessionRenewal(page)) {
      let isRenewed: boolean;
      try {
        isRenewed = await waitForVintedSessionRenewal(page, authorize, sessionRenewalWaitMs);
      } catch (loadError) {
        throw new VintedImportRequestError(
          'browser_context',
          undefined,
          classifyBrowserReadFailure(loadError),
        );
      }
      if (!isRenewed) throw new VintedImportRequestError('unauthorized');
    }
    try {
      return await vintedJson(page, '/api/v2/users/current', reads);
    } catch (error) {
      if (!(error instanceof VintedImportRequestError) || error.reason !== 'unauthorized')
        throw error;
      // Die gespeicherte Anmeldung kann erst durch die Seiteninitialisierung
      // erneuert werden. Läuft Vinteds Erneuerung bereits, wird sie abgewartet;
      // sonst einmal neu laden. Danach höchstens drei Prüfungen.
      const currentUrl = new URL(page.url());
      if (
        currentUrl.origin !== 'https://www.vinted.de' ||
        currentUrl.pathname.startsWith('/member/login')
      )
        throw error;
      await authorize();
      if (!isVintedSessionRenewal(page)) {
        try {
          await page.goto('https://www.vinted.de/', { waitUntil: 'load', timeout: 20_000 });
        } catch (reloadError) {
          throw new VintedImportRequestError(
            'browser_context',
            undefined,
            classifyBrowserReadFailure(reloadError),
          );
        }
      }
      // Auch das Neuladen kann auf der Erneuerungsseite landen.
      let isRenewed: boolean;
      try {
        isRenewed = await waitForVintedSessionRenewal(page, authorize, sessionRenewalWaitMs);
      } catch (loadError) {
        throw new VintedImportRequestError(
          'browser_context',
          undefined,
          classifyBrowserReadFailure(loadError),
        );
      }
      if (!isRenewed) throw error;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await wait(750 * attempt);
        await authorize();
        if (
          new URL(page.url()).origin !== 'https://www.vinted.de' ||
          new URL(page.url()).pathname.startsWith('/member/login')
        )
          throw error;
        try {
          return await vintedJson(page, '/api/v2/users/current', reads);
        } catch (retryError) {
          if (
            !(retryError instanceof VintedImportRequestError) ||
            retryError.reason !== 'unauthorized' ||
            attempt === 2
          )
            throw retryError;
        }
      }
      throw error;
    }
  });
  const identity = await atImportStage('identity', async () => {
    const account = parseVintedAccountIdentity(profile);
    if (!account) throw new Error('Vinted-Anmeldung nicht bestätigt');
    if (requestedConversation && account.id !== requestedConversation.accountId)
      throw new Error('Vinted-Konto stimmt nicht überein');
    return account;
  });
  const observedAt = new Date().toISOString();
  if (!requestedConversation) await onStage?.('publications');
  // Beim Öffnen eines Gesprächs sind Inserate und Bewertungen unabhängige
  // Datenbereiche. Teilstände erhalten ihre gespeicherten Einträge beim Import.
  const items = requestedConversation
    ? { values: [], result: { status: 'partial' as const } }
    : await pages(
        page,
        (number) => `/api/v2/wardrobe/${identity.id}/items?page=${number}&per_page=20`,
        'items',
        authorize,
        'publications',
        reads,
      );
  if (items.values.some((item) => identifier(record(item)?.['user_id']) !== identity.id))
    items.result = { status: 'partial', failure: 'invalid_response' };
  const previousPublications = new Map(
    (options.previousPublications ?? []).map((entry) => [entry.externalId, entry]),
  );
  const publicationAges = new Map<
    string,
    { publicationAge: unknown; publicationAgeCheckedAt: string | null; occurredAt: string | null }
  >();
  const candidatesForAge = items.values
    .flatMap((raw) => {
      const item = record(raw);
      const id = identifier(item?.['id']);
      if (!item || !id || identifier(item['user_id']) !== identity.id || item['is_closed'] === true)
        return [];
      const previous = previousPublications.get(id);
      const publicationAge = parseVintedPublicationAge(previous?.publicationAge);
      const occurredAt =
        publicationTime({ created_at: previous?.occurredAt }, observedAt) ??
        publicationTime(item, observedAt);
      publicationAges.set(id, {
        publicationAge,
        publicationAgeCheckedAt: previous?.checkedAt ?? null,
        occurredAt,
      });
      return occurredAt || publicationAge
        ? []
        : [{ id, checkedAt: Date.parse(previous?.checkedAt ?? '') || 0 }];
    })
    .sort((left, right) => left.checkedAt - right.checkedAt);
  // Alle fehlenden Angaben ergänzen; gespeicherte Alterswerte nicht erneut lesen.
  // Nur erfolglose Versuche erhalten ihre bisherige tägliche Wiederholgrenze.
  for (const candidate of candidatesForAge.filter(
    (entry) => Date.parse(observedAt) - entry.checkedAt >= 24 * 60 * 60 * 1000,
  )) {
    await atImportStage('publications', authorize);
    const cached = publicationAges.get(candidate.id)!;
    cached.publicationAgeCheckedAt = observedAt;
    try {
      const detail = record(await vintedJson(page, `/items/${candidate.id}`, reads));
      cached.publicationAge =
        vintedPublicationAgeLabel(detail?.['publicationAgeLabel'], observedAt) ??
        cached.publicationAge;
    } catch (error) {
      if (!(error instanceof VintedImportRequestError) || error.reason === 'unauthorized')
        throw new VintedImportReadError('publications', error);
      // Ein fehlendes Zusatzfeld macht die vollständige Kleiderschrankliste nicht unvollständig.
      if (reads.blocked) break;
    }
  }
  await onStage?.('conversations');
  const conversations = await pages(
    page,
    (number) => `/api/v2/inbox?page=${number}&per_page=20`,
    'conversations',
    authorize,
    'conversations',
    reads,
  );
  const areas: VintedImportAreas = {
    profile: { status: 'complete' },
    publications: items.result,
    conversations: conversations.result,
    // Details stammen aus sicher lesbaren Gesprächen, nicht aus einem vollständigen Ereignisfeed.
    messages: {
      status: conversations.result.status === 'failed' ? 'failed' : 'partial',
      ...(conversations.result.failure ? { failure: conversations.result.failure } : {}),
    },
    sales: {
      status: conversations.result.status === 'failed' ? 'failed' : 'partial',
      ...(conversations.result.failure ? { failure: conversations.result.failure } : {}),
    },
    feedback: { status: 'failed' },
  };
  const previousById = new Map(previousConversations.map((entry) => [entry.externalId, entry]));
  const details: unknown[] = [];
  const eventBatches: MarketplaceInboxEventBatch[] = [];
  let detailReads = 0;
  if (
    requestedConversation &&
    !conversations.values.some(
      (conversation) =>
        identifier(record(conversation)?.['id']) === requestedConversation.externalId,
    )
  )
    throw new VintedImportReadError('messages', new VintedImportRequestError('invalid_response'));
  const candidates = conversations.values
    .map((raw, index) => {
      const previous = previousById.get(identifier(record(raw)?.['id']) ?? '');
      const unchanged =
        previous?.sourceUpdatedAt === date(record(raw)?.['updated_at'], '') &&
        !isUnavailableItemText(previous?.text);
      return {
        raw,
        index,
        priority: unchanged ? 1 : 0,
        checkedAt: Date.parse(previous?.detailCheckedAt ?? '') || 0,
      };
    })
    .sort((left, right) => left.priority - right.priority || left.checkedAt - right.checkedAt);
  for (const { index, raw } of candidates) {
    const id = identifier(record(raw)?.['id']);
    if (requestedConversation && id !== requestedConversation.externalId) continue;
    const wasUnread = record(raw)?.['unread'] === true;
    const partnerId = identifier(record(record(raw)?.['opposite_user'])?.['id']);
    if (
      !requestedConversation &&
      (detailReads >= 3 || (record(raw)?.['unread'] !== false && (!wasUnread || !partnerId)))
    )
      continue;
    if (!id) continue;
    const previous = previousById.get(id);
    const sourceUpdatedAt = date(record(raw)?.['updated_at'], '');
    const checkedAt = previous ? Date.parse(previous.detailCheckedAt ?? '') : NaN;
    if (
      !requestedConversation &&
      !wasUnread &&
      previous &&
      sourceUpdatedAt &&
      previous.sourceUpdatedAt === sourceUpdatedAt &&
      !isUnavailableItemText(previous.text) &&
      Number.isFinite(checkedAt) &&
      checkedAt <= Date.now() &&
      Date.now() - checkedAt < 24 * 60 * 60 * 1000
    )
      continue;
    await atImportStage('messages', authorize);
    detailReads++;
    let conversation: unknown;
    try {
      conversation = await vintedJson(page, `/api/v2/conversations/${id}`, reads);
      const relation = record(record(conversation)?.['conversation']);
      if (identifier(relation?.['id']) !== id || !Array.isArray(relation?.['messages']))
        throw new VintedImportRequestError('invalid_response');
    } catch (error) {
      if (requestedConversation) throw new VintedImportReadError('messages', error);
      areas.messages = sourceFailure('messages', error, true);
      areas.sales = sourceFailure('transaction', error, true);
      continue;
    }
    const relation = record(record(conversation)?.['conversation']);
    if (!requestedConversation && wasUnread) {
      await atImportStage('messages', authorize);
      const check = record(
        await vintedJson(
          page,
          `/api/v2/inbox?page=${Math.floor(index / 20) + 1}&per_page=20`,
          reads,
        ),
      );
      const rows = check?.['conversations'];
      const same = Array.isArray(rows)
        ? rows.find((candidate) => identifier(record(candidate)?.['id']) === id)
        : null;
      if (
        record(same)?.['unread'] !== true ||
        relation?.['read_by_current_user'] !== false ||
        identifier(record(relation?.['opposite_user'])?.['id']) !== partnerId
      ) {
        throw new VintedImportReadError(
          'messages',
          new VintedImportRequestError('invalid_response'),
        );
      }
    }
    eventBatches.push(parseVintedInboxEvents(conversation, identity.id, observedAt));
    const transactionId = identifier(record(relation?.['transaction'])?.['id']);
    let transaction: unknown = null;
    if (
      !requestedConversation &&
      transactionId &&
      (identifier(record(relation?.['transaction'])?.['seller_id']) === identity.id ||
        record(relation?.['transaction'])?.['current_user_side'] === 'seller')
    ) {
      await atImportStage('transaction', authorize);
      try {
        transaction = await vintedJson(page, `/api/v2/transactions/${transactionId}`, reads);
        if (identifier(record(record(transaction)?.['transaction'])?.['id']) !== transactionId)
          throw new VintedImportRequestError('invalid_response');
      } catch (error) {
        areas.sales = sourceFailure('transaction', error, true);
      }
    }
    details.push({ ...record(conversation), transaction });
  }
  const feedbacks = requestedConversation
    ? { values: [], result: { status: 'partial' as const } }
    : await pages(
        page,
        (number) => `/api/v2/feedbacks?user_id=${identity.id}&page=${number}&per_page=20`,
        'user_feedbacks',
        authorize,
        'profile',
        reads,
      );
  areas.feedback = feedbacks.result;
  return atImportStage('parse', async () => {
    await onStage?.('sales');
    const snapshot = parseVintedAccountImport(
      identity,
      profile,
      items.values,
      conversations.values,
      details,
      observedAt,
      previousConversations,
      feedbacks.values,
      areas,
    );
    for (const entry of snapshot.entries) {
      const age = entry.kind === 'publication' ? publicationAges.get(entry.externalId) : undefined;
      if (age) Object.assign(entry.body, age);
    }
    return {
      ...snapshot,
      inboxEvents: {
        version: 1,
        observedAt,
        events: eventBatches.flatMap((batch) => batch.events),
        complete:
          conversations.result.status === 'complete' &&
          (eventBatches.length > 0 || conversations.values.length === 0) &&
          eventBatches.every((batch) => batch.complete),
        coveredConversationIds: eventBatches.flatMap((batch) => batch.coveredConversationIds),
      },
      sourceRequestCount: reads.count,
      ...(reads.browserFailures.length ? { browserReadFailures: reads.browserFailures } : {}),
    };
  });
}

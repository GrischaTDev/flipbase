import type { Page } from 'playwright';
import { createHash } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { parseVintedAccountIdentity, type VintedAccountIdentity } from './vinted-browser-reader.ts';

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
}

export interface VintedConversationVersion {
  externalId: string;
  sourceUpdatedAt: string;
  detailCheckedAt: string;
  text: string | null;
  occurredAt: string | null;
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

export class VintedImportRequestError extends Error {
  readonly reason: VintedRequestFailure;
  readonly retryAfter?: string;

  constructor(reason: VintedRequestFailure, retryAfter?: string) {
    super('Vinted-Datenantwort nicht verfügbar');
    this.reason = reason;
    this.retryAfter = retryAfter;
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
      Number.isFinite(Date.parse(previous.detailCheckedAt));
    entries.push({
      kind: 'conversation',
      externalId: id,
      sortAt: sourceUpdatedAt,
      body: {
        title: string(other?.['login']) ?? 'Gespräch',
        text: reusable ? previous.text : string(conversation?.['description']),
        occurredAt: reusable ? previous.occurredAt : sourceUpdatedAt,
        sourceUpdatedAt,
        detailCheckedAt: reusable ? previous.detailCheckedAt : null,
        unread: typeof conversation?.['unread'] === 'boolean' ? conversation['unread'] : null,
        imageUrl: image(record(other?.['photo'])?.['url']),
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
    if (conversationEntry) conversationEntry.body['detailCheckedAt'] = observedAt;
    let latestMessageAt: string | null = null;
    const messages = Array.isArray(conversation?.['messages']) ? conversation['messages'] : [];
    for (const rawMessage of messages) {
      const message = record(rawMessage);
      const entity = record(message?.['entity']);
      const id =
        identifier(message?.['id']) ??
        identifier(entity?.['id']) ??
        (message
          ? `event:${createHash('sha256')
              .update(
                JSON.stringify({
                  conversationId,
                  type: message['entity_type'],
                  createdAt: message['created_at_ts'],
                  eventGroup: message['event_group'],
                  eventType: message['event_type'],
                  entity,
                }),
              )
              .digest('hex')}`
          : null);
      if (!id || messageIds.has(id)) continue;
      messageIds.add(id);
      const sentAt = date(message?.['created_at_ts'], observedAt);
      const senderId = identifier(entity?.['user_id']) ?? identifier(entity?.['sender_id']);
      const entry: VintedImportEntry = {
        kind: 'message',
        externalId: id,
        parentExternalId: conversationId,
        sortAt: sentAt,
        body: {
          title: string(entity?.['title']) ?? string(message?.['entity_type']) ?? 'Nachricht',
          text:
            messageText(entity) ?? string(entity?.['title']) ?? string(entity?.['status_title']),
          occurredAt: sentAt,
          direction: senderId ? (senderId === identity.id ? 'outbound' : 'inbound') : 'unknown',
          messageType: string(message?.['entity_type']),
          priceLabel: string(entity?.['price_label']),
        },
      };
      entries.push(entry);
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
  return { identity, observedAt, entries, areas, rejectedSaleIds: [...rejectedSaleIds] };
}

interface SourceReadContext {
  count: number;
  blocked?: VintedImportRequestError;
}

async function vintedJson(page: Page, path: string, context?: SourceReadContext): Promise<unknown> {
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
          headers: { Accept: 'application/json' },
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
        !response.headers.get('content-type')?.includes('json')
      )
        return failure('invalid_response');
      try {
        return await response.json();
      } catch {
        return failure('invalid_response');
      }
    }, path);
  } catch {
    throw new VintedImportRequestError('browser_context');
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
): Promise<VintedAccountImport> {
  const reads: SourceReadContext = { count: 0 };
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
    try {
      return await vintedJson(page, '/api/v2/users/current', reads);
    } catch (error) {
      if (!(error instanceof VintedImportRequestError) || error.reason !== 'unauthorized')
        throw error;
      // Die gespeicherte Anmeldung kann erst durch die Seiteninitialisierung
      // erneuert werden. Einmal neu laden; danach höchstens drei Prüfungen.
      const currentUrl = new URL(page.url());
      if (
        currentUrl.origin !== 'https://www.vinted.de' ||
        currentUrl.pathname.startsWith('/member/login')
      )
        throw error;
      await authorize();
      try {
        await page.goto('https://www.vinted.de/', { waitUntil: 'load', timeout: 20_000 });
      } catch {
        throw new VintedImportRequestError('browser_context');
      }
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
    return account;
  });
  const observedAt = new Date().toISOString();
  await onStage?.('publications');
  const items = await pages(
    page,
    (number) => `/api/v2/wardrobe/${identity.id}/items?page=${number}&per_page=20`,
    'items',
    authorize,
    'publications',
    reads,
  );
  if (items.values.some((item) => identifier(record(item)?.['user_id']) !== identity.id))
    items.result = { status: 'partial', failure: 'invalid_response' };
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
  for (const raw of conversations.values) {
    // Das Öffnen ungelesener Gespräche könnte bei Vinted den Lesestatus verändern.
    if (record(raw)?.['unread'] !== false) continue;
    const id = identifier(record(raw)?.['id']);
    if (!id) continue;
    const previous = previousById.get(id);
    const sourceUpdatedAt = date(record(raw)?.['updated_at'], '');
    const checkedAt = previous ? Date.parse(previous.detailCheckedAt) : NaN;
    if (
      previous &&
      sourceUpdatedAt &&
      previous.sourceUpdatedAt === sourceUpdatedAt &&
      Number.isFinite(checkedAt) &&
      checkedAt <= Date.now() &&
      Date.now() - checkedAt < 24 * 60 * 60 * 1000
    )
      continue;
    await atImportStage('messages', authorize);
    let conversation: unknown;
    try {
      conversation = await vintedJson(page, `/api/v2/conversations/${id}`, reads);
      const relation = record(record(conversation)?.['conversation']);
      if (identifier(relation?.['id']) !== id || !Array.isArray(relation?.['messages']))
        throw new VintedImportRequestError('invalid_response');
    } catch (error) {
      areas.messages = sourceFailure('messages', error, true);
      areas.sales = sourceFailure('transaction', error, true);
      continue;
    }
    const relation = record(record(conversation)?.['conversation']);
    const transactionId = identifier(record(relation?.['transaction'])?.['id']);
    let transaction: unknown = null;
    if (
      transactionId &&
      identifier(record(relation?.['transaction'])?.['seller_id']) === identity.id
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
  const feedbacks = await pages(
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
    return { ...snapshot, sourceRequestCount: reads.count };
  });
}

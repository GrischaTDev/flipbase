import type { Page } from 'playwright';
import { createHash } from 'node:crypto';
import { readVintedAccountIdentity, type VintedAccountIdentity } from './vinted-browser-reader.ts';

export type VintedImportKind = 'profile' | 'publication' | 'conversation' | 'message' | 'sale';

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

/** Nur Felder aus den beobachteten Vinted-Antworten verlassen den Browser. */
export function parseVintedAccountImport(
  identity: VintedAccountIdentity,
  profileValue: unknown,
  itemValues: unknown[],
  conversationValues: unknown[],
  detailValues: unknown[],
  observedAt: string,
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
        bio: string(user?.['about']) ?? string(user?.['bio']),
        imageUrl: image(record(user?.['photo'])?.['url']),
        feedbackCount: count(user?.['feedback_count']),
        feedbackReputation: decimal(user?.['feedback_reputation']),
        positiveFeedbackCount: count(user?.['positive_feedback_count']),
        neutralFeedbackCount: count(user?.['neutral_feedback_count']),
        negativeFeedbackCount: count(user?.['negative_feedback_count']),
        itemCount: count(user?.['item_count']),
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
    entries.push({
      kind: 'publication',
      externalId: id,
      sortAt: observedAt,
      body: {
        title: string(item?.['title']) ?? 'Inserat',
        text: null,
        price: money.amount,
        currency: money.currency,
        status: string(item?.['status']),
        imageUrl: image(firstPhoto?.['url']),
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
  for (const raw of conversationValues) {
    const conversation = record(raw);
    const id = identifier(conversation?.['id']);
    if (!id || conversations.has(id)) continue;
    conversations.add(id);
    const other = record(conversation?.['opposite_user']);
    entries.push({
      kind: 'conversation',
      externalId: id,
      sortAt: date(conversation?.['updated_at'], observedAt),
      body: {
        title: string(other?.['login']) ?? 'Gespräch',
        text: string(conversation?.['description']),
        occurredAt: date(conversation?.['updated_at'], observedAt),
        unread: typeof conversation?.['unread'] === 'boolean' ? conversation['unread'] : null,
        imageUrl: image(record(other?.['photo'])?.['url']),
      },
    });
  }
  const sales = new Set<string>();
  const messageIds = new Set<string>();
  for (const raw of detailValues) {
    const detail = record(raw);
    const conversation = record(detail?.['conversation']);
    const conversationId = identifier(conversation?.['id']);
    if (!conversationId || !conversations.has(conversationId)) continue;
    const conversationEntry = entries.find(
      (entry) => entry.kind === 'conversation' && entry.externalId === conversationId,
    );
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
      !saleId ||
      sales.has(saleId) ||
      identifier(relation?.['id']) !== saleId ||
      identifier(transaction?.['seller_id']) !== identity.id ||
      !record(transaction?.['order'])
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
  return { identity, observedAt, entries };
}

async function vintedJson(page: Page, path: string): Promise<unknown> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (
      !response.ok ||
      new URL(response.url).origin !== 'https://www.vinted.de' ||
      !response.headers.get('content-type')?.includes('json')
    )
      throw new Error(`Vinted-Datenantwort HTTP ${response.status}`);
    return response.json();
  }, path);
}

async function pages(
  page: Page,
  path: (number: number) => string,
  key: string,
  authorize: () => Promise<void>,
): Promise<unknown[]> {
  const values: unknown[] = [];
  for (let number = 1; number <= 20; number++) {
    await authorize();
    const response = record(await vintedJson(page, path(number)));
    const items = response?.[key];
    if (!Array.isArray(items) || items.length > 100) throw new Error('Vinted-Datenformat geändert');
    values.push(...items);
    const pagination = record(response?.['pagination']);
    const totalPages = count(pagination?.['total_pages']);
    if (totalPages === null || totalPages < number)
      throw new Error('Vinted-Seitennavigation geändert');
    if (number >= totalPages) return values;
  }
  throw new Error('Vinted-Import überschreitet die Seitengrenze');
}

export async function readVintedAccountImport(
  page: Page,
  authorize: () => Promise<void>,
): Promise<VintedAccountImport> {
  await page.goto('https://www.vinted.de/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const identity = await readVintedAccountIdentity(page);
  if (!identity) throw new Error('Vinted-Anmeldung nicht bestätigt');
  await authorize();
  const profile = await vintedJson(page, '/api/v2/users/current');
  await authorize();
  const items = await pages(
    page,
    (number) => `/api/v2/wardrobe/${identity.id}/items?page=${number}&per_page=20`,
    'items',
    authorize,
  );
  await authorize();
  const conversations = await pages(
    page,
    (number) => `/api/v2/inbox?page=${number}&per_page=20`,
    'conversations',
    authorize,
  );
  if (conversations.length > 100)
    throw new Error('Vinted-Import überschreitet die Gesprächsgrenze');
  const details: unknown[] = [];
  for (const raw of conversations) {
    // Das Öffnen ungelesener Gespräche könnte bei Vinted den Lesestatus verändern.
    if (record(raw)?.['unread'] !== false) continue;
    const id = identifier(record(raw)?.['id']);
    if (!id) continue;
    await authorize();
    const conversation = await vintedJson(page, `/api/v2/conversations/${id}`);
    const relation = record(record(conversation)?.['conversation']);
    if (identifier(relation?.['id']) !== id) throw new Error('Vinted-Gespräch geändert');
    const transactionId = identifier(record(relation?.['transaction'])?.['id']);
    let transaction: unknown = null;
    if (
      transactionId &&
      identifier(record(relation?.['transaction'])?.['seller_id']) === identity.id
    ) {
      await authorize();
      transaction = await vintedJson(page, `/api/v2/transactions/${transactionId}`);
    }
    details.push({ ...record(conversation), transaction });
  }
  return parseVintedAccountImport(
    identity,
    profile,
    items,
    conversations,
    details,
    new Date().toISOString(),
  );
}

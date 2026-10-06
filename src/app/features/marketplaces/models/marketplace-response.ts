import type {
  AccountScope,
  Capability,
  CapabilityMap,
  ConnectionStatus,
  MarketplaceConnection,
} from './marketplace.models';
import type {
  MarketplaceConnectionList,
  MarketplaceSnapshot,
  MarketplacePage,
  MarketplaceEntry,
  MarketplaceProfile,
  MarketplaceFeedback,
} from './marketplace-read.models';

const capabilities: readonly Capability[] = [
  'profile.read',
  'listings.read',
  'metrics.read',
  'conversations.read',
  'messages.sendText',
  'listings.update',
  'listings.publish',
  'sales.read',
];
const statuses: readonly ConnectionStatus[] = [
  'disconnected',
  'needs_login',
  'connected',
  'paused',
  'blocked',
];

export class MarketplaceResponseError extends Error {
  constructor() {
    super('Die Kontodaten konnten nicht sicher zugeordnet werden. Bitte lade die Ansicht erneut.');
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MarketplaceResponseError();
  return value as Record<string, unknown>;
}
function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048)
    throw new MarketplaceResponseError();
  return value;
}
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === 'string' &&
    /^\d{4}-\d\d-\d\dT/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : null;
}
function nonnegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function counter(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function scopeOf(data: Record<string, unknown>, expected: AccountScope): AccountScope {
  if (
    data['workspaceId'] !== expected.workspaceId ||
    data['connectionId'] !== expected.connectionId
  )
    throw new MarketplaceResponseError();
  return { ...expected };
}
function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function parseMarketplaceConnections(
  value: unknown,
  workspaceId: string,
): MarketplaceConnectionList {
  const data = record(value);
  if (typeof data['canManage'] !== 'boolean' || !Array.isArray(data['connections']))
    throw new MarketplaceResponseError();
  const ids = new Set<string>();
  const connections = data['connections'].map((value): MarketplaceConnection => {
    const item = record(value);
    const connectionId = requiredText(item['connectionId']);
    const scope = scopeOf(item, { workspaceId, connectionId });
    if (
      ids.has(connectionId) ||
      item['marketplace'] !== 'vinted' ||
      !statuses.includes(item['status'] as ConnectionStatus)
    )
      throw new MarketplaceResponseError();
    if (
      item['executionMode'] !== undefined &&
      item['executionMode'] !== 'cloud' &&
      item['executionMode'] !== 'local'
    )
      throw new MarketplaceResponseError();
    ids.add(connectionId);
    const states = record(item['capabilities']);
    const verifiedStates: Partial<
      Record<Capability, 'unknown' | 'verified' | 'unsupported' | 'blocked'>
    > = {};
    for (const capability of capabilities) {
      const state = states[capability];
      if (state === undefined) continue;
      if (
        state !== 'unknown' &&
        state !== 'verified' &&
        state !== 'unsupported' &&
        state !== 'blocked'
      )
        throw new MarketplaceResponseError();
      verifiedStates[capability] = state;
    }
    if (
      !Array.isArray(item['allowedActions']) ||
      item['allowedActions'].some((action) => !capabilities.includes(action as Capability))
    )
      throw new MarketplaceResponseError();
    return Object.freeze({
      ...scope,
      marketplace: 'vinted',
      executionMode: item['executionMode'] === 'local' ? 'local' : 'cloud',
      displayName: requiredText(item['displayName']),
      externalAccountId: text(item['externalAccountId']),
      status: item['status'] as ConnectionStatus,
      capabilities: Object.freeze(verifiedStates) as CapabilityMap,
      allowedActions: Object.freeze([...item['allowedActions']]) as readonly Capability[],
      lastSyncedAt: timestamp(item['lastSyncedAt']),
    });
  });
  if (!data['canManage'] && connections.length) throw new MarketplaceResponseError();
  return { canManage: data['canManage'], connections };
}

export function parseMarketplacePage(
  value: unknown,
  scope: AccountScope,
  conversationId?: string,
): MarketplacePage<MarketplaceEntry> {
  const data = record(value);
  const total = counter(data['total']);
  if (
    !Array.isArray(data['items']) ||
    total === null ||
    total < data['items'].length ||
    data['items'].length > 50
  )
    throw new MarketplaceResponseError();
  const nextCursor = data['nextCursor'] === null ? null : requiredText(data['nextCursor']);
  const ids = new Set<string>();
  const items = data['items'].map((value): MarketplaceEntry => {
    const item = record(value);
    const id = requiredText(item['id']);
    if (ids.has(id) || (conversationId !== undefined && item['conversationId'] !== conversationId))
      throw new MarketplaceResponseError();
    ids.add(id);
    const metrics =
      item['metrics'] === undefined || item['metrics'] === null ? {} : record(item['metrics']);
    return {
      ...scopeOf(item, scope),
      id,
      externalId: text(item['externalId']),
      title: text(item['title']) ?? 'Ohne Bezeichnung',
      text: text(item['text']) ?? text(item['message']) ?? text(item['lastMessage']),
      ...(item['textState'] === 'loaded' || item['textState'] === 'not_loaded'
        ? { textState: item['textState'] }
        : {}),
      occurredAt:
        timestamp(item['occurredAt']) ?? timestamp(item['sentAt']) ?? timestamp(item['updatedAt']),
      price: nonnegative(item['price']),
      currency:
        typeof item['currency'] === 'string' && /^[A-Z]{3}$/.test(item['currency'])
          ? item['currency']
          : 'EUR',
      status: text(item['status']),
      imageUrl: imageUrl(item['imageUrl']),
      ...(Array.isArray(item['imageUrls'])
        ? {
            imageUrls: item['imageUrls']
              .slice(0, 20)
              .map(imageUrl)
              .filter((url): url is string => url !== null),
          }
        : {}),
      metrics: {
        views: counter(metrics['views']),
        favorites: counter(metrics['favorites']),
        observedAt: timestamp(metrics['observedAt']),
      },
      conversationId: text(item['conversationId']),
      direction:
        item['direction'] === 'inbound' || item['direction'] === 'outbound'
          ? item['direction']
          : 'unknown',
      promoted: typeof item['promoted'] === 'boolean' ? item['promoted'] : null,
      unread: typeof item['unread'] === 'boolean' ? item['unread'] : null,
      brand: text(item['brand']),
      size: text(item['size']),
      shipmentStatus: text(item['shipmentStatus']),
      messageType: text(item['messageType']),
      priceLabel: text(item['priceLabel']),
      itemId: text(item['itemId']),
      itemTitle: text(item['itemTitle']),
      itemImageUrl: imageUrl(item['itemImageUrl']),
      itemPrice: nonnegative(item['itemPrice']),
      itemCurrency:
        typeof item['itemCurrency'] === 'string' && /^[A-Z]{3}$/.test(item['itemCurrency'])
          ? item['itemCurrency']
          : null,
      partnerId: text(item['partnerId']),
      lastActiveAt: timestamp(item['lastActiveAt']),
      detailCheckedAt: timestamp(item['detailCheckedAt']),
      transactionStatus: text(item['transactionStatus']),
      eventType: text(item['eventType']),
      eventGroup: text(item['eventGroup']),
      offerStatus: text(item['offerStatus']),
    };
  });
  return { items, total, nextCursor };
}

export function parseMarketplaceSnapshot(value: unknown, scope: AccountScope): MarketplaceSnapshot {
  const data = record(value);
  let profile: MarketplaceProfile | null = null;
  if (data['profile'] !== null) {
    const item = record(data['profile']);
    const feedbacks = Array.isArray(item['feedbacks'])
      ? item['feedbacks'].flatMap((entry): MarketplaceFeedback[] => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
          const fb = entry as Record<string, unknown>;
          const id = text(fb['id']);
          if (!id) return [];
          return [
            {
              id,
              authorName: text(fb['authorName']),
              authorImageUrl: imageUrl(fb['authorImageUrl']),
              rating:
                typeof fb['rating'] === 'number' &&
                Number.isInteger(fb['rating']) &&
                fb['rating'] >= 0 &&
                fb['rating'] <= 5
                  ? fb['rating']
                  : null,
              text: text(fb['text']) ?? '',
              occurredAt: timestamp(fb['occurredAt']),
              isAutomatic: typeof fb['isAutomatic'] === 'boolean' ? fb['isAutomatic'] : null,
              itemTitle: text(fb['itemTitle']),
            },
          ];
        })
      : [];
    profile = {
      ...scopeOf(item, scope),
      username: text(item['username']),
      displayName: text(item['displayName']),
      location: text(item['location']),
      bio: text(item['bio']),
      ...(item['bioState'] === 'loaded' || item['bioState'] === 'not_loaded'
        ? { bioState: item['bioState'] }
        : {}),
      imageUrl: imageUrl(item['imageUrl']),
      feedbackCount: counter(item['feedbackCount']),
      feedbackReputation: nonnegative(item['feedbackReputation']),
      positiveFeedbackCount: counter(item['positiveFeedbackCount']),
      neutralFeedbackCount: counter(item['neutralFeedbackCount']),
      negativeFeedbackCount: counter(item['negativeFeedbackCount']),
      itemCount: counter(item['itemCount']),
      feedbacks,
    };
  }
  return {
    ...scopeOf(data, scope),
    profile,
    publications: parseMarketplacePage(data['publications'], scope),
    conversations: parseMarketplacePage(data['conversations'], scope),
    sales: parseMarketplacePage(data['sales'], scope),
    activity: parseMarketplacePage(data['activity'], scope),
  };
}

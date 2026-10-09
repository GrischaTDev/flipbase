import type { AppNotification } from '../../../core/models/webhook.models';
import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';

export interface FavoriteNotificationListing {
  readonly entryId: string;
  readonly title: string;
  readonly previousFavorites: number;
  readonly favorites: number;
}
export interface FavoriteNotification {
  readonly id: string;
  readonly connectionId: string;
  readonly accountName: string;
  readonly observedAt: string;
  readonly read: boolean;
  readonly listings: readonly FavoriteNotificationListing[];
}
export interface FavoriteNotificationFeed {
  readonly workspaceId: string;
  readonly items: readonly FavoriteNotification[];
  readonly unreadCount: number;
}
export interface FavoriteNotificationSettings extends AccountScope {
  readonly enabled: boolean;
  readonly version: number;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MarketplaceResponseError();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /\p{Cc}/u.test(value))
    throw new MarketplaceResponseError();
  return value;
}
function counter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new MarketplaceResponseError();
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new MarketplaceResponseError();
  return value;
}
export function parseFavoriteNotificationFeed(
  value: unknown,
  workspaceId: string,
): FavoriteNotificationFeed {
  const feed = record(value);
  if (
    feed['workspaceId'] !== workspaceId ||
    !Array.isArray(feed['items']) ||
    feed['items'].length > 50
  )
    throw new MarketplaceResponseError();
  const items = feed['items'].map((value): FavoriteNotification => {
    const item = record(value);
    const observedAt = text(item['observedAt']);
    if (
      !Number.isFinite(Date.parse(observedAt)) ||
      !Array.isArray(item['listings']) ||
      !item['listings'].length
    )
      throw new MarketplaceResponseError();
    const listings = item['listings'].map((value): FavoriteNotificationListing => {
      const listing = record(value);
      const previousFavorites = counter(listing['previousFavorites']);
      const favorites = counter(listing['favorites']);
      if (favorites <= previousFavorites) throw new MarketplaceResponseError();
      return {
        entryId: text(listing['entryId']),
        title: text(listing['title']),
        previousFavorites,
        favorites,
      };
    });
    return {
      id: text(item['id']),
      connectionId: text(item['connectionId']),
      accountName: text(item['accountName']),
      observedAt,
      read: boolean(item['read']),
      listings,
    };
  });
  const unreadCount = counter(feed['unreadCount']);
  if (
    unreadCount < items.filter((item) => !item.read).length ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new MarketplaceResponseError();
  return { workspaceId, items, unreadCount };
}
export function parseFavoriteNotificationSettings(
  value: unknown,
  scope: AccountScope,
): FavoriteNotificationSettings {
  const settings = record(value);
  if (
    settings['workspaceId'] !== scope.workspaceId ||
    settings['connectionId'] !== scope.connectionId
  )
    throw new MarketplaceResponseError();
  return { ...scope, enabled: boolean(settings['enabled']), version: counter(settings['version']) };
}
export function favoriteNotificationToInbox(item: FavoriteNotification): AppNotification {
  const listing = item.listings[0];
  const isSingle = item.listings.length === 1;
  return {
    id: `marketplace:${item.id}`,
    type: 'alert',
    title: isSingle
      ? `Artikel wurde favorisiert · ${item.accountName}`
      : `${item.listings.length} Artikel wurden favorisiert · ${item.accountName}`,
    message: isSingle ? listing.title : `${item.listings.length} Inserate wurden favorisiert.`,
    timestamp: item.observedAt,
    read: item.read,
    link: isSingle
      ? `/marketplaces/vinted/listings/${encodeURIComponent(item.connectionId)}/${encodeURIComponent(listing.entryId)}`
      : `/marketplaces/vinted/listings?connectionId=${encodeURIComponent(item.connectionId)}`,
  };
}

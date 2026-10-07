import type { AppNotification } from '../../../core/models/webhook.models';
import { MarketplaceResponseError } from './marketplace-response';
export interface FeedbackNotification {
  readonly id: string;
  readonly connectionId: string;
  readonly accountName: string;
  readonly observedAt: string;
  readonly read: boolean;
  readonly authorName: string | null;
  readonly rating: number | null;
  readonly isAutomatic: boolean | null;
}
export interface FeedbackNotificationFeed {
  readonly workspaceId: string;
  readonly items: readonly FeedbackNotification[];
  readonly unreadCount: number;
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

export function parseFeedbackNotificationFeed(
  value: unknown,
  workspaceId: string,
): FeedbackNotificationFeed {
  const feed = record(value);
  if (
    feed['workspaceId'] !== workspaceId ||
    !Array.isArray(feed['items']) ||
    feed['items'].length > 50
  )
    throw new MarketplaceResponseError();
  const items = feed['items'].map((value): FeedbackNotification => {
    const item = record(value);
    const observedAt = text(item['observedAt']);
    const rating = item['rating'] === null ? null : counter(item['rating']);
    if (!Number.isFinite(Date.parse(observedAt)) || (rating !== null && rating > 5))
      throw new MarketplaceResponseError();
    return {
      id: text(item['id']),
      connectionId: text(item['connectionId']),
      accountName: text(item['accountName']),
      observedAt,
      read: boolean(item['read']),
      authorName: item['authorName'] === null ? null : text(item['authorName']),
      rating,
      isAutomatic: item['isAutomatic'] === null ? null : boolean(item['isAutomatic']),
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
export function feedbackNotificationToInbox(item: FeedbackNotification): AppNotification {
  const source =
    item.isAutomatic === true
      ? 'Automatische Vinted-Bewertung'
      : item.authorName
        ? 'Bewertung von ' + item.authorName
        : 'Neue Vinted-Bewertung';
  return {
    id: 'marketplace-feedback:' + item.id,
    type: 'alert',
    title: 'Neue Bewertung · ' + item.accountName,
    message: source + (item.rating === null ? '.' : ' · ' + item.rating + ' von 5 Sternen.'),
    timestamp: item.observedAt,
    read: item.read,
    link:
      '/marketplaces/vinted/profile?connectionId=' +
      encodeURIComponent(item.connectionId) +
      '#reviews',
  };
}

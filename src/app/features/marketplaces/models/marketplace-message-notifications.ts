import type { AppNotification } from '../../../core/models/webhook.models';
import { MarketplaceResponseError } from './marketplace-response';
export interface MessageNotification {
  readonly id: string;
  readonly connectionId: string;
  readonly accountName: string;
  readonly observedAt: string;
  readonly read: boolean;
  readonly senderName: string | null;
  readonly conversationId: string;
  readonly eventKind: 'message' | 'offer_request_message';
}
export interface MessageNotificationFeed {
  readonly workspaceId: string;
  readonly items: readonly MessageNotification[];
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

export function parseMessageNotificationFeed(
  value: unknown,
  workspaceId: string,
): MessageNotificationFeed {
  const feed = record(value);
  if (
    feed['workspaceId'] !== workspaceId ||
    !Array.isArray(feed['items']) ||
    feed['items'].length > 50
  )
    throw new MarketplaceResponseError();
  const items = feed['items'].map((value): MessageNotification => {
    const item = record(value);
    const observedAt = text(item['observedAt']);
    const eventKind = item['eventKind'];
    if (
      !Number.isFinite(Date.parse(observedAt)) ||
      (eventKind !== 'message' && eventKind !== 'offer_request_message')
    )
      throw new MarketplaceResponseError();
    return {
      id: text(item['id']),
      connectionId: text(item['connectionId']),
      accountName: text(item['accountName']),
      observedAt,
      read: boolean(item['read']),
      senderName: item['senderName'] === null ? null : text(item['senderName']),
      conversationId: text(item['conversationId']),
      eventKind,
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
export function messageNotificationToInbox(item: MessageNotification): AppNotification {
  const isOffer = item.eventKind === 'offer_request_message';
  const message = isOffer ? 'Neuer Preisvorschlag' : 'Nachricht';
  return {
    id: 'marketplace-message:' + item.id,
    type: 'alert',
    title: (isOffer ? 'Neuer Preisvorschlag · ' : 'Neue Nachricht · ') + item.accountName,
    message: item.senderName
      ? message + ' von ' + item.senderName + '.'
      : (isOffer ? message : 'Neue Nachricht') + '.',
    timestamp: item.observedAt,
    read: item.read,
    link:
      '/marketplaces/vinted/messages?connectionId=' +
      encodeURIComponent(item.connectionId) +
      '&conversationId=' +
      encodeURIComponent(item.conversationId),
  };
}

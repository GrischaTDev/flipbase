import type { AppNotification } from '../../../core/models/webhook.models';
import { MarketplaceResponseError } from './marketplace-response';
import type { AccountScope } from './marketplace.models';

export const vintedNotificationCategories = [
  { key: 'messages', label: 'Neue Nachrichten' },
  { key: 'offers', label: 'Preisvorschläge' },
  { key: 'orders', label: 'Bestellungen und Verkäufe' },
  { key: 'shipping', label: 'Versand und Zustellung' },
  { key: 'payments', label: 'Zahlungen und Rückerstattungen' },
  { key: 'feedback', label: 'Neue Bewertungen' },
  { key: 'other', label: 'Weitere Statusmeldungen' },
] as const;
export type VintedNotificationCategory = (typeof vintedNotificationCategories)[number]['key'];
export type VintedNotificationCategorySettings = Readonly<
  Record<VintedNotificationCategory, boolean>
>;

export const vintedNotificationTitles = {
  message: 'Neue Nachricht',
  offer_received: 'Neuer Preisvorschlag',
  sale_sold: 'Artikel verkauft',
  purchase_created: 'Artikel gekauft',
  order_cancelled: 'Bestellung storniert',
  transaction_cancelled: 'Transaktion abgebrochen',
  item_relisted: 'Artikel wieder eingestellt',
  shipping_label_ready: 'Versandlabel verfügbar',
  shipment_sent: 'Sendung verschickt',
  ready_for_pickup: 'Sendung abholbereit',
  delivered: 'Sendung zugestellt',
  order_completed: 'Bestellung abgeschlossen',
  order_suspended: 'Bestellung unterbrochen',
  issue_reported: 'Problem gemeldet',
  refund_started: 'Rückerstattung eingeleitet',
  refund_completed: 'Rückerstattung abgeschlossen',
  refund_accepted: 'Rückerstattung angenommen',
  return_shipped: 'Rücksendung verschickt',
  feedback_received: 'Neue Bewertung',
  feedback_sent: 'Bewertung abgegeben',
  support_closed: 'Supportchat beendet',
  item_unavailable: 'Artikel nicht verfügbar',
  other_status: 'Status bei Vinted aktualisiert',
} as const;
export type VintedNotificationKind = keyof typeof vintedNotificationTitles;

export interface MessageNotificationSettings extends AccountScope {
  readonly enabled: boolean;
  readonly version: number;
  readonly categories?: VintedNotificationCategorySettings;
}
export interface MessageNotification {
  readonly id: string;
  readonly connectionId: string;
  readonly accountName: string;
  readonly observedAt: string;
  readonly read: boolean;
  readonly senderName: string | null;
  readonly conversationId: string;
  readonly eventKind:
    'message' | 'offer_request_message' | 'status_message' | 'action_message' | 'payment_message';
  readonly notificationKind?: VintedNotificationKind;
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
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1000 ||
    /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
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

export function messageNotificationCategorySettings(
  settings: Pick<MessageNotificationSettings, 'enabled' | 'categories'>,
): VintedNotificationCategorySettings {
  return (
    settings.categories ?? {
      messages: settings.enabled,
      offers: settings.enabled,
      orders: settings.enabled,
      shipping: settings.enabled,
      payments: settings.enabled,
      feedback: settings.enabled,
      other: settings.enabled,
    }
  );
}

export function parseMessageNotificationSettings(
  value: unknown,
  scope: AccountScope,
): MessageNotificationSettings {
  const settings = record(value);
  if (
    settings['workspaceId'] !== scope.workspaceId ||
    settings['connectionId'] !== scope.connectionId
  )
    throw new MarketplaceResponseError();
  const enabled = boolean(settings['enabled']);
  let categories = messageNotificationCategorySettings({ enabled });
  if (settings['categories'] !== undefined) {
    const source = record(settings['categories']);
    if (
      Object.keys(source).length !== vintedNotificationCategories.length ||
      Object.keys(source).some(
        (key) => !vintedNotificationCategories.some((category) => category.key === key),
      )
    )
      throw new MarketplaceResponseError();
    categories = {
      messages: boolean(source['messages']),
      offers: boolean(source['offers']),
      orders: boolean(source['orders']),
      shipping: boolean(source['shipping']),
      payments: boolean(source['payments']),
      feedback: boolean(source['feedback']),
      other: boolean(source['other']),
    };
    if (categories.messages !== enabled) throw new MarketplaceResponseError();
  }
  return { ...scope, enabled, version: counter(settings['version']), categories };
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
    const notificationKind = item['notificationKind'];
    if (
      !Number.isFinite(Date.parse(observedAt)) ||
      (eventKind !== 'message' &&
        eventKind !== 'offer_request_message' &&
        eventKind !== 'status_message' &&
        eventKind !== 'action_message' &&
        eventKind !== 'payment_message')
    )
      throw new MarketplaceResponseError();
    if (
      notificationKind !== undefined &&
      notificationKind !== null &&
      (typeof notificationKind !== 'string' ||
        !Object.hasOwn(vintedNotificationTitles, notificationKind) ||
        (eventKind === 'message') !== (notificationKind === 'message') ||
        (eventKind === 'offer_request_message') !== (notificationKind === 'offer_received'))
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
      ...(notificationKind == null
        ? {}
        : { notificationKind: notificationKind as VintedNotificationKind }),
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
  const kind =
    item.notificationKind ??
    (item.eventKind === 'message'
      ? 'message'
      : item.eventKind === 'offer_request_message'
        ? 'offer_received'
        : 'other_status');
  const title = vintedNotificationTitles[kind];
  const sender = (kind === 'message' || kind === 'offer_received') && item.senderName;
  return {
    id: 'marketplace-message:' + item.id,
    type: kind === 'sale_sold' ? 'sale' : 'alert',
    title: title + (sender ? ' von ' + sender : ''),
    message: 'Vinted-Konto: ' + item.accountName + '.',
    timestamp: item.observedAt,
    read: item.read,
    link:
      '/marketplaces/vinted/messages?connectionId=' +
      encodeURIComponent(item.connectionId) +
      '&conversationId=' +
      encodeURIComponent(item.conversationId),
  };
}

import type { PushWorkerConfig } from './config.ts';

interface NotificationContent {
  title: string;
  body: string;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function displayText(value: string, limit: number): string {
  return value
    .replace(/\p{Cc}|[\u202a-\u202e\u2066-\u2069]/gu, ' ')
    .trim()
    .slice(0, limit)
    .replace(/[\uD800-\uDBFF]$/u, '');
}

/** Liest ausschließlich die belegte Glockenmeldung im bereits autorisierten Konto. */
export async function readFavoriteNotificationContent(
  config: Pick<PushWorkerConfig, 'supabaseUrl' | 'serviceKey'>,
  payload: unknown,
): Promise<NotificationContent | null> {
  const event = record(payload);
  const target = record(event?.['target']);
  if (
    event?.['category'] !== 'favorite' ||
    target?.['kind'] !== 'vinted_favorites' ||
    [event['eventId'], event['workspaceId'], target['connectionId']].some(
      (value) => typeof value !== 'string' || !uuid.test(value),
    )
  )
    return null;

  async function read(table: string, parameters: Record<string, string>): Promise<unknown> {
    const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
    url.search = new URLSearchParams(parameters).toString();
    const response = await fetch(url, {
      headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    if (!response.ok) return null;
    const text = await response.text();
    return text.length <= 500_000 ? (JSON.parse(text) as unknown) : null;
  }

  try {
    const workspaceId = String(event['workspaceId']);
    const connectionId = String(target['connectionId']);
    const sources = await read('web_push_events', {
      select: 'id,workspace_id,connection_id,source_key',
      id: `eq.${String(event['eventId'])}`,
      workspace_id: `eq.${workspaceId}`,
      connection_id: `eq.${connectionId}`,
      category: 'eq.favorite',
      limit: '1',
    });
    if (!Array.isArray(sources) || sources.length !== 1) return null;
    const sourceEvent = record(sources[0]);
    if (
      !sourceEvent ||
      sourceEvent['id'] !== event['eventId'] ||
      sourceEvent['workspace_id'] !== workspaceId ||
      sourceEvent['connection_id'] !== connectionId
    )
      return null;
    const source = sourceEvent['source_key'];
    if (typeof source !== 'string' || !/^vinted-favorites:[1-9]\d*$/u.test(source)) return null;
    const notifications = await read('marketplace_favorite_notifications', {
      select:
        'id,workspace_id,connection_id,marketplace_connections!inner(display_name),marketplace_favorite_notification_events(id,title)',
      id: `eq.${source.slice('vinted-favorites:'.length)}`,
      workspace_id: `eq.${workspaceId}`,
      connection_id: `eq.${connectionId}`,
      'marketplace_favorite_notification_events.order': 'id.asc',
      limit: '1',
    });
    if (!Array.isArray(notifications) || notifications.length !== 1) return null;
    const notification = record(notifications[0]);
    if (
      String(notification?.['id']) !== source.slice('vinted-favorites:'.length) ||
      notification?.['workspace_id'] !== workspaceId ||
      notification['connection_id'] !== connectionId
    )
      return null;
    const accountName = record(notification?.['marketplace_connections'])?.['display_name'];
    const listings = notification?.['marketplace_favorite_notification_events'];
    if (
      typeof accountName !== 'string' ||
      !accountName.trim() ||
      !Array.isArray(listings) ||
      !listings.length
    )
      return null;
    const titles = listings.map((listing) => record(listing)?.['title']);
    if (titles.some((title) => typeof title !== 'string' || !title.trim())) return null;
    return {
      title: displayText(
        `${titles.length === 1 ? 'Artikel wurde favorisiert' : `${titles.length} Artikel wurden favorisiert`} · ${accountName}`,
        80,
      ),
      body: displayText(titles.join(' · '), 160),
    };
  } catch {
    // Fehlende/gelöschte Details blockieren die bestehende allgemeine Meldung nicht.
    return null;
  }
}

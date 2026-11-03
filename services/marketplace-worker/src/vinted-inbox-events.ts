import type {
  MarketplaceInboxEvent,
  MarketplaceInboxEventBatch,
  MarketplaceInboxNotificationKind,
} from '../../../supabase/functions/_shared/marketplace-inbox-event-contracts.d.ts';
import { createHash } from 'node:crypto';
import '../../../tools/flipbase-extension/vinted-local-inbox-events.js';

const inboxRuntime = (
  globalThis as unknown as {
    FlipbaseVintedInboxEvents: {
      notificationKind: (
        message: Record<string, unknown>,
        entity: Record<string, unknown>,
      ) => MarketplaceInboxNotificationKind;
    };
  }
).FlipbaseVintedInboxEvents;

const systemMessageTypes = ['status_message', 'action_message', 'payment_message'];
function systemIdentity(
  message: Record<string, unknown>,
  entity: Record<string, unknown>,
  occurredAt: string,
): string {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : null);
  return JSON.stringify({
    type: message['entity_type'],
    occurredAt,
    eventGroup: text(message['event_group']),
    eventType: text(message['event_type']),
    title: text(entity['title']),
    body: text(entity['body']),
    text: text(entity['text']),
    message: text(entity['message']) ?? text(record(entity['message'])?.['body']),
    statusTitle: text(entity['status_title']),
    priceLabel: text(entity['price_label']),
    sender: identifier(entity['user_id'] ?? entity['sender_id']),
    photos: Array.isArray(entity['photos'])
      ? entity['photos'].slice(0, 20).map((photo) => text(record(photo)?.['url']))
      : [],
  });
}

function record(input: unknown): Record<string, unknown> | null {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function identifier(input: unknown): string | null {
  const candidate =
    typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
  return typeof candidate === 'string' && /^[1-9][0-9]{0,31}$/.test(candidate) ? candidate : null;
}

function timestamp(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      input,
    );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const zone = match[7];
  if (
    year < 2000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    (zone !== 'Z' &&
      (!zone ||
        Number(zone.slice(1, 3)) > 14 ||
        Number(zone.slice(4)) > 59 ||
        (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0)))
  )
    return null;
  const instant = Date.parse(input);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : null;
}

export function parseVintedInboxEvents(
  input: unknown,
  accountId: string,
  observedAt: string,
): MarketplaceInboxEventBatch {
  const empty: MarketplaceInboxEventBatch = {
    observedAt,
    events: [],
    complete: false,
    coveredConversationIds: [],
  };
  const ownId = identifier(accountId);
  const observation = timestamp(observedAt);
  const envelope = record(input);
  const conversation = record(envelope?.['conversation']);
  const conversationId = identifier(conversation?.['id']);
  const partnerId = identifier(record(conversation?.['opposite_user'])?.['id']);
  const messages = conversation?.['messages'];
  if (
    !ownId ||
    !observation ||
    !conversationId ||
    !partnerId ||
    partnerId === ownId ||
    !Array.isArray(messages) ||
    (envelope?.['code'] !== undefined && envelope['code'] !== 0)
  )
    return empty;
  let complete = messages.length <= 200;
  const events = new Map<string, MarketplaceInboxEvent>();
  const known = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const raw of messages.slice(0, 200)) {
    const message = record(raw);
    const type = message?.['entity_type'];
    const system = typeof type === 'string' && systemMessageTypes.includes(type);
    if (!message || (type !== 'message' && type !== 'offer_request_message' && !system)) continue;
    const entity = record(message?.['entity']);
    const rawId = type === 'message' ? entity?.['id'] : (message?.['id'] ?? entity?.['id']);
    let messageId = identifier(rawId);
    const rawSender = entity?.['user_id'] ?? (system ? entity?.['sender_id'] : undefined);
    const senderId = identifier(rawSender);
    const platformSender = system && (rawSender == null || rawSender === 0);
    const occurredAt = timestamp(message?.['created_at_ts']);
    if (system && message && entity && rawId == null && occurredAt)
      messageId =
        'event:' +
        createHash('sha256')
          .update(systemIdentity(message, entity, occurredAt))
          .digest('hex');
    if (
      !entity ||
      !messageId ||
      (!platformSender && (!senderId || (senderId !== ownId && senderId !== partnerId))) ||
      !occurredAt ||
      occurredAt > observation
    ) {
      complete = false;
      continue;
    }
    const externalId = `${type}:${messageId}`;
    const signature = `${platformSender ? 'system' : senderId}:${occurredAt}`;
    if (known.has(externalId) && known.get(externalId) !== signature) {
      complete = false;
      conflicts.add(externalId);
      events.delete(externalId);
      continue;
    }
    known.set(externalId, signature);
    if (senderId === ownId || conflicts.has(externalId)) continue;
    events.set(externalId, {
      externalId,
      externalConversationId: conversationId,
      occurredAt,
      direction: 'inbound',
      source: 'conversation_snapshot',
      notificationKind: inboxRuntime.notificationKind(message, entity),
    });
  }
  return {
    observedAt,
    events: [...events.values()],
    complete,
    coveredConversationIds: complete ? [conversationId] : [],
  };
}

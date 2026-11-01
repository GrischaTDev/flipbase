import { EbayError, getEbayHosts, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import type { EbayConversationType, EbayMessage } from './ebay-message-contracts.ts';

// Vertrag: commerce_message_v1_oas3.json, Version 1.0.0, geprüft am 01.11.2026.
export function requireConversationType(value: unknown): EbayConversationType {
  if (value !== 'FROM_MEMBERS' && value !== 'FROM_EBAY') throw new EbayError('invalid_request');
  return value;
}
export function requireConversationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(value))
    throw new EbayError('invalid_request');
  return value;
}
export function requireMessageOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100000)
    throw new EbayError('invalid_request');
  return value;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new EbayError('invalid_response');
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new EbayError('invalid_response');
  return value;
}
export function parseEbayMessage(value: unknown): EbayMessage {
  const message = readRecord(value);
  const createdAt = text(message.createdDate);
  if (!Number.isFinite(Date.parse(createdAt))) throw new EbayError('invalid_response');
  return {
    id: text(message.messageId),
    createdAt,
    text: text(message.messageBody),
    sender: text(message.senderUsername ?? message.senderUserName),
    recipient: text(message.recipientUsername ?? message.recipientUserName),
    attachments: (Array.isArray(message.messageMedia) ? message.messageMedia : []).flatMap(
      (value) => {
        const media = readRecord(value);
        try {
          const url = new URL(text(media.mediaUrl));
          if (url.protocol !== 'https:' || url.username || url.password || url.port) return [];
          return [
            {
              name: typeof media.mediaName === 'string' ? media.mediaName : 'Anhang',
              url: url.href,
            },
          ];
        } catch {
          return [];
        }
      },
    ),
  };
}
async function request(
  config: EbayConfig,
  token: string,
  path: string,
  fetcher: typeof fetch,
  body?: Record<string, unknown>,
  sending = false,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(
      `${getEbayHosts(config.environment).api}/commerce/message/v1/${path}`,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new EbayError(sending ? 'message_send_unconfirmed' : 'provider_unavailable');
  }
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (response.status === 400 || response.status === 404) throw new EbayError('message_rejected');
  if (!response.ok)
    throw new EbayError(sending ? 'message_send_unconfirmed' : 'provider_unavailable');
  if (response.status === 204) return {};
  try {
    return readRecord(await response.json());
  } catch {
    throw new EbayError(sending ? 'message_send_unconfirmed' : 'invalid_response');
  }
}
function pagination(body: Record<string, unknown>, length: number, offset: number) {
  const total = count(body.total);
  if (length > 50 || (length === 0 && offset < total)) throw new EbayError('invalid_response');
  return { total, nextOffset: offset + length < total ? offset + length : null };
}
export async function readEbayInbox(
  config: EbayConfig,
  token: string,
  type: EbayConversationType,
  offset: number,
  unreadOnly: boolean,
  fetcher = fetch,
) {
  const query = new URLSearchParams({
    conversation_type: type,
    limit: '50',
    offset: String(offset),
    conversation_status: unreadOnly ? 'UNREAD' : 'ACTIVE',
  });
  const body = await request(config, token, `conversation?${query}`, fetcher);
  const rows = body.conversations ?? (body.total === 0 ? [] : null);
  if (!Array.isArray(rows)) throw new EbayError('invalid_response');
  const conversations = rows.map((value) => {
    const item = readRecord(value);
    if (item.conversationType !== type) throw new EbayError('invalid_response');
    return {
      id: text(item.conversationId),
      type,
      title: text(item.conversationTitle),
      unreadCount: count(item.unreadCount),
      listingId:
        item.referenceType === 'LISTING' && /^\d{1,20}$/.test(String(item.referenceId))
          ? String(item.referenceId)
          : null,
      latestMessage: item.latestMessage ? parseEbayMessage(item.latestMessage) : null,
    };
  });
  return { conversations, ...pagination(body, conversations.length, offset) };
}
export async function readEbayConversation(
  config: EbayConfig,
  token: string,
  conversationId: string,
  type: EbayConversationType,
  offset: number,
  fetcher = fetch,
) {
  const query = new URLSearchParams({
    conversation_type: type,
    limit: '50',
    offset: String(offset),
  });
  const body = await request(
    config,
    token,
    `conversation/${encodeURIComponent(conversationId)}?${query}`,
    fetcher,
  );
  if (body.conversationType !== type || !Array.isArray(body.messages))
    throw new EbayError('invalid_response');
  const messages = body.messages.map(parseEbayMessage);
  return {
    conversationId,
    type,
    title: text(body.conversationTitle),
    messages,
    ...pagination(body, messages.length, offset),
  };
}
export async function sendEbayReply(
  config: EbayConfig,
  token: string,
  conversationId: string,
  message: unknown,
  fetcher = fetch,
) {
  if (
    typeof message !== 'string' ||
    !message.trim() ||
    message.length > 2000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(message)
  )
    throw new EbayError('invalid_request');
  const body = await request(
    config,
    token,
    'send_message',
    fetcher,
    { conversationId, messageText: message, emailCopyToSender: false },
    true,
  );
  try {
    return { message: parseEbayMessage(body) };
  } catch {
    throw new EbayError('message_send_unconfirmed');
  }
}
export async function markEbayConversationRead(
  config: EbayConfig,
  token: string,
  conversationId: string,
  type: EbayConversationType,
  fetcher = fetch,
) {
  await request(config, token, 'update_conversation', fetcher, {
    conversationId,
    conversationType: type,
    read: true,
  });
  return { ok: true };
}

import type { AccountScope } from './marketplace.models';
import type {
  EbayConversation,
  EbayConversationMessages,
  EbayConversationType,
  EbayInbox,
  EbayMessage,
} from '../../../../../supabase/functions/_shared/ebay-message-contracts';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültige eBay-Antwort.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Ungültige eBay-Antwort.');
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Ungültige eBay-Antwort.');
  return value;
}
function scoped(value: unknown, scope: AccountScope) {
  const result = record(value);
  if (result['workspaceId'] !== scope.workspaceId || result['connectionId'] !== scope.connectionId)
    throw new Error('Die eBay-Kontoverbindung hat sich geändert.');
  return result;
}
function message(value: unknown): EbayMessage {
  const item = record(value);
  const createdAt = text(item['createdAt']);
  if (!Number.isFinite(Date.parse(createdAt)) || !Array.isArray(item['attachments']))
    throw new Error('Ungültige eBay-Nachricht.');
  return {
    id: text(item['id']),
    createdAt,
    text: text(item['text']),
    sender: text(item['sender']),
    recipient: text(item['recipient']),
    attachments: item['attachments'].map((value) => {
      const attachment = record(value);
      const url = new URL(text(attachment['url']));
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('Ungültiger Anhang.');
      return { name: text(attachment['name']), url: url.href };
    }),
  };
}
function page(result: Record<string, unknown>) {
  return {
    total: integer(result['total']),
    nextOffset: result['nextOffset'] === null ? null : integer(result['nextOffset']),
  };
}
export function parseEbayInbox(
  value: unknown,
  scope: AccountScope,
  type: EbayConversationType,
): EbayInbox {
  const result = scoped(value, scope);
  if (!Array.isArray(result['conversations'])) throw new Error('Ungültiges eBay-Postfach.');
  const conversations: EbayConversation[] = result['conversations'].map((value) => {
    const item = record(value);
    if (item['type'] !== type) throw new Error('Ungültiger Gesprächstyp.');
    return {
      id: text(item['id']),
      type,
      title: text(item['title']),
      unreadCount: integer(item['unreadCount']),
      listingId: item['listingId'] === null ? null : text(item['listingId']),
      latestMessage: item['latestMessage'] === null ? null : message(item['latestMessage']),
    };
  });
  return { ...scope, conversations, ...page(result) };
}
export function parseEbayConversationMessages(
  value: unknown,
  scope: AccountScope,
  conversationId: string,
  type: EbayConversationType,
): EbayConversationMessages {
  const result = scoped(value, scope);
  if (
    result['conversationId'] !== conversationId ||
    result['type'] !== type ||
    !Array.isArray(result['messages'])
  )
    throw new Error('Das eBay-Gespräch hat sich geändert.');
  return {
    ...scope,
    conversationId,
    type,
    title: text(result['title']),
    messages: result['messages'].map(message),
    ...page(result),
  };
}
export function parseEbaySentMessage(value: unknown, scope: AccountScope): EbayMessage {
  return message(scoped(value, scope)['message']);
}

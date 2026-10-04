import type { AccountScope } from './marketplace.models';
import type { LocalQueuedMessage } from './marketplace-read.models';
import { MarketplaceResponseError } from './marketplace-response';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states: readonly LocalQueuedMessage['state'][] = [
  'queued',
  'claimed',
  'sending',
  'sent',
  'failed',
  'outcome_unknown',
  'cancelled',
];
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new MarketplaceResponseError();
  return input as Record<string, unknown>;
}
function timestamp(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/.test(input) ||
    !Number.isFinite(Date.parse(input))
  )
    throw new MarketplaceResponseError();
  return input;
}
function envelope(input: unknown, scope: AccountScope) {
  const response = record(input);
  if (
    response['ok'] !== true ||
    response['workspaceId'] !== scope.workspaceId ||
    response['connectionId'] !== scope.connectionId
  )
    throw new MarketplaceResponseError();
  return response;
}
function parseMessage(input: unknown, conversationId: string): LocalQueuedMessage {
  const message = record(input);
  for (const key of ['id', 'requestId', 'conversationId'])
    if (typeof message[key] !== 'string' || !uuid.test(message[key]))
      throw new MarketplaceResponseError();
  if (
    message['conversationId'] !== conversationId ||
    !states.includes(message['state'] as LocalQueuedMessage['state'])
  )
    throw new MarketplaceResponseError();
  if (
    message['text'] !== null &&
    (typeof message['text'] !== 'string' || message['text'].length > 5000)
  )
    throw new MarketplaceResponseError();
  const externalMessageId = message['externalMessageId'];
  if (
    externalMessageId !== null &&
    (typeof externalMessageId !== 'string' || !/^[1-9][0-9]{0,31}$/.test(externalMessageId))
  )
    throw new MarketplaceResponseError();
  if (message['state'] === 'sent' && !externalMessageId) throw new MarketplaceResponseError();
  const errorCode = message['errorCode'];
  if (errorCode !== null && (typeof errorCode !== 'string' || errorCode.length > 120))
    throw new MarketplaceResponseError();
  let attachment: LocalQueuedMessage['attachment'] = null;
  if (message['attachment'] !== null) {
    const photo = record(message['attachment']);
    if (
      Object.keys(photo).some((key) => !['name', 'mimeType'].includes(key)) ||
      typeof photo['name'] !== 'string' ||
      [...photo['name']].length > 120 ||
      !photo['name'].trim() ||
      (photo['mimeType'] !== 'image/jpeg' && photo['mimeType'] !== 'image/png')
    )
      throw new MarketplaceResponseError();
    attachment = { name: photo['name'], mimeType: photo['mimeType'] };
  }
  return {
    id: message['id'] as string,
    requestId: message['requestId'] as string,
    conversationId,
    text: message['text'] as string | null,
    state: message['state'] as LocalQueuedMessage['state'],
    createdAt: timestamp(message['createdAt']),
    updatedAt: timestamp(message['updatedAt']),
    externalMessageId: externalMessageId as string | null,
    errorCode: errorCode as string | null,
    attachment,
  };
}
export function parseLocalMessageList(
  input: unknown,
  scope: AccountScope,
  conversationId: string,
): readonly LocalQueuedMessage[] {
  const response = envelope(input, scope);
  if (!Array.isArray(response['messages']) || response['messages'].length > 50)
    throw new MarketplaceResponseError();
  const messages = response['messages'].map((message) => parseMessage(message, conversationId));
  if (
    new Set(messages.map((message) => message.id)).size !== messages.length ||
    new Set(messages.map((message) => message.requestId)).size !== messages.length
  )
    throw new MarketplaceResponseError();
  return messages;
}
export function parseLocalMessageEnqueue(
  input: unknown,
  scope: AccountScope,
  conversationId: string,
  requestId: string,
): LocalQueuedMessage {
  const message = parseMessage(envelope(input, scope)['message'], conversationId);
  if (message.requestId !== requestId) throw new MarketplaceResponseError();
  return message;
}

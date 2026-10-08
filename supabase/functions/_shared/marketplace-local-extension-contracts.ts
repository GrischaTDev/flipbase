import type { AccountScope } from './marketplace-contracts.ts';
import type { MarketplaceInboxEventBatch } from './marketplace-inbox-event-contracts.d.ts';

export interface LocalExtensionEntry {
  readonly kind: 'profile' | 'publication';
  readonly externalId: string;
  readonly sortAt: string;
  readonly body: Readonly<Record<string, unknown>>;
}
export interface LocalExtensionSnapshot {
  readonly identity: { readonly id: string; readonly username: string };
  readonly observedAt: string;
  readonly entries: readonly LocalExtensionEntry[];
  readonly publicationsComplete: boolean;
}
export type LocalExtensionRequest = AccountScope &
  (
    | { readonly action: 'favorites_state' }
    | { readonly action: 'favorite_claim'; readonly offerSupported?: boolean }
    | { readonly action: 'favorites_import'; readonly events: readonly LocalFavoriteEvent[] }
    | { readonly action: 'favorite_start'; readonly id: string; readonly claimToken: string }
    | {
        readonly action: 'favorite_finish';
        readonly id: string;
        readonly claimToken: string;
        readonly outcome: 'sent' | 'failed' | 'outcome_unknown' | 'skipped';
        readonly externalMessageId?: string;
        readonly errorCode?: string;
      }
    | {
        readonly action: 'favorite_message_sent';
        readonly id: string;
        readonly claimToken: string;
        readonly externalMessageId: string;
        readonly conversationId: string;
        readonly transactionId?: string | null;
      }
    | {
        readonly action: 'favorite_offer_start';
        readonly id: string;
        readonly claimToken: string;
        readonly originalPriceCents: number;
        readonly offerPriceCents: number;
      }
    | {
        readonly action: 'favorite_offer_finish';
        readonly id: string;
        readonly claimToken: string;
        readonly outcome: 'sent' | 'failed' | 'outcome_unknown' | 'skipped';
        readonly externalOfferId?: string;
        readonly errorCode?: string;
      }
    | { readonly action: 'heartbeat' }
    | { readonly action: 'import'; readonly snapshot: LocalExtensionSnapshot }
    | { readonly action: 'inbox_state'; readonly mode?: 'latest' | 'backfill' }
    | {
        readonly action: 'inbox_import';
        readonly mode?: 'latest' | 'backfill';
        readonly batch: LocalExtensionInboxBatch;
      }
    | { readonly action: 'inbox_detail_state'; readonly conversationId: string }
    | {
        readonly action: 'inbox_detail_import';
        readonly conversationId: string;
        readonly batch: LocalExtensionInboxBatch;
      }
    | { readonly action: 'message_claim' }
    | { readonly action: 'message_start'; readonly id: string; readonly claimToken: string }
    | {
        readonly action: 'message_finish';
        readonly id: string;
        readonly claimToken: string;
        readonly outcome: 'sent' | 'failed' | 'outcome_unknown';
        readonly externalMessageId?: string;
        readonly errorCode?: string;
      }
  );
export interface LocalFavoriteEvent {
  readonly externalId: string;
  readonly actorId: string;
  readonly itemId: string;
  readonly eventAt: string;
}
export interface LocalExtensionInboxEntry {
  readonly kind: 'conversation' | 'message';
  readonly externalId: string;
  readonly parentExternalId?: string;
  readonly sortAt: string;
  readonly body: Readonly<Record<string, unknown>>;
}
export interface LocalExtensionInboxBatch {
  readonly inboxEvents?: MarketplaceInboxEventBatch & { readonly version: 1 };
  readonly identity: { readonly id: string };
  readonly observedAt: string;
  readonly page: number;
  readonly nextPage: number;
  readonly conversationsComplete: boolean;
  readonly entries: readonly LocalExtensionInboxEntry[];
}
export interface LocalExtensionInboxVersion {
  readonly externalId: string;
  readonly sourceUpdatedAt: string;
  readonly detailCheckedAt: string | null;
  readonly text: string | null;
  readonly occurredAt: string;
}
export interface LocalExtensionInboxState {
  readonly ok: true;
  readonly externalAccountId: string;
  readonly expiresAt: string;
  readonly messagesRead: boolean;
  readonly nextPage: number;
  readonly versions: readonly LocalExtensionInboxVersion[];
}
export interface LocalExtensionBinding {
  readonly inboxSyncedAt?: string | null;
  readonly externalAccountId: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string | null;
  readonly revoked: boolean;
  readonly messagesRead?: boolean;
  readonly messagesSend?: boolean;
}
export const localExtensionMaxBytes = 512 * 1024;
const accountId = /^[1-9][0-9]{0,31}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
function keys(input: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(input).every((key) => allowed.includes(key));
}
function text(input: unknown, max: number) {
  return (
    typeof input === 'string' &&
    input.length <= max &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)
  );
}
function date(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(input) &&
    Number.isFinite(Date.parse(input))
  );
}
function image(input: unknown) {
  if (input === null) return true;
  if (typeof input !== 'string' || input.length > 2048) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
const profileFields = [
  'username',
  'displayName',
  'location',
  'bio',
  'bioState',
  'imageUrl',
  'feedbackCount',
  'feedbackReputation',
  'positiveFeedbackCount',
  'neutralFeedbackCount',
  'negativeFeedbackCount',
  'itemCount',
  'observedAt',
];
const publicationFields = [
  'title',
  'text',
  'textState',
  'occurredAt',
  'price',
  'currency',
  'status',
  'imageUrl',
  'imageUrls',
  'metrics',
  'promoted',
  'brand',
  'size',
  'priceLabel',
  'isClosed',
  'isReserved',
];
const conversationFields = [
  'title',
  'text',
  'occurredAt',
  'sourceUpdatedAt',
  'detailCheckedAt',
  'unread',
  'imageUrl',
  'itemId',
  'itemTitle',
  'itemImageUrl',
  'itemPrice',
  'itemCurrency',
  'partnerId',
  'lastActiveAt',
  'transactionStatus',
];
const messageFields = [
  'title',
  'text',
  'occurredAt',
  'direction',
  'messageType',
  'priceLabel',
  'imageUrls',
  'eventType',
  'eventGroup',
  'offerStatus',
];
const numericFields = [
  'feedbackCount',
  'feedbackReputation',
  'positiveFeedbackCount',
  'neutralFeedbackCount',
  'negativeFeedbackCount',
  'itemCount',
  'price',
];
function validBody(body: Record<string, unknown>, kind: LocalExtensionEntry['kind']) {
  if (!keys(body, kind === 'profile' ? profileFields : publicationFields)) return false;
  for (const [field, input] of Object.entries(body)) {
    if (input === null) continue;
    if (field === 'imageUrl') {
      if (!image(input)) return false;
    } else if (field === 'imageUrls') {
      if (!Array.isArray(input) || input.length > 20 || !input.every(image)) return false;
    } else if (numericFields.includes(field)) {
      if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > 1e12)
        return false;
    } else if (field === 'metrics') {
      if (!record(input) || !keys(input, ['views', 'favorites', 'observedAt'])) return false;
      for (const metric of ['views', 'favorites'])
        if (
          input[metric] !== null &&
          (typeof input[metric] !== 'number' ||
            !Number.isSafeInteger(input[metric]) ||
            input[metric] < 0)
        )
          return false;
      if (input['observedAt'] !== null && !date(input['observedAt'])) return false;
    } else if (field === 'promoted' || field === 'isClosed' || field === 'isReserved') {
      if (typeof input !== 'boolean') return false;
    } else if (field === 'occurredAt' || field === 'observedAt') {
      if (!date(input)) return false;
    } else if (field === 'bioState' || field === 'textState') {
      if (input !== 'loaded' && input !== 'not_loaded') return false;
    } else if (!text(input, field === 'bio' || field === 'text' ? 10000 : 500)) return false;
  }
  return kind === 'profile'
    ? text(body['username'], 120) && (body['username'] as string).length > 0
    : text(body['title'], 500) && (body['title'] as string).length > 0;
}
export function parseLocalExtensionRequest(input: unknown): LocalExtensionRequest | null {
  if (
    !record(input) ||
    typeof input['workspaceId'] !== 'string' ||
    !uuid.test(input['workspaceId']) ||
    typeof input['connectionId'] !== 'string' ||
    !uuid.test(input['connectionId'])
  )
    return null;
  if (input['action'] === 'heartbeat' && keys(input, ['action', 'workspaceId', 'connectionId']))
    return input as unknown as LocalExtensionRequest;
  if (
    input['action'] === 'favorites_state' &&
    keys(input, ['action', 'workspaceId', 'connectionId'])
  )
    return input as unknown as LocalExtensionRequest;
  if (
    input['action'] === 'favorite_claim' &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'offerSupported']) &&
    (input['offerSupported'] === undefined || typeof input['offerSupported'] === 'boolean')
  )
    return input as unknown as LocalExtensionRequest;
  if (
    ['favorite_message_sent', 'favorite_offer_start', 'favorite_offer_finish'].includes(
      String(input['action']),
    ) &&
    typeof input['id'] === 'string' &&
    uuid.test(input['id']) &&
    typeof input['claimToken'] === 'string' &&
    uuid.test(input['claimToken'])
  ) {
    const scopeKeys = ['action', 'workspaceId', 'connectionId', 'id', 'claimToken'];
    if (
      input['action'] === 'favorite_message_sent' &&
      keys(input, [...scopeKeys, 'externalMessageId', 'conversationId', 'transactionId']) &&
      typeof input['externalMessageId'] === 'string' &&
      accountId.test(input['externalMessageId']) &&
      typeof input['conversationId'] === 'string' &&
      accountId.test(input['conversationId']) &&
      (input['transactionId'] === undefined ||
        input['transactionId'] === null ||
        (typeof input['transactionId'] === 'string' && accountId.test(input['transactionId'])))
    )
      return input as unknown as LocalExtensionRequest;
    if (
      input['action'] === 'favorite_offer_start' &&
      keys(input, [...scopeKeys, 'originalPriceCents', 'offerPriceCents']) &&
      [input['originalPriceCents'], input['offerPriceCents']].every(
        (price) =>
          typeof price === 'number' &&
          Number.isSafeInteger(price) &&
          price > 0 &&
          price <= 100_000_000,
      )
    )
      return input as unknown as LocalExtensionRequest;
    if (
      input['action'] === 'favorite_offer_finish' &&
      keys(input, [...scopeKeys, 'outcome', 'externalOfferId', 'errorCode']) &&
      ['sent', 'failed', 'outcome_unknown', 'skipped'].includes(String(input['outcome'])) &&
      (input['externalOfferId'] === undefined ||
        (typeof input['externalOfferId'] === 'string' &&
          accountId.test(input['externalOfferId']))) &&
      (input['errorCode'] === undefined ||
        (typeof input['errorCode'] === 'string' && /^[a-z_]{1,80}$/.test(input['errorCode']))) &&
      (input['outcome'] === 'sent'
        ? typeof input['externalOfferId'] === 'string'
        : input['externalOfferId'] === undefined)
    )
      return input as unknown as LocalExtensionRequest;
    return null;
  }
  if (
    input['action'] === 'favorites_import' &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'events'])
  ) {
    const events = input['events'];
    return Array.isArray(events) &&
      events.length <= 200 &&
      events.every(
        (event) =>
          record(event) &&
          keys(event, ['externalId', 'actorId', 'itemId', 'eventAt']) &&
          typeof event['externalId'] === 'string' &&
          uuid.test(event['externalId']) &&
          typeof event['actorId'] === 'string' &&
          accountId.test(event['actorId']) &&
          typeof event['itemId'] === 'string' &&
          accountId.test(event['itemId']) &&
          date(event['eventAt']),
      )
      ? (input as unknown as LocalExtensionRequest)
      : null;
  }
  const mode = input['mode'];
  const validMode = mode === undefined || mode === 'latest' || mode === 'backfill';
  if (
    input['action'] === 'inbox_state' &&
    validMode &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'mode'])
  )
    return input as unknown as LocalExtensionRequest;
  if (
    input['action'] === 'inbox_import' &&
    validMode &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'mode', 'batch'])
  )
    return parseInboxBatch(input['batch']) ? (input as unknown as LocalExtensionRequest) : null;
  if (
    input['action'] === 'inbox_detail_state' &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'conversationId']) &&
    typeof input['conversationId'] === 'string' &&
    uuid.test(input['conversationId'])
  )
    return input as unknown as LocalExtensionRequest;
  if (
    input['action'] === 'inbox_detail_import' &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'conversationId', 'batch']) &&
    typeof input['conversationId'] === 'string' &&
    uuid.test(input['conversationId'])
  )
    return parseInboxBatch(input['batch']) ? (input as unknown as LocalExtensionRequest) : null;
  if (input['action'] === 'message_claim' && keys(input, ['action', 'workspaceId', 'connectionId']))
    return input as unknown as LocalExtensionRequest;
  if (
    (input['action'] === 'message_start' ||
      input['action'] === 'message_finish' ||
      input['action'] === 'favorite_start' ||
      input['action'] === 'favorite_finish') &&
    keys(input, [
      'action',
      'workspaceId',
      'connectionId',
      'id',
      'claimToken',
      'outcome',
      'externalMessageId',
      'errorCode',
    ]) &&
    typeof input['id'] === 'string' &&
    uuid.test(input['id']) &&
    typeof input['claimToken'] === 'string' &&
    uuid.test(input['claimToken'])
  ) {
    if (
      (input['action'] === 'message_start' || input['action'] === 'favorite_start') &&
      !Object.hasOwn(input, 'outcome') &&
      !Object.hasOwn(input, 'externalMessageId') &&
      !Object.hasOwn(input, 'errorCode')
    )
      return input as unknown as LocalExtensionRequest;
    if (
      (input['action'] === 'message_finish' || input['action'] === 'favorite_finish') &&
      (input['outcome'] === 'sent' ||
        input['outcome'] === 'failed' ||
        input['outcome'] === 'outcome_unknown' ||
        (input['action'] === 'favorite_finish' && input['outcome'] === 'skipped')) &&
      (input['externalMessageId'] === undefined ||
        (typeof input['externalMessageId'] === 'string' &&
          accountId.test(input['externalMessageId']))) &&
      (input['errorCode'] === undefined ||
        (typeof input['errorCode'] === 'string' && /^[a-z_]{1,80}$/.test(input['errorCode']))) &&
      (input['outcome'] !== 'sent' || typeof input['externalMessageId'] === 'string') &&
      (input['outcome'] === 'sent' || input['externalMessageId'] === undefined)
    )
      return input as unknown as LocalExtensionRequest;
  }
  if (
    input['action'] !== 'import' ||
    !keys(input, ['action', 'workspaceId', 'connectionId', 'snapshot'])
  )
    return null;
  const snapshot = input['snapshot'];
  if (
    !record(snapshot) ||
    !keys(snapshot, ['identity', 'observedAt', 'entries', 'publicationsComplete']) ||
    !record(snapshot['identity']) ||
    !keys(snapshot['identity'], ['id', 'username']) ||
    typeof snapshot['identity']['id'] !== 'string' ||
    !accountId.test(snapshot['identity']['id']) ||
    !text(snapshot['identity']['username'], 120) ||
    !snapshot['identity']['username'] ||
    !date(snapshot['observedAt']) ||
    typeof snapshot['publicationsComplete'] !== 'boolean' ||
    !Array.isArray(snapshot['entries']) ||
    snapshot['entries'].length > 501
  )
    return null;
  let profiles = 0;
  const seen = new Set<string>();
  for (const entry of snapshot['entries']) {
    if (
      !record(entry) ||
      !keys(entry, ['kind', 'externalId', 'sortAt', 'body']) ||
      (entry['kind'] !== 'profile' && entry['kind'] !== 'publication') ||
      typeof entry['externalId'] !== 'string' ||
      !accountId.test(entry['externalId']) ||
      !date(entry['sortAt']) ||
      !record(entry['body']) ||
      !validBody(entry['body'], entry['kind'])
    )
      return null;
    const key = `${entry['kind']}:${entry['externalId']}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (entry['kind'] === 'profile') {
      profiles++;
      if (
        entry['externalId'] !== snapshot['identity']['id'] ||
        entry['body']['username'] !== snapshot['identity']['username']
      )
        return null;
    }
  }
  return profiles === 1 ? (input as unknown as LocalExtensionRequest) : null;
}
function parseInboxBatch(input: unknown): input is LocalExtensionInboxBatch {
  if (
    !record(input) ||
    !keys(input, [
      'identity',
      'observedAt',
      'page',
      'nextPage',
      'conversationsComplete',
      'entries',
      'inboxEvents',
    ]) ||
    !record(input['identity']) ||
    !keys(input['identity'], ['id']) ||
    typeof input['identity']['id'] !== 'string' ||
    !accountId.test(input['identity']['id']) ||
    !date(input['observedAt']) ||
    !Number.isInteger(input['page']) ||
    (input['page'] as number) < 1 ||
    (input['page'] as number) > 20 ||
    !Number.isInteger(input['nextPage']) ||
    (input['nextPage'] as number) < 1 ||
    (input['nextPage'] as number) > 20 ||
    typeof input['conversationsComplete'] !== 'boolean' ||
    !Array.isArray(input['entries'])
  )
    return false;
  const entries = input['entries'] as unknown[];
  if (
    input['inboxEvents'] !== undefined &&
    (!isMarketplaceInboxEventBatch(input['inboxEvents']) ||
      input['inboxEvents'].observedAt !== input['observedAt'])
  )
    return false;
  if (entries.length > 220) return false;
  let conversations = 0;
  let messages = 0;
  const seen = new Set<string>();
  const parents = new Set<string>();
  for (const entry of entries) {
    if (
      !record(entry) ||
      !keys(entry, ['kind', 'externalId', 'parentExternalId', 'sortAt', 'body']) ||
      (entry['kind'] !== 'conversation' && entry['kind'] !== 'message') ||
      typeof entry['externalId'] !== 'string' ||
      !/^(?:[1-9][0-9]{0,31}|event:[0-9a-f]{64})$/.test(entry['externalId']) ||
      !date(entry['sortAt']) ||
      !record(entry['body'])
    )
      return false;
    const key = `${entry['kind']}:${entry['externalId']}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const body = entry['body'];
    if (entry['kind'] === 'conversation') {
      conversations++;
      if (
        Object.hasOwn(entry, 'parentExternalId') ||
        !keys(body, conversationFields) ||
        !text(body['title'], 500) ||
        !body['title'] ||
        (body['text'] !== null && !text(body['text'], 10000)) ||
        !date(body['occurredAt']) ||
        !date(body['sourceUpdatedAt']) ||
        (body['detailCheckedAt'] !== null && !date(body['detailCheckedAt'])) ||
        (body['unread'] !== null && typeof body['unread'] !== 'boolean') ||
        !image(body['imageUrl']) ||
        (body['itemId'] !== undefined &&
          body['itemId'] !== null &&
          (typeof body['itemId'] !== 'string' || !accountId.test(body['itemId']))) ||
        (body['partnerId'] !== undefined &&
          body['partnerId'] !== null &&
          (typeof body['partnerId'] !== 'string' || !accountId.test(body['partnerId']))) ||
        (body['itemTitle'] !== undefined &&
          body['itemTitle'] !== null &&
          !text(body['itemTitle'], 500)) ||
        (body['itemImageUrl'] !== undefined && !image(body['itemImageUrl'])) ||
        (body['itemPrice'] !== undefined &&
          body['itemPrice'] !== null &&
          (typeof body['itemPrice'] !== 'number' ||
            !Number.isFinite(body['itemPrice']) ||
            body['itemPrice'] < 0 ||
            body['itemPrice'] > 1e12)) ||
        (body['itemCurrency'] !== undefined &&
          body['itemCurrency'] !== null &&
          (typeof body['itemCurrency'] !== 'string' || !/^[A-Z]{3}$/.test(body['itemCurrency']))) ||
        (body['lastActiveAt'] !== undefined &&
          body['lastActiveAt'] !== null &&
          !date(body['lastActiveAt'])) ||
        (body['transactionStatus'] !== undefined &&
          body['transactionStatus'] !== null &&
          !text(body['transactionStatus'], 500))
      )
        return false;
      parents.add(entry['externalId']);
    } else {
      messages++;
      if (
        typeof entry['parentExternalId'] !== 'string' ||
        !accountId.test(entry['parentExternalId']) ||
        !keys(body, messageFields) ||
        !text(body['title'], 500) ||
        !body['title'] ||
        (body['text'] !== null && !text(body['text'], 10000)) ||
        !date(body['occurredAt']) ||
        !['inbound', 'outbound', 'unknown'].includes(body['direction'] as string) ||
        (body['messageType'] !== null && !text(body['messageType'], 500)) ||
        (body['priceLabel'] !== null && !text(body['priceLabel'], 500)) ||
        (body['imageUrls'] !== undefined &&
          (!Array.isArray(body['imageUrls']) ||
            body['imageUrls'].length > 10 ||
            !body['imageUrls'].every(image))) ||
        ['eventType', 'eventGroup', 'offerStatus'].some(
          (field) => body[field] !== undefined && body[field] !== null && !text(body[field], 500),
        )
      )
        return false;
    }
  }
  return (
    conversations <= 20 &&
    messages <= 200 &&
    entries.every(
      (entry) =>
        !record(entry) ||
        entry['kind'] !== 'message' ||
        parents.has(entry['parentExternalId'] as string),
    )
  );
}

export interface LocalExtensionApproval extends AccountScope {
  readonly externalAccountId: string;
  readonly expiresAt: string;
  readonly messagesRead?: boolean;
  readonly messagesSend?: boolean;
}
export interface LocalExtensionStatus {
  readonly binding: LocalExtensionBinding | null;
}
export interface LocalExtensionRevocation {
  readonly ok: true;
}
export function parseLocalExtensionApproval(
  input: unknown,
  scope: AccountScope,
): LocalExtensionApproval | null {
  return record(input) &&
    input['workspaceId'] === scope.workspaceId &&
    input['connectionId'] === scope.connectionId &&
    typeof input['externalAccountId'] === 'string' &&
    accountId.test(input['externalAccountId']) &&
    date(input['expiresAt']) &&
    (input['messagesRead'] === undefined || typeof input['messagesRead'] === 'boolean') &&
    (input['messagesSend'] === undefined || typeof input['messagesSend'] === 'boolean')
    ? (input as unknown as LocalExtensionApproval)
    : null;
}
export function parseLocalExtensionStatus(input: unknown): LocalExtensionStatus | null {
  if (!record(input) || !Object.hasOwn(input, 'binding')) return null;
  const binding = input['binding'];
  if (binding === null) return { binding: null };
  return record(binding) &&
    typeof binding['externalAccountId'] === 'string' &&
    accountId.test(binding['externalAccountId']) &&
    date(binding['expiresAt']) &&
    (binding['lastSeenAt'] === null || date(binding['lastSeenAt'])) &&
    typeof binding['revoked'] === 'boolean' &&
    (binding['messagesRead'] === undefined || typeof binding['messagesRead'] === 'boolean') &&
    (binding['messagesSend'] === undefined || typeof binding['messagesSend'] === 'boolean') &&
    (binding['inboxSyncedAt'] === undefined ||
      binding['inboxSyncedAt'] === null ||
      date(binding['inboxSyncedAt']))
    ? (input as unknown as LocalExtensionStatus)
    : null;
}
export function parseLocalExtensionInboxState(input: unknown): LocalExtensionInboxState | null {
  if (
    !record(input) ||
    input['ok'] !== true ||
    typeof input['externalAccountId'] !== 'string' ||
    !accountId.test(input['externalAccountId']) ||
    !date(input['expiresAt']) ||
    typeof input['messagesRead'] !== 'boolean' ||
    !Number.isInteger(input['nextPage']) ||
    (input['nextPage'] as number) < 1 ||
    (input['nextPage'] as number) > 20 ||
    !Array.isArray(input['versions']) ||
    input['versions'].length > 400
  )
    return null;
  const seen = new Set<string>();
  for (const version of input['versions']) {
    if (
      !record(version) ||
      !keys(version, ['externalId', 'sourceUpdatedAt', 'detailCheckedAt', 'text', 'occurredAt']) ||
      typeof version['externalId'] !== 'string' ||
      !accountId.test(version['externalId']) ||
      seen.has(version['externalId']) ||
      !date(version['sourceUpdatedAt']) ||
      (version['detailCheckedAt'] !== null && !date(version['detailCheckedAt'])) ||
      (version['text'] !== null && !text(version['text'], 10000)) ||
      !date(version['occurredAt'])
    )
      return null;
    seen.add(version['externalId']);
  }
  return input as unknown as LocalExtensionInboxState;
}
export function parseLocalExtensionRevocation(input: unknown): LocalExtensionRevocation | null {
  return record(input) && input['ok'] === true ? { ok: true } : null;
}

function exactInboxEventKeys(input: Record<string, unknown>, fields: readonly string[]) {
  return (
    Object.keys(input).length === fields.length &&
    Object.keys(input).every((field) => fields.includes(field))
  );
}
function inboxEventTimestamp(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) &&
    Number.isFinite(Date.parse(input)) &&
    new Date(input).toISOString() === input
  );
}
const inboxEventIdentifier = /^[1-9][0-9]{0,31}$/;
export function isMarketplaceInboxEventBatch(
  input: unknown,
): input is MarketplaceInboxEventBatch & { readonly version: 1 } {
  if (
    !record(input) ||
    !exactInboxEventKeys(input, [
      'version',
      'observedAt',
      'events',
      'complete',
      'coveredConversationIds',
    ]) ||
    input['version'] !== 1 ||
    !inboxEventTimestamp(input['observedAt']) ||
    typeof input['complete'] !== 'boolean' ||
    !Array.isArray(input['events']) ||
    input['events'].length > 600 ||
    !Array.isArray(input['coveredConversationIds']) ||
    input['coveredConversationIds'].length > 3
  )
    return false;
  const covered = input['coveredConversationIds'];
  if (
    !covered.every((id) => typeof id === 'string' && inboxEventIdentifier.test(id)) ||
    new Set(covered).size !== covered.length
  )
    return false;
  const seen = new Set<string>();
  for (const event of input['events']) {
    if (
      !record(event) ||
      !exactInboxEventKeys(event, [
        'externalId',
        'externalConversationId',
        'occurredAt',
        'direction',
        'source',
      ]) ||
      typeof event['externalId'] !== 'string' ||
      !/^(message|offer_request_message):[1-9][0-9]{0,31}$/.test(event['externalId']) ||
      typeof event['externalConversationId'] !== 'string' ||
      !inboxEventIdentifier.test(event['externalConversationId']) ||
      !inboxEventTimestamp(event['occurredAt']) ||
      event['occurredAt'] > input['observedAt'] ||
      event['direction'] !== 'inbound' ||
      event['source'] !== 'conversation_snapshot'
    )
      return false;
    const key = `${event['externalConversationId']}:${event['externalId']}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

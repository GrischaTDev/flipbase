import type { AccountScope } from './marketplace-contracts.ts';

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
    | { readonly action: 'heartbeat' }
    | { readonly action: 'import'; readonly snapshot: LocalExtensionSnapshot }
    | { readonly action: 'inbox_state' }
    | { readonly action: 'inbox_import'; readonly batch: LocalExtensionInboxBatch }
  );
export interface LocalExtensionInboxEntry {
  readonly kind: 'conversation' | 'message';
  readonly externalId: string;
  readonly parentExternalId?: string;
  readonly sortAt: string;
  readonly body: Readonly<Record<string, unknown>>;
}
export interface LocalExtensionInboxBatch {
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
  readonly externalAccountId: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string | null;
  readonly revoked: boolean;
  readonly messagesRead?: boolean;
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
];
const messageFields = ['title', 'text', 'occurredAt', 'direction', 'messageType', 'priceLabel'];
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
  if (input['action'] === 'inbox_state' && keys(input, ['action', 'workspaceId', 'connectionId']))
    return input as unknown as LocalExtensionRequest;
  if (
    input['action'] === 'inbox_import' &&
    keys(input, ['action', 'workspaceId', 'connectionId', 'batch'])
  )
    return parseInboxBatch(input['batch']) ? (input as unknown as LocalExtensionRequest) : null;
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
        !image(body['imageUrl'])
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
        (body['priceLabel'] !== null && !text(body['priceLabel'], 500))
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
    (input['messagesRead'] === undefined || typeof input['messagesRead'] === 'boolean')
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
    (binding['messagesRead'] === undefined || typeof binding['messagesRead'] === 'boolean')
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

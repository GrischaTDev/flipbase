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
  );
export interface LocalExtensionBinding {
  readonly externalAccountId: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string | null;
  readonly revoked: boolean;
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

export interface LocalExtensionApproval extends AccountScope {
  readonly externalAccountId: string;
  readonly expiresAt: string;
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
    date(input['expiresAt'])
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
    typeof binding['revoked'] === 'boolean'
    ? (input as unknown as LocalExtensionStatus)
    : null;
}
export function parseLocalExtensionRevocation(input: unknown): LocalExtensionRevocation | null {
  return record(input) && input['ok'] === true ? { ok: true } : null;
}

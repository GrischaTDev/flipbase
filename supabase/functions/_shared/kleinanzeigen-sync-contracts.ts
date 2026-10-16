import {
  kleinanzeigenConnectionId,
  kleinanzeigenRecord,
  type KleinanzeigenAccountScope,
} from './kleinanzeigen-contracts.ts';
interface SyncScope extends KleinanzeigenAccountScope {
  readonly generation: number;
  readonly runId: string;
}
export interface KleinanzeigenSyncPublication {
  readonly externalId: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: null;
  readonly state: 'active' | 'unknown';
}
export interface KleinanzeigenQuotaObservation {
  readonly externalAccountId: string;
  readonly accountType: 'private' | 'commercial';
  readonly source: 'account_settings';
  readonly used: number;
  readonly observedAt: string;
}
interface ClaimedSync extends SyncScope {
  readonly claimToken: string;
  readonly externalAccountId: string;
}
export type KleinanzeigenSyncFailure =
  | 'schema_changed'
  | 'needs_login'
  | 'interrupted'
  | 'account_changed'
  | 'unsupported'
  | 'access_revoked';
export type KleinanzeigenSyncRequest =
  | (SyncScope & { readonly action: 'sync_claim' })
  | (ClaimedSync & {
      readonly action: 'sync_page';
      readonly pageCursor: string;
      readonly nextCursor: string | null;
      readonly items: readonly KleinanzeigenSyncPublication[];
    })
  | (ClaimedSync & {
      readonly action: 'sync_finish';
      readonly quota: KleinanzeigenQuotaObservation | null;
    })
  | (ClaimedSync & { readonly action: 'sync_fail'; readonly errorCode: KleinanzeigenSyncFailure });
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const keys = (value: Record<string, unknown>, fields: readonly string[]) =>
  Object.keys(value).sort().join(',') === [...fields].sort().join(',');
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value);
const cursor = (value: unknown): value is string =>
  typeof value === 'string' && /^page:[1-9][0-9]{0,3}$/u.test(value);
const secret = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT/u.test(value) &&
  Number.isFinite(Date.parse(value));
const failures: readonly string[] = [
  'schema_changed',
  'needs_login',
  'interrupted',
  'account_changed',
  'unsupported',
  'access_revoked',
];
export function parseKleinanzeigenQuota(
  value: unknown,
  externalAccountId: string,
): KleinanzeigenQuotaObservation | null {
  if (
    !kleinanzeigenRecord(value) ||
    !keys(value, ['externalAccountId', 'accountType', 'source', 'used', 'observedAt']) ||
    value.externalAccountId !== externalAccountId ||
    !id(externalAccountId) ||
    (value.accountType !== 'private' && value.accountType !== 'commercial') ||
    value.source !== 'account_settings' ||
    typeof value.used !== 'number' ||
    !Number.isSafeInteger(value.used) ||
    value.used < 0 ||
    value.used > 999999999 ||
    !timestamp(value.observedAt)
  )
    return null;
  return {
    externalAccountId,
    accountType: value.accountType,
    source: 'account_settings',
    used: value.used,
    observedAt: value.observedAt,
  };
}
export function parseKleinanzeigenSyncRequest(value: unknown): KleinanzeigenSyncRequest | null {
  if (
    !kleinanzeigenRecord(value) ||
    typeof value.workspaceId !== 'string' ||
    !uuid.test(value.workspaceId) ||
    !kleinanzeigenConnectionId(value.connectionId) ||
    !kleinanzeigenConnectionId(value.runId) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1
  )
    return null;
  const scope = {
    workspaceId: value.workspaceId,
    connectionId: value.connectionId,
    generation: value.generation,
    runId: value.runId,
  };
  const scopeKeys = ['action', 'workspaceId', 'connectionId', 'generation', 'runId'];
  if (value.action === 'sync_claim')
    return keys(value, scopeKeys) ? { action: 'sync_claim', ...scope } : null;
  if (!secret(value.claimToken) || !id(value.externalAccountId)) return null;
  const claimed = {
    ...scope,
    claimToken: value.claimToken,
    externalAccountId: value.externalAccountId,
  };
  const claimKeys = [...scopeKeys, 'claimToken', 'externalAccountId'];
  if (value.action === 'sync_finish') {
    if (!keys(value, [...claimKeys, 'quota'])) return null;
    const quota =
      value.quota === null ? null : parseKleinanzeigenQuota(value.quota, value.externalAccountId);
    return value.quota !== null && !quota ? null : { action: 'sync_finish', ...claimed, quota };
  }
  if (value.action === 'sync_fail')
    return keys(value, [...claimKeys, 'errorCode']) &&
      typeof value.errorCode === 'string' &&
      failures.includes(value.errorCode)
      ? { action: 'sync_fail', ...claimed, errorCode: value.errorCode as KleinanzeigenSyncFailure }
      : null;
  if (
    value.action !== 'sync_page' ||
    !keys(value, [...claimKeys, 'pageCursor', 'nextCursor', 'items']) ||
    !cursor(value.pageCursor) ||
    !(value.nextCursor === null || cursor(value.nextCursor)) ||
    !Array.isArray(value.items) ||
    value.items.length > 200 ||
    (value.items.length === 0 && value.nextCursor !== null)
  )
    return null;
  if (
    value.nextCursor !== null &&
    value.nextCursor !== 'page:' + (Number(value.pageCursor.slice(5)) + 1)
  )
    return null;
  const items: KleinanzeigenSyncPublication[] = [];
  const seen = new Set<string>();
  for (const candidate of value.items) {
    if (
      !kleinanzeigenRecord(candidate) ||
      !keys(candidate, ['externalId', 'title', 'url', 'publishedAt', 'state']) ||
      !id(candidate.externalId) ||
      seen.has(candidate.externalId) ||
      typeof candidate.title !== 'string' ||
      !candidate.title.trim() ||
      candidate.title.length > 512 ||
      typeof candidate.url !== 'string' ||
      candidate.url.length > 2048 ||
      candidate.publishedAt !== null ||
      (candidate.state !== 'active' && candidate.state !== 'unknown')
    )
      return null;
    try {
      const url = new URL(candidate.url);
      if (
        url.protocol !== 'https:' ||
        !['www.kleinanzeigen.de', 'kleinanzeigen.de'].includes(url.hostname) ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !new RegExp('^/s-anzeige/[^/]+/' + candidate.externalId + '-[0-9]+-[0-9]+$', 'u').test(
          url.pathname,
        )
      )
        return null;
    } catch {
      return null;
    }
    seen.add(candidate.externalId);
    items.push({
      externalId: candidate.externalId,
      title: candidate.title,
      url: candidate.url,
      publishedAt: null,
      state: candidate.state,
    });
  }
  return {
    action: 'sync_page',
    ...claimed,
    pageCursor: value.pageCursor,
    nextCursor: value.nextCursor,
    items,
  };
}
export function parseKleinanzeigenSyncReply(
  value: unknown,
  input: KleinanzeigenSyncRequest,
): Record<string, unknown> | null {
  if (
    !kleinanzeigenRecord(value) ||
    value.workspaceId !== input.workspaceId ||
    value.connectionId !== input.connectionId ||
    value.runId !== input.runId ||
    value.generation !== input.generation
  )
    return null;
  const scope = {
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    runId: input.runId,
    generation: input.generation,
  };
  const base = Object.keys(scope);
  if (input.action === 'sync_claim')
    return keys(value, [...base, 'claimToken', 'externalAccountId', 'nextCursor']) &&
      secret(value.claimToken) &&
      id(value.externalAccountId) &&
      value.nextCursor === 'page:1'
      ? {
          ...scope,
          claimToken: value.claimToken,
          externalAccountId: value.externalAccountId,
          nextCursor: 'page:1',
        }
      : null;
  if (input.action === 'sync_page')
    return keys(value, [...base, 'acceptedCursor', 'nextCursor', 'complete']) &&
      value.acceptedCursor === input.pageCursor &&
      value.nextCursor === input.nextCursor &&
      value.complete === (input.nextCursor === null)
      ? {
          ...scope,
          acceptedCursor: input.pageCursor,
          nextCursor: input.nextCursor,
          complete: input.nextCursor === null,
        }
      : null;
  if (input.action === 'sync_finish')
    return keys(value, [...base, 'state', 'observedAt', 'itemCount']) &&
      value.state === 'confirmed' &&
      timestamp(value.observedAt) &&
      typeof value.itemCount === 'number' &&
      Number.isSafeInteger(value.itemCount) &&
      value.itemCount >= 0 &&
      value.itemCount <= 20000
      ? { ...scope, state: 'confirmed', observedAt: value.observedAt, itemCount: value.itemCount }
      : null;
  return keys(value, [...base, 'state', 'errorCode']) &&
    value.state === 'failed' &&
    value.errorCode === input.errorCode
    ? { ...scope, state: 'failed', errorCode: input.errorCode }
    : null;
}

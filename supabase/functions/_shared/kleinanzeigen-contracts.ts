export interface KleinanzeigenIdentity {
  readonly externalAccountId: string;
  readonly displayName: string;
  readonly accountType: 'private' | 'commercial';
}
export interface KleinanzeigenAccountScope {
  readonly workspaceId: string;
  readonly connectionId: string;
}
export interface KleinanzeigenExtensionRequest extends KleinanzeigenAccountScope {
  readonly action: 'heartbeat';
  readonly generation: number;
}
export interface KleinanzeigenExtensionSession extends KleinanzeigenAccountScope {
  readonly externalAccountId: string;
  readonly generation: number;
  readonly canPublish: boolean;
  readonly expiresAt: string;
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
export function kleinanzeigenRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function kleinanzeigenConnectionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9][0-9]{0,18}$/u.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}
export function parseKleinanzeigenExtensionRequest(
  value: unknown,
): KleinanzeigenExtensionRequest | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !== 'action,connectionId,generation,workspaceId' ||
    value['action'] !== 'heartbeat' ||
    typeof value['workspaceId'] !== 'string' ||
    !uuid.test(value['workspaceId']) ||
    !kleinanzeigenConnectionId(value['connectionId']) ||
    typeof value['generation'] !== 'number' ||
    !Number.isSafeInteger(value['generation']) ||
    value['generation'] < 1
  )
    return null;
  return {
    action: 'heartbeat',
    workspaceId: value['workspaceId'],
    connectionId: value['connectionId'],
    generation: value['generation'],
  };
}
export function parseKleinanzeigenExtensionSession(
  value: unknown,
  scope: KleinanzeigenExtensionRequest,
): KleinanzeigenExtensionSession | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'canPublish,connectionId,expiresAt,externalAccountId,generation,workspaceId' ||
    value['workspaceId'] !== scope.workspaceId ||
    value['connectionId'] !== scope.connectionId ||
    value['generation'] !== scope.generation ||
    typeof value['externalAccountId'] !== 'string' ||
    !/^[1-9][0-9]{0,31}$/u.test(value['externalAccountId']) ||
    typeof value['canPublish'] !== 'boolean' ||
    typeof value['expiresAt'] !== 'string' ||
    !Number.isFinite(Date.parse(value['expiresAt']))
  )
    return null;
  return {
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    externalAccountId: value['externalAccountId'],
    generation: scope.generation,
    canPublish: value['canPublish'],
    expiresAt: value['expiresAt'],
  };
}

export interface KleinanzeigenBinding extends KleinanzeigenAccountScope {
  readonly externalAccountId: string;
  readonly displayName: string;
  readonly accountType: 'private' | 'commercial' | 'unknown';
  readonly status: 'needs_login' | 'connected' | 'disconnected';
  readonly generation: number;
  readonly expiresAt: string;
  readonly canPublish: boolean;
}
export interface KleinanzeigenProposal extends KleinanzeigenIdentity {
  readonly installationId: string;
  readonly tokenHash: string;
  readonly nonce: string;
}
const text = (value: unknown): value is string =>
  typeof value === 'string' &&
  value['trim']().length > 0 &&
  value['length'] <= 120 &&
  !/\p{Cc}/u.test(value);
const externalId = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value);
export function parseKleinanzeigenBinding(
  value: unknown,
  workspaceId: string,
  connectionId?: string,
): KleinanzeigenBinding | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'accountType,canPublish,connectionId,displayName,expiresAt,externalAccountId,generation,status,workspaceId' ||
    !uuid.test(workspaceId) ||
    value['workspaceId'] !== workspaceId ||
    !kleinanzeigenConnectionId(value['connectionId']) ||
    (connectionId !== undefined && value['connectionId'] !== connectionId) ||
    !externalId(value['externalAccountId']) ||
    !text(value['displayName']) ||
    (value['accountType'] !== 'private' &&
      value['accountType'] !== 'commercial' &&
      value['accountType'] !== 'unknown') ||
    (value['status'] !== 'needs_login' &&
      value['status'] !== 'connected' &&
      value['status'] !== 'disconnected') ||
    typeof value['generation'] !== 'number' ||
    !Number.isSafeInteger(value['generation']) ||
    value['generation'] < 1 ||
    typeof value['expiresAt'] !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/u.test(value['expiresAt']) ||
    !Number.isFinite(Date.parse(value['expiresAt'])) ||
    typeof value['canPublish'] !== 'boolean'
  )
    return null;
  return Object.freeze({
    workspaceId,
    connectionId: value['connectionId'],
    externalAccountId: value['externalAccountId'],
    displayName: value['displayName'],
    accountType: value['accountType'],
    status: value['status'],
    generation: value['generation'],
    expiresAt: value['expiresAt'],
    canPublish: value['canPublish'],
  });
}
export function parseKleinanzeigenProposal(value: unknown): KleinanzeigenProposal | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'accountType,displayName,externalAccountId,installationId,nonce,tokenHash' ||
    !externalId(value['externalAccountId']) ||
    !text(value['displayName']) ||
    (value['accountType'] !== 'private' && value['accountType'] !== 'commercial') ||
    typeof value['installationId'] !== 'string' ||
    !uuid.test(value['installationId']) ||
    typeof value['nonce'] !== 'string' ||
    !uuid.test(value['nonce']) ||
    typeof value['tokenHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['tokenHash'])
  )
    return null;
  return Object.freeze({
    externalAccountId: value['externalAccountId'],
    displayName: value['displayName'],
    accountType: value['accountType'],
    installationId: value['installationId'],
    nonce: value['nonce'],
    tokenHash: value['tokenHash'],
  });
}

export type KleinanzeigenAccountRequest =
  | {
      readonly action: 'connect';
      readonly workspaceId: string;
      readonly externalAccountId: string;
      readonly displayName: string;
      readonly accountType: 'private' | 'commercial';
      readonly installationId: string;
      readonly tokenHash: string;
      readonly canPublish: boolean;
    }
  | ({ readonly action: 'disconnect' | 'request_sync' } & KleinanzeigenAccountScope)
  | { readonly action: 'read_accounts'; readonly workspaceId: string }
  | KleinanzeigenPublicationsRequest;
export function parseKleinanzeigenAccountRequest(
  value: unknown,
): KleinanzeigenAccountRequest | null {
  if (
    !kleinanzeigenRecord(value) ||
    typeof value['workspaceId'] !== 'string' ||
    !uuid.test(value['workspaceId'])
  )
    return null;
  if (value['action'] === 'read_accounts')
    return Object.keys(value).sort().join(',') === 'action,workspaceId'
      ? { action: 'read_accounts', workspaceId: value['workspaceId'] }
      : null;
  if (value['action'] === 'read_publications') {
    if (
      Object.keys(value).sort().join(',') !==
        'action,afterId,connectionId,limit,search,snapshotAt,state,workspaceId' ||
      !kleinanzeigenConnectionId(value['connectionId']) ||
      typeof value['limit'] !== 'number' ||
      !Number.isInteger(value['limit']) ||
      value['limit'] < 1 ||
      value['limit'] > 100 ||
      (value['state'] !== 'all' && value['state'] !== 'active' && value['state'] !== 'ended') ||
      typeof value['search'] !== 'string' ||
      value['search'].length > 200 ||
      !(value['afterId'] === null || kleinanzeigenConnectionId(value['afterId'])) ||
      !kleinanzeigenNullableDate(value['snapshotAt']) ||
      (value['afterId'] !== null && value['snapshotAt'] === null)
    )
      return null;
    return {
      action: 'read_publications',
      workspaceId: value['workspaceId'],
      connectionId: value['connectionId'],
      limit: value['limit'],
      state: value['state'],
      search: value['search'],
      afterId: value['afterId'],
      snapshotAt: value['snapshotAt'],
    };
  }
  if (
    (value['action'] === 'disconnect' || value['action'] === 'request_sync') &&
    Object.keys(value).sort().join(',') === 'action,connectionId,workspaceId' &&
    kleinanzeigenConnectionId(value['connectionId'])
  )
    return {
      action: value['action'],
      workspaceId: value['workspaceId'],
      connectionId: value['connectionId'],
    };
  if (
    value['action'] !== 'connect' ||
    Object.keys(value).sort().join(',') !==
      'accountType,action,canPublish,displayName,externalAccountId,installationId,tokenHash,workspaceId' ||
    !externalId(value['externalAccountId']) ||
    !text(value['displayName']) ||
    (value['accountType'] !== 'private' && value['accountType'] !== 'commercial') ||
    typeof value['installationId'] !== 'string' ||
    !uuid.test(value['installationId']) ||
    typeof value['tokenHash'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['tokenHash']) ||
    typeof value['canPublish'] !== 'boolean'
  )
    return null;
  return {
    action: 'connect',
    workspaceId: value['workspaceId'],
    externalAccountId: value['externalAccountId'],
    displayName: value['displayName'],
    accountType: value['accountType'],
    installationId: value['installationId'],
    tokenHash: value['tokenHash'],
    canPublish: value['canPublish'],
  };
}

export interface KleinanzeigenSyncRun extends KleinanzeigenAccountScope {
  readonly runId: string;
  readonly generation: number;
  readonly state: 'queued' | 'reading';
}
export function parseKleinanzeigenSyncRun(
  value: unknown,
  scope: KleinanzeigenAccountScope,
): KleinanzeigenSyncRun | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !== 'connectionId,generation,runId,state,workspaceId' ||
    value['workspaceId'] !== scope.workspaceId ||
    value['connectionId'] !== scope.connectionId ||
    !kleinanzeigenConnectionId(value['runId']) ||
    typeof value['generation'] !== 'number' ||
    !Number.isSafeInteger(value['generation']) ||
    value['generation'] < 1 ||
    (value['state'] !== 'queued' && value['state'] !== 'reading')
  )
    return null;
  return Object.freeze({
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    runId: value['runId'],
    generation: value['generation'],
    state: value['state'],
  });
}

export interface KleinanzeigenSyncResult extends KleinanzeigenAccountScope {
  readonly runId: string;
  readonly generation: number;
  readonly state: 'confirmed';
  readonly observedAt: string;
  readonly itemCount: number;
}
export function parseKleinanzeigenSyncResult(
  value: unknown,
  scope: KleinanzeigenSyncRun,
): KleinanzeigenSyncResult | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'connectionId,generation,itemCount,observedAt,runId,state,workspaceId' ||
    value['workspaceId'] !== scope.workspaceId ||
    value['connectionId'] !== scope.connectionId ||
    value['runId'] !== scope.runId ||
    value['generation'] !== scope.generation ||
    value['state'] !== 'confirmed' ||
    typeof value['observedAt'] !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/u.test(value['observedAt']) ||
    !Number.isFinite(Date.parse(value['observedAt'])) ||
    typeof value['itemCount'] !== 'number' ||
    !Number.isSafeInteger(value['itemCount']) ||
    value['itemCount'] < 0 ||
    value['itemCount'] > 20000
  )
    return null;
  return Object.freeze({
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    runId: scope.runId,
    generation: scope.generation,
    state: 'confirmed',
    observedAt: value['observedAt'],
    itemCount: value['itemCount'],
  });
}

export type KleinanzeigenSyncFailure =
  | 'schema_changed'
  | 'needs_login'
  | 'interrupted'
  | 'account_changed'
  | 'unsupported'
  | 'access_revoked';
export interface KleinanzeigenAccount extends KleinanzeigenAccountScope {
  readonly externalAccountId: string;
  readonly displayName: string;
  readonly accountType: 'private' | 'commercial' | 'unknown';
  readonly status: 'needs_login' | 'connected' | 'disconnected';
  readonly lastSyncedAt: string | null;
  readonly listingCount: number | null;
  readonly activeCount: number | null;
  readonly quota: {
    readonly used: number;
    readonly observedAt: string;
    readonly source: 'account_settings';
  } | null;
  readonly localGrant: {
    readonly active: boolean;
    readonly canPublish: boolean;
    readonly generation: number;
    readonly expiresAt: string;
  } | null;
  readonly sync: {
    readonly runId: string;
    readonly state: 'queued' | 'reading' | 'confirmed' | 'failed' | 'cancelled';
    readonly errorCode: KleinanzeigenSyncFailure | null;
    readonly pageCount: number;
    readonly requestedAt: string;
    readonly completedAt: string | null;
  } | null;
}
export interface KleinanzeigenAccounts {
  readonly workspaceId: string;
  readonly canManage: boolean;
  readonly accounts: readonly KleinanzeigenAccount[];
}
export interface KleinanzeigenPublication {
  readonly publicationId: string;
  readonly externalId: string;
  readonly title: string;
  readonly url: string;
  readonly state: 'active' | 'unknown' | 'processing';
  readonly available: boolean;
  readonly publishedAt: string | null;
  readonly observedAt: string;
}
export interface KleinanzeigenPublicationPage extends KleinanzeigenAccountScope {
  readonly snapshotAt: string | null;
  readonly items: readonly KleinanzeigenPublication[];
  readonly total: number | null;
  readonly nextId: string | null;
  readonly completeness: 'complete' | 'partial' | 'unknown';
}
const kleinanzeigenKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const kleinanzeigenDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT/u.test(value) &&
  Number.isFinite(Date.parse(value));
const kleinanzeigenNullableDate = (value: unknown): value is string | null =>
  value === null || kleinanzeigenDate(value);
const kleinanzeigenCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const kleinanzeigenNullableCount = (value: unknown): value is number | null =>
  value === null || kleinanzeigenCount(value);
const kleinanzeigenFailures: readonly string[] = [
  'schema_changed',
  'needs_login',
  'interrupted',
  'account_changed',
  'unsupported',
  'access_revoked',
];
function parseKleinanzeigenAccount(
  value: unknown,
  workspaceId: string,
): KleinanzeigenAccount | null {
  if (
    !kleinanzeigenRecord(value) ||
    !kleinanzeigenKeys(value, [
      'workspaceId',
      'connectionId',
      'externalAccountId',
      'displayName',
      'accountType',
      'status',
      'lastSyncedAt',
      'listingCount',
      'activeCount',
      'quota',
      'localGrant',
      'sync',
    ]) ||
    value['workspaceId'] !== workspaceId ||
    !kleinanzeigenConnectionId(value['connectionId']) ||
    !externalId(value['externalAccountId']) ||
    !text(value['displayName']) ||
    (value['accountType'] !== 'private' &&
      value['accountType'] !== 'commercial' &&
      value['accountType'] !== 'unknown') ||
    (value['status'] !== 'needs_login' &&
      value['status'] !== 'connected' &&
      value['status'] !== 'disconnected') ||
    !kleinanzeigenNullableDate(value['lastSyncedAt']) ||
    !kleinanzeigenNullableCount(value['listingCount']) ||
    !kleinanzeigenNullableCount(value['activeCount']) ||
    (value['lastSyncedAt'] === null &&
      (value['listingCount'] !== null || value['activeCount'] !== null))
  )
    return null;
  let quota: KleinanzeigenAccount['quota'] = null;
  const quotaValue = value['quota'];
  if (quotaValue !== null) {
    if (
      !kleinanzeigenRecord(quotaValue) ||
      !kleinanzeigenKeys(quotaValue, ['used', 'observedAt', 'source']) ||
      !kleinanzeigenCount(quotaValue['used']) ||
      !kleinanzeigenDate(quotaValue['observedAt']) ||
      quotaValue['source'] !== 'account_settings'
    )
      return null;
    quota = Object.freeze({
      used: quotaValue['used'],
      observedAt: quotaValue['observedAt'],
      source: 'account_settings',
    });
  }
  let localGrant: KleinanzeigenAccount['localGrant'] = null;
  const grant = value['localGrant'];
  if (grant !== null) {
    if (
      !kleinanzeigenRecord(grant) ||
      !kleinanzeigenKeys(grant, ['active', 'canPublish', 'generation', 'expiresAt']) ||
      typeof grant['active'] !== 'boolean' ||
      typeof grant['canPublish'] !== 'boolean' ||
      typeof grant['generation'] !== 'number' ||
      !Number.isSafeInteger(grant['generation']) ||
      grant['generation'] < 1 ||
      !kleinanzeigenDate(grant['expiresAt'])
    )
      return null;
    localGrant = Object.freeze({
      active: grant['active'],
      canPublish: grant['canPublish'],
      generation: grant['generation'],
      expiresAt: grant['expiresAt'],
    });
  }
  let sync: KleinanzeigenAccount['sync'] = null;
  const run = value['sync'];
  if (run !== null) {
    if (
      !kleinanzeigenRecord(run) ||
      !kleinanzeigenKeys(run, [
        'runId',
        'state',
        'errorCode',
        'pageCount',
        'requestedAt',
        'completedAt',
      ]) ||
      !kleinanzeigenConnectionId(run['runId']) ||
      typeof run['state'] !== 'string' ||
      !['queued', 'reading', 'confirmed', 'failed', 'cancelled'].includes(run['state']) ||
      !(
        run['errorCode'] === null ||
        (typeof run['errorCode'] === 'string' && kleinanzeigenFailures.includes(run['errorCode']))
      ) ||
      !kleinanzeigenCount(run['pageCount']) ||
      run['pageCount'] > 500 ||
      !kleinanzeigenDate(run['requestedAt']) ||
      !kleinanzeigenNullableDate(run['completedAt']) ||
      (run['state'] === 'confirmed' && (run['completedAt'] === null || run['errorCode'] !== null))
    )
      return null;
    sync = Object.freeze({
      runId: run['runId'],
      state: run['state'] as NonNullable<KleinanzeigenAccount['sync']>['state'],
      errorCode: run['errorCode'] as KleinanzeigenSyncFailure | null,
      pageCount: run['pageCount'],
      requestedAt: run['requestedAt'],
      completedAt: run['completedAt'],
    });
  }
  return Object.freeze({
    workspaceId,
    connectionId: value['connectionId'],
    externalAccountId: value['externalAccountId'],
    displayName: value['displayName'],
    accountType: value['accountType'],
    status: value['status'],
    lastSyncedAt: value['lastSyncedAt'],
    listingCount: value['listingCount'],
    activeCount: value['activeCount'],
    quota,
    localGrant,
    sync,
  });
}
export function parseKleinanzeigenAccounts(
  value: unknown,
  workspaceId: string,
): KleinanzeigenAccounts | null {
  if (
    !uuid.test(workspaceId) ||
    !kleinanzeigenRecord(value) ||
    !kleinanzeigenKeys(value, ['workspaceId', 'canManage', 'accounts']) ||
    value['workspaceId'] !== workspaceId ||
    typeof value['canManage'] !== 'boolean' ||
    !Array.isArray(value['accounts']) ||
    value['accounts'].length > 1000 ||
    (!value['canManage'] && value['accounts'].length)
  )
    return null;
  const accounts: KleinanzeigenAccount[] = [];
  const seen = new Set<string>();
  for (const raw of value['accounts']) {
    const account = parseKleinanzeigenAccount(raw, workspaceId);
    if (!account || seen.has(account.connectionId)) return null;
    seen.add(account.connectionId);
    accounts.push(account);
  }
  return Object.freeze({
    workspaceId,
    canManage: value['canManage'],
    accounts: Object.freeze(accounts),
  });
}
export function parseKleinanzeigenPublicationPage(
  value: unknown,
  scope: KleinanzeigenAccountScope,
  limit: number,
): KleinanzeigenPublicationPage | null {
  if (
    !kleinanzeigenRecord(value) ||
    !kleinanzeigenKeys(value, [
      'workspaceId',
      'connectionId',
      'snapshotAt',
      'items',
      'total',
      'nextId',
      'completeness',
    ]) ||
    value['workspaceId'] !== scope.workspaceId ||
    value['connectionId'] !== scope.connectionId ||
    !kleinanzeigenNullableDate(value['snapshotAt']) ||
    !Array.isArray(value['items']) ||
    value['items'].length > limit ||
    !kleinanzeigenNullableCount(value['total']) ||
    !(value['nextId'] === null || kleinanzeigenConnectionId(value['nextId'])) ||
    (value['completeness'] !== 'complete' &&
      value['completeness'] !== 'partial' &&
      value['completeness'] !== 'unknown') ||
    (value['completeness'] === 'complete' && value['total'] === null) ||
    (value['nextId'] !== null && (value['snapshotAt'] === null || value['items'].length === 0))
  )
    return null;
  const items: KleinanzeigenPublication[] = [];
  const ids = new Set<string>();
  const externalIds = new Set<string>();
  for (const item of value['items']) {
    if (
      !kleinanzeigenRecord(item) ||
      !kleinanzeigenKeys(item, [
        'publicationId',
        'externalId',
        'title',
        'url',
        'state',
        'available',
        'publishedAt',
        'observedAt',
      ]) ||
      !kleinanzeigenConnectionId(item['publicationId']) ||
      ids.has(item['publicationId']) ||
      !externalId(item['externalId']) ||
      externalIds.has(item['externalId']) ||
      typeof item['title'] !== 'string' ||
      !item['title'].trim() ||
      item['title'].length > 512 ||
      typeof item['url'] !== 'string' ||
      item['url'].length > 2048 ||
      (item['state'] !== 'active' &&
        item['state'] !== 'unknown' &&
        item['state'] !== 'processing') ||
      typeof item['available'] !== 'boolean' ||
      !kleinanzeigenNullableDate(item['publishedAt']) ||
      !kleinanzeigenDate(item['observedAt'])
    )
      return null;
    try {
      const url = new URL(item['url']);
      if (
        url.protocol !== 'https:' ||
        !['www.kleinanzeigen.de', 'kleinanzeigen.de'].includes(url.hostname) ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !new RegExp('^/s-anzeige/[^/]+/' + item['externalId'] + '-[0-9]+-[0-9]+$', 'u').test(
          url.pathname,
        )
      )
        return null;
    } catch {
      return null;
    }
    ids.add(item['publicationId']);
    externalIds.add(item['externalId']);
    items.push(
      Object.freeze({
        publicationId: item['publicationId'],
        externalId: item['externalId'],
        title: item['title'],
        url: item['url'],
        state: item['state'],
        available: item['available'],
        publishedAt: item['publishedAt'],
        observedAt: item['observedAt'],
      }),
    );
  }
  if (value['nextId'] !== null && items.at(-1)?.publicationId !== value['nextId']) return null;
  return Object.freeze({
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    snapshotAt: value['snapshotAt'],
    items: Object.freeze(items),
    total: value['total'],
    nextId: value['nextId'],
    completeness: value['completeness'],
  });
}

export interface KleinanzeigenPublicationsRequest extends KleinanzeigenAccountScope {
  readonly action: 'read_publications';
  readonly limit: number;
  readonly state: 'all' | 'active' | 'ended';
  readonly search: string;
  readonly afterId: string | null;
  readonly snapshotAt: string | null;
}

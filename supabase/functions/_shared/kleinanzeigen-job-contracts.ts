import type { KleinanzeigenDraftContent } from './kleinanzeigen-listing-contracts.ts';
export type KleinanzeigenJobState =
  | 'queued'
  | 'claimed'
  | 'writing'
  | 'confirmed'
  | 'failed'
  | 'outcome_unknown'
  | 'cancelled'
  | 'needs_user_action';
export interface KleinanzeigenJobScope {
  readonly workspaceId: string;
  readonly connectionId: string;
}
export interface KleinanzeigenJobPhoto {
  readonly imageId: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteSize: number;
  readonly sha256: string;
}
export interface KleinanzeigenJobSourcePhoto extends Omit<KleinanzeigenJobPhoto, 'sha256'> {
  readonly sortOrder: number;
}
export interface KleinanzeigenJobPreflight extends KleinanzeigenJobScope {
  readonly draftId: string;
  readonly draftRevision: number;
  readonly grantGeneration: number;
  readonly externalAccountId: string;
  readonly content: KleinanzeigenDraftContent;
  readonly images: readonly KleinanzeigenJobSourcePhoto[];
}
export interface KleinanzeigenJobSnapshot extends Omit<KleinanzeigenJobPreflight, 'images'> {
  readonly images: readonly KleinanzeigenJobPhoto[];
}
export interface KleinanzeigenListingJob extends KleinanzeigenJobScope {
  readonly id: string;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly grantGeneration: number;
  readonly requestedBy: string;
  readonly immutableSnapshot: KleinanzeigenJobSnapshot;
  readonly state: KleinanzeigenJobState;
  readonly version: number;
  readonly externalId: string | null;
  readonly providerState: 'active' | 'processing' | null;
  readonly verifiedAt: string | null;
  readonly errorCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export type KleinanzeigenUserJobRequest = KleinanzeigenJobScope &
  (
    | {
        readonly action: 'listing_enqueue';
        readonly draftId: string;
        readonly expectedRevision: number;
        readonly requestId: string;
      }
    | { readonly action: 'listing_status'; readonly jobId: string }
    | { readonly action: 'listing_reconcile'; readonly jobId: string }
    | { readonly action: 'listing_latest'; readonly draftId: string }
  );
export type KleinanzeigenFeeObservation = {
  readonly state: 'free' | 'paid' | 'unknown';
  readonly observedAt: string;
};
export type KleinanzeigenJobOutcome =
  | {
      readonly outcome: 'confirmed' | 'processing';
      readonly externalId: string;
      readonly externalAccountId: string;
      readonly providerState: 'active' | 'processing';
      readonly verifiedAt: string;
      readonly url: string;
    }
  | {
      readonly outcome: 'failed' | 'needs_user_action' | 'outcome_unknown';
      readonly errorCode: string;
    };
export type KleinanzeigenInstallJobRequest = KleinanzeigenJobScope & {
  readonly generation: number;
} & (
    | {
        readonly action: 'quota_observation';
        readonly jobId: string | null;
        readonly quota: {
          readonly externalAccountId: string;
          readonly accountType: 'private' | 'commercial';
          readonly used: number;
          readonly observedAt: string;
          readonly source: 'account_settings';
        };
      }
    | ({ readonly jobId: string; readonly claimToken: string } & (
        | { readonly action: 'job_claim' }
        | { readonly action: 'job_check' }
        | {
            readonly action: 'job_begin';
            readonly expectedVersion: number;
            readonly fee: KleinanzeigenFeeObservation;
          }
        | { readonly action: 'job_finish'; readonly result: KleinanzeigenJobOutcome }
        | { readonly action: 'job_photo'; readonly imageId: string }
      ))
  );
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value: unknown, names: readonly string[]): value is Record<string, unknown> =>
  record(value) &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9][0-9]{0,18}$/u.test(value) &&
  BigInt(value) <= 9223372036854775807n;
const external = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value);
const version = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT/u.test(value) &&
  Number.isFinite(Date.parse(value));
const scope = (value: Record<string, unknown>) =>
  uuid(value['workspaceId']) && id(value['connectionId']);
const name = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 255 &&
  !/[\u0000-\u001f]/u.test(value);
export function parseKleinanzeigenUserJobRequest(
  value: unknown,
): KleinanzeigenUserJobRequest | null {
  if (!record(value) || !scope(value)) return null;
  if (
    value['action'] === 'listing_latest' &&
    fields(value, ['action', 'workspaceId', 'connectionId', 'draftId']) &&
    uuid(value['draftId'])
  )
    return { ...value } as unknown as KleinanzeigenUserJobRequest;
  if (
    value['action'] === 'listing_enqueue' &&
    fields(value, [
      'action',
      'workspaceId',
      'connectionId',
      'draftId',
      'expectedRevision',
      'requestId',
    ]) &&
    uuid(value['draftId']) &&
    version(value['expectedRevision']) &&
    uuid(value['requestId'])
  )
    return { ...value } as unknown as KleinanzeigenUserJobRequest;
  if (
    ['listing_status', 'listing_reconcile'].includes(String(value['action'])) &&
    fields(value, ['action', 'workspaceId', 'connectionId', 'jobId']) &&
    id(value['jobId'])
  )
    return { ...value } as unknown as KleinanzeigenUserJobRequest;
  return null;
}
export function parseKleinanzeigenJobOutcome(value: unknown): KleinanzeigenJobOutcome | null {
  if (!record(value)) return null;
  if (
    ['failed', 'needs_user_action', 'outcome_unknown'].includes(String(value['outcome'])) &&
    fields(value, ['outcome', 'errorCode']) &&
    typeof value['errorCode'] === 'string' &&
    /^[a-z_]{1,80}$/u.test(value['errorCode'])
  )
    return { ...value } as unknown as KleinanzeigenJobOutcome;
  if (
    !fields(value, [
      'outcome',
      'externalId',
      'externalAccountId',
      'providerState',
      'verifiedAt',
      'url',
    ]) ||
    !['confirmed', 'processing'].includes(String(value['outcome'])) ||
    !external(value['externalId']) ||
    !external(value['externalAccountId']) ||
    value['providerState'] !== (value['outcome'] === 'confirmed' ? 'active' : 'processing') ||
    !date(value['verifiedAt']) ||
    typeof value['url'] !== 'string'
  )
    return null;
  try {
    const url = new URL(value['url']);
    if (
      url.protocol !== 'https:' ||
      !['www.kleinanzeigen.de', 'kleinanzeigen.de'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !new RegExp('^/s-anzeige/[^/]+/' + value['externalId'] + '-[0-9]+-[0-9]+$', 'u').test(
        url.pathname,
      )
    )
      return null;
  } catch {
    return null;
  }
  return { ...value } as unknown as KleinanzeigenJobOutcome;
}
export function parseKleinanzeigenInstallJobRequest(
  value: unknown,
): KleinanzeigenInstallJobRequest | null {
  if (!record(value) || !scope(value) || !version(value['generation'])) return null;
  const base = ['action', 'workspaceId', 'connectionId', 'generation'];
  if (value['action'] === 'quota_observation') {
    const quota = value['quota'];
    if (
      !fields(value, [...base, 'quota', 'jobId']) ||
      !(value['jobId'] === null || id(value['jobId'])) ||
      !fields(quota, ['externalAccountId', 'accountType', 'used', 'observedAt', 'source']) ||
      !external(quota['externalAccountId']) ||
      !['private', 'commercial'].includes(String(quota['accountType'])) ||
      typeof quota['used'] !== 'number' ||
      !Number.isSafeInteger(quota['used']) ||
      quota['used'] < 0 ||
      quota['used'] > 999999999 ||
      !date(quota['observedAt']) ||
      quota['source'] !== 'account_settings'
    )
      return null;
  } else {
    base.push('jobId', 'claimToken');
    if (!id(value['jobId']) || !hash(value['claimToken'])) return null;
    if (['job_claim', 'job_check'].includes(String(value['action']))) {
      if (!fields(value, base)) return null;
    } else if (value['action'] === 'job_begin') {
      if (
        !fields(value, [...base, 'expectedVersion', 'fee']) ||
        !version(value['expectedVersion']) ||
        !fields(value['fee'], ['state', 'observedAt']) ||
        !['free', 'paid', 'unknown'].includes(String(value['fee']['state'])) ||
        !date(value['fee']['observedAt'])
      )
        return null;
    } else if (value['action'] === 'job_finish') {
      if (!fields(value, [...base, 'result']) || !parseKleinanzeigenJobOutcome(value['result']))
        return null;
    } else if (value['action'] === 'job_photo') {
      if (!fields(value, [...base, 'imageId']) || !uuid(value['imageId'])) return null;
    } else return null;
  }
  return structuredClone(value) as unknown as KleinanzeigenInstallJobRequest;
}
type ReadContent = (value: unknown) => KleinanzeigenDraftContent | null;
function snapshotBase(
  value: unknown,
  expected: KleinanzeigenJobScope,
  read: ReadContent,
): value is Record<string, unknown> {
  if (
    !fields(value, [
      'workspaceId',
      'connectionId',
      'draftId',
      'draftRevision',
      'grantGeneration',
      'externalAccountId',
      'content',
      'images',
    ]) ||
    value['workspaceId'] !== expected.workspaceId ||
    value['connectionId'] !== expected.connectionId ||
    !uuid(value['draftId']) ||
    !version(value['draftRevision']) ||
    !version(value['grantGeneration']) ||
    !external(value['externalAccountId']) ||
    !Array.isArray(value['images']) ||
    value['images'].length < 1 ||
    value['images'].length > 20
  )
    return false;
  const content = read(value['content']);
  return (
    !!content &&
    content.priceCents % 100 === 0 &&
    content.priceCents <= 9999999900 &&
    content.categoryId !== null &&
    /^153(?:\/[a-z0-9_]+){1,5}$/u.test(content.categoryId) &&
    !!content.schemaRevision &&
    hash(content.schemaRevision) &&
    !!content.postalCode &&
    content.shippingPriceCents === null &&
    content.shippingType !== 'shipping' &&
    !!content.description.trim()
  );
}
function photos(
  value: readonly unknown[],
  scope: KleinanzeigenJobScope,
  draftId: string,
  source: boolean,
): boolean {
  const ids = new Set<string>();
  const paths = new Set<string>();
  let previous = -1;
  for (const photo of value) {
    if (
      !fields(photo, [
        'imageId',
        'storagePath',
        'fileName',
        'mimeType',
        'byteSize',
        source ? 'sortOrder' : 'sha256',
      ]) ||
      !uuid(photo['imageId']) ||
      ids.has(photo['imageId']) ||
      !name(photo['fileName']) ||
      typeof photo['storagePath'] !== 'string' ||
      paths.has(photo['storagePath']) ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(String(photo['mimeType'])) ||
      typeof photo['byteSize'] !== 'number' ||
      !Number.isSafeInteger(photo['byteSize']) ||
      photo['byteSize'] < 1 ||
      photo['byteSize'] > 12582912
    )
      return false;
    if (source) {
      if (
        typeof photo['sortOrder'] !== 'number' ||
        !Number.isSafeInteger(photo['sortOrder']) ||
        photo['sortOrder'] < previous ||
        !new RegExp(
          '^listings/' + scope.workspaceId + '/' + draftId + '/[a-f0-9-]+\\.(jpg|jpeg|png|webp)$',
          'u',
        ).test(photo['storagePath'])
      )
        return false;
      previous = photo['sortOrder'];
    } else {
      const ext =
        photo['mimeType'] === 'image/jpeg'
          ? 'jpg'
          : photo['mimeType'] === 'image/png'
            ? 'png'
            : 'webp';
      const uuidPath = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
      if (
        !hash(photo['sha256']) ||
        !new RegExp(
          '^kleinanzeigen-jobs/' +
            scope.workspaceId +
            '/' +
            uuidPath +
            '/' +
            uuidPath +
            '/' +
            photo['imageId'] +
            '\\.' +
            ext +
            '$',
          'u',
        ).test(photo['storagePath'])
      )
        return false;
    }
    ids.add(photo['imageId']);
    paths.add(photo['storagePath']);
  }
  return true;
}
export function parseKleinanzeigenJobPreflight(
  value: unknown,
  expected: KleinanzeigenJobScope,
  read: ReadContent,
): KleinanzeigenJobPreflight | null {
  return snapshotBase(value, expected, read) &&
    photos(value['images'] as unknown[], expected, value['draftId'] as string, true)
    ? (structuredClone(value) as unknown as KleinanzeigenJobPreflight)
    : null;
}
export function parseKleinanzeigenListingJob(
  value: unknown,
  expected: KleinanzeigenJobScope,
  read: ReadContent,
  now = Date.now(),
): KleinanzeigenListingJob | null {
  if (
    !fields(value, [
      'id',
      'workspaceId',
      'connectionId',
      'draftId',
      'draftRevision',
      'grantGeneration',
      'requestedBy',
      'immutableSnapshot',
      'state',
      'version',
      'externalId',
      'providerState',
      'verifiedAt',
      'errorCode',
      'createdAt',
      'updatedAt',
    ]) ||
    !scope(value) ||
    value['workspaceId'] !== expected.workspaceId ||
    value['connectionId'] !== expected.connectionId ||
    !id(value['id']) ||
    !uuid(value['draftId']) ||
    !version(value['draftRevision']) ||
    !version(value['grantGeneration']) ||
    !uuid(value['requestedBy']) ||
    !version(value['version']) ||
    ![
      'queued',
      'claimed',
      'writing',
      'confirmed',
      'failed',
      'outcome_unknown',
      'cancelled',
      'needs_user_action',
    ].includes(String(value['state'])) ||
    !(
      value['errorCode'] === null ||
      (typeof value['errorCode'] === 'string' && /^[a-z_]{1,80}$/u.test(value['errorCode']))
    ) ||
    !date(value['createdAt']) ||
    !date(value['updatedAt']) ||
    Date.parse(value['updatedAt']) < Date.parse(value['createdAt']) ||
    Date.parse(value['updatedAt']) > now + 5000
  )
    return null;
  const snapshot = value['immutableSnapshot'];
  if (
    !snapshotBase(snapshot, expected, read) ||
    snapshot['draftId'] !== value['draftId'] ||
    snapshot['draftRevision'] !== value['draftRevision'] ||
    snapshot['grantGeneration'] !== value['grantGeneration'] ||
    !photos(snapshot['images'] as unknown[], expected, value['draftId'], false)
  )
    return null;
  if (value['externalId'] === null) {
    if (
      value['providerState'] !== null ||
      value['verifiedAt'] !== null ||
      value['state'] === 'confirmed'
    )
      return null;
  } else if (
    !['writing', 'outcome_unknown', 'confirmed'].includes(String(value['state'])) ||
    !external(value['externalId']) ||
    !['active', 'processing'].includes(String(value['providerState'])) ||
    !date(value['verifiedAt']) ||
    Date.parse(value['verifiedAt']) > now + 5000 ||
    (value['state'] === 'confirmed' && value['providerState'] !== 'active') ||
    (value['state'] !== 'confirmed' && value['providerState'] === 'active')
  )
    return null;
  return structuredClone(value) as unknown as KleinanzeigenListingJob;
}

export function parseKleinanzeigenJobPhotoDescriptor(
  value: unknown,
  expected: KleinanzeigenJobScope & { readonly jobId: string; readonly imageId: string },
): {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly jobId: string;
  readonly image: KleinanzeigenJobPhoto;
} | null {
  if (
    !fields(value, ['workspaceId', 'connectionId', 'jobId', 'image']) ||
    value['workspaceId'] !== expected.workspaceId ||
    value['connectionId'] !== expected.connectionId ||
    value['jobId'] !== expected.jobId ||
    !record(value['image']) ||
    value['image']['imageId'] !== expected.imageId ||
    !photos([value['image']], expected, '', false)
  )
    return null;
  return structuredClone(value) as unknown as {
    workspaceId: string;
    connectionId: string;
    jobId: string;
    image: KleinanzeigenJobPhoto;
  };
}

export function parseKleinanzeigenInstallJobReply(
  value: unknown,
  input: Exclude<KleinanzeigenInstallJobRequest, { action: 'job_photo' }>,
  read: ReadContent,
  now = Date.now(),
): Readonly<Record<string, unknown>> | KleinanzeigenListingJob | KleinanzeigenQuotaResult | null {
  if (!record(value)) return null;
  if (input.action === 'quota_observation')
    return parseKleinanzeigenQuotaResult(
      value,
      {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        externalAccountId: input.quota.externalAccountId,
        generation: input.generation,
        accountType: input.quota.accountType,
      },
      now,
    );
  const jobFields = [
    'id',
    'workspaceId',
    'connectionId',
    'draftId',
    'draftRevision',
    'grantGeneration',
    'requestedBy',
    'immutableSnapshot',
    'state',
    'version',
    'externalId',
    'providerState',
    'verifiedAt',
    'errorCode',
    'createdAt',
    'updatedAt',
  ];
  const scoped = (raw: unknown) => {
    const job = parseKleinanzeigenListingJob(raw, input, read, now);
    return job && job.id === input.jobId && job.grantGeneration === input.generation ? job : null;
  };
  if (input.action === 'job_claim') {
    if (!fields(value, [...jobFields, 'claimToken', 'leaseUntil', 'absoluteExpiresAt']))
      return null;
    const job = scoped(Object.fromEntries(jobFields.map((key) => [key, value[key]])));
    if (!job || !['claimed', 'writing', 'outcome_unknown', 'needs_user_action'].includes(job.state))
      return null;
    if (job.state === 'needs_user_action') {
      if (
        value['claimToken'] !== null ||
        value['leaseUntil'] !== null ||
        value['absoluteExpiresAt'] !== null
      )
        return null;
    } else if (
      value['claimToken'] !== input.claimToken ||
      !(value['leaseUntil'] === null || date(value['leaseUntil'])) ||
      !date(value['absoluteExpiresAt']) ||
      (job.state === 'claimed' &&
        (!date(value['leaseUntil']) ||
          Date.parse(value['leaseUntil']) <= now ||
          Date.parse(value['leaseUntil']) > Date.parse(value['absoluteExpiresAt']) ||
          Date.parse(value['absoluteExpiresAt']) > now + 905000))
    )
      return null;
    return structuredClone(value);
  }
  if (input.action === 'job_check') {
    if (
      !fields(value, ['active', 'generation', 'version', 'leaseUntil']) ||
      typeof value['active'] !== 'boolean' ||
      value['generation'] !== input.generation ||
      !version(value['version']) ||
      !(value['leaseUntil'] === null || date(value['leaseUntil'])) ||
      (value['active'] &&
        (!date(value['leaseUntil']) ||
          Date.parse(value['leaseUntil']) <= now ||
          Date.parse(value['leaseUntil']) > now + 125000))
    )
      return null;
    return structuredClone(value);
  }
  if (input.action === 'job_begin') {
    if (!fields(value, ['authorized', 'reason', 'job']) || typeof value['authorized'] !== 'boolean')
      return null;
    const job = scoped(value['job']);
    if (!job) return null;
    if (value['authorized']) {
      if (
        value['reason'] !== null ||
        job.state !== 'writing' ||
        job.version !== input.expectedVersion + 1
      )
        return null;
    } else if (typeof value['reason'] !== 'string' || !/^[a-z_]{1,80}$/u.test(value['reason']))
      return null;
    return { authorized: value['authorized'], reason: value['reason'], job };
  }
  if (input.action !== 'job_finish') return null;
  const job = scoped(value);
  if (!job) return null;
  const result = input.result;
  if (result.outcome === 'confirmed' || result.outcome === 'processing') {
    if (
      job.externalId !== result.externalId ||
      job.providerState !== result.providerState ||
      job.verifiedAt === null ||
      Date.parse(job.verifiedAt) !== Date.parse(result.verifiedAt) ||
      job.state !== (result.outcome === 'confirmed' ? 'confirmed' : 'writing')
    )
      return null;
  } else if (
    !('errorCode' in result) ||
    !['failed', 'needs_user_action', 'outcome_unknown'].includes(job.state) ||
    job.errorCode !== result.errorCode
  )
    return null;
  return job;
}

export interface KleinanzeigenQuotaResult extends KleinanzeigenJobScope {
  readonly externalAccountId: string;
  readonly generation: number;
  readonly expiresAt: string;
  readonly canPublish: boolean;
  readonly quota: {
    readonly used: number | null;
    readonly observedAt: string | null;
    readonly reserved: number;
    readonly allowed: boolean;
    readonly reason: 'quota_unknown' | 'quota_exhausted' | null;
  };
}
export function parseKleinanzeigenQuotaResult(
  value: unknown,
  expected: KleinanzeigenJobScope & {
    readonly externalAccountId: string;
    readonly generation: number;
    readonly accountType: 'private' | 'commercial' | 'unknown';
  },
  now = Date.now(),
): KleinanzeigenQuotaResult | null {
  if (
    !fields(value, [
      'workspaceId',
      'connectionId',
      'externalAccountId',
      'generation',
      'expiresAt',
      'canPublish',
      'quota',
    ]) ||
    value['workspaceId'] !== expected.workspaceId ||
    value['connectionId'] !== expected.connectionId ||
    value['externalAccountId'] !== expected.externalAccountId ||
    value['generation'] !== expected.generation ||
    !date(value['expiresAt']) ||
    Date.parse(value['expiresAt']) <= now ||
    typeof value['canPublish'] !== 'boolean' ||
    !fields(value['quota'], ['used', 'observedAt', 'reserved', 'allowed', 'reason'])
  )
    return null;
  const quota = value['quota'];
  if (
    !(
      quota['used'] === null ||
      (typeof quota['used'] === 'number' &&
        Number.isSafeInteger(quota['used']) &&
        quota['used'] >= 0)
    ) ||
    !(quota['observedAt'] === null || date(quota['observedAt'])) ||
    typeof quota['reserved'] !== 'number' ||
    !Number.isSafeInteger(quota['reserved']) ||
    quota['reserved'] < 0 ||
    typeof quota['allowed'] !== 'boolean' ||
    ![null, 'quota_unknown', 'quota_exhausted'].includes(
      quota['reason'] as null | 'quota_unknown' | 'quota_exhausted',
    )
  )
    return null;
  if (
    quota['allowed'] &&
    (quota['reason'] !== null ||
      expected.accountType !== 'private' ||
      quota['used'] === null ||
      quota['used'] + quota['reserved'] >= 100 ||
      !date(quota['observedAt']) ||
      Date.parse(quota['observedAt']) < now - 60000 ||
      Date.parse(quota['observedAt']) > now + 5000)
  )
    return null;
  return structuredClone(value) as unknown as KleinanzeigenQuotaResult;
}

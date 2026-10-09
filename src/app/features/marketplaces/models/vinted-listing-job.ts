import { listingIdentifier } from './vinted-listing-draft';
import type { VintedListingLatePolicy } from './vinted-listing-schedule';

export type VintedListingExecutionMode = 'local' | 'cloud';
export type VintedListingJobAction = 'publish' | 'vinted_draft';
export type VintedListingJobState =
  | 'queued'
  | 'paused'
  | 'claimed'
  | 'writing'
  | 'confirmed'
  | 'failed'
  | 'outcome_unknown'
  | 'cancelled';

export interface VintedListingPermission {
  readonly allowed: boolean;
  readonly authorizationVersion: number;
  readonly executionMode: VintedListingExecutionMode;
}
export interface VintedListingJob {
  readonly id: string;
  readonly workspaceId: string;
  readonly connectionId: string | null;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly executionMode: VintedListingExecutionMode;
  readonly externalAccountId: string;
  readonly action: VintedListingJobAction;
  readonly state: VintedListingJobState;
  readonly version: number;
  readonly scheduledAt: string | null;
  readonly timeZone: string | null;
  readonly latePolicy: VintedListingLatePolicy;
  readonly errorCode: string | null;
  readonly externalId: string | null;
  readonly providerState: 'active' | 'draft' | 'processing' | null;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replacesJobId: string | null;
}
function invalid(): never {
  throw new Error(
    'Der Inseratauftrag konnte nicht sicher zugeordnet werden. Lade den Verlauf erneut.',
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    return invalid();
  return value;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return invalid();
  const date = value.slice(0, 10);
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return invalid();
  return value;
}
function accountIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,31}$/.test(value)) return invalid();
  return value;
}
function executionMode(value: unknown): VintedListingExecutionMode {
  if (value !== 'local' && value !== 'cloud') return invalid();
  return value;
}
export function parseVintedListingPermission(value: unknown): VintedListingPermission {
  const data = record(value);
  if (typeof data['allowed'] !== 'boolean') return invalid();
  return {
    allowed: data['allowed'],
    authorizationVersion: integer(data['authorizationVersion'], data['allowed'] ? 1 : 0),
    executionMode: executionMode(data['executionMode']),
  };
}
export function parseVintedListingJob(
  value: unknown,
  workspaceId: string,
  expectedDraftId?: string,
  expectedJobId?: string,
): VintedListingJob {
  const data = record(value);
  const id = listingIdentifier(data['id']);
  const draftId = listingIdentifier(data['draftId']);
  if (
    data['workspaceId'] !== workspaceId ||
    (expectedDraftId && draftId !== expectedDraftId) ||
    (expectedJobId && id !== expectedJobId)
  )
    return invalid();
  const connectionId = data['connectionId'];
  if (
    connectionId !== null &&
    (typeof connectionId !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(connectionId))
  )
    return invalid();
  const action = data['action'],
    state = data['state'];
  if (action !== 'publish' && action !== 'vinted_draft') return invalid();
  if (
    typeof state !== 'string' ||
    ![
      'queued',
      'paused',
      'claimed',
      'writing',
      'confirmed',
      'failed',
      'outcome_unknown',
      'cancelled',
    ].includes(state)
  )
    return invalid();
  const scheduledAt = data['scheduledAt'] === null ? null : timestamp(data['scheduledAt']);
  const timeZone = data['timeZone'];
  if ((scheduledAt === null) !== (timeZone === null)) return invalid();
  if (timeZone !== null) {
    if (typeof timeZone !== 'string' || !timeZone || /^[+-]/.test(timeZone)) return invalid();
    try {
      new Intl.DateTimeFormat('de-DE', { timeZone }).format();
    } catch {
      return invalid();
    }
  }
  const latePolicy = data['latePolicy'];
  if (latePolicy !== 'pause_after_30_minutes' && latePolicy !== 'publish_when_available')
    return invalid();
  const errorCode = data['errorCode'];
  if (errorCode !== null && (typeof errorCode !== 'string' || !/^[a-z_]{1,80}$/.test(errorCode)))
    return invalid();
  const externalId = data['externalId'] === null ? null : accountIdentifier(data['externalId']);
  const providerState = data['providerState'];
  if (
    providerState !== null &&
    providerState !== 'active' &&
    providerState !== 'draft' &&
    providerState !== 'processing'
  )
    return invalid();
  const verifiedAt = data['verifiedAt'] === null ? null : timestamp(data['verifiedAt']);
  if (
    state === 'confirmed' &&
    (externalId === null ||
      verifiedAt === null ||
      errorCode !== null ||
      (action === 'vinted_draft'
        ? providerState !== 'draft'
        : providerState !== 'active' && providerState !== 'processing'))
  )
    return invalid();
  return {
    id,
    workspaceId,
    connectionId,
    draftId,
    draftRevision: integer(data['draftRevision']),
    executionMode: executionMode(data['executionMode']),
    externalAccountId: accountIdentifier(data['externalAccountId']),
    action,
    state: state as VintedListingJobState,
    version: integer(data['version']),
    scheduledAt,
    timeZone: timeZone as string | null,
    latePolicy,
    errorCode,
    externalId,
    providerState,
    verifiedAt,
    createdAt: timestamp(data['createdAt']),
    updatedAt: timestamp(data['updatedAt']),
    replacesJobId: data['replacesJobId'] === null ? null : listingIdentifier(data['replacesJobId']),
  };
}
export function vintedListingJobLabel(job: VintedListingJob): string {
  switch (job.state) {
    case 'queued':
      return job.action === 'publish' ? 'Veröffentlichung beauftragt' : 'Vinted-Entwurf beauftragt';
    case 'paused':
      return 'Planung angehalten';
    case 'claimed':
      return 'Wird vorbereitet';
    case 'writing':
      return 'Wird bei Vinted gespeichert';
    case 'confirmed':
      return job.providerState === 'draft'
        ? 'Vinted-Entwurf angelegt'
        : job.providerState === 'processing'
          ? 'Vinted prüft Dein Inserat'
          : 'Veröffentlicht';
    case 'failed':
      return 'Fehlgeschlagen';
    case 'outcome_unknown':
      return 'Ergebnis unklar';
    case 'cancelled':
      return 'Abgebrochen';
  }
}

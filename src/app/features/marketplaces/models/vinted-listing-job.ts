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
  readonly relistEntryId?: string | null;
  readonly relistDeletedAt?: string | null;
  readonly relistDelaySeconds?: number;
  readonly relistExternalId?: string | null;
  readonly itemTitle?: string;
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
  const relistExternalId = data['relistExternalId'];
  const relistEntryId = data['relistEntryId'];
  if (
    relistEntryId != null &&
    (typeof relistEntryId !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(relistEntryId))
  )
    return invalid();
  if (
    relistExternalId != null &&
    (typeof relistExternalId !== 'string' || !/^[1-9][0-9]{0,31}$/.test(relistExternalId))
  )
    return invalid();
  const itemTitle = data['itemTitle'];
  if (itemTitle != null && typeof itemTitle !== 'string') return invalid();
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
    relistEntryId: typeof relistEntryId === 'string' ? relistEntryId : null,
    relistDeletedAt: data['relistDeletedAt'] == null ? null : timestamp(data['relistDeletedAt']),
    relistDelaySeconds:
      data['relistDelaySeconds'] == null ? 0 : integer(data['relistDelaySeconds'], 0),
    relistExternalId: relistExternalId as string | null | undefined,
    itemTitle: typeof itemTitle === 'string' ? itemTitle : undefined,
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
/** Die native Erstellungskennung ist bekannt; ein begrenzter Nachabgleich läuft noch. */
export function isVintedListingConfirmationPending(
  job: VintedListingJob,
  now = Date.now(),
): boolean {
  const updatedAt = Date.parse(job.updatedAt);
  return (
    job.state === 'outcome_unknown' &&
    job.action === 'publish' &&
    job.executionMode === 'cloud' &&
    job.externalId !== null &&
    job.externalId !== job.relistExternalId &&
    [
      'provider_unconfirmed_save_navigation',
      'provider_unconfirmed_saved_navigation',
      'provider_unconfirmed_saved_form',
      'provider_unconfirmed_active_navigation',
      'provider_unconfirmed_active_filter',
      'provider_unconfirmed_active_loading',
      'provider_unconfirmed_active_evidence',
    ].includes(job.errorCode ?? '') &&
    Number.isFinite(now) &&
    Number.isFinite(updatedAt) &&
    updatedAt <= now + 60_000 &&
    now - updatedAt < 120_000
  );
}

export function vintedListingJobLabel(job: VintedListingJob, now = Date.now()): string {
  if (isVintedListingConfirmationPending(job, now)) return 'Veröffentlichung wird geprüft …';
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
      if (job.errorCode === 'category_unavailable')
        return 'Vinted-Kategorie konnte nicht geladen werden';
      if (job.errorCode === 'provider_unavailable') return 'Vorbereitung bei Vinted fehlgeschlagen';
      return 'Fehlgeschlagen';
    case 'outcome_unknown':
      return 'Ergebnis unklar';
    case 'cancelled':
      return 'Abgebrochen';
  }
}

/** Tatsächlicher Relist-Zustand; die Wartezeit beginnt erst mit belegter Löschung. */
export function vintedRelistingJobLabel(job: VintedListingJob, now: number): string {
  if (job.errorCode === 'editing') return 'Wird bearbeitet';
  if (job.state === 'claimed') return 'Wird vorbereitet';
  if (job.state === 'writing') return job.relistDeletedAt ? 'Wird inseriert' : 'Wird vorbereitet';
  if (job.state !== 'queued') return vintedListingJobLabel(job, now);
  if (!job.relistDeletedAt) return 'Wird vorbereitet';
  if (!job.scheduledAt) return 'Wartet auf den Start';
  const remaining = Date.parse(job.scheduledAt) - now;
  if (remaining <= 0) return 'Wartet auf den Start';
  if (remaining < 60_000) return 'Wird in weniger als einer Minute relistet';
  const minutes = Math.ceil(remaining / 60_000);
  return `Wird in ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'} relistet`;
}

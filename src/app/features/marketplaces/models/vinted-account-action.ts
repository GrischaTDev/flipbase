import { actionPreviewImageUrl } from './action-preview-image';
import type { AccountScope } from './marketplace.models';

export const vintedAccountActionKinds = [
  'price_save',
  'listing_delete',
  'listing_edit_read',
  'listing_content_read',
  'listing_category_read',
  'conversations_read',
  'shipping_label_request',
  'profile_details_read',
  'profile_cities_read',
  'profile_details_save',
  'profile_edit_read',
  'profile_edit_save',
  'listing_edit_save',
  'listing_content_save',
  'listing_edit_intent',
  'outcome_reconcile',
  'cloud_setup_open',
  'cloud_session_open',
] as const;
export type VintedAccountActionKind = (typeof vintedAccountActionKinds)[number];
const backgroundActionKinds: ReadonlySet<VintedAccountActionKind> = new Set([
  'listing_edit_read',
  'listing_content_read',
  'listing_category_read',
  'conversations_read',
  'profile_details_read',
  'profile_cities_read',
  'profile_edit_read',
  'outcome_reconcile',
]);

/** Diese Schritte gehören zur Hauptaktion und bleiben in der technischen Warteschlange. */
export function isVisibleVintedAccountAction(kind: VintedAccountActionKind): boolean {
  return !backgroundActionKinds.has(kind);
}
export type VintedAccountActionState =
  'queued' | 'running' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled';
export interface VintedAccountAction extends AccountScope {
  readonly id: string;
  readonly requestId: string;
  readonly entryId: string | null;
  readonly title: string | null;
  /** Bild des betroffenen Inserats oder Gesprächs, falls gespeichert. */
  readonly imageUrl?: string | null;
  readonly kind: VintedAccountActionKind;
  readonly state: VintedAccountActionState;
  readonly version: number;
  readonly waitReason:
    'account_busy' | 'pool_busy' | 'dependency_unresolved' | 'account_paused' | null;
  readonly errorCode: string | null;
  readonly result: unknown;
  readonly blockedByActionId: string | null;
  readonly historyPurged: boolean;
  readonly resultExpired: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}
const identifier = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const states: readonly string[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'outcome_unknown',
  'cancelled',
];
const kinds: readonly string[] = vintedAccountActionKinds;
const waitReasons: readonly unknown[] = [
  null,
  'account_busy',
  'pool_busy',
  'dependency_unresolved',
  'account_paused',
];
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export function parseVintedAccountAction(value: unknown, scope: AccountScope): VintedAccountAction {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Ungültiger Aktionsstatus.');
  const row = value as Record<string, unknown>;
  const id = row['id'],
    requestId = row['requestId'],
    kind = row['kind'],
    state = row['state'];
  const version = row['version'],
    waitReason = row['waitReason'],
    errorCode = row['errorCode'];
  const blockedByActionId = row['blockedByActionId'],
    createdAt = row['createdAt'],
    updatedAt = row['updatedAt'];
  const entryId = row['entryId'],
    title = row['title'];
  const startedAt = row['startedAt'],
    finishedAt = row['finishedAt'];
  if (
    row['workspaceId'] !== scope.workspaceId ||
    row['connectionId'] !== scope.connectionId ||
    typeof id !== 'string' ||
    !identifier.test(id) ||
    typeof requestId !== 'string' ||
    !identifier.test(requestId) ||
    typeof kind !== 'string' ||
    !kinds.includes(kind) ||
    typeof state !== 'string' ||
    !states.includes(state) ||
    typeof version !== 'number' ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !waitReasons.includes(waitReason) ||
    (errorCode !== null && typeof errorCode !== 'string') ||
    (blockedByActionId !== null &&
      (typeof blockedByActionId !== 'string' || !identifier.test(blockedByActionId))) ||
    (entryId !== null && (typeof entryId !== 'string' || !identifier.test(entryId))) ||
    (title !== null && typeof title !== 'string') ||
    typeof row['historyPurged'] !== 'boolean' ||
    typeof row['resultExpired'] !== 'boolean' ||
    !Object.hasOwn(row, 'result') ||
    !timestamp(createdAt) ||
    !timestamp(updatedAt) ||
    (startedAt !== null && !timestamp(startedAt)) ||
    (finishedAt !== null && !timestamp(finishedAt))
  )
    throw new Error('Der Aktionsstatus passt nicht zum gewählten Konto.');
  return {
    ...scope,
    id,
    requestId,
    entryId,
    title,
    imageUrl: actionPreviewImageUrl(row['imageUrl']),
    kind: kind as VintedAccountActionKind,
    state: state as VintedAccountActionState,
    version,
    waitReason: waitReason as VintedAccountAction['waitReason'],
    errorCode,
    result: row['result'],
    blockedByActionId,
    historyPurged: row['historyPurged'],
    resultExpired: row['resultExpired'],
    createdAt,
    updatedAt,
    startedAt,
    finishedAt,
  };
}

export function vintedAccountActionTitle(kind: VintedAccountActionKind): string {
  const labels: Record<VintedAccountActionKind, string> = {
    price_save: 'Preisänderung',
    listing_delete: 'Inserat löschen',
    listing_edit_read: 'Inserat lesen',
    listing_content_read: 'Inserat lesen',
    listing_category_read: 'Kategorieauswahl laden',
    conversations_read: 'Gespräch aktualisieren',
    shipping_label_request: 'Versandschein abrufen',
    profile_details_read: 'Profil laden',
    profile_cities_read: 'Stadt suchen',
    profile_details_save: 'Profil ändern',
    profile_edit_read: 'Profil laden',
    profile_edit_save: 'Profil ändern',
    listing_edit_save: 'Inserat bearbeiten',
    listing_content_save: 'Inserat bearbeiten',
    listing_edit_intent: 'Inserat bearbeiten',
    outcome_reconcile: 'Ergebnis nachprüfen',
    cloud_setup_open: 'Vinted-Anmeldung vorbereiten',
    cloud_session_open: 'Vinted-Anmeldung vorbereiten',
  };
  return labels[kind];
}
export function vintedAccountActionStatus(action: VintedAccountAction): string {
  if (action.state === 'queued') {
    if (action.waitReason === 'account_busy') return 'Wartet · Konto ist beschäftigt';
    if (action.waitReason === 'pool_busy') return 'Wartet · Alle Browserplätze sind belegt';
    if (action.waitReason === 'dependency_unresolved')
      return 'Wartet · Vorherige Änderung muss geprüft werden';
    if (action.waitReason === 'account_paused') return 'Wartet · Konto benötigt Deine Anmeldung';
    return 'Wartet';
  }
  if (action.state === 'failed') {
    if (
      action.result &&
      typeof action.result === 'object' &&
      'status' in action.result &&
      action.result.status === 'conflict'
    )
      return action.kind.startsWith('profile_')
        ? 'Dein Profil wurde inzwischen bei Vinted geändert. Lade die aktuellen Angaben und prüfe Deine Änderung.'
        : 'Das Inserat wurde inzwischen bei Vinted geändert. Lade die aktuellen Angaben und prüfe Deine Änderung.';
    if (action.errorCode === 'invalid_payload')
      return 'Prüfe die Angaben. Die Aktion wurde nicht ausgeführt.';
    if (action.errorCode === 'authorization_revoked')
      return 'Du darfst diese Aktion für das Konto nicht mehr ausführen.';
    if (action.errorCode === 'browser_unavailable')
      return 'Der Cloud-Browser konnte nicht gestartet werden. Versuche es erneut.';
    if (action.errorCode === 'login_required' || action.errorCode === 'challenge_required')
      return 'Melde Dich für dieses Konto erneut bei Vinted an.';
  }
  return {
    running: 'Wird ausgeführt',
    succeeded: 'Erledigt',
    failed: 'Fehlgeschlagen',
    outcome_unknown: 'Ergebnis unklar',
    cancelled: 'Abgebrochen',
  }[action.state];
}

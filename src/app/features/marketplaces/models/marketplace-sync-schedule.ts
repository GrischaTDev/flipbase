import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';

export type MarketplaceSyncInterval = 5 | 10 | 15;
export const MARKETPLACE_SYNC_PAUSE_LABELS = {
  needs_login: 'Vinted verlangt eine neue Anmeldung. Öffne die Vinted-Anmeldung für dieses Konto.',
  forbidden: 'Vinted hat den Abruf abgelehnt. Prüfe die Kontoverbindung.',
  challenge:
    'Vinted verlangt eine zusätzliche Prüfung. Öffne die Vinted-Anmeldung für dieses Konto.',
  rate_limited: 'Der Anbieter verlangt eine Wartezeit. Der nächste Abruf wartet.',
  network: 'Die Verbindung zum Anbieter ist unterbrochen. Der nächste Versuch wartet.',
  server: 'Der Anbieter ist vorübergehend nicht verfügbar. Der nächste Versuch wartet.',
  retry_limit:
    'Mehrere Abrufversuche sind fehlgeschlagen. Prüfe die Verbindung und aktiviere den Abruf danach erneut.',
  access_revoked:
    'Die Freigabe wurde entzogen. Aktiviere den Abruf mit Deinen aktuellen Rechten erneut.',
  cleanup: 'Die vorherige Browsersitzung muss zuerst sicher beendet werden.',
  interrupted: 'Der Browserdienst wurde unterbrochen. Der nächste Versuch wartet.',
} as const;
export type MarketplaceSyncPauseReason = keyof typeof MARKETPLACE_SYNC_PAUSE_LABELS;

export interface MarketplaceSyncSchedule extends AccountScope {
  readonly enabled: boolean;
  readonly intervalMinutes: MarketplaceSyncInterval;
  readonly nextDueAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly pausedReason: MarketplaceSyncPauseReason | null;
  readonly retryAfter: string | null;
  readonly authorizationVersion: number;
}

export interface ScheduledSyncAvailability {
  readonly enabled: boolean;
  readonly allowedIntervals: readonly MarketplaceSyncInterval[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new MarketplaceResponseError();
  return value;
}

export function parseMarketplaceSyncSchedule(
  value: unknown,
  scope: AccountScope,
): MarketplaceSyncSchedule {
  const item = record(value);
  if (
    !item ||
    item['workspaceId'] !== scope.workspaceId ||
    item['connectionId'] !== scope.connectionId ||
    typeof item['enabled'] !== 'boolean' ||
    ![5, 10, 15].includes(Number(item['intervalMinutes'])) ||
    typeof item['intervalMinutes'] !== 'number' ||
    typeof item['authorizationVersion'] !== 'number' ||
    !Number.isSafeInteger(item['authorizationVersion']) ||
    item['authorizationVersion'] < 0 ||
    (item['pausedReason'] !== null &&
      (typeof item['pausedReason'] !== 'string' ||
        !Object.hasOwn(MARKETPLACE_SYNC_PAUSE_LABELS, item['pausedReason'])))
  )
    throw new MarketplaceResponseError();
  return {
    ...scope,
    enabled: item['enabled'],
    intervalMinutes: item['intervalMinutes'] as MarketplaceSyncInterval,
    nextDueAt: timestamp(item['nextDueAt']),
    lastAttemptAt: timestamp(item['lastAttemptAt']),
    lastSuccessAt: timestamp(item['lastSuccessAt']),
    pausedReason: item['pausedReason'] as MarketplaceSyncPauseReason | null,
    retryAfter: timestamp(item['retryAfter']),
    authorizationVersion: item['authorizationVersion'],
  };
}

/** Freigabeversion 1 ist ausschließlich für den 15-Minuten-Pilot geprüft. */
export function parseScheduledSyncAvailability(value: unknown): ScheduledSyncAvailability {
  const item = record(value);
  const capability = record(item?.['scheduledSync']);
  if (
    item?.['ok'] === true &&
    item['readOnly'] === false &&
    item['apiVersion'] === 2 &&
    capability?.['enabled'] === true &&
    capability['authorizationVersion'] === 1 &&
    Array.isArray(capability['allowedIntervals']) &&
    capability['allowedIntervals'].length === 1 &&
    capability['allowedIntervals'][0] === 15
  )
    return { enabled: true, allowedIntervals: [15] };
  return { enabled: false, allowedIntervals: [] };
}

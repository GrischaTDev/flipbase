import type { BadgeTone } from '../../../shared/components/badge/badge.component';

export interface PlatformSystemHealth {
  readonly checkedAt: string;
  readonly marketplaceWorker: { readonly heartbeatAt: string; readonly expiresAt: string } | null;
  readonly feedBot: {
    readonly reportedAt: string;
    readonly requestsLastMinute: number;
    readonly rejectedLastMinute: number;
    readonly requestBudget: number;
    readonly lastCycleError: string | null;
    readonly vintedLastSuccessAt: string | null;
  } | null;
  readonly storage: {
    readonly reportedAt: string;
    readonly totalBytes: number;
    readonly usedBytes: number;
  } | null;
  readonly operationsLastHour: {
    readonly queued: number;
    readonly running: number;
    readonly succeeded: number;
    readonly failed: number;
  };
  readonly cloudIps: {
    readonly enabled: number;
    readonly expiringSoon: number;
    readonly expired: number;
  };
}

export interface HealthStatus {
  readonly label: string;
  readonly tone: BadgeTone;
}

/** Ein Dienst, der so lange nichts gemeldet hat, gilt als ausgefallen. */
export const SERVICE_STALE_AFTER_MS = 3 * 60 * 1000;
/** Der Speicherstand wird minütlich gemeldet; großzügiger, weil er nur informiert. */
export const STORAGE_STALE_AFTER_MS = 15 * 60 * 1000;

const OK: HealthStatus = { label: 'Läuft', tone: 'success' };
const NEVER: HealthStatus = { label: 'Keine Meldung', tone: 'neutral' };
const STALE: HealthStatus = { label: 'Meldet sich nicht', tone: 'critical' };

function ageMs(timestamp: string, now: number): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? now - parsed : Number.POSITIVE_INFINITY;
}

export function marketplaceWorkerStatus(health: PlatformSystemHealth, now: number): HealthStatus {
  const worker = health.marketplaceWorker;
  if (!worker) return NEVER;
  return ageMs(worker.heartbeatAt, now) <= SERVICE_STALE_AFTER_MS ? OK : STALE;
}

export function feedBotStatus(health: PlatformSystemHealth, now: number): HealthStatus {
  const bot = health.feedBot;
  if (!bot) return NEVER;
  if (ageMs(bot.reportedAt, now) > SERVICE_STALE_AFTER_MS) return STALE;
  if (bot.lastCycleError) return { label: 'Läuft mit Hinweis', tone: 'caution' };
  return OK;
}

export function storageUsedPercent(health: PlatformSystemHealth): number | null {
  const storage = health.storage;
  if (!storage || storage.totalBytes <= 0) return null;
  return Math.round((storage.usedBytes / storage.totalBytes) * 1000) / 10;
}

export function storageStatus(health: PlatformSystemHealth, now: number): HealthStatus {
  const percent = storageUsedPercent(health);
  if (percent === null || !health.storage) return NEVER;
  if (ageMs(health.storage.reportedAt, now) > STORAGE_STALE_AFTER_MS)
    return { label: 'Veraltet', tone: 'caution' };
  if (percent >= 90) return { label: 'Fast voll', tone: 'critical' };
  if (percent >= 80) return { label: 'Wird knapp', tone: 'caution' };
  return { label: 'Ausreichend', tone: 'success' };
}

export function operationsStatus(health: PlatformSystemHealth): HealthStatus {
  const operations = health.operationsLastHour;
  if (operations.failed === 0) return { label: 'Ohne Fehler', tone: 'success' };
  const failedShare = operations.failed / Math.max(1, operations.failed + operations.succeeded);
  return failedShare >= 0.25
    ? { label: 'Viele Fehler', tone: 'critical' }
    : { label: 'Einzelne Fehler', tone: 'caution' };
}

export function cloudIpStatus(health: PlatformSystemHealth): HealthStatus {
  const ips = health.cloudIps;
  if (ips.enabled === 0) return { label: 'Keine aktive IP', tone: 'caution' };
  if (ips.expiringSoon > 0) return { label: 'Läuft bald ab', tone: 'caution' };
  return { label: 'Bereit', tone: 'success' };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Übersetzt die Antwort von platform_system_health in das Oberflächenmodell. */
export function parsePlatformSystemHealth(value: unknown): PlatformSystemHealth {
  const root = record(value);
  if (!root) throw new Error('Der Systemzustand ist ungültig.');
  const worker = record(root['marketplaceWorker']);
  const bot = record(root['feedBot']);
  const storage = record(root['storage']);
  const operations = record(root['operationsLastHour']) ?? {};
  const ips = record(root['cloudIps']) ?? {};
  const workerHeartbeat = text(worker?.['heartbeatAt']);
  const botReported = text(bot?.['reportedAt']);
  const storageReported = text(storage?.['reportedAt']);
  return {
    checkedAt: text(root['checkedAt']) ?? '',
    marketplaceWorker:
      worker && workerHeartbeat
        ? { heartbeatAt: workerHeartbeat, expiresAt: text(worker['expiresAt']) ?? '' }
        : null,
    feedBot:
      bot && botReported
        ? {
            reportedAt: botReported,
            requestsLastMinute: count(bot['requestsLastMinute']),
            rejectedLastMinute: count(bot['rejectedLastMinute']),
            requestBudget: count(bot['requestBudget']),
            lastCycleError: text(bot['lastCycleError']),
            vintedLastSuccessAt: text(bot['vintedLastSuccessAt']),
          }
        : null,
    storage:
      storage && storageReported
        ? {
            reportedAt: storageReported,
            totalBytes: count(storage['totalBytes']),
            usedBytes: count(storage['usedBytes']),
          }
        : null,
    operationsLastHour: {
      queued: count(operations['queued']),
      running: count(operations['running']),
      succeeded: count(operations['succeeded']),
      failed: count(operations['failed']),
    },
    cloudIps: {
      enabled: count(ips['enabled']),
      expiringSoon: count(ips['expiringSoon']),
      expired: count(ips['expired']),
    },
  };
}

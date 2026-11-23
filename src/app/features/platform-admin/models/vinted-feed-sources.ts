import type { BadgeTone } from '../../../shared/components/badge/badge.component';

export type VintedFeedSourceKind = 'main' | 'category' | 'brand';
export type VintedFeedSourceCoverage = 'unknown' | 'initial' | 'caught_up' | 'limited';

/** Eine gemeinsame Abrufquelle der persönlichen Vinted-Feeds. */
export interface VintedFeedSource {
  key: string;
  kind: VintedFeedSourceKind;
  catalogId: number | null;
  categoryPath: string | null;
  feedCount: number;
  lastSuccessAt: string | null;
  coverage: VintedFeedSourceCoverage;
}

/** Auslastung und Einstellungen der gemeinsamen Vinted-Quellen. */
export interface VintedFeedCapacity {
  maxCategorySources: number;
  categoryPollIntervalSeconds: number;
  activeCategorySources: number;
  activeFeeds: number;
  requestsLastMinute: number | null;
  requestBudget: number | null;
  reportedAt: string | null;
  sources: VintedFeedSource[];
}

export interface VintedFeedSettings {
  maxCategorySources: number;
  categoryPollIntervalSeconds: number;
}

/** Stand des gespeicherten Vinted-Kategoriebaums. */
export interface VintedCategorySyncStatus {
  refreshedAt: string | null;
  requestedAt: string | null;
  lastAttemptAt: string | null;
  categoryCount: number;
  lastError: string | null;
}

export const VINTED_FEED_SETTING_LIMITS = {
  maxCategorySources: { min: 0, max: 500 },
  categoryPollIntervalSeconds: { min: 15, max: 3600 },
} as const;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function optionalCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

const COVERAGES: readonly VintedFeedSourceCoverage[] = [
  'unknown',
  'initial',
  'caught_up',
  'limited',
];

function parseSource(value: unknown, index: number): VintedFeedSource {
  const row = record(value);
  const kind: VintedFeedSourceKind =
    row['kind'] === 'category' ? 'category' : row['kind'] === 'brand' ? 'brand' : 'main';
  const coverage = COVERAGES.find((entry) => entry === row['coverage_status']) ?? 'unknown';
  const catalogId = optionalCount(row['catalog_id']);
  return {
    key: text(row['key']) ?? `${kind}-${catalogId ?? index}`,
    kind,
    catalogId,
    categoryPath: text(row['category_path']),
    feedCount: count(row['feed_count']),
    lastSuccessAt: text(row['last_success_at']),
    coverage,
  };
}

/** Liest die Antwort von `sniper_feed_capacity` defensiv ein. */
export function parseVintedFeedCapacity(value: unknown): VintedFeedCapacity {
  const data = record(value);
  const sources = Array.isArray(data['sources']) ? data['sources'] : [];
  return {
    maxCategorySources: count(data['max_category_sources']),
    categoryPollIntervalSeconds: count(data['category_poll_interval_seconds']),
    activeCategorySources: count(data['active_category_sources']),
    activeFeeds: count(data['active_feeds']),
    requestsLastMinute: optionalCount(data['requests_last_minute']),
    requestBudget: optionalCount(data['request_budget']),
    reportedAt: text(data['reported_at']),
    sources: sources.map(parseSource),
  };
}

export function sourceKindLabel(kind: VintedFeedSourceKind): string {
  if (kind === 'category') return 'Kategorie';
  if (kind === 'brand') return 'Marke';
  return 'Hauptquelle';
}

export function sourceCoverageStatus(coverage: VintedFeedSourceCoverage): {
  label: string;
  tone: BadgeTone;
} {
  if (coverage === 'caught_up') return { label: 'Aktuell', tone: 'success' };
  if (coverage === 'limited') return { label: 'Kommt nicht hinterher', tone: 'caution' };
  return { label: 'Unbekannt', tone: 'neutral' };
}

/** Kurze Altersangabe wie „vor 12 s“; ältere Zeitpunkte als Datum mit Uhrzeit. */
export function sourceAgeLabel(timestamp: string | null, now: number): string {
  if (!timestamp) return '—';
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return '—';
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return `vor ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);
}

/**
 * Zeitpunkt einer noch nicht abgearbeiteten Neu-Einlese-Anforderung, sonst null.
 * Abgearbeitet heißt: Der Dienst hat es seither versucht, gelungen oder gescheitert.
 */
export function pendingCategoryRefresh(status: VintedCategorySyncStatus | null): string | null {
  const requestedAt = status?.requestedAt ?? null;
  if (status === null || requestedAt === null) return null;
  const handled = Math.max(
    status.refreshedAt === null ? 0 : Date.parse(status.refreshedAt),
    status.lastAttemptAt === null ? 0 : Date.parse(status.lastAttemptAt),
  );
  return Date.parse(requestedAt) > handled ? requestedAt : null;
}

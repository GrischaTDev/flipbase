import { MarketplaceResponseError } from './marketplace-response';

export type VintedStatisticsRange = '24h' | '7d' | '30d';
export type VintedStatisticsMetric = 'views' | 'favorites';

export interface VintedStatisticsRequestScope {
  readonly workspaceId: string;
  /** `null` steht für alle Vinted-Konten des Workspace. */
  readonly connectionId: string | null;
}
export interface VintedStatisticsTotals {
  readonly views: number;
  readonly favorites: number;
}
export interface VintedStatisticsBucket extends VintedStatisticsTotals {
  readonly start: string;
}
export interface VintedStatisticsTopItem extends VintedStatisticsTotals {
  readonly id: string;
  readonly connectionId: string;
  readonly accountName: string;
  readonly entryId: string | null;
  readonly title: string;
  readonly imageUrl: string | null;
  readonly price: number | null;
  readonly currency: string;
  readonly removedAt: string | null;
  readonly totalViews: number | null;
  readonly totalFavorites: number | null;
}
export interface VintedStatisticsOverview extends VintedStatisticsRequestScope {
  readonly range: VintedStatisticsRange;
  readonly historyStartsAt: string | null;
  readonly activeCount: number;
  readonly totals: VintedStatisticsTotals;
  readonly previousTotals: VintedStatisticsTotals | null;
  readonly buckets: readonly VintedStatisticsBucket[];
  readonly topItems: readonly VintedStatisticsTopItem[];
}

export const VINTED_STATISTICS_RANGES: readonly {
  readonly value: VintedStatisticsRange;
  readonly label: string;
  readonly previousLabel: string;
}[] = [
  { value: '24h', label: '24 Stunden', previousLabel: 'den 24 Stunden davor' },
  { value: '7d', label: '7 Tage', previousLabel: 'den 7 Tagen davor' },
  { value: '30d', label: '30 Tage', previousLabel: 'den 30 Tagen davor' },
];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MarketplaceResponseError();
  return value as Record<string, unknown>;
}
function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new MarketplaceResponseError();
  return value;
}
function counter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new MarketplaceResponseError();
  return value;
}
function optionalCounter(value: unknown): number | null {
  return value === null || value === undefined ? null : counter(value);
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new MarketplaceResponseError();
  return value;
}
function optionalDate(value: unknown): string | null {
  return value === null || value === undefined ? null : date(value);
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new MarketplaceResponseError();
  return value;
}
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
function totals(value: unknown): VintedStatisticsTotals {
  const source = record(value);
  return { views: counter(source['views']), favorites: counter(source['favorites']) };
}

export function parseVintedStatisticsOverview(
  data: unknown,
  scope: VintedStatisticsRequestScope,
  range: VintedStatisticsRange,
): VintedStatisticsOverview {
  const response = record(data);
  if (
    response['workspaceId'] !== scope.workspaceId ||
    (response['connectionId'] ?? null) !== scope.connectionId ||
    response['period'] !== range
  )
    throw new MarketplaceResponseError();
  const ids = new Set<string>();
  const topItems = list(response['topItems']).map((value) => {
    const source = record(value);
    const id = text(source['id']);
    if (ids.has(id)) throw new MarketplaceResponseError();
    ids.add(id);
    const price = source['price'];
    if (price !== null && price !== undefined && (typeof price !== 'number' || price < 0))
      throw new MarketplaceResponseError();
    return {
      id,
      connectionId: text(source['connectionId']),
      accountName: text(source['accountName']),
      entryId: optionalText(source['entryId']),
      title: text(source['title']),
      imageUrl: optionalText(source['imageUrl']),
      price: typeof price === 'number' ? price : null,
      currency: optionalText(source['currency']) ?? 'EUR',
      removedAt: optionalDate(source['removedAt']),
      views: counter(source['views']),
      favorites: counter(source['favorites']),
      totalViews: optionalCounter(source['totalViews']),
      totalFavorites: optionalCounter(source['totalFavorites']),
    };
  });
  return {
    ...scope,
    range,
    historyStartsAt: optionalDate(response['historyStartsAt']),
    activeCount: counter(response['activeCount']),
    totals: totals(response['totals']),
    previousTotals:
      response['previousTotals'] === null || response['previousTotals'] === undefined
        ? null
        : totals(response['previousTotals']),
    buckets: list(response['buckets']).map((value) => {
      const source = record(value);
      return { start: date(source['start']), ...totals(source) };
    }),
    topItems,
  };
}

/** Stärkste Artikel der gewählten Kennzahl; Gleichstand entscheidet die andere Kennzahl. */
export function rankTopItems(
  items: readonly VintedStatisticsTopItem[],
  metric: VintedStatisticsMetric,
  limit = 25,
): readonly VintedStatisticsTopItem[] {
  const other: VintedStatisticsMetric = metric === 'views' ? 'favorites' : 'views';
  return items
    .filter((item) => item[metric] > 0)
    .sort(
      (left, right) =>
        right[metric] - left[metric] ||
        right[other] - left[other] ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

const zone = 'Europe/Berlin';
const hourFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: zone,
  hour: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: zone,
  day: '2-digit',
  month: '2-digit',
});
const weekdayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: zone, weekday: 'long' });
const countFormat = new Intl.NumberFormat('de-DE');

function hourOf(start: string): string {
  const hour = hourFormat.formatToParts(new Date(start)).find((part) => part.type === 'hour');
  return `${hour?.value ?? '00'} Uhr`;
}

export function formatBucketLabel(start: string, range: VintedStatisticsRange): string {
  return range === '24h' ? hourOf(start) : dayFormat.format(new Date(start));
}

export function formatBucketDescription(start: string, range: VintedStatisticsRange): string {
  const day = dayFormat.format(new Date(start));
  return range === '24h'
    ? `${day}, ${hourOf(start)}`
    : `${weekdayFormat.format(new Date(start))}, ${day}`;
}

export function describeChange(
  current: number,
  previous: number | null,
  range: VintedStatisticsRange,
): string {
  if (previous === null) return 'Noch kein Vergleich';
  const period = VINTED_STATISTICS_RANGES.find((option) => option.value === range)!.previousLabel;
  if (current === previous) return `Unverändert gegenüber ${period}`;
  if (previous === 0) return `+${countFormat.format(current)} gegenüber ${period}`;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return `Unverändert gegenüber ${period}`;
  return `${percent > 0 ? '+' : '−'}${countFormat.format(Math.abs(percent))} % gegenüber ${period}`;
}

export function formatCount(value: number | null): string {
  return value === null ? '—' : countFormat.format(value);
}

export function formatPrice(price: number | null, currency: string): string {
  if (price === null) return 'Preis unbekannt';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(price);
  } catch {
    return `${countFormat.format(price)} ${currency}`;
  }
}

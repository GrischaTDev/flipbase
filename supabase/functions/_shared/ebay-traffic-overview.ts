import type { EbayTrafficDay, EbayTrafficDays, EbayTrafficMetrics } from './ebay-contracts.ts';
import { EbayError, ebayJson, getEbayHosts, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';

export const ebayTrafficMetrics = {
  impressions: 'TOTAL_IMPRESSION_TOTAL',
  views: 'LISTING_VIEWS_TOTAL',
  externalViews: 'LISTING_VIEWS_SOURCE_OFF_EBAY',
  transactions: 'TRANSACTION',
  searchImpressions: 'LISTING_IMPRESSION_SEARCH_RESULTS_PAGE',
  searchViews: 'LISTING_VIEWS_SOURCE_SEARCH_RESULTS_PAGE',
  clickThroughRate: 'CLICK_THROUGH_RATE',
  conversionRate: 'SALES_CONVERSION_RATE',
} as const;

export function readTrafficMetricKeys(body: Record<string, unknown>): readonly unknown[] {
  const header = readRecord(body.header);
  if (
    !Array.isArray(header.dimensionKeys) ||
    header.dimensionKeys.length !== 1 ||
    typeof readRecord(header.dimensionKeys[0]).key !== 'string' ||
    !readRecord(header.dimensionKeys[0]).key ||
    !Array.isArray(header.metrics) ||
    !Array.isArray(body.records)
  )
    throw new EbayError('invalid_response');
  const keys = header.metrics.map((metric) => readRecord(metric).key);
  if (
    new Set(keys).size !== keys.length ||
    !Object.values(ebayTrafficMetrics).every((key) => keys.includes(key))
  )
    throw new EbayError('invalid_response');
  return keys;
}

export function readTrafficMetrics(
  row: Record<string, unknown>,
  keys: readonly unknown[],
): EbayTrafficMetrics {
  const values = row.metricValues;
  if (!Array.isArray(values) || values.length !== keys.length)
    throw new EbayError('invalid_response');
  const metric = (key: string): number | null => {
    const entry = readRecord(values[keys.indexOf(key)]);
    if (entry.applicable === false) return null;
    if (
      entry.applicable !== true ||
      typeof entry.value !== 'number' ||
      !Number.isFinite(entry.value) ||
      entry.value < 0
    )
      throw new EbayError('invalid_response');
    return entry.value;
  };
  return {
    impressions: metric(ebayTrafficMetrics.impressions),
    views: metric(ebayTrafficMetrics.views),
    externalViews: metric(ebayTrafficMetrics.externalViews),
    transactions: metric(ebayTrafficMetrics.transactions),
    searchImpressions: metric(ebayTrafficMetrics.searchImpressions),
    searchViews: metric(ebayTrafficMetrics.searchViews),
    clickThroughRate: metric(ebayTrafficMetrics.clickThroughRate),
    conversionRate: metric(ebayTrafficMetrics.conversionRate),
  };
}

export function getEbayTrafficPeriod(requestedDays: EbayTrafficDays) {
  const days = requireEbayTrafficDays(requestedDays);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function requireEbayTrafficDays(days: unknown): EbayTrafficDays {
  if (days !== 7 && days !== 30 && days !== 90) throw new EbayError('invalid_request');
  return days;
}

export function parseEbayTrafficDays(
  body: Record<string, unknown>,
  startDate: string,
  endDate: string,
): readonly EbayTrafficDay[] {
  const keys = readTrafficMetricKeys(body);
  if (!Array.isArray(body.records)) throw new EbayError('invalid_response');
  const rows = new Map<string, EbayTrafficDay>();
  for (const record of body.records) {
    const row = readRecord(record);
    if (
      !Array.isArray(row.dimensionValues) ||
      row.dimensionValues.length !== 1 ||
      !Array.isArray(row.metricValues) ||
      row.metricValues.length !== keys.length
    )
      throw new EbayError('invalid_response');
    const dimension = readRecord(row.dimensionValues[0]);
    const rawDate = dimension.value;
    if (dimension.applicable !== true || typeof rawDate !== 'string')
      throw new EbayError('invalid_response');
    // eBay liefert ISO-Daten oder ausgeschriebene Datumswerte mit Zeitzone.
    const dateText = /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;
    const timestamp = Date.parse(dateText);
    if (!Number.isFinite(timestamp)) throw new EbayError('invalid_response');
    const date = new Date(timestamp).toISOString().slice(0, 10);
    if (
      (/^\d{4}-\d{2}-\d{2}$/.test(dateText) && dateText !== date) ||
      date < startDate ||
      date > endDate ||
      rows.has(date)
    )
      throw new EbayError('invalid_response');
    rows.set(date, {
      date,
      ...readTrafficMetrics(row, keys),
    });
  }
  const days: EbayTrafficDay[] = [];
  for (
    const day = new Date(`${startDate}T00:00:00Z`);
    day.toISOString().slice(0, 10) <= endDate;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const date = day.toISOString().slice(0, 10);
    // Fehlende Tage sind unbekannt, kein erfundener Null-Traffic.
    days.push(
      rows.get(date) ?? {
        date,
        impressions: null,
        views: null,
        externalViews: null,
        transactions: null,
        searchImpressions: null,
        searchViews: null,
        clickThroughRate: null,
        conversionRate: null,
      },
    );
  }
  return days;
}

export async function readEbayTrafficOverview(
  config: EbayConfig,
  token: string,
  requestedDays: EbayTrafficDays,
  fetcher = fetch,
) {
  const { startDate, endDate } = getEbayTrafficPeriod(requestedDays);
  const current = await readEbayTrafficPeriod(config, token, startDate, endDate, fetcher);
  const previousEnd = new Date(`${startDate}T00:00:00Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - requestedDays + 1);
  try {
    const previousPeriod = await readEbayTrafficPeriod(
      config,
      token,
      previousStart.toISOString().slice(0, 10),
      previousEnd.toISOString().slice(0, 10),
      fetcher,
    );
    return { ...current, previousPeriod };
  } catch (error) {
    const isTransportError =
      error instanceof TypeError || error instanceof SyntaxError || error instanceof DOMException;
    if (
      !isTransportError &&
      (!(error instanceof EbayError) ||
        (error.code !== 'provider_unavailable' && error.code !== 'invalid_response'))
    )
      throw error;
    // Aktuelle Werte bleiben nutzbar, wenn eBay den Vergleich nicht liefern kann.
    console.warn(
      `eBay traffic comparison unavailable! Code=${error instanceof EbayError ? error.code : 'provider_unavailable'}`,
    );
    return { ...current, previousPeriod: null };
  }
}

async function readEbayTrafficPeriod(
  config: EbayConfig,
  token: string,
  startDate: string,
  endDate: string,
  fetcher: typeof fetch,
) {
  const url = new URL(`${getEbayHosts(config.environment).api}/sell/analytics/v1/traffic_report`);
  url.search = new URLSearchParams({
    dimension: 'DAY',
    filter: `marketplace_ids:{EBAY_DE},date_range:[${startDate}T00:00:00.000+00:00..${endDate}T23:59:59.000+00:00]`,
    metric: Object.values(ebayTrafficMetrics).join(','),
  }).toString();
  const body = await ebayJson(url.href, token, fetcher);
  return {
    startDate,
    endDate,
    lastUpdatedDate: typeof body.lastUpdatedDate === 'string' ? body.lastUpdatedDate : null,
    days: parseEbayTrafficDays(body, startDate, endDate),
  };
}

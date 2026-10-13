import { EbayError, ebayJson, getEbayHosts, readListings, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import type { EbayTrafficDays, EbayTrafficMetrics } from './ebay-contracts.ts';
import {
  ebayTrafficMetrics,
  getEbayTrafficPeriod,
  readTrafficMetricKeys,
  readTrafficMetrics,
} from './ebay-traffic-overview.ts';

export function parseEbayListingPerformance(body: Record<string, unknown>) {
  const keys = readTrafficMetricKeys(body);
  if (!Array.isArray(body.records) || body.records.length > 200)
    throw new EbayError('invalid_response');
  const items = new Map<string, EbayTrafficMetrics>();
  for (const record of body.records) {
    const row = readRecord(record);
    if (!Array.isArray(row.dimensionValues) || row.dimensionValues.length !== 1)
      throw new EbayError('invalid_response');
    const dimension = readRecord(row.dimensionValues[0]);
    const listingId = dimension.value;
    if (
      dimension.applicable !== true ||
      typeof listingId !== 'string' ||
      !/^\d{1,20}$/.test(listingId) ||
      items.has(listingId)
    )
      throw new EbayError('invalid_response');
    items.set(listingId, readTrafficMetrics(row, keys));
  }
  return [...items].map(([listingId, metrics]) => ({ listingId, ...metrics }));
}

export async function readEbayListingMetrics(
  config: EbayConfig,
  token: string,
  days: EbayTrafficDays,
  fetcher = fetch,
) {
  const period = getEbayTrafficPeriod(days);
  const url = new URL(`${getEbayHosts(config.environment).api}/sell/analytics/v1/traffic_report`);
  url.search = new URLSearchParams({
    dimension: 'LISTING',
    filter: `marketplace_ids:{EBAY_DE},date_range:[${period.startDate}T00:00:00.000+00:00..${period.endDate}T23:59:59.000+00:00]`,
    metric: Object.values(ebayTrafficMetrics).join(','),
    sort: '-TOTAL_IMPRESSION_TOTAL',
  }).toString();
  const body = await ebayJson(url.href, token, fetcher);
  return {
    ...period,
    lastUpdatedDate: typeof body.lastUpdatedDate === 'string' ? body.lastUpdatedDate : null,
    items: parseEbayListingPerformance(body),
    limit: 200 as const,
  };
}

export async function readEbayListingPerformance(
  config: EbayConfig,
  token: string,
  days: EbayTrafficDays,
  fetcher = fetch,
) {
  const report = await readEbayListingMetrics(config, token, days, fetcher);
  const listings = await readListings(config, token, 1, fetcher);
  const titles = new Map(listings.items.map((listing) => [listing.id, listing]));
  return {
    ...report,
    items: report.items.map((item) => {
      const listing = titles.get(item.listingId);
      return {
        ...item,
        title: listing?.title ?? 'Angebot bei eBay',
        imageUrl: listing?.imageUrl ?? null,
        watchCount: listing?.watchCount ?? null,
        quantityAvailable: listing?.quantity ?? null,
      };
    }),
  };
}

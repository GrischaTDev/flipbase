import type { AccountScope } from './marketplace.models';
import type {
  EbayAdvertisingReport,
  EbayListingPerformanceReport,
  EbayTrafficDays,
} from '../../../../../supabase/functions/_shared/ebay-contracts';

function record(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new Error('Ungültige eBay-Auswertung.');
  return response as Record<string, unknown>;
}
function text(response: unknown): string {
  if (typeof response !== 'string' || !response) throw new Error('Ungültige eBay-Auswertung.');
  return response;
}
function count(response: unknown): number {
  if (typeof response !== 'number' || !Number.isFinite(response) || response < 0)
    throw new Error('Ungültige eBay-Auswertung.');
  return response;
}
function optionalCount(response: unknown): number | null {
  return response === null ? null : count(response);
}
function optionalText(response: unknown): string | null {
  return response === null ? null : text(response);
}
function period(response: Record<string, unknown>, scope: AccountScope, days: EbayTrafficDays) {
  if (
    response['workspaceId'] !== scope.workspaceId ||
    response['connectionId'] !== scope.connectionId
  )
    throw new Error('Die eBay-Kontoverbindung stimmt nicht überein.');
  const startDate = text(response['startDate']),
    endDate = text(response['endDate']);
  if (
    ![startDate, endDate].every(
      (date) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(Date.parse(date)) &&
        new Date(Date.parse(date)).toISOString().slice(0, 10) === date,
    ) ||
    (Date.parse(endDate) - Date.parse(startDate)) / 86400000 !== days - 1
  )
    throw new Error('Ungültiger eBay-Berichtszeitraum.');
  return { startDate, endDate };
}
function listingId(response: unknown): string {
  const id = text(response);
  if (!/^\d{1,20}$/.test(id)) throw new Error('Ungültige eBay-Angebotskennung.');
  return id;
}

export function parseEbayListingPerformance(
  response: unknown,
  scope: AccountScope,
  days: EbayTrafficDays,
): EbayListingPerformanceReport {
  const report = record(response),
    dates = period(report, scope, days);
  if (report['limit'] !== 200 || !Array.isArray(report['items']) || report['items'].length > 200)
    throw new Error('Ungültige eBay-Artikelauswertung.');
  const seen = new Set<string>();
  const items = report['items'].map((entry) => {
    const item = record(entry),
      id = listingId(item['listingId']);
    if (seen.has(id)) throw new Error('Doppelte eBay-Angebotskennung.');
    seen.add(id);
    return {
      listingId: id,
      title: text(item['title']),
      imageUrl: optionalText(item['imageUrl']),
      watchCount: optionalCount(item['watchCount']),
      quantityAvailable: optionalCount(item['quantityAvailable']),
      impressions: optionalCount(item['impressions']),
      views: optionalCount(item['views']),
      externalViews: optionalCount(item['externalViews']),
      transactions: optionalCount(item['transactions']),
      searchImpressions: optionalCount(item['searchImpressions']),
      searchViews: optionalCount(item['searchViews']),
      clickThroughRate: optionalCount(item['clickThroughRate']),
      conversionRate: optionalCount(item['conversionRate']),
    };
  });
  return {
    ...scope,
    ...dates,
    limit: 200,
    lastUpdatedDate: optionalText(report['lastUpdatedDate']),
    items,
  };
}

export function parseEbayAdvertisingReport(
  response: unknown,
  scope: AccountScope,
  days: EbayTrafficDays,
): EbayAdvertisingReport {
  const report = record(response),
    dates = period(report, scope, days);
  if (
    (report['status'] !== 'ready' && report['status'] !== 'pending') ||
    !Array.isArray(report['days']) ||
    !Array.isArray(report['items']) ||
    report['items'].length > 200
  )
    throw new Error('Ungültiger eBay-Werbebericht.');
  if (
    report['days'].length !== (report['status'] === 'ready' ? days : 0) ||
    (report['status'] === 'pending' && report['items'].length)
  )
    throw new Error('Unvollständiger eBay-Werbebericht.');
  const daily = report['days'].map((entry, index) => {
    const item = record(entry),
      date = text(item['date']);
    if (
      date !== new Date(Date.parse(dates.startDate) + index * 86400000).toISOString().slice(0, 10)
    )
      throw new Error('Ungültiger eBay-Werbebericht.');
    return { date, impressions: count(item['impressions']), clicks: count(item['clicks']) };
  });
  const seen = new Set<string>();
  const items = report['items'].map((entry) => {
    const item = record(entry),
      id = listingId(item['listingId']);
    if (seen.has(id)) throw new Error('Doppelte eBay-Angebotskennung.');
    seen.add(id);
    return {
      listingId: id,
      impressions: count(item['impressions']),
      clicks: count(item['clicks']),
    };
  });
  return {
    ...scope,
    ...dates,
    status: report['status'],
    generatedAt: optionalText(report['generatedAt']),
    days: daily,
    items,
  };
}

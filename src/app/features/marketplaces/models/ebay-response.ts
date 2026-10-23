import type {
  EbayConnectionStatus,
  EbayListing,
  EbayOrder,
  EbayPage,
  EbayListingDetails,
  EbayTrafficReport,
  EbayTrafficOverview,
  EbayTrafficDays,
  EbayTrafficPeriod,
} from '../../../../../supabase/functions/_shared/ebay-contracts';
import type { AccountScope } from './marketplace.models';
import { parseEbayOrderSource, parseEbayVariationAspects } from './ebay-order-import-response';

function readResponseRecord(responseValue: unknown): Record<string, unknown> {
  if (!responseValue || typeof responseValue !== 'object' || Array.isArray(responseValue))
    throw new Error('Ungültige eBay-Antwort.');
  return responseValue as Record<string, unknown>;
}
function readNullableText(responseValue: unknown): string | null {
  if (responseValue === null) return null;
  if (typeof responseValue !== 'string') throw new Error('Ungültige eBay-Antwort.');
  return responseValue;
}
function readRequiredText(responseValue: unknown): string {
  const result = readNullableText(responseValue);
  if (!result) throw new Error('Ungültige eBay-Antwort.');
  return result;
}
function readOptionalAmount(responseValue: unknown): number | null {
  if (responseValue === null) return null;
  if (typeof responseValue !== 'number' || !Number.isFinite(responseValue) || responseValue < 0)
    throw new Error('Ungültige eBay-Antwort.');
  return responseValue;
}
export function parseEbayStatus(responseValue: unknown, workspaceId: string): EbayConnectionStatus {
  const response = readResponseRecord(responseValue);
  if (typeof response['configured'] !== 'boolean') throw new Error('Ungültige eBay-Antwort.');
  const importAvailable = response['importAvailable'] === true;
  const listingManagementAvailable = response['listingManagementAvailable'] === true;
  if (
    response['listingManagementAvailable'] !== undefined &&
    typeof response['listingManagementAvailable'] !== 'boolean'
  )
    throw new Error('Ungültige eBay-Antwort.');
  if (response['importAvailable'] !== undefined && typeof response['importAvailable'] !== 'boolean')
    throw new Error('Ungültige eBay-Antwort.');
  if (response['connection'] === null)
    return {
      configured: response['configured'],
      importAvailable,
      listingManagementAvailable,
      connection: null,
    };
  const connection = readResponseRecord(response['connection']);
  const status = connection['status'];
  const environment = connection['environment'];
  if (
    connection['workspaceId'] !== workspaceId ||
    !['connected', 'needs_login', 'disconnected'].includes(String(status)) ||
    (environment !== 'production' && environment !== 'sandbox')
  )
    throw new Error('Ungültige eBay-Antwort.');
  return {
    configured: response['configured'],
    importAvailable,
    listingManagementAvailable,
    connection: {
      workspaceId,
      ...(Number.isSafeInteger(connection['authorizationVersion']) &&
      Number(connection['authorizationVersion']) > 0
        ? { authorizationVersion: Number(connection['authorizationVersion']) }
        : {}),
      connectionId: readRequiredText(connection['connectionId']),
      status: status as 'connected' | 'needs_login' | 'disconnected',
      environment,
      username: readNullableText(connection['username']),
      lastReadAt: readNullableText(connection['lastReadAt']),
    },
  };
}
export function parseEbayPage<T>(
  responseValue: unknown,
  scope: AccountScope,
  parseItem: (responseValue: unknown) => T,
): EbayPage<T> {
  const page = readResponseRecord(responseValue);
  if (
    page['workspaceId'] !== scope.workspaceId ||
    page['connectionId'] !== scope.connectionId ||
    !Array.isArray(page['items'])
  )
    throw new Error('Ungültige eBay-Antwort.');
  const total = readOptionalAmount(page['total']);
  const nextPage = readOptionalAmount(page['nextPage']);
  if (
    total === null ||
    !Number.isInteger(total) ||
    (nextPage !== null && (!Number.isInteger(nextPage) || nextPage < 1))
  )
    throw new Error('Ungültige eBay-Antwort.');
  let sync;
  if (page['sync'] !== undefined) {
    const value = readResponseRecord(page['sync']);
    const status = value['status'];
    if (status !== 'pending' && status !== 'syncing' && status !== 'ready' && status !== 'error')
      throw new Error('Ungültiger eBay-Abgleichstand.');
    if (value['lastError'] !== null && value['lastError'] !== 'unavailable')
      throw new Error('Ungültiger eBay-Abgleichstand.');
    sync = {
      status,
      lastCompletedAt: readNullableText(value['lastCompletedAt']),
      lastError: value['lastError'],
    } as const;
  }
  return {
    ...scope,
    items: page['items'].map(parseItem),
    total,
    nextPage,
    ...(sync ? { sync } : {}),
  };
}
export function parseEbayListing(responseValue: unknown): EbayListing {
  const item = readResponseRecord(responseValue);
  const url = readNullableText(item['url']);
  if (url && !/^https:\/\/(www\.ebay\.de|sandbox\.ebay\.com)\/itm\/\d+$/.test(url))
    throw new Error('Ungültige eBay-Antwort.');
  return {
    id: readRequiredText(item['id']),
    imageUrl: readEbayImageUrl(item['imageUrl'], false),
    watchCount: item['watchCount'] === undefined ? null : readOptionalAmount(item['watchCount']),
    title: readRequiredText(item['title']),
    price: readOptionalAmount(item['price']),
    currency: readNullableText(item['currency']),
    quantity: readOptionalAmount(item['quantity']),
    listingType: readNullableText(item['listingType']),
    url,
    hasVariations: item['hasVariations'] === true,
    variants: item['variants'] === undefined ? [] : parseListingVariants(item['variants']),
  };
}
function readEbayImageUrl(responseValue: unknown, hostedOnly = true): string | null {
  if (responseValue === undefined || responseValue === null) return null;
  const text = readRequiredText(responseValue);
  const url = new URL(text);
  if (
    url.protocol !== 'https:' ||
    (hostedOnly && !url.hostname.endsWith('.ebayimg.com')) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('Ungültige eBay-Bildadresse.');
  return text;
}
export function parseEbayListingDetails(
  responseValue: unknown,
  scope: AccountScope,
  listingId: string,
): EbayListingDetails {
  const row = readResponseRecord(responseValue);
  if (
    row['workspaceId'] !== scope.workspaceId ||
    row['connectionId'] !== scope.connectionId ||
    row['id'] !== listingId ||
    !Array.isArray(row['imageUrls']) ||
    row['imageUrls'].length > 24 ||
    typeof row['description'] !== 'string' ||
    !/^[a-f0-9]{64}$/.test(String(row['revision']))
  )
    throw new Error('Ungültige eBay-Inseratdaten.');
  return {
    ...parseEbayListing(row),
    description: row['description'],
    revision: String(row['revision']),
    imageUrls: row['imageUrls'].map((url) => readEbayImageUrl(url, false) ?? ''),
  };
}
export function parseEbayTrafficReport(
  responseValue: unknown,
  scope: AccountScope,
  listingIds: readonly string[],
): EbayTrafficReport {
  const row = readResponseRecord(responseValue);
  if (
    row['workspaceId'] !== scope.workspaceId ||
    row['connectionId'] !== scope.connectionId ||
    !Array.isArray(row['items'])
  )
    throw new Error('Ungültige eBay-Statistik.');
  const startDate = readRequiredText(row['startDate']),
    endDate = readRequiredText(row['endDate']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))
    throw new Error('Ungültiger Statistikzeitraum.');
  const items = row['items'].map((entry) => {
    const item = readResponseRecord(entry);
    const listingId = readRequiredText(item['listingId']);
    if (!listingIds.includes(listingId)) throw new Error('Ungültige eBay-Statistik.');
    return {
      listingId,
      views: readOptionalAmount(item['views']),
      transactions: readOptionalAmount(item['transactions']),
      conversionRate: readOptionalAmount(item['conversionRate']),
    };
  });
  if (
    items.length !== listingIds.length ||
    new Set(items.map((item) => item.listingId)).size !== items.length
  )
    throw new Error('Unvollständige eBay-Statistik.');
  return {
    ...scope,
    startDate,
    endDate,
    lastUpdatedDate: readNullableText(row['lastUpdatedDate']),
    items,
  };
}
export function parseEbayImageUpload(responseValue: unknown, scope: AccountScope): string {
  const row = readResponseRecord(responseValue);
  if (row['workspaceId'] !== scope.workspaceId || row['connectionId'] !== scope.connectionId)
    throw new Error('Ungültige eBay-Bildantwort.');
  const url = readEbayImageUrl(row['imageUrl']);
  if (!url) throw new Error('eBay hat keine Bildadresse bestätigt.');
  return url;
}
export function parseEbayTrafficOverview(
  responseValue: unknown,
  scope: AccountScope,
  requestedDays: EbayTrafficDays,
): EbayTrafficOverview {
  const row = readResponseRecord(responseValue);
  if (row['workspaceId'] !== scope.workspaceId || row['connectionId'] !== scope.connectionId)
    throw new Error('Ungültige eBay-Trafficdaten.');
  const current = parseEbayTrafficPeriod(row, requestedDays);
  const previousPeriod =
    row['previousPeriod'] === null
      ? null
      : parseEbayTrafficPeriod(readResponseRecord(row['previousPeriod']), requestedDays);
  if (
    previousPeriod &&
    Date.parse(current.startDate) - Date.parse(previousPeriod.endDate) !== 86400000
  )
    throw new Error('Ungültiger eBay-Vergleichszeitraum.');
  return { ...scope, ...current, previousPeriod };
}

function parseEbayTrafficPeriod(
  row: Record<string, unknown>,
  requestedDays: EbayTrafficDays,
): EbayTrafficPeriod {
  const startDate = readRequiredText(row['startDate']);
  const endDate = readRequiredText(row['endDate']);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    !Number.isFinite(Date.parse(startDate)) ||
    !Number.isFinite(Date.parse(endDate)) ||
    new Date(Date.parse(startDate)).toISOString().slice(0, 10) !== startDate ||
    new Date(Date.parse(endDate)).toISOString().slice(0, 10) !== endDate ||
    (Date.parse(endDate) - Date.parse(startDate)) / 86400000 !== requestedDays - 1 ||
    !Array.isArray(row['days']) ||
    row['days'].length !== requestedDays
  )
    throw new Error('Ungültige eBay-Trafficdaten.');
  const days = row['days'].map((entry, index) => {
    const day = readResponseRecord(entry);
    const date = readRequiredText(day['date']);
    const expectedDate = new Date(Date.parse(startDate) + index * 86400000)
      .toISOString()
      .slice(0, 10);
    if (date !== expectedDate) throw new Error('Ungültige eBay-Trafficdaten.');
    return {
      date,
      impressions: readOptionalAmount(day['impressions']),
      views: readOptionalAmount(day['views']),
      externalViews: readOptionalAmount(day['externalViews']),
      transactions: readOptionalAmount(day['transactions']),
      searchImpressions: readOptionalAmount(day['searchImpressions']),
      searchViews: readOptionalAmount(day['searchViews']),
      clickThroughRate: readOptionalAmount(day['clickThroughRate']),
      conversionRate: readOptionalAmount(day['conversionRate']),
    };
  });
  return {
    startDate,
    endDate,
    lastUpdatedDate: readNullableText(row['lastUpdatedDate']),
    days,
  };
}
function parseListingVariants(value: unknown): NonNullable<EbayListing['variants']> {
  if (!Array.isArray(value) || value.length > 200) throw new Error('Ungültige eBay-Varianten.');
  return value.map((item) => {
    const row = readResponseRecord(item);
    return {
      id: readNullableText(row['id']),
      sku: readNullableText(row['sku']),
      quantity: readOptionalAmount(row['quantity']),
      aspects: parseEbayVariationAspects(row['aspects']),
    };
  });
}
export function parseEbayOrder(responseValue: unknown): EbayOrder {
  const item = readResponseRecord(responseValue);
  if (!Array.isArray(item['items'])) throw new Error('Ungültige eBay-Antwort.');
  const createdAt = readRequiredText(item['createdAt']);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Ungültige eBay-Antwort.');
  return {
    id: readRequiredText(item['id']),
    createdAt,
    paymentStatus: readRequiredText(item['paymentStatus']),
    fulfillmentStatus: readRequiredText(item['fulfillmentStatus']),
    cancelStatus: readNullableText(item['cancelStatus']),
    total: readOptionalAmount(item['total']),
    currency: readNullableText(item['currency']),
    importSource:
      item['importSource'] === undefined || item['importSource'] === null
        ? null
        : parseEbayOrderSource(item['importSource'], readRequiredText(item['id'])),
    items: item['items'].map((line) => ({
      title: readRequiredText(readResponseRecord(line)['title']),
      quantity: readOptionalAmount(readResponseRecord(line)['quantity']),
      ...(readResponseRecord(line)['imageUrl'] !== undefined
        ? { imageUrl: readEbayImageUrl(readResponseRecord(line)['imageUrl'], false) }
        : {}),
    })),
  };
}
export function parseEbayAuthorization(responseValue: unknown): string {
  const url = new URL(readRequiredText(readResponseRecord(responseValue)['authorizationUrl']));
  if (
    !['auth.ebay.com', 'auth.sandbox.ebay.com'].includes(url.hostname) ||
    url.protocol !== 'https:' ||
    url.pathname !== '/oauth2/authorize' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw new Error('Ungültige eBay-Anmeldung.');
  return url.href;
}

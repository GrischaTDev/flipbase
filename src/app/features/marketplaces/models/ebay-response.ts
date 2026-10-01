import type {
  EbayConnectionStatus,
  EbayListing,
  EbayOrder,
  EbayPage,
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
  if (response['importAvailable'] !== undefined && typeof response['importAvailable'] !== 'boolean')
    throw new Error('Ungültige eBay-Antwort.');
  if (response['connection'] === null)
    return { configured: response['configured'], importAvailable, connection: null };
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
    connection: {
      workspaceId,
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
  return { ...scope, items: page['items'].map(parseItem), total, nextPage };
}
export function parseEbayListing(responseValue: unknown): EbayListing {
  const item = readResponseRecord(responseValue);
  const url = readNullableText(item['url']);
  if (url && !/^https:\/\/(www\.ebay\.de|sandbox\.ebay\.com)\/itm\/\d+$/.test(url))
    throw new Error('Ungültige eBay-Antwort.');
  return {
    id: readRequiredText(item['id']),
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

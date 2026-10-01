import type { EbayEnvironment, EbayListing, EbayOrder } from './ebay-contracts.ts';
import { parseEbayXml, findXmlChild, readXmlText } from './ebay-xml.ts';

export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
] as const;
export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  ruName: string;
  environment: EbayEnvironment;
  encryptionKey: string;
  appUrl: string;
  allowedOrigins: readonly string[];
}
export interface EbayTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}
export class EbayError extends Error {
  constructor(
    readonly code: 'needs_login' | 'provider_unavailable' | 'scope_missing' | 'invalid_response',
  ) {
    super(code);
  }
}
export function readRecord(apiValue: unknown): Record<string, unknown> {
  return apiValue && typeof apiValue === 'object' && !Array.isArray(apiValue)
    ? (apiValue as Record<string, unknown>)
    : {};
}
export function readNonEmptyString(apiValue: unknown): string | null {
  return typeof apiValue === 'string' && apiValue.length > 0 ? apiValue : null;
}
export function readNonNegativeNumber(apiValue: unknown): number | null {
  if (typeof apiValue !== 'string' && typeof apiValue !== 'number') return null;
  if (apiValue === '') return null;
  const number = Number(apiValue);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
export function getEbayHosts(environment: EbayEnvironment) {
  return environment === 'sandbox'
    ? {
        api: 'https://api.sandbox.ebay.com',
        identity: 'https://apiz.sandbox.ebay.com',
        consent: 'https://auth.sandbox.ebay.com/oauth2/authorize',
      }
    : {
        api: 'https://api.ebay.com',
        identity: 'https://apiz.ebay.com',
        consent: 'https://auth.ebay.com/oauth2/authorize',
      };
}
export function authorizationUrl(config: EbayConfig, state: string): string {
  const url = new URL(getEbayHosts(config.environment).consent);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.ruName,
    response_type: 'code',
    scope: EBAY_SCOPES.join(' '),
    state,
  }).toString();
  return url.href;
}
export async function requestToken(
  config: EbayConfig,
  params: URLSearchParams,
  fetcher = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(
    `${getEbayHosts(config.environment).api}/identity/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = readRecord(await response.json());
  if (!response.ok) {
    if (body.error === 'invalid_grant') throw new EbayError('needs_login');
    if (body.error === 'invalid_scope') throw new EbayError('scope_missing');
    throw new EbayError('provider_unavailable');
  }
  if (!readNonEmptyString(body.access_token) || !readNonNegativeNumber(body.expires_in))
    throw new EbayError('invalid_response');
  return body;
}
export async function exchangeCode(
  config: EbayConfig,
  code: string,
  fetcher = fetch,
): Promise<EbayTokens> {
  const body = await requestToken(
    config,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.ruName }),
    fetcher,
  );
  const refreshToken = readNonEmptyString(body.refresh_token);
  const accessToken = readNonEmptyString(body.access_token);
  const expires = readNonNegativeNumber(body.expires_in);
  const refreshExpires = readNonNegativeNumber(body.refresh_token_expires_in);
  if (!refreshToken || !accessToken || !expires || !refreshExpires)
    throw new EbayError('invalid_response');
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expires * 1000,
    refreshExpiresAt: Date.now() + refreshExpires * 1000,
  };
}
export async function refreshTokens(
  config: EbayConfig,
  tokens: EbayTokens,
  fetcher = fetch,
): Promise<EbayTokens> {
  if (tokens.refreshExpiresAt <= Date.now()) throw new EbayError('needs_login');
  if (tokens.expiresAt > Date.now() + 60_000) return tokens;
  const body = await requestToken(
    config,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      scope: EBAY_SCOPES.join(' '),
    }),
    fetcher,
  );
  const accessToken = readNonEmptyString(body.access_token);
  const expires = readNonNegativeNumber(body.expires_in);
  if (!accessToken || !expires) throw new EbayError('invalid_response');
  return { ...tokens, accessToken, expiresAt: Date.now() + expires * 1000 };
}
export async function ebayJson(
  url: string,
  token: string,
  fetcher = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE' },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (!response.ok) throw new EbayError('provider_unavailable');
  return readRecord(await response.json());
}
export async function readIdentity(config: EbayConfig, token: string, fetcher = fetch) {
  const body = await ebayJson(
    `${getEbayHosts(config.environment).identity}/commerce/identity/v1/user/`,
    token,
    fetcher,
  );
  const id = readNonEmptyString(body.userId);
  if (!id) throw new EbayError('invalid_response');
  return { id, username: readNonEmptyString(body.username) };
}
export function parseOrders(body: Record<string, unknown>): EbayOrder[] {
  if (!Array.isArray(body.orders)) {
    if (body.total === 0) return [];
    throw new EbayError('invalid_response');
  }
  return body.orders.map((apiValue) => {
    const row = readRecord(apiValue);
    const total = readRecord(readRecord(row.pricingSummary).total);
    const id = readNonEmptyString(row.orderId);
    const createdAt = readNonEmptyString(row.creationDate);
    if (!id || !createdAt) throw new EbayError('invalid_response');
    return {
      id,
      createdAt,
      total: readNonNegativeNumber(total.value),
      currency: readNonEmptyString(total.currency),
      paymentStatus: readNonEmptyString(row.orderPaymentStatus) ?? 'UNKNOWN',
      fulfillmentStatus: readNonEmptyString(row.orderFulfillmentStatus) ?? 'UNKNOWN',
      cancelStatus: readNonEmptyString(readRecord(row.cancelStatus).cancelState),
      items: Array.isArray(row.lineItems)
        ? row.lineItems.map((item) => ({
            title: readNonEmptyString(readRecord(item).title) ?? 'eBay-Artikel',
            quantity: readNonNegativeNumber(readRecord(item).quantity),
          }))
        : [],
    };
  });
}
export async function readOrders(config: EbayConfig, token: string, page: number, fetcher = fetch) {
  const body = await ebayJson(
    `${getEbayHosts(config.environment).api}/sell/fulfillment/v1/order?limit=50&offset=${(page - 1) * 50}`,
    token,
    fetcher,
  );
  const total = readNonNegativeNumber(body.total);
  if (total === null) throw new EbayError('invalid_response');
  const items = parseOrders(body);
  return {
    items,
    total,
    nextPage: page < 200 && page * 50 < total && items.length > 0 ? page + 1 : null,
  };
}
export function parseListings(xml: string): { items: EbayListing[]; total: number; pages: number } {
  const root = parseEbayXml(xml);
  const ack = readXmlText(root, 'Ack');
  if (ack !== 'Success' && ack !== 'Warning') {
    const codes = root.children
      .filter((node) => node.name === 'Errors')
      .map((node) => readXmlText(node, 'ErrorCode'));
    if (codes.some((code) => ['931', '932', '16110', '21917053'].includes(code ?? '')))
      throw new EbayError('needs_login');
    throw new EbayError('provider_unavailable');
  }
  const active = findXmlChild(root, 'ActiveList');
  const pagination = findXmlChild(active, 'PaginationResult');
  const total = readNonNegativeNumber(readXmlText(pagination, 'TotalNumberOfEntries'));
  const pages = readNonNegativeNumber(readXmlText(pagination, 'TotalNumberOfPages'));
  if (!active || total === null || pages === null) throw new EbayError('invalid_response');
  const items = (findXmlChild(active, 'ItemArray')?.children ?? [])
    .filter((node) => node.name === 'Item')
    .map((node) => {
      const price = findXmlChild(findXmlChild(node, 'SellingStatus'), 'CurrentPrice');
      const id = readXmlText(node, 'ItemID');
      if (!id || !/^\d+$/.test(id)) throw new EbayError('invalid_response');
      return {
        id,
        title: readXmlText(node, 'Title') ?? 'eBay-Artikel',
        price: readNonNegativeNumber(price?.text),
        currency: price?.attributes.currencyID ?? null,
        quantity: readNonNegativeNumber(readXmlText(node, 'QuantityAvailable')),
        listingType: readXmlText(node, 'ListingType'),
        url: `https://www.ebay.de/itm/${id}`,
      };
    });
  return { items, total, pages };
}
export async function readListings(
  config: EbayConfig,
  token: string,
  page: number,
  fetcher = fetch,
) {
  const api =
    config.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';
  const response = await fetcher(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
      'X-EBAY-API-SITEID': '77',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1477',
      'X-EBAY-API-IAF-TOKEN': token,
    },
    body: `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList><SoldList><Include>false</Include></SoldList><UnsoldList><Include>false</Include></UnsoldList><ScheduledList><Include>false</Include></ScheduledList><HideVariations>true</HideVariations></GetMyeBaySellingRequest>`,
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401) throw new EbayError('needs_login');
  if (!response.ok) throw new EbayError('provider_unavailable');
  const result = parseListings(await response.text());
  return {
    items: result.items.map((item) => ({
      ...item,
      url: config.environment === 'sandbox' ? `https://sandbox.ebay.com/itm/${item.id}` : item.url,
    })),
    total: result.total,
    nextPage: page < result.pages && page < 125 ? page + 1 : null,
  };
}

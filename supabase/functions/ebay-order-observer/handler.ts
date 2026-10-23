import {
  EbayError,
  getEbayHosts,
  readRecord,
  readNonEmptyString,
  refreshTokens,
  readListings,
} from '../_shared/ebay-api.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { decryptTokens, encryptTokens } from '../_shared/ebay-token-encryption.ts';
import { ebayOrderSourceKey, parseEbayOrderSource } from '../_shared/ebay-order-source.ts';
import type { EbayCacheScan, EbayCachedOrderWrite } from '../_shared/ebay-cache-contracts.ts';
import type { EbayListing } from '../_shared/ebay-contracts.ts';

export interface ObserverConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  environment: 'production' | 'sandbox';
  external_account_id: string;
  authorization_version: number;
  operation_id: string;
}
export interface ObserverClaim {
  connection: { connection: ObserverConnection; encryptedTokens: string };
  scan: EbayCacheScan;
}
export interface ObserverStore {
  claim(): Promise<ObserverClaim | null>;
  page(
    claim: ObserverClaim,
    offset: number,
    rows: readonly (EbayCachedOrderWrite | EbayListing)[],
    complete: boolean,
    total: number,
  ): Promise<boolean>;
  delay(claim: ObserverClaim, seconds: number): Promise<void>;
  finish(
    claim: ObserverClaim,
    encryptedTokens: string | null,
    needsLogin: boolean,
    observed: boolean,
  ): Promise<boolean>;
}
class ObserverRateError extends Error {
  constructor(readonly retrySeconds: number) {
    super('Provider rate limited');
  }
}
export function observerRetrySeconds(header: string | null, now = Date.now()): number {
  const delay =
    header && /^\d+$/u.test(header)
      ? Number(header)
      : header
        ? (Date.parse(header) - now) / 1000
        : 300;
  return Number.isFinite(delay) ? Math.min(86400, Math.max(300, Math.ceil(delay))) : 300;
}
export async function readObserverPage(
  config: EbayConfig,
  token: string,
  scan: ObserverClaim['scan'],
  offset: number,
  fetcher = fetch,
) {
  const url = new URL(`${getEbayHosts(config.environment).api}/sell/fulfillment/v1/order`);
  url.searchParams.set('limit', '50');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set(
    'filter',
    `${scan.initial ? 'creationdate' : 'lastmodifieddate'}:[${new Date(scan.from).toISOString()}..${new Date(scan.to).toISOString()}]`,
  );
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 429)
    throw new ObserverRateError(observerRetrySeconds(response.headers.get('Retry-After')));
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (!response.ok) throw new EbayError('provider_unavailable');
  const body = readRecord(await response.json());
  if (
    typeof body.total !== 'number' ||
    !Number.isSafeInteger(body.total) ||
    body.total < 0 ||
    (!Array.isArray(body.orders) && body.total !== 0)
  )
    throw new EbayError('invalid_response');
  const rows = Array.isArray(body.orders) ? body.orders : [];
  if (rows.length > 50) throw new EbayError('invalid_response');
  const orders = rows.map((row) => {
    const item = readRecord(row),
      id = readNonEmptyString(item.orderId),
      createdAt = readNonEmptyString(item.creationDate),
      filteredAt = scan.initial ? createdAt : readNonEmptyString(item.lastModifiedDate);
    if (
      !id ||
      id.length > 256 ||
      !createdAt ||
      !Number.isFinite(Date.parse(createdAt)) ||
      !filteredAt ||
      !Number.isFinite(Date.parse(filteredAt)) ||
      Date.parse(filteredAt) < Date.parse(scan.from) ||
      Date.parse(filteredAt) > Date.parse(scan.to)
    )
      throw new EbayError('invalid_response');
    return parseEbayOrderSource(item, new Date().toISOString());
  });
  if (
    offset + orders.length > body.total ||
    new Set(orders.map((order) => order.orderId)).size !== orders.length
  )
    throw new EbayError('invalid_response');
  const complete = offset + orders.length === body.total;
  if (!complete && orders.length !== 50) throw new EbayError('invalid_response');
  return { orders, complete, total: body.total };
}
async function sameSecret(received: string, expected: string) {
  if (!expected || received.length !== expected.length) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const leftBytes = new Uint8Array(left),
    rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++)
    difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}
export function createEbayOrderObserverHandler(
  store: ObserverStore,
  config: EbayConfig | null,
  serviceSecret: string,
  isEnabled: () => boolean,
  fetcher = fetch,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (
      request.headers.has('Origin') ||
      !(await sameSecret(request.headers.get('Authorization') ?? '', `Bearer ${serviceSecret}`)) ||
      !serviceSecret
    )
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (!isEnabled() || !config) return Response.json({ error: 'disabled' }, { status: 503 });
    if (Number(request.headers.get('Content-Length') ?? 0) > 128)
      return new Response(null, { status: 413 });
    let body: string;
    try {
      body = await request.text();
    } catch {
      return new Response(null, { status: 400 });
    }
    if (body.length > 128) return new Response(null, { status: 413 });
    if (body !== '{}') return new Response(null, { status: 400 });
    let claim: ObserverClaim | null = null,
      encrypted: string | null = null,
      observed = false;
    try {
      claim = await store.claim();
      if (!claim) return Response.json({ status: 'idle' });
      const started = Date.now();
      const connection = claim.connection.connection;
      if (connection.environment !== config.environment)
        throw new Error('Observer environment mismatch');
      const budgetedFetch: typeof fetch = async (input, init) => {
        const response = await fetcher(input, init);
        if (response.status === 429)
          throw new ObserverRateError(observerRetrySeconds(response.headers.get('Retry-After')));
        return response;
      };
      const tokens = await refreshTokens(
        config,
        await decryptTokens(claim.connection.encryptedTokens, config.encryptionKey, connection.id),
        budgetedFetch,
      );
      encrypted = await encryptTokens(tokens, config.encryptionKey, connection.id);
      const pageSize = claim.scan.kind === 'orders' ? 50 : 200;
      for (let page = 0, offset = claim.scan.offset; page < 5; page++, offset += pageSize) {
        if (Date.now() - started >= 60000) break;
        let rows: readonly (EbayCachedOrderWrite | EbayListing)[], complete: boolean, total: number;
        if (claim.scan.kind === 'listings') {
          const result = await readListings(
            config,
            tokens.accessToken,
            offset / 200 + 1,
            budgetedFetch,
          );
          total = result.total;
          complete = result.nextPage === null;
          if (
            total >= 25000 ||
            offset + result.items.length > total ||
            complete !== (offset + result.items.length === total) ||
            (!complete && result.items.length !== 200)
          )
            throw new EbayError('invalid_response');
          rows = result.items;
        } else {
          const result = await readObserverPage(
            config,
            tokens.accessToken,
            claim.scan,
            offset,
            budgetedFetch,
          );
          total = result.total;
          complete = result.complete;
          rows = await Promise.all(
            result.orders.map(async (source) => ({
              source,
              sourceKey: await ebayOrderSourceKey(
                config.encryptionKey,
                connection.workspace_id,
                connection.environment,
                connection.external_account_id,
                source.orderId,
              ),
            })),
          );
        }
        if (!(await store.page(claim, offset, rows, complete, total)))
          throw new Error('Stale observer lease');
        observed = true;
        if (complete) break;
      }
      if (!(await store.finish(claim, encrypted, false, observed)))
        return Response.json({ error: 'stale' }, { status: 409 });
      return Response.json({ status: 'observed' });
    } catch (error) {
      if (claim) {
        try {
          await store.delay(claim, error instanceof ObserverRateError ? error.retrySeconds : 300);
          await store.finish(
            claim,
            encrypted,
            error instanceof EbayError && error.code === 'needs_login',
            observed,
          );
        } catch {
          /* Keine Anbieter- oder Tokendetails in der Antwort. Dauerhafte Lease begrenzt Wiederaufnahme. */
        }
      }
      return Response.json(
        { error: error instanceof ObserverRateError ? 'rate_limited' : 'unavailable' },
        { status: error instanceof ObserverRateError ? 429 : 503 },
      );
    }
  };
}

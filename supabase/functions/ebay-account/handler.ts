import type { EbayConnection, EbayConnectionStatus } from '../_shared/ebay-contracts.ts';
import {
  authorizationUrl,
  exchangeCode,
  readIdentity,
  readListings,
  readOrders,
  readRecord,
  EbayError,
} from '../_shared/ebay-api.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { encryptTokens, hashState } from '../_shared/ebay-token-encryption.ts';

import { withEbayConnection, EbayConnectionError } from './connection-read.ts';
import { createEbayOrderImportHandler } from './order-import.ts';
import type { EbayOrderImportStore } from './order-import.ts';

export interface StoredEbayConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  environment: 'production' | 'sandbox';
  status: 'connected' | 'needs_login' | 'disconnected';
  username: string | null;
  external_account_id: string | null;
  last_read_at: string | null;
  authorization_version: number;
}
export interface EbayAccountStore {
  importAvailable?(): Promise<boolean>;
  authenticate(bearer: string): Promise<string | null>;
  canConnect(bearer: string, workspaceId: string): Promise<boolean>;
  status(
    userId: string,
    workspaceId: string,
    environment: string,
  ): Promise<StoredEbayConnection | null>;
  begin(
    userId: string,
    workspaceId: string,
    environment: string,
    stateHash: string,
  ): Promise<StoredEbayConnection>;
  consume(stateHash: string): Promise<StoredEbayConnection | null>;
  complete(
    connection: StoredEbayConnection,
    accountId: string,
    username: string | null,
    encryptedTokens: string,
  ): Promise<boolean>;
  claim(
    userId: string,
    workspaceId: string,
    connectionId: string,
    operationId: string,
  ): Promise<{ connection: StoredEbayConnection; encryptedTokens: string } | null>;
  finish(
    connection: StoredEbayConnection,
    operationId: string,
    encryptedTokens: string | null,
    needsLogin: boolean,
    observed: boolean,
  ): Promise<boolean>;
  disconnect(bearer: string, workspaceId: string, connectionId: string): Promise<void>;
}
export function mapPublicConnection(connection: StoredEbayConnection): EbayConnection {
  return {
    connectionId: connection.id,
    workspaceId: connection.workspace_id,
    environment: connection.environment,
    status: connection.status,
    username: connection.username,
    lastReadAt: connection.last_read_at,
  };
}
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
export function createEbayAccountHandler(
  store: EbayAccountStore,
  config: EbayConfig | null,
  origins: readonly string[],
  fetcher = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    };
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'GET' && new URL(request.url).pathname.endsWith('/callback')) {
      if (!config) return respond({ error: 'not_configured' }, 503);
      const redirect = (result: string, workspaceId?: string) => {
        const target = new URL('/marketplaces/ebay', config.appUrl);
        target.searchParams.set('ebay_result', result);
        if (workspaceId) target.searchParams.set('workspace', workspaceId);
        return new Response(null, {
          status: 303,
          headers: {
            Location: target.href,
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          },
        });
      };
      let workspaceId: string | undefined;
      try {
        const params = new URL(request.url).searchParams;
        const state = params.get('state');
        if (!state || !/^[0-9a-f]{64}$/.test(state)) return redirect('failed');
        const connection = await store.consume(await hashState(state));
        if (!connection || connection.environment !== config.environment) return redirect('failed');
        workspaceId = connection.workspace_id;
        if (params.has('error')) return redirect('denied', workspaceId);
        const code = params.get('code');
        if (!code || code.length > 10_000) return redirect('failed', workspaceId);
        const tokens = await exchangeCode(config, code, fetcher);
        const identity = await readIdentity(config, tokens.accessToken, fetcher);
        const saved = await store.complete(
          connection,
          identity.id,
          identity.username,
          await encryptTokens(tokens, config.encryptionKey, connection.id),
        );
        return redirect(saved ? 'connected' : 'failed', workspaceId);
      } catch {
        // OAuth-Codes, Tokens und fremde Fehlermeldungen gelangen weder in URL noch Log.
        return redirect('failed', workspaceId);
      }
    }
    if (origin && !origins.includes(origin)) return respond({ error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    try {
      const bearer = request.headers.get('authorization') ?? '';
      if (!bearer.startsWith('Bearer ')) return respond({ error: 'unauthorized' }, 401);
      const userId = await store.authenticate(bearer);
      if (!userId) return respond({ error: 'unauthorized' }, 401);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 65536)
        return respond({ error: 'invalid_request' }, 400);
      let body: Record<string, unknown>;
      try {
        body = readRecord(JSON.parse(raw));
      } catch {
        return respond({ error: 'invalid_request' }, 400);
      }
      if (typeof body.action === 'string' && body.action.startsWith('order_')) {
        if (!config || !('storeSnapshot' in store))
          return respond({ error: 'import_unavailable' }, 503);
        return createEbayOrderImportHandler(
          store as EbayOrderImportStore,
          config,
          fetcher,
        )(new Request(request.url, { method: 'POST', headers: request.headers, body: raw }));
      }
      const workspaceId = body.workspaceId;
      if (!isUuid(workspaceId)) return respond({ error: 'invalid_request' }, 400);
      if (!(await store.canConnect(bearer, workspaceId)))
        return respond({ error: 'forbidden' }, 403);
      if (body.action === 'status') {
        const connection = await store.status(
          userId,
          workspaceId,
          config?.environment ?? 'production',
        );
        const result: EbayConnectionStatus = {
          configured: config !== null,
          importAvailable: config !== null && (await store.importAvailable?.()) === true,
          connection: connection ? mapPublicConnection(connection) : null,
        };
        return respond(result);
      }
      if (body.action === 'disconnect') {
        if (!isUuid(body.connectionId)) return respond({ error: 'invalid_request' }, 400);
        await store.disconnect(bearer, workspaceId, body.connectionId);
        return respond({ ok: true });
      }
      if (!config) return respond({ error: 'not_configured' }, 503);
      if (body.action === 'connect') {
        const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        await store.begin(userId, workspaceId, config.environment, await hashState(state));
        return respond({ authorizationUrl: authorizationUrl(config, state) });
      }
      if (body.action !== 'listings' && body.action !== 'orders')
        return respond({ error: 'invalid_request' }, 400);
      const page = body.page ?? 1;
      const maximum = body.action === 'listings' ? 125 : 200;
      if (
        !isUuid(body.connectionId) ||
        typeof page !== 'number' ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > maximum
      )
        return respond({ error: 'invalid_request' }, 400);
      const result = await withEbayConnection<unknown>(
        { workspaceId, connectionId: body.connectionId },
        bearer,
        store,
        config,
        ({ accessToken }) =>
          body.action === 'listings'
            ? readListings(config, accessToken, page, fetcher)
            : readOrders(config, accessToken, page, fetcher),
        fetcher,
      );
      return respond({ ...readRecord(result), workspaceId, connectionId: body.connectionId });
    } catch (error) {
      if (error instanceof EbayConnectionError)
        return respond(
          { error: error.code },
          error.code === 'unauthorized' ? 401 : error.code === 'forbidden' ? 403 : 409,
        );
      if (error instanceof EbayError)
        return respond({ error: error.code }, error.code === 'needs_login' ? 409 : 502);
      return respond({ error: 'request_failed' }, 503);
    }
  };
}

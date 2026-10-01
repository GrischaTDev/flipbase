import type { EbayConnection, EbayConnectionStatus } from '../_shared/ebay-contracts.ts';
import {
  authorizationUrl,
  exchangeCode,
  refreshTokens,
  readIdentity,
  readListings,
  readOrders,
  readRecord,
  readNonEmptyString,
  EbayError,
} from '../_shared/ebay-api.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import { decryptTokens, encryptTokens, hashState } from '../_shared/ebay-token-encryption.ts';

export interface StoredEbayConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  environment: 'production' | 'sandbox';
  status: 'connected' | 'needs_login' | 'disconnected';
  username: string | null;
  last_read_at: string | null;
  authorization_version: number;
}
export interface EbayAccountStore {
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
      if (raw.length > 4096) return respond({ error: 'invalid_request' }, 400);
      let body: Record<string, unknown>;
      try {
        body = readRecord(JSON.parse(raw));
      } catch {
        return respond({ error: 'invalid_request' }, 400);
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
      const operationId = crypto.randomUUID();
      const claimed = await store.claim(userId, workspaceId, body.connectionId, operationId);
      if (!claimed) return respond({ error: 'connection_busy_or_unavailable' }, 409);
      const connection = claimed.connection;
      let encrypted: string | null = null;
      let needsLogin = false;
      let observed = false;
      let result: unknown;
      let providerError: unknown;
      try {
        if (
          connection.environment !== config.environment ||
          !readNonEmptyString(claimed.encryptedTokens)
        )
          throw new EbayError('needs_login');
        const previous = await decryptTokens(
          claimed.encryptedTokens,
          config.encryptionKey,
          connection.id,
        );
        let tokens = await refreshTokens(config, previous, fetcher);
        encrypted = await encryptTokens(tokens, config.encryptionKey, connection.id);
        const read = () =>
          body.action === 'listings'
            ? readListings(config, tokens.accessToken, page, fetcher)
            : readOrders(config, tokens.accessToken, page, fetcher);
        try {
          result = await read();
        } catch (error) {
          if (!(error instanceof EbayError) || error.code !== 'needs_login') throw error;
          tokens = await refreshTokens(config, { ...tokens, expiresAt: 0 }, fetcher);
          encrypted = await encryptTokens(tokens, config.encryptionKey, connection.id);
          result = await read();
        }
        observed = true;
      } catch (error) {
        needsLogin = error instanceof EbayError && error.code === 'needs_login';
        providerError = error;
      }
      const valid = await store.finish(connection, operationId, encrypted, needsLogin, observed);
      if (!valid) return respond({ error: 'connection_changed' }, 409);
      if (providerError)
        return respond(
          {
            error: providerError instanceof EbayError ? providerError.code : 'provider_unavailable',
          },
          needsLogin ? 409 : 502,
        );
      return respond({ ...readRecord(result), workspaceId, connectionId: connection.id });
    } catch {
      return respond({ error: 'request_failed' }, 503);
    }
  };
}

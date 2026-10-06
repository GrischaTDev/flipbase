import {
  localExtensionMaxBytes,
  parseLocalExtensionRequest,
} from '../_shared/marketplace-local-extension-contracts.ts';
import type { LocalExtensionRequest } from '../_shared/marketplace-local-extension-contracts.ts';

export class LocalExtensionStoreError extends Error {
  constructor(readonly code: 'access' | 'invalid' | 'conflict') {
    super(code);
  }
}
export interface LocalExtensionStore {
  favorites?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  ingest(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  inboxState?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  inboxImport?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  inboxDetailState?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  inboxDetailImport?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  messageClaim?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  messageStart?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
  messageFinish?(tokenHash: string, input: LocalExtensionRequest): Promise<unknown>;
}
export async function hashLocalExtensionSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function readLimitedBody(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > localExtensionMaxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export function createLocalExtensionHandler(store: LocalExtensionStore) {
  return async (request: Request): Promise<Response> => {
    // Extensions verwenden ein eigenes Secret, niemals Supabase-Nutzertoken oder Vinted-Cookies.
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    const bearer = request.headers.get('authorization') ?? '';
    if (!/^Bearer [0-9a-f]{64}$/.test(bearer)) return respond({ error: 'unauthorized' }, 401);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return respond({ error: 'invalid_request' }, 400);
    let input: LocalExtensionRequest | null;
    try {
      const raw = await readLimitedBody(request);
      input = raw === null ? null : parseLocalExtensionRequest(JSON.parse(raw));
    } catch {
      return respond({ error: 'invalid_request' }, 400);
    }
    if (!input) return respond({ error: 'invalid_request' }, 400);
    try {
      const tokenHash = await hashLocalExtensionSecret(bearer.slice(7));
      if (
        [
          'favorites_state',
          'favorites_import',
          'favorite_claim',
          'favorite_start',
          'favorite_finish',
          'favorite_message_sent',
          'favorite_offer_start',
          'favorite_offer_finish',
        ].includes(input.action)
      ) {
        if (!store.favorites) return respond({ error: 'unavailable' }, 503);
        return respond(await store.favorites(tokenHash, input));
      }
      if (input.action === 'inbox_state') {
        if (!store.inboxState) return respond({ error: 'unavailable' }, 503);
        return respond(await store.inboxState(tokenHash, input));
      }
      if (input.action === 'inbox_import') {
        if (!store.inboxImport) return respond({ error: 'unavailable' }, 503);
        return respond(await store.inboxImport(tokenHash, input));
      }
      if (input.action === 'inbox_detail_state') {
        if (!store.inboxDetailState) return respond({ error: 'unavailable' }, 503);
        return respond(await store.inboxDetailState(tokenHash, input));
      }
      if (input.action === 'inbox_detail_import') {
        if (!store.inboxDetailImport) return respond({ error: 'unavailable' }, 503);
        return respond(await store.inboxDetailImport(tokenHash, input));
      }
      if (input.action === 'message_claim') {
        if (!store.messageClaim) return respond({ error: 'unavailable' }, 503);
        return respond(await store.messageClaim(tokenHash, input));
      }
      if (input.action === 'message_start') {
        if (!store.messageStart) return respond({ error: 'unavailable' }, 503);
        return respond(await store.messageStart(tokenHash, input));
      }
      if (input.action === 'message_finish') {
        if (!store.messageFinish) return respond({ error: 'unavailable' }, 503);
        return respond(await store.messageFinish(tokenHash, input));
      }
      if (input.action !== 'heartbeat' && input.action !== 'import')
        return respond({ error: 'unavailable' }, 503);
      return respond(await store.ingest(tokenHash, input));
    } catch (error) {
      if (error instanceof LocalExtensionStoreError)
        return respond(
          {
            error:
              error.code === 'access'
                ? 'unauthorized'
                : error.code === 'conflict'
                  ? 'conflict'
                  : 'invalid_request',
          },
          error.code === 'access' ? 401 : error.code === 'conflict' ? 409 : 400,
        );
      return respond({ error: 'unavailable' }, 503);
    }
  };
}

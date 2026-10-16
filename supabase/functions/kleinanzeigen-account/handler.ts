import {
  parseKleinanzeigenUserJobRequest,
  parseKleinanzeigenListingJob,
  type KleinanzeigenUserJobRequest,
} from '../_shared/kleinanzeigen-job-contracts.ts';
import { parseKleinanzeigenDraftContent } from '../_shared/kleinanzeigen-listing-validation.mts';
import { parseKleinanzeigenTransferRequest } from '../_shared/kleinanzeigen-listing-validation.mts';
import type { KleinanzeigenTransferRequest } from '../_shared/kleinanzeigen-listing-contracts.ts';
import { parseTransferSourceRead, validPublicTransferDraft } from './transfer-response.ts';
import {
  parseKleinanzeigenAccounts,
  parseKleinanzeigenPublicationPage,
} from '../_shared/kleinanzeigen-contracts.ts';
import { parseKleinanzeigenSyncRun } from '../_shared/kleinanzeigen-contracts.ts';
import {
  kleinanzeigenRecord,
  parseKleinanzeigenAccountRequest,
  parseKleinanzeigenBinding,
  type KleinanzeigenAccountRequest,
} from '../_shared/kleinanzeigen-contracts.ts';
export interface KleinanzeigenAccountStore {
  executeJobs?(bearer: string, input: KleinanzeigenUserJobRequest): Promise<unknown>;
  executeTransfer?(bearer: string, input: KleinanzeigenTransferRequest): Promise<unknown>;
  authenticate(bearer: string): Promise<boolean>;
  execute(bearer: string, input: KleinanzeigenAccountRequest): Promise<unknown>;
}
export class KleinanzeigenAccountError extends Error {
  constructor(readonly code: 'forbidden' | 'conflict' | 'invalid_request') {
    super(code);
  }
}
function allowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (
      u.origin === origin &&
      (origin === 'https://app.flipbase.de' ||
        origin === 'https://flipbase.de' ||
        (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))
    );
  } catch {
    return false;
  }
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('empty');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new Error('large');
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function createKleinanzeigenAccountHandler(store: KleinanzeigenAccountStore) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigin(origin))
      return new Response('{"error":"forbidden"}', {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin ?? 'https://app.flipbase.de',
      'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    };
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    const bearer = request.headers.get('authorization') ?? '';
    // Installationssecrets sind keine Nutzer-JWTs. Die eigentliche JWT-Prüfung übernimmt Supabase Auth.
    if (
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(bearer) ||
      bearer.length > 8192
    )
      return respond({ error: 'unauthorized' }, 401);
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') ?? ''))
      return respond({ error: 'invalid_request' }, 400);
    let input:
      | KleinanzeigenAccountRequest
      | KleinanzeigenTransferRequest
      | KleinanzeigenUserJobRequest
      | null;
    try {
      const body = await readBody(request);
      input =
        parseKleinanzeigenAccountRequest(body) ??
        parseKleinanzeigenTransferRequest(body) ??
        parseKleinanzeigenUserJobRequest(body);
    } catch {
      return respond({ error: 'invalid_request' }, 400);
    }
    if (!input) return respond({ error: 'invalid_request' }, 400);
    try {
      if (!(await store.authenticate(bearer))) return respond({ error: 'unauthorized' }, 401);
      if (
        input.action === 'listing_enqueue' ||
        input.action === 'listing_status' ||
        input.action === 'listing_reconcile' ||
        input.action === 'listing_latest'
      ) {
        if (!store.executeJobs) return respond({ error: 'unavailable' }, 503);
        const reply = await store.executeJobs(bearer, input);
        if (input.action === 'listing_latest' && reply === null) return respond(null);
        const job = parseKleinanzeigenListingJob(reply, input, parseKleinanzeigenDraftContent);
        if (
          !job ||
          (input.action === 'listing_enqueue' &&
            (job.draftId !== input.draftId || job.draftRevision !== input.expectedRevision)) ||
          (input.action === 'listing_latest' && job.draftId !== input.draftId) ||
          ((input.action === 'listing_status' || input.action === 'listing_reconcile') &&
            job.id !== input.jobId)
        )
          return respond({ error: 'invalid_response' }, 502);
        return respond(job);
      }
      if (input.action === 'prepare_transfer' || input.action === 'save_transfer') {
        if (!store.executeTransfer) return respond({ error: 'unavailable' }, 503);
        const reply = await store.executeTransfer(bearer, input);
        if (input.action === 'prepare_transfer') {
          const result = parseTransferSourceRead(reply, input);
          return result ? respond(result) : respond({ error: 'invalid_response' }, 502);
        }
        return validPublicTransferDraft(reply, input)
          ? respond(reply)
          : respond({ error: 'invalid_response' }, 502);
      }
      const reply = await store.execute(bearer, input);
      if (input.action === 'read_accounts') {
        const result = parseKleinanzeigenAccounts(reply, input.workspaceId);
        return result ? respond(result) : respond({ error: 'invalid_response' }, 502);
      }
      if (input.action === 'read_publications') {
        const result = parseKleinanzeigenPublicationPage(reply, input, input.limit);
        return result ? respond(result) : respond({ error: 'invalid_response' }, 502);
      }
      if (input.action === 'request_sync') {
        const result = parseKleinanzeigenSyncRun(reply, input);
        return result ? respond(result) : respond({ error: 'invalid_response' }, 502);
      }
      if (input.action === 'connect') {
        const binding = parseKleinanzeigenBinding(reply, input.workspaceId);
        if (
          !binding ||
          binding.externalAccountId !== input.externalAccountId ||
          binding.displayName !== input.displayName ||
          binding.accountType !== input.accountType ||
          binding.canPublish !== input.canPublish ||
          binding.status === 'disconnected'
        )
          return respond({ error: 'invalid_response' }, 502);
        return respond(binding);
      }
      if (!kleinanzeigenRecord(reply) || Object.keys(reply).join(',') !== 'ok' || reply.ok !== true)
        return respond({ error: 'invalid_response' }, 502);
      return respond({ ok: true });
    } catch (error) {
      if (error instanceof KleinanzeigenAccountError)
        return respond(
          { error: error.code },
          error.code === 'forbidden' ? 403 : error.code === 'conflict' ? 409 : 400,
        );
      return respond({ error: 'unavailable' }, 503);
    }
  };
}

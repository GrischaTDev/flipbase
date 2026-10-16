import {
  parseKleinanzeigenInstallJobRequest,
  parseKleinanzeigenInstallJobReply,
  type KleinanzeigenInstallJobRequest,
} from '../_shared/kleinanzeigen-job-contracts.ts';
import { parseKleinanzeigenDraftContent } from '../_shared/kleinanzeigen-listing-validation.mts';
import { validateKleinanzeigenPhoto } from '../_shared/kleinanzeigen-photo.ts';
import type { loadKleinanzeigenListingPhoto } from './listing-photo.ts';
import {
  parseKleinanzeigenFormImport,
  parseKleinanzeigenFormResult,
  type KleinanzeigenFormImport,
} from '../_shared/kleinanzeigen-form-contracts.ts';
import {
  parseKleinanzeigenSyncRequest,
  parseKleinanzeigenSyncReply,
  type KleinanzeigenSyncRequest,
} from '../_shared/kleinanzeigen-sync-contracts.ts';
import {
  parseKleinanzeigenExtensionRequest,
  parseKleinanzeigenExtensionSession,
  type KleinanzeigenExtensionRequest,
} from '../_shared/kleinanzeigen-contracts.ts';
export type { KleinanzeigenExtensionRequest } from '../_shared/kleinanzeigen-contracts.ts';
export interface KleinanzeigenExtensionStore {
  job?(
    hash: string,
    input: Exclude<KleinanzeigenInstallJobRequest, { action: 'job_photo' }>,
  ): Promise<unknown>;
  photo?(
    hash: string,
    input: Extract<KleinanzeigenInstallJobRequest, { action: 'job_photo' }>,
  ): Promise<Awaited<ReturnType<typeof loadKleinanzeigenListingPhoto>>>;
  formSchema?(hash: string, input: KleinanzeigenFormImport): Promise<unknown>;
  sync?(hash: string, input: KleinanzeigenSyncRequest): Promise<unknown>;
  session(hash: string, input: KleinanzeigenExtensionRequest): Promise<unknown>;
}
export class KleinanzeigenExtensionStoreError extends Error {
  constructor(readonly code: 'access' | 'conflict' | 'invalid') {
    super(code);
  }
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('empty');
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 1048576) {
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
export function createKleinanzeigenExtensionHandler(store: KleinanzeigenExtensionStore) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    };
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/u.test(origin))
      return new Response('{"error":"forbidden"}', {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [0-9a-f]{64}$/u.test(authorization))
      return respond({ error: 'unauthorized' }, 401);
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type') ?? ''))
      return respond({ error: 'invalid_request' }, 400);
    let input:
      | KleinanzeigenExtensionRequest
      | KleinanzeigenSyncRequest
      | KleinanzeigenFormImport
      | KleinanzeigenInstallJobRequest
      | null;
    try {
      const body = await readBody(request);
      input =
        parseKleinanzeigenExtensionRequest(body) ??
        parseKleinanzeigenSyncRequest(body) ??
        parseKleinanzeigenFormImport(body) ??
        parseKleinanzeigenInstallJobRequest(body);
    } catch {
      return respond({ error: 'invalid_request' }, 400);
    }
    if (!input) return respond({ error: 'invalid_request' }, 400);
    try {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(authorization.slice(7)),
      );
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      if (input.action === 'job_photo') {
        if (!store.photo) return respond({ error: 'unavailable' }, 503);
        const photo = await store.photo(hash, input);
        if (
          photo.imageId !== input.imageId ||
          !(photo.bytes instanceof Uint8Array) ||
          photo.bytes.byteLength !== photo.byteSize ||
          photo.byteSize < 1 ||
          photo.byteSize > 12582912 ||
          !/^[a-f0-9]{64}$/u.test(photo.sha256)
        )
          return respond({ error: 'invalid_response' }, 502);
        try {
          validateKleinanzeigenPhoto(photo.bytes, photo.mimeType);
        } catch {
          return respond({ error: 'invalid_response' }, 502);
        }
        return new Response(photo.bytes as BodyInit, {
          headers: {
            ...headers,
            'Content-Type': photo.mimeType,
            'Content-Length': String(photo.byteSize),
            'X-Flipbase-Workspace-Id': input.workspaceId,
            'X-Flipbase-Connection-Id': input.connectionId,
            'X-Flipbase-Job-Id': input.jobId,
            'X-Flipbase-Image-Id': photo.imageId,
            'X-Flipbase-Image-Sha256': photo.sha256,
            'Access-Control-Expose-Headers':
              'X-Flipbase-Workspace-Id, X-Flipbase-Connection-Id, X-Flipbase-Job-Id, X-Flipbase-Image-Id, X-Flipbase-Image-Sha256',
          },
        });
      }
      if (
        input.action === 'quota_observation' ||
        input.action === 'job_claim' ||
        input.action === 'job_check' ||
        input.action === 'job_begin' ||
        input.action === 'job_finish'
      ) {
        if (!store.job) return respond({ error: 'unavailable' }, 503);
        const result = parseKleinanzeigenInstallJobReply(
          await store.job(hash, input),
          input,
          parseKleinanzeigenDraftContent,
        );
        return result ? respond(result) : respond({ error: 'invalid_response' }, 502);
      }
      const result =
        input.action === 'form_schema'
          ? store.formSchema
            ? parseKleinanzeigenFormResult(await store.formSchema(hash, input), {
                workspaceId: input.workspaceId,
                connectionId: input.connectionId,
                externalAccountId: input.externalAccountId,
                generation: input.generation,
                categoryPath: input.schema.categoryPath,
              })
            : null
          : input.action === 'heartbeat'
            ? parseKleinanzeigenExtensionSession(await store.session(hash, input), input)
            : store.sync
              ? parseKleinanzeigenSyncReply(await store.sync(hash, input), input)
              : null;
      return result ? respond(result) : respond({ error: 'invalid_response' }, 502);
    } catch (error) {
      if (error instanceof KleinanzeigenExtensionStoreError)
        return respond(
          {
            error:
              error.code === 'access'
                ? 'forbidden'
                : error.code === 'conflict'
                  ? 'conflict'
                  : 'invalid_request',
          },
          error.code === 'access' ? 403 : error.code === 'conflict' ? 409 : 400,
        );
      return respond({ error: 'unavailable' }, 503);
    }
  };
}

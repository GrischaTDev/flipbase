import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createAiConnectionTokenHandler } from './token-handler.ts';
import { createAiConnectionHandler } from './handler.ts';
import { validateAiConnectionImage } from './image-validation.ts';
import { deriveAiConnectionRequestId } from './request-id.ts';
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const url = Deno.env.get('SUPABASE_URL') ?? '';
const externalUrl =
  Deno.env.get('AI_CONNECTION_PUBLIC_URL') ?? 'https://api.flipbase.de/functions/v1/ai-connection';
const authorizationServer =
  Deno.env.get('AI_CONNECTION_AUTHORIZATION_SERVER') ?? 'https://api.flipbase.de/auth/v1';
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
});
const publicStorageUrl = (signed: string) => {
  const parsed = new URL(signed);
  return new URL(parsed.pathname + parsed.search, new URL(externalUrl).origin).href;
};
const user = (token: string) =>
  createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  });
async function imageUploadArgs(
  token: string,
  imageId: unknown,
  expectedRevision: unknown,
  requestId: string | null,
) {
  const verified = await user(token).rpc('ai_connection_context');
  if (verified.error || verified.data?.access_mode !== 'edit')
    throw new Error('Die KI-Freigabe ist nicht mehr gültig.');
  return {
    p_grant_id: verified.data.id,
    p_auth_session_id: verified.data.session_id,
    p_image_id: imageId,
    p_expected_revision: expectedRevision,
    p_request_id: requestId,
  };
}
async function commitImage(
  token: string,
  imageId: unknown,
  expectedRevision: unknown,
  requestId: string | null,
) {
  const args = await imageUploadArgs(token, imageId, expectedRevision, requestId);
  const descriptor = await admin.rpc('ai_connection_image_upload', {
    ...args,
    p_operation: 'describe',
  });
  if (
    descriptor.error ||
    !descriptor.data ||
    descriptor.data.bucket !== 'marketplace-listing-media'
  )
    throw new Error('Der Bild-Upload wurde nicht gefunden.');
  if (descriptor.data.completed) return descriptor.data.completed;
  const file = await admin.storage.from(descriptor.data.bucket).download(descriptor.data.path);
  if (file.error || !file.data) throw new Error('Der Bild-Upload ist noch nicht vollständig.');
  await validateAiConnectionImage(
    new Uint8Array(await file.data.arrayBuffer()),
    descriptor.data.mimeType,
    descriptor.data.byteSize,
  );
  const committed = await admin.rpc('ai_connection_image_upload', {
    ...args,
    p_operation: 'commit',
  });
  if (committed.error) throw new Error(committed.error.message);
  return committed.data;
}
async function importOriginalPhotos(token: string, requestId: string) {
  const verified = await user(token).rpc('ai_connection_context');
  if (verified.error || verified.data?.access_mode !== 'edit')
    throw new Error('Die KI-Freigabe ist nicht mehr gültig.');
  const args = {
    p_grant_id: verified.data.id,
    p_auth_session_id: verified.data.session_id,
    p_request_id: requestId,
  };
  try {
    const originals = await admin.rpc('ai_connection_original_photos', {
      ...args,
      p_operation: 'describe',
    });
    if (originals.error) throw originals.error;
    let revision = originals.data.expectedRevision;
    for (const [index, image] of originals.data.images.entries()) {
      const reserveId = await deriveAiConnectionRequestId(requestId, 'reserve-original', index);
      const commitId = await deriveAiConnectionRequestId(requestId, 'commit-original', index);
      const reserved = await user(token).rpc('ai_connection_call', {
        p_action: 'prepare_vinted_image_upload',
        p_request_id: reserveId,
        p_input: {
          draft_id: originals.data.draftId,
          file_name: image.fileName,
          mime_type: image.mimeType,
          byte_size: image.byteSize,
        },
      });
      if (reserved.error) throw reserved.error;
      const descriptor = await admin.rpc('ai_connection_image_upload', {
        ...(await imageUploadArgs(token, reserved.data.id, revision, commitId)),
        p_operation: 'describe',
      });
      if (descriptor.error) throw descriptor.error;
      if (descriptor.data.completed) {
        revision = descriptor.data.completed.revision;
        continue;
      }
      const source = await admin.storage
        .from('marketplace-listing-media')
        .download(image.storagePath);
      if (source.error) throw source.error;
      const bytes = new Uint8Array(await source.data.arrayBuffer());
      await validateAiConnectionImage(bytes, image.mimeType, image.byteSize);
      const uploaded = await admin.storage
        .from('marketplace-listing-media')
        .upload(reserved.data.storagePath, bytes, { contentType: image.mimeType, upsert: false });
      if (uploaded.error) {
        const existing = await admin.storage
          .from('marketplace-listing-media')
          .download(reserved.data.storagePath);
        if (existing.error) throw uploaded.error;
        const expectedHash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const actualHash = new Uint8Array(
          await crypto.subtle.digest('SHA-256', await existing.data.arrayBuffer()),
        );
        if (!expectedHash.every((value, i) => actualHash[i] === value))
          throw new Error('Das Originalfoto stimmt nicht überein.');
      }
      const committed = await commitImage(token, reserved.data.id, revision, commitId);
      revision = committed.revision;
    }
    const finished = await admin.rpc('ai_connection_original_photos', {
      ...args,
      p_operation: 'finish',
    });
    if (finished.error) throw finished.error;
  } catch {
    await admin.rpc('ai_connection_original_photos', { ...args, p_operation: 'fail' });
  }
}
const handler = createAiConnectionHandler(
  {
    endpoint: externalUrl,
    authorizationServer,
    allowedOrigins: (
      Deno.env.get('AI_CONNECTION_ALLOWED_ORIGINS') ?? 'https://app.flipbase.de,https://chatgpt.com'
    ).split(','),
  },
  {
    async connected(token) {
      await user(token).rpc('ai_connection_connected');
    },
    async context(token) {
      const { data, error } = await user(token).rpc('ai_connection_context');
      if (error || !data || typeof data !== 'object') throw new Error('Ungültige KI-Verbindung.');
      return data;
    },
    async call(token, action, input, requestId) {
      if (action === 'commit_vinted_image') {
        return commitImage(token, input['image_id'], input['expected_revision'], requestId);
      }
      const { data, error } = await user(token).rpc('ai_connection_call', {
        p_action: action,
        p_input: input,
        p_request_id: requestId,
      });
      if (error) throw new Error(error.message);
      if (action === 'import_vinted_original_photos' && requestId && data?.status !== 'completed')
        EdgeRuntime.waitUntil(importOriginalPhotos(token, requestId));
      if (action === 'prepare_vinted_image_upload') {
        const upload = await admin.storage
          .from('marketplace-listing-media')
          .createSignedUploadUrl(data.storagePath, { upsert: false });
        if (upload.error) throw new Error('Die Upload-Adresse konnte nicht erstellt werden.');
        return {
          ...data,
          uploadUrl: publicStorageUrl(upload.data.signedUrl),
          method: 'PUT',
          headers: {
            'Content-Type': input['mime_type'],
            apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          },
        };
      }
      if (action === 'read_file') {
        if (
          !['purchase-documents', 'expense-documents', 'marketplace-listing-media'].includes(
            data?.bucket,
          )
        )
          throw new Error('Die Datei wurde nicht gefunden.');
        const download = await admin.storage.from(data.bucket).createSignedUrl(data.path, 60);
        if (download.error) throw new Error('Die Datei kann nicht gelesen werden.');
        return {
          fileName: data.fileName,
          mimeType: data.mimeType,
          downloadUrl: publicStorageUrl(download.data.signedUrl),
          expiresIn: 60,
        };
      }
      return data;
    },
  },
);
const tokenHandler = createAiConnectionTokenHandler(
  Deno.env.get('AI_CONNECTION_NATIVE_TOKEN_URL') ?? 'http://auth:9999/oauth/token',
  {
    async grant(clientId, code) {
      const { data, error } = await admin.rpc('ai_connection_token_grant', {
        p_client_id: clientId,
        p_code: code,
      });
      if (error || typeof data !== 'string') throw new Error('invalid_grant');
      return data;
    },
    async context(token) {
      const { data, error } = await user(token).rpc('ai_connection_context');
      if (error || typeof data?.id !== 'string') throw new Error('invalid_grant');
      return data;
    },
  },
);
Deno.serve((request) =>
  new URL(request.url).pathname.endsWith('/ai-connection/oauth/token')
    ? tokenHandler(request)
    : handler(request),
);

// Die Repository-Regeln verlangen versionierte npm-Imports für Edge Functions.
// deno-lint-ignore no-import-prefix
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { inspectLabelPng, originalLabelMime } from './png.ts';

const origins = new Set(
  (
    Deno.env.get('LABEL_MEDIA_ALLOWED_ORIGINS') ??
    'https://app.flipbase.de,http://localhost:4200,http://127.0.0.1:4200'
  ).split(','),
);

async function readBody(request: Request, maximumBytes: number): Promise<Blob> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing_body');
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumBytes) throw new Error('body_too_large');
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return new Blob(parts.map((part) => new Uint8Array(part)));
}

async function digest(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: 'forbidden' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'method' }, 405);
  const token = request.headers.get('authorization');
  if (!token?.startsWith('Bearer ')) return reply({ error: 'unauthorized' }, 401);
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: authError } = await userClient.auth.getUser(token.slice(7));
    if (authError || !identity.user) return reply({ error: 'forbidden' }, 403);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (request.headers.get('content-type')?.startsWith('application/json')) {
      const input = JSON.parse(await (await readBody(request, 512)).text());
      if (
        !input ||
        typeof input !== 'object' ||
        Object.keys(input).length !== 1 ||
        !Number.isInteger(input.assetId) ||
        input.assetId < 1
      )
        return reply({ error: 'validation' }, 400);
      const path = `${input.assetId}.png`;
      const { data: readable, error: readError } = await userClient.rpc('can_read_label_image', {
        p_path: path,
      });
      if (readError || readable !== true) return reply({ error: 'forbidden' }, 403);
      const { data: signed, error: signError } = await service.storage
        .from('label-images')
        .createSignedUrl(path, 60);
      if (signError) return reply({ error: 'unavailable' }, 404);
      return reply({ signedUrl: signed.signedUrl });
    }
    const { data: operator, error: roleError } = await userClient.rpc('is_platform_operator');
    if (roleError || operator !== true) return reply({ error: 'forbidden' }, 403);
    const form = await new Response(await readBody(request, 16000000), {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
    const original = form.get('original');
    const normalized = form.get('image');
    const requestId = form.get('requestId');
    const attribution = form.get('attribution');
    const allowedUse = form.get('allowedUse');
    if (
      !(original instanceof File) ||
      !(normalized instanceof File) ||
      original.size < 1 ||
      original.size > 10000000 ||
      normalized.size > 6000000 ||
      typeof requestId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(requestId) ||
      typeof attribution !== 'string' ||
      typeof allowedUse !== 'string'
    ) {
      return reply({ error: 'validation' }, 400);
    }
    const originalBytes = new Uint8Array(await original.arrayBuffer());
    const mime = originalLabelMime(originalBytes);
    const image = await inspectLabelPng(new Uint8Array(await normalized.arrayBuffer()));
    const input = {
      originalHash: await digest(originalBytes),
      imageHash: await digest(image.bytes),
      attribution,
      allowedUse,
    };
    const { data: reservation, error: reserveError } = await userClient.rpc('reserve_label_image', {
      p_request_id: requestId,
      p_input: input,
    });
    if (
      reserveError ||
      !reservation ||
      typeof reservation.assetId !== 'number' ||
      typeof reservation.originalPath !== 'string'
    ) {
      return reply({ error: 'reserve_failed' }, 400);
    }
    for (const [bucket, path, bytes, contentType] of [
      ['label-originals', reservation.originalPath, originalBytes, mime],
      ['label-images', `${reservation.assetId}.png`, image.bytes, 'image/png'],
    ] as const) {
      const { error } = await service.storage
        .from(bucket)
        .upload(path, bytes, { contentType, upsert: false });
      // Gleiches reserviertes Uploadpaket darf nach verlorener Antwort erneut bestätigt werden.
      if (error && !('statusCode' in error && String(error.statusCode) === '409'))
        throw new Error('upload_failed');
    }
    const { data: receipt, error: completeError } = await service.rpc('complete_label_image', {
      p_asset_id: reservation.assetId,
      p_actor_id: identity.user.id,
      p_original_bytes: original.size,
      p_mime_type: mime,
      p_width: image.width,
      p_height: image.height,
      p_attribution: attribution,
      p_allowed_use: allowedUse,
    });
    if (completeError) throw new Error('complete_failed');
    return reply(receipt);
  } catch {
    return reply({ error: 'upload_not_confirmed' }, 400);
  }
});

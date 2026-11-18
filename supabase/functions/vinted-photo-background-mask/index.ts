import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readLimitedJsonBody } from '../_shared/limited-request-body.ts';
import {
  encodeBase64,
  generateForegroundMask,
  hasPngSignature,
  parseImageDataUri,
  resolvePhotoMaskProvider,
  type PhotoMaskProviderConfig,
  type PhotoMaskProviderName,
} from './provider.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const origins = new Set(
  (
    Deno.env.get('VINTED_AI_ALLOWED_ORIGINS') ??
    'https://app.flipbase.de,https://flipbase.de,http://localhost:4200,http://127.0.0.1:4200,http://localhost'
  )
    .split(',')
    .map((origin) => origin.trim()),
);

type MaskReservation = {
  id: string;
  storagePath: string;
  cached: boolean;
  error?: string;
};

export interface MaskDependencies {
  authenticate(token: string): Promise<string | null>;
  authorize(token: string, workspaceId: string): Promise<boolean>;
  provider(): PhotoMaskProviderConfig | null;
  reserve(
    userId: string,
    workspaceId: string,
    hash: string,
    provider: PhotoMaskProviderName,
    model: string,
  ): Promise<MaskReservation>;
  save(id: string, values: Record<string, unknown>): Promise<void>;
  uploadMask(storagePath: string, bytes: Uint8Array): Promise<void>;
  downloadStoredMask(storagePath: string): Promise<Uint8Array>;
  generateMask(config: PhotoMaskProviderConfig, imageDataUrl: string): Promise<Uint8Array>;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createMaskHandler(deps: MaskDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          Vary: 'Origin',
          ...(origin && origins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
          'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      });
    if (origin && !origins.has(origin)) return respond({ error: 'forbidden_origin' }, 403);
    if (request.method === 'OPTIONS') return respond({});
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

    const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) return respond({ error: 'unauthorized' }, 401);

    let userId: string | null;
    try {
      userId = await deps.authenticate(token);
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503);
    }
    if (!userId) return respond({ error: 'unauthorized' }, 401);

    let body: Record<string, unknown> | null = null;
    try {
      const parsed = await readLimitedJsonBody(request, 8 * 1024 * 1024);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return respond({ error: 'invalid_input' }, 400);
    }

    const workspaceId = body?.['workspaceId'];
    const imageDataUrl = body?.['imageDataUrl'];
    if (
      typeof workspaceId !== 'string' ||
      !UUID.test(workspaceId) ||
      typeof imageDataUrl !== 'string'
    ) {
      return respond({ error: 'invalid_input' }, 400);
    }

    let inputBytes: Uint8Array;
    try {
      inputBytes = parseImageDataUri(imageDataUrl).bytes;
    } catch {
      return respond({ error: 'invalid_image' }, 400);
    }

    try {
      if (!(await deps.authorize(token, workspaceId))) return respond({ error: 'forbidden' }, 403);
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503);
    }

    const provider = deps.provider();
    if (!provider) return respond({ error: 'not_configured' }, 503);

    const inputHash = await sha256Hex(inputBytes);
    let reservation: MaskReservation;
    try {
      reservation = await deps.reserve(
        userId,
        workspaceId,
        inputHash,
        provider.provider,
        provider.model,
      );
    } catch {
      return respond({ error: 'reservation_unavailable' }, 503);
    }

    if (reservation.error) {
      return respond(
        { error: reservation.error },
        reservation.error === 'mask_busy' ? 409 : reservation.error === 'mask_limit' ? 429 : 400,
      );
    }

    if (reservation.cached) {
      try {
        const storedBytes = await deps.downloadStoredMask(reservation.storagePath);
        if (hasPngSignature(storedBytes)) {
          return respond({
            maskId: reservation.id,
            maskBase64: encodeBase64(storedBytes),
            maskMimeType: 'image/png',
            cached: true,
          });
        }
      } catch {
        return respond({ error: 'mask_storage_unavailable' }, 503);
      }
      return respond({ error: 'mask_storage_unavailable' }, 503);
    }

    let maskBytes: Uint8Array;
    try {
      maskBytes = await deps.generateMask(provider, imageDataUrl);
      if (!hasPngSignature(maskBytes)) throw new Error('Ungueltiges Masken-PNG.');
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      await deps
        .save(reservation.id, {
          status: timedOut ? 'unknown' : 'failed',
          error_code: timedOut ? 'provider_timeout' : 'provider_failed',
          finished_at: new Date().toISOString(),
        })
        .catch(() => undefined);
      return respond(
        { error: timedOut ? 'provider_timeout' : 'provider_failed' },
        timedOut ? 504 : 502,
      );
    }

    try {
      await deps.uploadMask(reservation.storagePath, maskBytes);
      await deps.save(reservation.id, {
        status: 'completed',
        byte_size: maskBytes.byteLength,
        estimated_cost_usd: provider.estimatedCostUsd,
        finished_at: new Date().toISOString(),
      });
    } catch {
      await deps
        .save(reservation.id, {
          status: 'unknown',
          error_code: 'storage_failed',
          finished_at: new Date().toISOString(),
        })
        .catch(() => undefined);
      return respond({ error: 'mask_storage_unavailable' }, 503);
    }

    return respond({
      maskId: reservation.id,
      maskBase64: encodeBase64(maskBytes),
      maskMimeType: 'image/png',
      cached: false,
    });
  };
}

export function createProductionDependencies(): MaskDependencies {
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = (token: string) =>
    createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  return {
    provider: () => resolvePhotoMaskProvider(),
    async authenticate(token) {
      const { data, error } = await user(token).auth.getUser();
      return error ? null : (data.user?.id ?? null);
    },
    async authorize(token, workspaceId) {
      const { data, error } = await user(token).rpc('marketplace_can_manage', {
        p_workspace_id: workspaceId,
      });
      if (error) throw new Error('Authorization unavailable');
      return data === true;
    },
    async reserve(userId, workspaceId, hash, providerName, model) {
      const { data, error } = await admin.rpc('reserve_vinted_photo_background_mask', {
        p_user_id: userId,
        p_workspace_id: workspaceId,
        p_input_hash: hash,
        p_provider: providerName,
        p_model: model,
      });
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Reservation failed');
      }
      return data as MaskReservation;
    },
    async save(id, values) {
      const { data, error } = await admin
        .from('vinted_photo_background_masks')
        .update(values)
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) throw new Error('Mask tracking unavailable');
    },
    async uploadMask(storagePath, bytes) {
      const { error } = await admin.storage
        .from('marketplace-listing-masks')
        .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });
      if (error) throw error;
    },
    async downloadStoredMask(storagePath) {
      const { data, error } = await admin.storage
        .from('marketplace-listing-masks')
        .download(storagePath);
      if (error || !data) throw new Error('Mask download failed');
      return new Uint8Array(await data.arrayBuffer());
    },
    generateMask: (config, imageDataUrl) => generateForegroundMask(config, imageDataUrl),
  };
}

if (import.meta.main) Deno.serve(createMaskHandler(createProductionDependencies()));

import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { readLimitedJsonBody } from '../_shared/limited-request-body.ts';
import {
  MODEL_PRICES,
  PROMPT_VERSION,
  parseAnalysis,
  parseUsage,
  record,
  type SearchModel,
} from './analysis.ts';

import { searchOpenAi, type ResearchListing as Listing } from './research.ts';
import { listingImages, loadListingDetails } from './listing-details.ts';
export { searchOpenAi, listingImages };

type Reservation = {
  id: number;
  cached: boolean;
  result?: Record<string, unknown>;
  error?: string;
};
export interface SearchDependencies {
  authenticate(token: string): Promise<string | null>;
  authorize(token: string, workspaceId: string): Promise<boolean>;
  configured(): boolean;
  listing(id: string): Promise<Listing | null>;
  reserve(
    userId: string,
    workspaceId: string,
    listingId: string,
    hash: string,
    model: SearchModel,
  ): Promise<Reservation>;
  save(id: number, values: Record<string, unknown>): Promise<void>;
  usage(token: string, workspaceId: string): Promise<unknown>;
  search(listing: Listing, images: string[], model: SearchModel): Promise<Record<string, unknown>>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const origins = new Set(
  (
    Deno.env.get('VINTED_AI_ALLOWED_ORIGINS') ??
    'https://app.flipbase.de,https://flipbase.de,http://localhost:4200,http://127.0.0.1:4200,http://localhost'
  )
    .split(',')
    .map((origin) => origin.trim()),
);
export function createSearchHandler(deps: SearchDependencies) {
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
    let body: Record<string, unknown> | null;
    try {
      userId = await deps.authenticate(token);
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503);
    }
    if (!userId) return respond({ error: 'unauthorized' }, 401);
    try {
      body = record(await readLimitedJsonBody(request, 4096));
    } catch {
      return respond({ error: 'invalid_input' }, 400);
    }
    const workspaceId = body?.['workspaceId'];
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId))
      return respond({ error: 'invalid_input' }, 400);
    try {
      if (!(await deps.authorize(token, workspaceId))) return respond({ error: 'forbidden' }, 403);
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503);
    }
    if (body?.['action'] === 'usage') {
      try {
        return respond({ stats: await deps.usage(token, workspaceId) });
      } catch {
        return respond({ error: 'usage_unavailable' }, 503);
      }
    }
    const listingId = body?.['listingId'];
    const model = body?.['model'] ?? 'gpt-6-luna';
    if (
      typeof listingId !== 'string' ||
      !UUID.test(listingId) ||
      typeof model !== 'string' ||
      !Object.hasOwn(MODEL_PRICES, model)
    )
      return respond({ error: 'invalid_input' }, 400);
    if (!deps.configured()) return respond({ error: 'not_configured' }, 503);
    let reservation: Reservation;
    let listing: Listing;
    let images: string[];
    try {
      const found = await deps.listing(listingId);
      if (!found) return respond({ error: 'listing_not_found' }, 404);
      if (
        found.currency !== 'EUR' ||
        !Number.isFinite(found.total_price) ||
        found.total_price < 0 ||
        !Number.isFinite(found.item_price) ||
        found.item_price < 0
      )
        return respond({ error: 'unsupported_currency' }, 400);
      listing = {
        ...found,
        title: found.title.slice(0, 300),
        description: found.description?.slice(0, 5000) ?? null,
      };
      images = listingImages(found.image_urls);
      const hashBytes = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          JSON.stringify({ version: PROMPT_VERSION, ...listing, image_urls: images }),
        ),
      );
      const hash = [...new Uint8Array(hashBytes)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      reservation = await deps.reserve(userId, workspaceId, listingId, hash, model as SearchModel);
      if (reservation.error) return respond({ error: reservation.error }, 429);
      if (reservation.cached && !reservation.result)
        return respond({ error: 'tracking_unavailable' }, 503);
      if (reservation.cached && reservation.result)
        return respond({
          ...reservation.result,
          cacheHit: true,
          stats: await deps.usage(token, workspaceId),
        });
    } catch {
      return respond({ error: 'tracking_unavailable' }, 503);
    }

    let raw: Record<string, unknown>;
    try {
      raw = await deps.search(listing, images, model as SearchModel);
    } catch {
      // Bei Verbindungsabbruch ist unbekannt, ob OpenAI bereits Kosten erzeugt hat.
      try {
        await deps.save(reservation.id, {
          status: 'unknown',
          error_code: 'provider_unavailable',
          finished_at: new Date().toISOString(),
        });
      } catch {
        return respond({ error: 'tracking_unavailable' }, 503);
      }
      return respond({ error: 'search_failed' }, 502);
    }
    const usage = parseUsage(raw, model as SearchModel);
    try {
      // Vor der Ergebnisprüfung speichern: Auch unvollständige/abgelehnte Antworten kosten.
      await deps.save(reservation.id, {
        response_id: typeof raw['id'] === 'string' ? raw['id'] : null,
        input_tokens: usage.inputTokens,
        cached_input_tokens: usage.cachedInputTokens,
        output_tokens: usage.outputTokens,
        web_search_calls: usage.webSearchCalls,
        estimated_cost_usd: usage.estimatedCostUsd,
        pricing: usage.pricing,
      });
    } catch {
      return respond({ error: 'tracking_unavailable' }, 503);
    }
    let result: Record<string, unknown>;
    let researchIncomplete = false;
    try {
      const analysis = parseAnalysis(raw, listing.url);
      researchIncomplete = Boolean(
        analysis.research && Object.values(analysis.research).some((section) => !section.completed),
      );
      result = {
        analysis,
        model,
        usage,
        cacheHit: false,
        searchedAt: new Date().toISOString(),
        listing: {
          title: listing.title,
          itemPrice: listing.item_price,
          totalPrice: listing.total_price,
          currency: listing.currency,
          photoCount: images.length,
          detailsStatus: listing.detailsStatus ?? null,
          hasDescription: Boolean(listing.description),
        },
      };
    } catch {
      try {
        await deps.save(reservation.id, {
          status: 'failed',
          error_code: 'invalid_analysis',
          finished_at: new Date().toISOString(),
        });
      } catch {
        return respond({ error: 'tracking_unavailable' }, 503);
      }
      return respond({ error: 'analysis_incomplete', usage }, 502);
    }
    try {
      await deps.save(reservation.id, {
        status: researchIncomplete ? 'failed' : 'completed',
        error_code: researchIncomplete ? 'research_incomplete' : null,
        result,
        finished_at: new Date().toISOString(),
      });
      return respond({ ...result, stats: await deps.usage(token, workspaceId) });
    } catch {
      return respond({ error: 'tracking_unavailable' }, 503);
    }
  };
}

export function createProductionDependencies(): SearchDependencies {
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const user = (token: string) =>
    createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  return {
    configured: () => Boolean(Deno.env.get('OPENAI_API_KEY')),
    async authenticate(token) {
      const { data, error } = await user(token).auth.getUser();
      return error ? null : (data.user?.id ?? null);
    },
    async authorize(token, workspaceId) {
      const client = user(token);
      const [operator, access] = await Promise.all([
        client.rpc('is_platform_operator'),
        client.rpc('can_access_workspace', { ws_id: workspaceId }),
      ]);
      if (operator.error || access.error) throw new Error('Authorization unavailable');
      return operator.data === true && access.data === true;
    },
    async listing(id) {
      const { data, error } = await admin
        .from('sniper_listings')
        .select(
          'id,url,title,description,image_urls,item_price,total_price,currency,brand,size,condition',
        )
        .eq('id', id)
        .eq('marketplace', 'vinted')
        .maybeSingle();
      if (error) throw error;
      return data ? loadListingDetails(data) : null;
    },
    async reserve(userId, workspaceId, listingId, hash, model) {
      const { data, error } = await admin.rpc('reserve_vinted_ai_search', {
        p_user_id: userId,
        p_workspace_id: workspaceId,
        p_listing_id: listingId,
        p_input_hash: hash,
        p_model: model,
      });
      if (error) throw error;
      if (!record(data) || (!data.error && !Number.isSafeInteger(data.id)))
        throw new Error('Invalid reservation');
      return data as Reservation;
    },
    async save(id, values) {
      const { data, error } = await admin
        .from('vinted_ai_searches')
        .update(values)
        .eq('id', id)
        .select('id')
        .single();
      if (error || !data) throw new Error('Tracking unavailable');
    },
    async usage(token, workspaceId) {
      const { data, error } = await user(token).rpc('vinted_ai_search_usage', {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      return data;
    },
    search: searchOpenAi,
  };
}

if (import.meta.main) Deno.serve(createSearchHandler(createProductionDependencies()));

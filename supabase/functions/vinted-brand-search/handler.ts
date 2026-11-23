import type { VintedBrand } from './brand-source.ts';

export interface BrandSearchDependencies {
  authenticate(token: string): Promise<{ id: string } | null>;
  isOperator(userId: string, token: string): Promise<boolean>;
  canManageWorkspace(userId: string, token: string, workspaceId: string): Promise<boolean>;
  canUseFeed(userId: string, token: string, workspaceId: string): Promise<boolean>;
  /** Plattform-Schalter `vinted_feed`; ein fehlender Eintrag gilt als eingeschaltet. */
  isFeedEnabled(token: string): Promise<boolean>;
  search(keyword: string): Promise<VintedBrand[]>;
  /** Uhr für Bremse und Zwischenspeicher; in Tests ersetzbar. */
  now?: () => number;
}

/** Höchstens so viele Suchen je Nutzer und Minute. */
export const BRAND_SEARCH_LIMIT_PER_MINUTE = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_TRACKED_USERS = 5_000;
/** Ergebnisse je normalisiertem Suchwort bleiben kurz im Prozessspeicher. */
export const BRAND_CACHE_TTL_MS = 10 * 60_000;
export const BRAND_CACHE_MAX_ENTRIES = 500;

const allowedOrigins = new Set([
  'https://app.flipbase.de',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function respond(data: unknown, status: number, origin: string | null): Response {
  return Response.json(data, { status, headers: corsHeaders(origin) });
}

/** Feste Minutenfenster je Nutzer; alte Fenster werden bei vielen Nutzern verworfen. */
function createRateLimiter(now: () => number) {
  const windows = new Map<string, { startedAt: number; count: number }>();
  return (userId: string): boolean => {
    const time = now();
    if (windows.size >= RATE_TRACKED_USERS) {
      for (const [key, window] of windows) {
        if (time - window.startedAt >= RATE_WINDOW_MS) windows.delete(key);
      }
    }
    const current = windows.get(userId);
    if (!current || time - current.startedAt >= RATE_WINDOW_MS) {
      windows.set(userId, { startedAt: time, count: 1 });
      return true;
    }
    if (current.count >= BRAND_SEARCH_LIMIT_PER_MINUTE) return false;
    current.count++;
    return true;
  };
}

function createBrandCache(now: () => number) {
  const entries = new Map<string, { expiresAt: number; brands: VintedBrand[] }>();
  return {
    get(key: string): VintedBrand[] | null {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.brands;
    },
    set(key: string, brands: VintedBrand[]): void {
      entries.delete(key);
      entries.set(key, { expiresAt: now() + BRAND_CACHE_TTL_MS, brands });
      while (entries.size > BRAND_CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

function normalizedKeyword(keyword: string): string {
  return keyword.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
}

export function createBrandSearchHandler(dependencies: BrandSearchDependencies) {
  const now = dependencies.now ?? Date.now;
  const allowSearch = createRateLimiter(now);
  const cache = createBrandCache(now);

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405, origin);
    if (origin && !allowedOrigins.has(origin))
      return respond({ error: 'origin_not_allowed' }, 403, origin);

    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer '))
      return respond({ error: 'unauthorized' }, 401, origin);
    const token = authorization.slice(7);
    let user: { id: string };
    try {
      const authenticated = await dependencies.authenticate(token);
      if (!authenticated) return respond({ error: 'unauthorized' }, 401, origin);
      user = authenticated;
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503, origin);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond({ error: 'invalid_body' }, 400, origin);
    }
    const keyword =
      typeof body === 'object' && body !== null && 'keyword' in body
        ? (body as { keyword: unknown }).keyword
        : undefined;
    if (typeof keyword !== 'string' || keyword.trim().length > 100) {
      return respond({ error: 'invalid_keyword' }, 400, origin);
    }

    const scopedSearch = typeof body === 'object' && body !== null && 'workspaceId' in body;
    const workspaceId = scopedSearch ? (body as { workspaceId: unknown }).workspaceId : null;
    const feedSearch =
      typeof body === 'object' && body !== null && 'purpose' in body && body.purpose === 'feed';
    if (
      (scopedSearch || feedSearch) &&
      (typeof workspaceId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId))
    )
      return respond({ error: 'invalid_workspace' }, 400, origin);

    if (feedSearch) {
      try {
        if (!(await dependencies.isFeedEnabled(token)))
          return respond({ error: 'feature_disabled' }, 503, origin);
      } catch {
        return respond({ error: 'authorization_unavailable' }, 503, origin);
      }
    }

    const allowed = () => {
      if (typeof workspaceId !== 'string') return dependencies.isOperator(user.id, token);
      return feedSearch
        ? dependencies.canUseFeed(user.id, token, workspaceId)
        : dependencies.canManageWorkspace(user.id, token, workspaceId);
    };
    try {
      if (!(await allowed())) return respond({ error: 'forbidden' }, 403, origin);
    } catch {
      return respond({ error: 'authorization_unavailable' }, 503, origin);
    }

    const term = keyword.trim();
    if (feedSearch && term.length < 2) return respond({ brands: [] }, 200, origin);
    if (!allowSearch(user.id)) return respond({ error: 'rate_limited' }, 429, origin);

    try {
      const cacheKey = normalizedKeyword(term);
      let brands = cache.get(cacheKey);
      if (brands === null) {
        brands = await dependencies.search(term);
        cache.set(cacheKey, brands);
      }
      if (scopedSearch) {
        try {
          if (!(await allowed())) return respond({ error: 'forbidden' }, 403, origin);
        } catch {
          return respond({ error: 'authorization_unavailable' }, 503, origin);
        }
      }
      return respond({ brands }, 200, origin);
    } catch {
      return respond({ error: 'brand_search_failed' }, 502, origin);
    }
  };
}

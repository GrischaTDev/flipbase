import type { VintedBrand } from './brand-source.ts';

export interface BrandSearchDependencies {
  authenticate(token: string): Promise<{ id: string } | null>;
  isOperator(userId: string, token: string): Promise<boolean>;
  search(keyword: string): Promise<VintedBrand[]>;
}

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

export function createBrandSearchHandler(dependencies: BrandSearchDependencies) {
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
    try {
      const user = await dependencies.authenticate(authorization.slice(7));
      if (!user) return respond({ error: 'unauthorized' }, 401, origin);
      if (!(await dependencies.isOperator(user.id, authorization.slice(7))))
        return respond({ error: 'forbidden' }, 403, origin);
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

    try {
      const brands = await dependencies.search(keyword.trim());
      return respond({ brands }, 200, origin);
    } catch {
      return respond({ error: 'brand_search_failed' }, 502, origin);
    }
  };
}

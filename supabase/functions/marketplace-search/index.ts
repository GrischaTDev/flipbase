// Marktweite Verkaufsergebnisse erfordern einen gesonderten eBay-Datenzugang.
// Aktuelle Angebote dürfen nicht als tatsächlich erzielte Preise ausgegeben werden.
Deno.serve((request: Request): Response => {
  const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://app.flipbase.de')
    .split(',')
    .map((value) => value.trim());
  const origin = request.headers.get('origin');
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  if (origin && !origins.includes(origin)) return new Response(null, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ success: false, error: 'sold_history_unavailable' }), {
    status: 410,
    headers,
  });
});

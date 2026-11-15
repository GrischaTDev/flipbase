// Isolierter Router: bestehende Supabase-Functions und deren JWT-Regeln bleiben erhalten.
declare const EdgeRuntime: {
  userWorkers: {
    create(options: {
      servicePath: string;
      memoryLimitMb: number;
      workerTimeoutMs: number;
      noModuleCache: boolean;
      envVars: [string, string][];
    }): Promise<{ fetch(request: Request): Promise<Response> }>;
  };
};
Deno.serve(async (request: Request) => {
  const path = new URL(request.url).pathname;
  if (path === '/healthz')
    return Response.json({ healthy: true, commit: Deno.env.get('FLIPBASE_COMMIT') ?? '' });
  const functionName =
    path === '/ai-connection/oauth/token' ||
    path === '/ai-connection' ||
    path === '/ai-connection/.well-known/oauth-protected-resource'
      ? 'ai-connection'
      : path === '/push-settings'
        ? 'push-settings'
        : path === '/push-revoke'
          ? 'push-revoke'
          : path === '/ebay-order-observer'
            ? 'ebay-order-observer'
            : null;
  if (!functionName) return new Response(null, { status: 404 });
  if (
    request.method !== 'POST' &&
    request.method !== 'OPTIONS' &&
    !(functionName === 'ai-connection' && request.method === 'GET')
  )
    return new Response(null, { status: 405 });
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${functionName}`,
      memoryLimitMb: functionName === 'ai-connection' ? 384 : 128,
      workerTimeoutMs:
        functionName === 'ai-connection'
          ? 150000
          : functionName === 'ebay-order-observer'
            ? 85000
            : 15000,
      noModuleCache: false,
      envVars: Object.entries(Deno.env.toObject()),
    });
    return await worker.fetch(request);
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});

import { createServer } from 'node:http';

export function createPushGateway(options: {
  commit: string;
  upstream?: string;
  perIp?: number;
  global?: number;
}) {
  const upstream = options.upstream ?? 'http://push-functions:9000';
  const windows = new Map<string, { count: number; until: number }>();
  let globalWindow = { count: 0, until: 0 };
  function admit(client: string, perIp = options.perIp ?? 10): boolean {
    const now = Date.now();
    if (globalWindow.until <= now) {
      globalWindow = { count: 0, until: now + 60000 };
      for (const [key, window] of windows) if (window.until <= now) windows.delete(key);
    }
    const window = windows.get(client) ?? { count: 0, until: now + 60000 };
    if (window.until <= now) {
      window.count = 0;
      window.until = now + 60000;
    }
    if (
      globalWindow.count >= (options.global ?? 120) ||
      window.count >= perIp ||
      (!windows.has(client) && windows.size >= 5000)
    )
      return false;
    window.count++;
    globalWindow.count++;
    windows.set(client, window);
    return true;
  }
  const server = createServer(async (request, response) => {
    const path = request.url ?? '';
    if (path === '/healthz') {
      try {
        const health = await fetch(`${upstream}/healthz`, {
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
        });
        const body = (await health.json()) as Record<string, unknown>;
        const healthy = health.ok && body.commit === options.commit;
        response
          .writeHead(healthy ? 200 : 503, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          })
          .end(JSON.stringify({ healthy, commit: options.commit, functionsCommit: body.commit }));
      } catch {
        response.writeHead(503).end();
      }
      return;
    }
    const aiConnection =
      path === '/functions/v1/ai-connection/oauth/token' ||
      path === '/functions/v1/ai-connection' ||
      path === '/functions/v1/ai-connection/.well-known/oauth-protected-resource';
    const name = aiConnection
      ? path.slice('/functions/v1/'.length)
      : path === '/functions/v1/push-settings'
        ? 'push-settings'
        : path === '/functions/v1/push-revoke'
          ? 'push-revoke'
          : null;
    if (!name) {
      response.writeHead(404).end();
      return;
    }
    if (aiConnection) request.socket.setTimeout(25000);
    if (
      request.method !== 'POST' &&
      request.method !== 'OPTIONS' &&
      !(aiConnection && request.method === 'GET')
    ) {
      response.writeHead(405).end();
      return;
    }
    const limit = aiConnection ? 300000 : name === 'push-revoke' ? 512 : 4096;
    if (Number(request.headers['content-length'] ?? 0) > limit) {
      response.writeHead(413).end();
      request.resume();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > limit) {
          response.writeHead(413).end();
          request.resume();
          return;
        }
        chunks.push(buffer);
      }
      // Caddy setzt diesen Header neu. Der Socket ist nur im privaten Supabasenetz erreichbar.
      const forwarded = request.headers['x-forwarded-for'];
      const client =
        typeof forwarded === 'string'
          ? forwarded.slice(0, 128)
          : (request.socket.remoteAddress ?? 'unknown');
      if (
        request.method !== 'OPTIONS' &&
        !admit(client, aiConnection ? (options.perIp ?? 60) : undefined)
      ) {
        const origin = request.headers.origin;
        const allowed = (process.env.WEB_PUSH_ALLOWED_ORIGINS ?? 'https://app.flipbase.de').split(
          ',',
        );
        const headers: Record<string, string> = {
          'Retry-After': '60',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        };
        if (origin && allowed.includes(origin)) {
          headers['Access-Control-Allow-Origin'] = origin;
          headers.Vary = 'Origin';
        }
        response.writeHead(429, headers).end('{"error":"rate_limit"}');
        return;
      }
      const headers: Record<string, string> = {
        'Content-Type':
          typeof request.headers['content-type'] === 'string'
            ? request.headers['content-type']
            : 'application/json',
      };
      for (const header of [
        'authorization',
        'accept',
        'mcp-protocol-version',
        'origin',
        'access-control-request-method',
        'access-control-request-headers',
      ]) {
        const value = request.headers[header];
        if (typeof value === 'string') headers[header] = value;
      }
      const result = await fetch(`${upstream}/${name}`, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
        signal: AbortSignal.timeout(aiConnection ? 20000 : 10000),
        redirect: 'error',
      });
      const resultHeaders: Record<string, string> = { 'Cache-Control': 'no-store' };
      for (const header of [
        'content-type',
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers',
        'vary',
        'retry-after',
        'www-authenticate',
        'access-control-expose-headers',
      ]) {
        const value = result.headers.get(header);
        if (value) resultHeaders[header] = value;
      }
      const responseLimit = aiConnection ? 16 * 1024 * 1024 : 16384;
      const responseReader = result.body?.getReader();
      const responseChunks: Uint8Array[] = [];
      let responseBytes = 0;
      if (responseReader) {
        while (true) {
          const chunk = await responseReader.read();
          if (chunk.done) break;
          responseBytes += chunk.value.length;
          if (responseBytes > responseLimit) {
            await responseReader.cancel();
            throw new Error('response');
          }
          responseChunks.push(chunk.value);
        }
      }
      response.writeHead(result.status, resultHeaders).end(Buffer.concat(responseChunks));
    } catch {
      if (!response.headersSent)
        response
          .writeHead(503, { 'Content-Type': 'application/json' })
          .end('{"error":"unavailable"}');
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 30;
  server.setTimeout(10000);
  return server;
}

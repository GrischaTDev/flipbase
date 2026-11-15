export interface AiConnectionTokenStore {
  grant(clientId: string, code: string): Promise<string>;
  context(token: string): Promise<{ id: string }>;
}

// GoTrue prüft weiterhin PKCE, Client und Redirect. Der Gateway bindet die Ausgabe an Flipbase-Zustimmungen.
export function createAiConnectionTokenHandler(
  upstream: string,
  store: AiConnectionTokenStore,
  send = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const headers = {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      pragma: 'no-cache',
    };
    const fail = (error = 'invalid_grant', status = 400) =>
      Response.json({ error }, { status, headers });
    if (request.method !== 'POST') return fail('invalid_request', 405);
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
      return fail('invalid_request');
    try {
      const reader = request.body?.getReader();
      if (!reader) return fail('invalid_request');
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 16384) {
          await reader.cancel();
          return fail('invalid_request', 413);
        }
        chunks.push(chunk.value);
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      const form = new URLSearchParams(new TextDecoder().decode(body));
      for (const key of new Set(form.keys()))
        if (form.getAll(key).length !== 1) return fail('invalid_request');
      const authorization = request.headers.get('authorization');
      let clientId = form.get('client_id');
      if (authorization) {
        const basic = authorization.match(/^Basic ([A-Za-z0-9+/=]+)$/i);
        if (!basic) return fail('invalid_client', 401);
        const credentials = atob(basic[1]);
        const separator = credentials.indexOf(':');
        if (separator < 1) return fail('invalid_client', 401);
        const basicId = decodeURIComponent(credentials.slice(0, separator));
        if (clientId && clientId !== basicId) return fail('invalid_client', 401);
        clientId = basicId;
      }
      if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) return fail('invalid_client', 401);
      let expectedGrant: string | null = null;
      switch (form.get('grant_type')) {
        case 'authorization_code': {
          const code = form.get('code');
          if (!code) return fail('invalid_request');
          expectedGrant = await store.grant(clientId, code);
          break;
        }
        case 'refresh_token':
          if (!form.get('refresh_token')) return fail('invalid_request');
          break;
        default:
          return fail('unsupported_grant_type');
      }
      const native = await send(upstream, {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          ...(authorization ? { authorization } : {}),
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      const text = await native.text();
      if (text.length > 65536) return fail('server_error', 502);
      if (!native.ok) return fail();
      const result = JSON.parse(text);
      if (typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string')
        return fail('server_error', 502);
      const context = await store.context(result.access_token);
      if (expectedGrant && context.id !== expectedGrant) return fail();
      // Native Benutzerobjekte und OIDC-Identitätstokens gehören nicht zur begrenzten MCP-Freigabe.
      return Response.json(
        Object.fromEntries(
          ['access_token', 'refresh_token', 'token_type', 'expires_in', 'scope']
            .filter((key) => result[key] !== undefined)
            .map((key) => [key, result[key]]),
        ),
        { headers },
      );
    } catch {
      return fail();
    }
  };
}

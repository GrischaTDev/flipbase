import { instructions, tools } from './tools.ts';

export interface AiConnectionStore {
  connected(token: string): Promise<void>;
  context(token: string): Promise<Record<string, unknown>>;
  call(
    token: string,
    action: string,
    input: Record<string, unknown>,
    requestId: string | null,
  ): Promise<unknown>;
}
export interface AiConnectionConfig {
  endpoint: string;
  authorizationServer: string;
  allowedOrigins: readonly string[];
}
const versions = ['2025-06-18', '2025-11-25'];
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validArguments(schema: Record<string, unknown>, args: Record<string, unknown>): boolean {
  const properties = schema['properties'] as Record<string, Record<string, unknown>>;
  if ((schema['required'] as string[]).some((key) => !(key in args))) return false;
  return Object.entries(args).every(([key, value]) => {
    const field = properties[key];
    if (!field) return false;
    if (Array.isArray(field['enum']) && !field['enum'].includes(value)) return false;
    if (Array.isArray(field['type']))
      return (
        (field['type'].includes('null') && value === null) ||
        (field['type'].includes('object') && isObject(value))
      );
    switch (field['type']) {
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'string':
        return typeof value === 'string' && value.length <= 20000;
      case 'integer':
        return Number.isSafeInteger(value) && (value as number) >= 0;
      case 'object':
        return isObject(value);
      case 'array':
        return Array.isArray(value) && value.length <= 1000 && value.every(isObject);
      default:
        return false;
    }
  });
}

export function createAiConnectionHandler(config: AiConnectionConfig, store: AiConnectionStore) {
  const metadataUrl = `${config.endpoint}/.well-known/oauth-protected-resource`;
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      vary: 'Origin',
    };
    const json = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers });
    if (origin && !config.allowedOrigins.includes(origin))
      return json({ error: 'origin_not_allowed' }, 403);
    if (origin) headers['access-control-allow-origin'] = origin;
    headers['access-control-expose-headers'] = 'WWW-Authenticate';
    if (req.method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'POST, GET, OPTIONS';
      headers['access-control-allow-headers'] =
        'Authorization, Content-Type, Accept, MCP-Protocol-Version';
      return new Response(null, { status: 204, headers });
    }
    if (
      req.method === 'GET' &&
      new URL(req.url).pathname.endsWith('/.well-known/oauth-protected-resource')
    ) {
      return json({
        resource: config.endpoint,
        authorization_servers: [config.authorizationServer],
        scopes_supported: ['email'],
        bearer_methods_supported: ['header'],
      });
    }
    const token = req.headers.get('authorization')?.match(/^Bearer ([^\s]{1,8192})$/i)?.[1];
    const unauthorized = () => {
      headers['www-authenticate'] = `Bearer resource_metadata="${metadataUrl}", scope="email"`;
      return json({ error: 'invalid_token' }, 401);
    };
    if (!token) return unauthorized();
    let context: Record<string, unknown>;
    try {
      context = await store.context(token);
    } catch {
      return unauthorized();
    }
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!req.headers.get('content-type')?.startsWith('application/json'))
      return json({ error: 'unsupported_media_type' }, 415);
    if (!req.headers.get('accept')?.includes('application/json'))
      return json({ error: 'not_acceptable' }, 406);
    const version = req.headers.get('mcp-protocol-version');
    if (version && !versions.includes(version))
      return json({ error: 'unsupported_protocol_version' }, 400);
    let body: unknown;
    try {
      const reader = req.body?.getReader();
      if (!reader) return json({ error: 'invalid_request' }, 400);
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        if (length > 300000) {
          await reader.cancel();
          return json({ error: 'request_too_large' }, 413);
        }
        chunks.push(chunk.value);
      }
      const buffer = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      body = JSON.parse(new TextDecoder().decode(buffer));
    } catch {
      return json(
        { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
        400,
      );
    }
    if (!isObject(body) || body['jsonrpc'] !== '2.0' || typeof body['method'] !== 'string')
      return json({ error: 'invalid_request' }, 400);
    const id = body['id'];
    if (id !== undefined && typeof id !== 'string' && typeof id !== 'number')
      return json({ error: 'invalid_request' }, 400);
    const reply = async (result: unknown) => {
      try {
        await store.connected(token);
      } catch {
        /* Eine bereits ausgeführte Fachaktion bleibt erfolgreich. */
      }
      return json({ jsonrpc: '2.0', id, result });
    };
    const error = (code: number, message: string) =>
      json({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined) return new Response(null, { status: 202, headers });
    if (body['method'] === 'initialize') {
      const requested = isObject(body['params']) ? body['params']['protocolVersion'] : undefined;
      return reply({
        protocolVersion: versions.includes(String(requested)) ? requested : '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: 'flipbase', version: '1.0.0' },
        instructions,
      });
    }
    if (body['method'] === 'ping') return reply({});
    if (body['method'] === 'tools/list')
      return reply({
        tools: tools.filter(
          (t) =>
            (context['access_mode'] === 'edit' || t.annotations.readOnlyHint) &&
            (!t.name.includes('vinted') || ['owner', 'admin'].includes(String(context['role']))) &&
            (context['role'] !== 'accountant' ||
              t.annotations.readOnlyHint ||
              [
                'create_invoice',
                'create_expense',
                'assign_bank_transaction',
                'book_bank_transaction',
              ].includes(t.name)),
        ),
      });
    if (body['method'] !== 'tools/call') return error(-32601, 'Method not found');
    const params = body['params'];
    if (!isObject(params)) return error(-32602, 'Invalid params');
    const tool = tools.find((t) => t.name === params['name']);
    const args = params['arguments'] ?? {};
    if (!tool || !isObject(args) || !validArguments(tool.inputSchema, args))
      return error(-32602, 'Invalid tool arguments');
    if (!tool.annotations.readOnlyHint && context['access_mode'] !== 'edit')
      return error(-32602, 'Diese Verbindung darf nur lesen.');
    const requestId = args['request_id'];
    if (!tool.annotations.readOnlyHint && (typeof requestId !== 'string' || !uuid.test(requestId)))
      return error(-32602, 'Ungültige Vorgangskennung.');
    const { request_id: _requestId, ...input } = args;
    try {
      const result =
        tool.name === 'get_context'
          ? context
          : await store.call(
              token,
              tool.name,
              input,
              typeof requestId === 'string' ? requestId : null,
            );
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Die Aktion konnte nicht ausgeführt werden.';
      return reply({ isError: true, content: [{ type: 'text', text: message }] });
    }
  };
}

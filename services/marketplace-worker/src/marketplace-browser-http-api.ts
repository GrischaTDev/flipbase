import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

interface BrowserBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    sessionId: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, sessionId: string): Promise<void>;
}

interface BrowserUserVerifier {
  userId(accessToken: string): Promise<string>;
}

interface BrowserApiOptions {
  broker: BrowserBroker;
  users: BrowserUserVerifier;
}

const pathPrefix = '/marketplace-browser/sessions';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const frameLimit = 512 * 1024;
const bodyLimit = 4 * 1024;
const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

class RequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('Ungültige Browseranfrage');
    this.status = status;
  }
}

function json(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.writeHead(status, {
    ...responseHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const declaredSize = Number(request.headers['content-length']);
  if (Number.isFinite(declaredSize) && declaredSize > bodyLimit) throw new RequestError(413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > bodyLimit) throw new RequestError(413);
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (isRecord(value)) return value;
  } catch {
    // Öffentliche Antworten enthalten weder Nutzereingaben noch Parserdetails.
  }
  throw new RequestError(400);
}

function scopeOf(
  body: Record<string, unknown>,
  userId: string,
  token: string,
): BrowserSessionScope {
  if (
    typeof body['workspaceId'] !== 'string' ||
    !uuidPattern.test(body['workspaceId']) ||
    typeof body['connectionId'] !== 'string' ||
    !uuidPattern.test(body['connectionId'])
  )
    throw new RequestError(400);
  return {
    workspaceId: body['workspaceId'],
    connectionId: body['connectionId'],
    userId,
    userAccessToken: token,
  };
}

function inputOf(
  body: Record<string, unknown>,
):
  | { kind: 'click'; x: number; y: number }
  | { kind: 'type'; value: string }
  | { kind: 'press'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' } {
  const input = body['input'];
  if (!isRecord(input)) throw new RequestError(400);
  if (
    input['kind'] === 'click' &&
    typeof input['x'] === 'number' &&
    typeof input['y'] === 'number' &&
    Number.isFinite(input['x']) &&
    Number.isFinite(input['y']) &&
    input['x'] >= 0 &&
    input['x'] < 1 &&
    input['y'] >= 0 &&
    input['y'] < 1
  )
    return { kind: 'click', x: input['x'], y: input['y'] };
  if (
    input['kind'] === 'type' &&
    typeof input['value'] === 'string' &&
    input['value'].length > 0 &&
    input['value'].length <= 256
  )
    return { kind: 'type', value: input['value'] };
  if (
    input['kind'] === 'press' &&
    (input['key'] === 'Enter' ||
      input['key'] === 'Tab' ||
      input['key'] === 'Escape' ||
      input['key'] === 'Backspace')
  )
    return { kind: 'press', key: input['key'] };
  throw new RequestError(400);
}

export class MarketplaceBrowserHttpApi {
  private readonly broker: BrowserBroker;
  private readonly users: BrowserUserVerifier;
  private readonly inFlight = new Set<string>();

  constructor(options: BrowserApiOptions) {
    this.broker = options.broker;
    this.users = options.users;
  }

  createServer(): Server {
    const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
      void this.handle(request, response);
    });
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    return server;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/marketplace-browser/healthz') {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method !== 'POST') throw new RequestError(404);
      const token = request.headers.authorization?.match(/^Bearer ([^\s]{1,4096})$/)?.[1];
      if (!token) throw new RequestError(401);
      let userId: string;
      try {
        userId = await this.users.userId(token);
      } catch {
        throw new RequestError(401);
      }
      if (!uuidPattern.test(userId)) throw new RequestError(401);
      const body = await readBody(request);
      const scope = scopeOf(body, userId, token);
      if (path === pathPrefix) {
        const id = await this.broker.open(scope);
        json(response, 201, { id });
        return;
      }
      const match = path.match(
        /^\/marketplace-browser\/sessions\/([0-9a-f-]{36})\/(frame|input|close)$/i,
      );
      if (!match || !uuidPattern.test(match[1] ?? '')) throw new RequestError(404);
      const sessionId = match[1]!;
      const inFlightKey = `${userId}:${sessionId}`;
      if (this.inFlight.has(inFlightKey)) throw new RequestError(429);
      this.inFlight.add(inFlightKey);
      try {
        if (match[2] === 'frame') {
          const bytes = await this.broker.run(scope, sessionId, async (browser) => {
            if (!browser.capture) throw new Error('Bild nicht verfügbar');
            return browser.capture();
          });
          if (
            !(bytes instanceof Uint8Array) ||
            bytes.byteLength > frameLimit ||
            bytes.byteLength < 4 ||
            bytes[0] !== 0xff ||
            bytes[1] !== 0xd8 ||
            bytes[bytes.byteLength - 2] !== 0xff ||
            bytes[bytes.byteLength - 1] !== 0xd9
          )
            throw new RequestError(502);
          response.writeHead(200, {
            ...responseHeaders,
            'Content-Type': 'image/jpeg',
            'Content-Length': bytes.byteLength,
          });
          response.end(Buffer.from(bytes));
          return;
        }
        if (match[2] === 'input') {
          const input = inputOf(body);
          await this.broker.run(scope, sessionId, async (browser) => {
            if (input.kind === 'click' && browser.click) return browser.click(input.x, input.y);
            if (input.kind === 'type' && browser.type) return browser.type(input.value);
            if (input.kind === 'press' && browser.press) return browser.press(input.key);
            throw new Error('Eingabe nicht verfügbar');
          });
          json(response, 200, { accepted: true });
          return;
        }
        await this.broker.close(scope, sessionId);
        response.writeHead(204, responseHeaders);
        response.end();
      } finally {
        this.inFlight.delete(inFlightKey);
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof RequestError ? error.status : 409;
      json(response, status, {
        error:
          status === 401
            ? 'Anmeldung erforderlich'
            : status === 400
              ? 'Ungültige Anfrage'
              : status === 413
                ? 'Anfrage zu groß'
                : status === 429
                  ? 'Sitzung ist beschäftigt'
                  : 'Browsersitzung nicht verfügbar',
      });
    }
  }
}

export class SupabaseBrowserUserVerifier implements BrowserUserVerifier {
  private readonly url: string;
  private readonly publishableKey: string;
  private readonly request: typeof fetch;

  constructor(url: string, publishableKey: string, request: typeof fetch = fetch) {
    this.url = url;
    this.publishableKey = publishableKey;
    this.request = request;
  }

  async userId(accessToken: string): Promise<string> {
    const response = await this.request(new URL('/auth/v1/user', this.url), {
      headers: { apikey: this.publishableKey, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Anmeldung ungültig');
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value['id'] !== 'string') throw new Error('Anmeldung ungültig');
    return value['id'];
  }
}

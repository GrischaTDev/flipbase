import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import type { VintedAccountImport } from './vinted-account-import.ts';
import {
  MarketplaceBrowserSessionEndedError,
  type BrowserSessionScope,
} from './marketplace-browser-session-broker.ts';
import {
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
  type VintedAccountIdentity,
} from './vinted-browser-reader.ts';
import { GoLoginApiLimitError, GoLoginProfileLimitError } from './gologin-api-limit.ts';

interface BrowserBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    sessionId: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, sessionId: string): Promise<void>;
  reconcile?(): Promise<void>;
}

interface BrowserUserVerifier {
  userId(accessToken: string): Promise<string>;
}

interface BrowserApiOptions {
  broker: BrowserBroker;
  users: BrowserUserVerifier;
  profiles?: {
    prepare(scope: BrowserSessionScope): Promise<void>;
    remove?(scope: BrowserSessionScope, stopSessions: () => Promise<void>): Promise<void>;
  };
  accounts?: {
    confirm(
      scope: BrowserSessionScope,
      sessionId: string,
      identity: VintedAccountIdentity,
    ): Promise<void>;
  };
  imports?: {
    write(
      scope: BrowserSessionScope,
      sessionId: string,
      snapshot: VintedAccountImport,
    ): Promise<Record<'profile' | 'publication' | 'conversation' | 'message' | 'sale', number>>;
  };
  readOnly?: boolean;
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
  private readonly profiles?: BrowserApiOptions['profiles'];
  private readonly accounts?: BrowserApiOptions['accounts'];
  private readonly imports?: BrowserApiOptions['imports'];
  private readonly readOnly: boolean;
  private readonly inFlight = new Set<string>();

  constructor(options: BrowserApiOptions) {
    this.broker = options.broker;
    this.users = options.users;
    this.profiles = options.profiles;
    this.accounts = options.accounts;
    this.imports = options.imports;
    this.readOnly = options.readOnly ?? false;
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
        json(response, 200, { ok: true, readOnly: this.readOnly, apiVersion: 2 });
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
      if (path === '/marketplace-browser/connections/sync') {
        if (this.readOnly) throw new RequestError(403);
        if (!this.imports) throw new RequestError(503);
        const key = `${scope.workspaceId}:${scope.connectionId}:sync`;
        if (this.inFlight.has(key)) throw new RequestError(429);
        this.inFlight.add(key);
        let sessionId: string | undefined;
        try {
          sessionId = await this.broker.open(scope);
          const currentSessionId = sessionId;
          const result = await this.broker.run(scope, currentSessionId, async (browser) => {
            if (!browser.importAccount) return null;
            try {
              return await browser.importAccount(() =>
                this.broker.run(scope, currentSessionId, async () => undefined),
              );
            } catch {
              return null;
            }
          });
          if (!result) throw new RequestError(502);
          await this.broker.run(scope, currentSessionId, async () => undefined);
          const counts = await this.imports.write(scope, currentSessionId, result);
          await this.broker.close(scope, currentSessionId);
          sessionId = undefined;
          json(response, 200, { observedAt: result.observedAt, counts });
        } finally {
          try {
            if (sessionId) await this.broker.close(scope, sessionId);
          } finally {
            this.inFlight.delete(key);
          }
        }
        return;
      }
      if (path === '/marketplace-browser/connections/delete') {
        if (this.readOnly) throw new RequestError(403);
        if (!this.profiles?.remove || !this.broker.reconcile) throw new RequestError(503);
        const key = `${scope.workspaceId}:${scope.connectionId}:delete`;
        if (this.inFlight.has(key)) throw new RequestError(429);
        this.inFlight.add(key);
        try {
          await this.profiles.remove(scope, () => this.broker.reconcile!());
          response.writeHead(204, responseHeaders);
          response.end();
        } finally {
          this.inFlight.delete(key);
        }
        return;
      }
      if (path === pathPrefix) {
        await this.profiles?.prepare(scope);
        const id = await this.broker.open(scope);
        json(response, 201, { id });
        return;
      }
      const match = path.match(
        /^\/marketplace-browser\/sessions\/([0-9a-f-]{36})\/(frame|input|login|verify|identify|close)$/i,
      );
      if (!match || !uuidPattern.test(match[1] ?? '')) throw new RequestError(404);
      const sessionId = match[1]!;
      // Beenden muss auch eine laufende Anmeldung unterbrechen können. Der
      // Broker setzt stopPending vor dem Anbieteraufruf und sperrt Folgeeingaben.
      if (match[2] === 'close') {
        await this.broker.close(scope, sessionId);
        response.writeHead(204, responseHeaders);
        response.end();
        return;
      }
      const inFlightKey = `${userId}:${sessionId}`;
      if (this.inFlight.has(inFlightKey)) throw new RequestError(429);
      this.inFlight.add(inFlightKey);
      try {
        if (match[2] === 'login') {
          if (this.readOnly) throw new RequestError(403);
          const credentials = body['credentials'];
          if (
            !isRecord(credentials) ||
            Object.keys(credentials).some((key) => key !== 'username' && key !== 'password') ||
            typeof credentials['username'] !== 'string' ||
            !credentials['username'].trim() ||
            credentials['username'].length > 256 ||
            typeof credentials['password'] !== 'string' ||
            !credentials['password'] ||
            credentials['password'].length > 256
          )
            throw new RequestError(400);
          const login = {
            username: credentials['username'].trim(),
            password: credentials['password'],
          };
          delete body['credentials'];
          credentials['username'] = '';
          credentials['password'] = '';
          const accounts = this.accounts;
          try {
            const result = await this.broker.run(scope, sessionId, async (browser) => {
              if (accounts && browser.identify) {
                try {
                  const identity = await browser.identify();
                  if (identity) return { status: 'already_authenticated' as const, identity };
                } catch (error) {
                  if (error instanceof VintedVerificationRequiredError)
                    return { status: 'verification_required' as const };
                  if (!(
                    error instanceof VintedLoginPendingError ||
                    error instanceof VintedLoginRejectedError
                  ))
                    throw error;
                }
              }
              if (!browser.login) throw new Error('Anmeldung nicht verfügbar');
              const status = await browser.login(login, () =>
                this.broker.run(scope, sessionId, async () => undefined),
              );
              return { status };
            });
            login.username = '';
            login.password = '';
            if (result.status === 'already_authenticated' && accounts)
              await accounts.confirm(scope, sessionId, result.identity);
            json(response, 200, { status: result.status });
          } finally {
            login.username = '';
            login.password = '';
          }
          return;
        }
        if (match[2] === 'verify') {
          if (this.readOnly) throw new RequestError(403);
          const code = body['code'];
          if (typeof code !== 'string' || !/^[0-9]{4,8}$/.test(code)) throw new RequestError(400);
          body['code'] = '';
          const status = await this.broker.run(scope, sessionId, async (browser) => {
            if (!browser.verify) throw new Error('Bestätigung nicht verfügbar');
            return browser.verify(code, () =>
              this.broker.run(scope, sessionId, async () => undefined),
            );
          });
          json(response, 200, { status });
          return;
        }
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
          if (this.readOnly) throw new RequestError(403);
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
        if (match[2] === 'identify') {
          if (this.readOnly) throw new RequestError(403);
          if (!this.accounts) throw new RequestError(503);
          const identity = await this.broker.run(scope, sessionId, async (browser) => {
            if (!browser.identify) return null;
            try {
              return await browser.identify();
            } catch (error) {
              // Eine fachliche Ablehnung ist kein Browserabbruch. Die Sitzung
              // bleibt für einen ausdrücklichen Korrekturversuch bestehen.
              if (error instanceof VintedLoginRejectedError) return 'login_rejected' as const;
              if (error instanceof VintedLoginPendingError) return 'login_pending' as const;
              if (error instanceof VintedVerificationRequiredError)
                return 'verification_required' as const;
              throw error;
            }
          });
          if (identity === 'login_rejected') throw new VintedLoginRejectedError();
          if (identity === 'login_pending') throw new VintedLoginPendingError();
          if (identity === 'verification_required') throw new VintedVerificationRequiredError();
          if (!identity) throw new RequestError(422);
          await this.accounts.confirm(scope, sessionId, identity);
          json(response, 200, {
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            externalAccountId: identity.id,
            username: identity.username,
          });
          return;
        }
      } finally {
        this.inFlight.delete(inFlightKey);
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof VintedLoginRejectedError) {
        json(response, 422, {
          code: 'vinted_login_rejected',
          error: 'Vinted hat die Zugangsdaten abgelehnt',
        });
        return;
      }
      if (error instanceof VintedLoginPendingError) {
        json(response, 422, { code: 'vinted_login_pending' });
        return;
      }
      if (error instanceof VintedVerificationRequiredError) {
        json(response, 422, { code: 'vinted_verification_required' });
        return;
      }
      if (error instanceof GoLoginApiLimitError) {
        json(response, 503, {
          code: 'gologin_api_limit_reached',
          error: 'GoLogin-API-Limit erreicht',
        });
        return;
      }
      if (error instanceof GoLoginProfileLimitError) {
        json(response, 503, { code: 'gologin_profile_limit_reached' });
        return;
      }
      const status =
        error instanceof RequestError
          ? error.status
          : error instanceof MarketplaceBrowserSessionEndedError
            ? 410
            : 409;
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
                  : status === 422
                    ? 'Vinted-Anmeldung konnte nicht bestätigt werden'
                    : status === 410
                      ? 'Browsersitzung wurde beendet'
                      : status === 403
                        ? 'Eingabe ist gesperrt'
                        : status === 502
                          ? 'Vinted-Daten konnten nicht gelesen werden'
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

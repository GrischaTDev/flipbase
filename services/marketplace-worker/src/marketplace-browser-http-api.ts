import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BrowserDragPoint, BrowserInfo } from './gologin-cloud-browser.ts';
import {
  VintedImportReadError,
  type VintedAccountImport,
  type VintedImportStage,
} from './vinted-account-import.ts';
import {
  MarketplaceBrowserSessionBusyError,
  MarketplaceBrowserSessionEndedError,
  type BrowserSessionScope,
} from './marketplace-browser-session-broker.ts';
import {
  VintedInteractionRequiredError,
  VintedSessionBlockedError,
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
  type VintedAccountIdentity,
} from './vinted-browser-reader.ts';
import { GoLoginApiLimitError, GoLoginProfileLimitError } from './gologin-api-limit.ts';
import type { VintedEditAccess } from './vinted-edit-access.ts';
import type { VintedListingEditFields } from './vinted-browser-listing-edit.ts';
import type { MarketplaceSyncRunner } from './marketplace-sync-runner.ts';
import type { SupabaseVintedListingCache } from './supabase-vinted-listing-cache.ts';
import type { SupabaseVintedProfileCache } from './supabase-vinted-profile-cache.ts';

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
  edits?: VintedEditAccess;
  operations?: Pick<MarketplaceSyncRunner, 'start' | 'read'>;
  listingCache?: Pick<SupabaseVintedListingCache, 'save'>;
  profileCache?: Pick<SupabaseVintedProfileCache, 'save'>;
  readOnly?: boolean;
  scheduledSync?: () => {
    enabled: boolean;
    authorizationVersion: number;
    allowedIntervals: number[];
  };
}

const pathPrefix = '/marketplace-browser/sessions';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const frameLimit = 512 * 1024;
const bodyLimit = 16 * 1024;
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

class ImportError extends RequestError {
  readonly stage: VintedImportStage | 'unknown';

  constructor(stage: VintedImportStage | 'unknown') {
    super(502);
    this.stage = stage;
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
  | { kind: 'drag'; points: BrowserDragPoint[] }
  | { kind: 'type'; value: string }
  | { kind: 'press'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' } {
  const input = body['input'];
  if (!isRecord(input)) throw new RequestError(400);
  if (input['kind'] === 'drag') {
    const suppliedPoints = input['points'];
    if (!Array.isArray(suppliedPoints) || suppliedPoints.length < 2 || suppliedPoints.length > 128)
      throw new RequestError(400);
    const points: BrowserDragPoint[] = [];
    let previousElapsedMs = -1;
    for (const point of suppliedPoints) {
      if (
        !isRecord(point) ||
        typeof point['x'] !== 'number' ||
        typeof point['y'] !== 'number' ||
        !Number.isFinite(point['x']) ||
        !Number.isFinite(point['y']) ||
        point['x'] < 0 ||
        point['x'] >= 1 ||
        point['y'] < 0 ||
        point['y'] >= 1 ||
        typeof point['elapsedMs'] !== 'number' ||
        !Number.isInteger(point['elapsedMs']) ||
        point['elapsedMs'] < 0 ||
        point['elapsedMs'] > 15_000 ||
        (points.length === 0 && point['elapsedMs'] !== 0) ||
        point['elapsedMs'] <= previousElapsedMs
      )
        throw new RequestError(400);
      points.push({ x: point['x'], y: point['y'], elapsedMs: point['elapsedMs'] });
      previousElapsedMs = point['elapsedMs'];
    }
    return { kind: 'drag', points };
  }
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
  private readonly edits?: VintedEditAccess;
  private readonly operations?: BrowserApiOptions['operations'];
  private readonly listingCache?: BrowserApiOptions['listingCache'];
  private readonly profileCache?: BrowserApiOptions['profileCache'];
  private readonly readOnly: boolean;
  private readonly scheduledSync?: BrowserApiOptions['scheduledSync'];
  private readonly inFlight = new Set<string>();

  constructor(options: BrowserApiOptions) {
    this.broker = options.broker;
    this.users = options.users;
    this.profiles = options.profiles;
    this.accounts = options.accounts;
    this.imports = options.imports;
    this.edits = options.edits;
    this.operations = options.operations;
    this.listingCache = options.listingCache;
    this.profileCache = options.profileCache;
    this.scheduledSync = options.scheduledSync;
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
        json(response, 200, {
          ok: true,
          readOnly: this.readOnly,
          apiVersion: 2,
          dragSupported: !this.readOnly,
          ...(this.scheduledSync ? { scheduledSync: this.scheduledSync() } : {}),
        });
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
      if (path === '/marketplace-browser/connections/sync/start') {
        if (this.readOnly) throw new RequestError(403);
        if (!this.operations) throw new RequestError(503);
        const id = await this.operations.start(scope);
        json(response, 202, { id });
        return;
      }
      if (path === '/marketplace-browser/connections/sync/status') {
        if (!this.operations) throw new RequestError(503);
        const id = body['operationId'];
        if (typeof id !== 'string' || !uuidPattern.test(id)) throw new RequestError(400);
        const operation = await this.operations.read(scope, id);
        if (!operation) throw new RequestError(404);
        json(response, 200, { ...operation });
        return;
      }
      if (
        path === '/marketplace-browser/profile/edit/read' ||
        path === '/marketplace-browser/profile/edit/save'
      ) {
        if (this.readOnly) throw new RequestError(403);
        if (!this.edits) throw new RequestError(503);
        const about = body['about'];
        const expectedAbout = body['expectedAbout'];
        const saving = path === '/marketplace-browser/profile/edit/save';
        if (!saving && about !== undefined) throw new RequestError(400);
        if (saving && (typeof about !== 'string' || about.length > 2000))
          throw new RequestError(400);
        if (
          expectedAbout !== undefined &&
          (!saving || typeof expectedAbout !== 'string' || expectedAbout.length > 2000)
        )
          throw new RequestError(400);
        const key = `${scope.workspaceId}:${scope.connectionId}:edit`;
        if (this.inFlight.has(key)) throw new RequestError(429);
        this.inFlight.add(key);
        let sessionId: string | undefined;
        try {
          const entry = await this.edits.entry(scope, 'profile');
          sessionId = await this.broker.open(scope);
          const currentSessionId = sessionId;
          const result = await this.broker.run(scope, currentSessionId, async (browser) => {
            if (saving && typeof about === 'string') {
              if (!browser.updateProfileAbout) throw new RequestError(503);
              return {
                status: await browser.updateProfileAbout(
                  entry.accountId,
                  about,
                  async () => {
                    const current = await this.edits!.entry(scope, 'profile');
                    if (current.accountId !== entry.accountId)
                      throw new Error('Kontozuordnung geändert');
                    await this.broker.run(scope, currentSessionId, async () => undefined);
                  },
                  typeof expectedAbout === 'string' ? expectedAbout : undefined,
                ),
              };
            }
            if (!browser.readProfileAbout) throw new RequestError(503);
            return { about: await browser.readProfileAbout(entry.accountId) };
          });
          if (saving) {
            let cachePending = false;
            if (
              'status' in result &&
              result.status === 'confirmed' &&
              typeof about === 'string' &&
              this.profileCache
            ) {
              try {
                const current = await this.edits.entry(scope, 'profile');
                if (current.accountId !== entry.accountId)
                  throw new Error('Kontozuordnung geändert');
                await this.broker.run(scope, currentSessionId, async () => undefined);
                cachePending = !(await this.profileCache.save(scope, entry.accountId, about));
              } catch {
                cachePending = true;
              }
            }
            let cleanup: 'complete' | 'pending' = 'complete';
            try {
              await this.broker.close(scope, currentSessionId);
            } catch {
              cleanup = 'pending';
            }
            sessionId = undefined;
            json(response, 200, {
              ...result,
              ...(cleanup === 'pending' ? { cleanup } : {}),
              ...(cachePending ? { cache: 'pending' } : {}),
            });
          } else {
            await this.broker.close(scope, currentSessionId);
            sessionId = undefined;
            json(response, 200, result);
          }
        } finally {
          try {
            if (sessionId) await this.broker.close(scope, sessionId);
          } finally {
            this.inFlight.delete(key);
          }
        }
        return;
      }
      if (
        path === '/marketplace-browser/listings/edit/read' ||
        path === '/marketplace-browser/listings/edit/save'
      ) {
        if (this.readOnly) throw new RequestError(403);
        if (!this.edits) throw new RequestError(503);
        const entryId = body['entryId'];
        if (typeof entryId !== 'string' || !uuidPattern.test(entryId)) throw new RequestError(400);
        let fields: VintedListingEditFields | undefined;
        if (path.endsWith('/save')) {
          const value = body['fields'];
          if (
            !isRecord(value) ||
            Object.keys(value).some((key) => !['title', 'description', 'price'].includes(key)) ||
            typeof value['title'] !== 'string' ||
            !value['title'].trim() ||
            value['title'].length > 120 ||
            typeof value['description'] !== 'string' ||
            value['description'].length > 2000 ||
            typeof value['price'] !== 'string' ||
            !/^\d{1,6}(?:[,.]\d{1,2})?$/.test(value['price']) ||
            Number(value['price'].replace(',', '.')) <= 0
          )
            throw new RequestError(400);
          fields = {
            title: value['title'].trim(),
            description: value['description'],
            price: value['price'],
          };
        }
        const key = `${scope.workspaceId}:${scope.connectionId}:edit`;
        if (this.inFlight.has(key)) throw new RequestError(429);
        this.inFlight.add(key);
        let sessionId: string | undefined;
        try {
          const entry = await this.edits.entry(scope, 'publication', entryId);
          sessionId = await this.broker.open(scope);
          const currentSessionId = sessionId;
          const result = await this.broker.run(scope, currentSessionId, async (browser) => {
            if (fields) {
              if (!browser.updateListing) throw new RequestError(503);
              return {
                status: await browser.updateListing(
                  entry.externalId,
                  entry.accountId,
                  fields,
                  async () => {
                    const current = await this.edits!.entry(scope, 'publication', entryId);
                    if (
                      current.accountId !== entry.accountId ||
                      current.externalId !== entry.externalId
                    )
                      throw new Error('Kontozuordnung geändert');
                    await this.broker.run(scope, currentSessionId, async () => undefined);
                  },
                ),
              };
            }
            if (!browser.readListingEdit) throw new RequestError(503);
            return { fields: await browser.readListingEdit(entry.externalId, entry.accountId) };
          });
          let cachePending = false;
          const confirmedEdit = fields && 'status' in result && result.status === 'confirmed';
          const cachedFields = confirmedEdit ? fields : 'fields' in result ? result.fields : null;
          if (cachedFields && this.listingCache) {
            try {
              const current = await this.edits.entry(scope, 'publication', entryId);
              if (current.externalId !== entry.externalId || current.accountId !== entry.accountId)
                throw new Error('Kontozuordnung geändert');
              await this.broker.run(scope, currentSessionId, async () => undefined);
              cachePending = !(await this.listingCache.save(
                scope,
                entryId,
                entry.externalId,
                cachedFields,
                Boolean(confirmedEdit),
              ));
            } catch {
              cachePending = true;
            }
          }
          if (fields) {
            let cleanup: 'complete' | 'pending' = 'complete';
            try {
              await this.broker.close(scope, currentSessionId);
            } catch {
              cleanup = 'pending';
            }
            sessionId = undefined;
            json(response, 200, {
              ...result,
              ...(cleanup === 'pending' ? { cleanup } : {}),
              ...(cachePending ? { cache: 'pending' } : {}),
            });
          } else {
            await this.broker.close(scope, currentSessionId);
            sessionId = undefined;
            json(response, 200, cachePending ? { ...result, cache: 'pending' } : result);
          }
        } finally {
          try {
            if (sessionId) await this.broker.close(scope, sessionId);
          } finally {
            this.inFlight.delete(key);
          }
        }
        return;
      }
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
          let failedStage: VintedImportStage | 'unknown' = 'unknown';
          const result = await this.broker.run(scope, currentSessionId, async (browser) => {
            if (!browser.importAccount) return null;
            try {
              return await browser.importAccount(() =>
                this.broker.run(scope, currentSessionId, async () => undefined),
              );
            } catch (error) {
              if (error instanceof VintedImportReadError) failedStage = error.stage;
              return null;
            }
          });
          if (!result) throw new ImportError(failedStage);
          await this.broker.run(scope, currentSessionId, async () => undefined);
          const counts = await this.imports.write(scope, currentSessionId, result);
          await this.broker.close(scope, currentSessionId);
          sessionId = undefined;
          json(response, 200, {
            observedAt: result.observedAt,
            counts,
            sourceResults: result.areas,
          });
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
                  if (error instanceof VintedSessionBlockedError)
                    return { status: 'session_blocked' as const };
                  if (error instanceof VintedInteractionRequiredError)
                    return { status: 'interaction_required' as const };
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
          const frame = await this.broker.run(scope, sessionId, async (browser) => {
            if (!browser.capture) throw new Error('Bild nicht verfügbar');
            const sessionBlocked = (await browser.sessionBlocked?.()) === true;
            return { bytes: await browser.capture(), sessionBlocked };
          });
          const bytes = frame.bytes;
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
            ...(frame.sessionBlocked
              ? { 'X-Flipbase-Vinted-State': 'session_blocked' }
              : {}),
          });
          response.end(Buffer.from(bytes));
          return;
        }
        if (match[2] === 'input') {
          if (this.readOnly) throw new RequestError(403);
          const input = inputOf(body);
          await this.broker.run(scope, sessionId, async (browser) => {
            if ((await browser.sessionBlocked?.()) === true) throw new VintedSessionBlockedError();
            if (input.kind === 'click' && browser.click) await browser.click(input.x, input.y);
            else if (input.kind === 'drag' && browser.drag) await browser.drag(input.points);
            else if (input.kind === 'type' && browser.type) await browser.type(input.value);
            else if (input.kind === 'press' && browser.press) await browser.press(input.key);
            else throw new Error('Eingabe nicht verfügbar');
            if ((await browser.sessionBlocked?.()) === true) throw new VintedSessionBlockedError();
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
              if (error instanceof VintedSessionBlockedError)
                return 'session_blocked' as const;
              if (error instanceof VintedInteractionRequiredError)
                return 'interaction_required' as const;
              throw error;
            }
          });
          if (identity === 'login_rejected') throw new VintedLoginRejectedError();
          if (identity === 'login_pending') throw new VintedLoginPendingError();
          if (identity === 'verification_required') throw new VintedVerificationRequiredError();
          if (identity === 'session_blocked') throw new VintedSessionBlockedError();
          if (identity === 'interaction_required') throw new VintedInteractionRequiredError();
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
      if (error instanceof ImportError) {
        json(response, 502, {
          code: 'vinted_import_failed',
          stage: error.stage,
          error: 'Vinted-Daten konnten nicht gelesen werden',
        });
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
      if (error instanceof VintedSessionBlockedError) {
        json(response, 422, { code: 'vinted_session_blocked' });
        return;
      }
      if (error instanceof VintedInteractionRequiredError) {
        json(response, 422, { code: 'vinted_interaction_required' });
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
      if (error instanceof MarketplaceBrowserSessionBusyError) {
        json(response, 409, { code: 'browser_session_busy' });
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

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { BrowserSessionError, type BrowserSession } from './browser-types.js';
import type { FetchLike } from '../vinted/session.js';

const BrowserInputSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('click'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .strict(),
  z
    .object({
      kind: z.literal('text'),
      text: z
        .string()
        .min(1)
        .max(256)
        .refine((text) => !/\p{Cc}/u.test(text)),
    })
    .strict(),
  z
    .object({ kind: z.literal('key'), key: z.enum(['Enter', 'Tab', 'Escape', 'Backspace']) })
    .strict(),
]);

export function createOperatorVerifier(
  config: { supabaseUrl: string; supabaseAnonKey: string },
  request: FetchLike = fetch,
): (token: string) => Promise<string> {
  return async (token) => {
    if (!config.supabaseAnonKey)
      throw new BrowserSessionError(503, 'Die Betreiberprüfung ist noch nicht konfiguriert.');
    const headers = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    try {
      const userResponse = await request(new URL('/auth/v1/user', config.supabaseUrl), {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (userResponse.status >= 500)
        throw new BrowserSessionError(503, 'Die Anmeldung kann gerade nicht geprüft werden.');
      if (!userResponse.ok) throw new BrowserSessionError(401, 'Bitte melde Dich erneut an.');
      const user = z.object({ id: z.string().min(1) }).safeParse(await userResponse.json());
      if (!user.success) throw new BrowserSessionError(401, 'Deine Anmeldung ist ungültig.');
      const roleResponse = await request(
        new URL('/rest/v1/rpc/is_platform_operator', config.supabaseUrl),
        {
          method: 'POST',
          headers,
          body: '{}',
          signal: AbortSignal.timeout(5000),
        },
      );
      if (roleResponse.status === 401)
        throw new BrowserSessionError(401, 'Bitte melde Dich erneut an.');
      if (!roleResponse.ok)
        throw new BrowserSessionError(
          503,
          'Die Betreiberrechte können gerade nicht geprüft werden.',
        );
      if ((await roleResponse.json()) !== true)
        throw new BrowserSessionError(403, 'Diese Aktion ist nur für Betreiber verfügbar.');
      return user.data.id;
    } catch (error) {
      if (error instanceof BrowserSessionError) throw error;
      throw new BrowserSessionError(503, 'Die Betreiberrechte können gerade nicht geprüft werden.');
    }
  };
}

async function readInput(incoming: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of incoming) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 16 * 1024) throw new BrowserSessionError(413, 'Die Browsereingabe ist zu groß.');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BrowserSessionError(400, 'Ungültige Browsereingabe.');
  }
}

interface BrowserApiOptions {
  host: string;
  port: number;
  session: BrowserSession;
  verifyOperator(token: string): Promise<string>;
}

function sendJson(outgoing: ServerResponse, status: number, payload: unknown): void {
  outgoing.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  outgoing.end(JSON.stringify(payload));
}

export function startBrowserApi(options: BrowserApiOptions): Server {
  if (!['127.0.0.1', '172.18.0.1'].includes(options.host))
    throw new Error('Browser-API muss an eine private Adresse binden.');
  const server = createServer(
    { requestTimeout: 5000, headersTimeout: 5000, keepAliveTimeout: 2000 },
    (incoming, outgoing) => {
      outgoing.setHeader('Cache-Control', 'no-store');
      outgoing.setHeader('X-Content-Type-Options', 'nosniff');
      const handle = async () => {
        const authorization = incoming.headers.authorization ?? '';
        if (!/^Bearer [A-Za-z0-9._-]{1,8192}$/.test(authorization))
          throw new BrowserSessionError(401, 'Bitte melde Dich erneut an.');
        const operator = await options.verifyOperator(authorization.slice(7));
        const url = new URL(incoming.url ?? '', 'http://127.0.0.1');
        if (url.search) throw new BrowserSessionError(400, 'Ungültige Browseradresse.');
        const path = url.pathname;
        if (path === '/sniper-browser/status') {
          if (incoming.method !== 'GET')
            throw new BrowserSessionError(405, 'Methode nicht erlaubt.');
          sendJson(outgoing, 200, await options.session.status(operator));
          return;
        }
        if (path === '/sniper-browser/sessions') {
          if (incoming.method !== 'POST')
            throw new BrowserSessionError(405, 'Methode nicht erlaubt.');
          sendJson(outgoing, 200, await options.session.open(operator));
          return;
        }
        const match =
          /^\/sniper-browser\/sessions\/([a-f0-9-]{36})(?:\/(frame|input|verify))?$/.exec(path);
        const id = match?.[1];
        if (!id) throw new BrowserSessionError(404, 'Browseraktion nicht gefunden.');
        const action = match?.[2];
        const expectedMethod = action === 'frame' ? 'GET' : action ? 'POST' : 'DELETE';
        if (incoming.method !== expectedMethod)
          throw new BrowserSessionError(405, 'Methode nicht erlaubt.');
        if (action === 'frame') {
          const frame = await options.session.frame(operator, id);
          if (
            frame.length < 4 ||
            frame.length > 6 * 1024 * 1024 ||
            frame[0] !== 255 ||
            frame[1] !== 216 ||
            frame[2] !== 255
          )
            throw new BrowserSessionError(503, 'Browserbild nicht verfügbar.');
          outgoing.writeHead(200, { 'Content-Type': 'image/jpeg' });
          outgoing.end(Buffer.from(frame));
        } else if (action === 'input') {
          const input = BrowserInputSchema.safeParse(await readInput(incoming));
          if (!input.success) throw new BrowserSessionError(400, 'Ungültige Browsereingabe.');
          await options.session.input(operator, id, input.data);
          outgoing.writeHead(204).end();
        } else if (action === 'verify')
          sendJson(outgoing, 200, await options.session.verify(operator, id));
        else {
          await options.session.close(operator, id);
          outgoing.writeHead(204).end();
        }
      };
      void handle().catch((error: unknown) => {
        if (!outgoing.headersSent)
          sendJson(outgoing, error instanceof BrowserSessionError ? error.status : 503, {
            message:
              error instanceof BrowserSessionError
                ? error.message
                : 'Die Botsitzung ist gerade nicht verfügbar.',
          });
        else outgoing.destroy();
      });
    },
  );
  server.listen(options.port, options.host);
  server.unref();
  return server;
}

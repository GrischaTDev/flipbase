import { VintedHttpError } from './errors.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type Sleep = (milliseconds: number) => Promise<void>;

export const sleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface SessionOptions {
  baseUrl: string;
  userAgent: string;
}

/**
 * Haelt die anonymen Cookies der Vinted-Startseite. Bleibt trotzdem ein 401
 * uebrig, ruft der Sammler `invalidate()` und wiederholt die Runde einmal
 * mit frischen Cookies.
 */
export class VintedSession {
  private cookie: string | undefined;

  constructor(
    private readonly options: SessionOptions,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async cookieHeader(): Promise<string> {
    if (this.cookie !== undefined) return this.cookie;

    const response = await this.fetchFn(this.options.baseUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': this.options.userAgent,
      },
    });

    if (!response.ok) throw new VintedHttpError(response.status);

    this.cookie = extractCookieHeader(response.headers);
    return this.cookie;
  }

  invalidate(): void {
    this.cookie = undefined;
  }
}

/**
 * Vinted setzt `access_token_web` in derselben Antwort ZWEIMAL: zuerst leer
 * (Invalidierung), danach den echten Token. Wer alle Set-Cookie-Werte stumpf
 * aneinanderhaengt, schickt den leeren zuerst - der Server nimmt den ersten
 * und antwortet mit 401. Deshalb gewinnt hier je Name der LETZTE Wert.
 *
 * Am 30.08.2026 gemessen: naiv zusammengefuegt -> 401, dedupliziert -> 200,
 * bei identischer Aufwaermung.
 */
function extractCookieHeader(headers: Headers): string {
  const latest = new Map<string, string>();

  for (const raw of headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0]?.trim();
    if (!pair) continue;

    const separator = pair.indexOf('=');
    if (separator <= 0) continue;

    latest.set(pair.slice(0, separator), pair.slice(separator + 1));
  }

  return [...latest].map(([name, value]) => `${name}=${value}`).join('; ');
}

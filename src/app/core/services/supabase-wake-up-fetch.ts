/**
 * Mobile Browser pausieren im Hintergrund die Token-Erneuerung. Nach dem Aufwecken ist der
 * Zugriffstoken oft abgelaufen und das Netz noch nicht bereit. Supabase sendet Datenanfragen dann
 * mit abgelaufenem Token (401) oder ohne Anmeldung nur mit dem öffentlichen Schlüssel. Beides sah
 * in der Oberfläche wie ein fehlendes Verwaltungsrecht aus.
 *
 * Diese Hülle wiederholt eine solche Datenanfrage genau einmal mit einer frisch bestätigten
 * Sitzung. Ohne bekannte Anmeldung oder ohne neuen Token bleibt die ursprüngliche Antwort.
 */
export interface WakeUpFetchOptions {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Ob für diesen Browser eine Anmeldung besteht, die nicht abgemeldet wurde. */
  readonly hasSignedInUser: () => boolean;
  /** Liefert einen gültigen Zugriffstoken; erneuert ihn bei Bedarf. */
  readonly freshAccessToken: () => Promise<string | null>;
  readonly fetch?: typeof fetch;
  readonly waitForNetworkMs?: number;
}

const DATA_PATHS = ['/rest/v1/', '/functions/v1/', '/storage/v1/'];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function waitForNetwork(timeoutMs: number): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('online', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    window.addEventListener('online', done);
  });
}

export function createWakeUpFetch(options: WakeUpFetchOptions): typeof fetch {
  const base = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const origin = new URL(options.supabaseUrl).origin;
  const anonHeader = `Bearer ${options.anonKey}`;

  return async (input, init) => {
    const response = await base(input, init);
    const url = requestUrl(input);
    // Nur echte Datenanfragen mit wiederverwendbarem Inhalt; Auth-Aufrufe nie, sonst Rekursion.
    if (
      !url.startsWith(origin) ||
      !DATA_PATHS.some((path) => url.startsWith(origin + path)) ||
      input instanceof Request ||
      (init?.body != null && typeof init.body !== 'string')
    )
      return response;
    const headers = new Headers(init?.headers);
    const sent = headers.get('Authorization');
    const expired = response.status === 401;
    const sentAnonymously = sent === anonHeader;
    if ((!expired && !sentAnonymously) || !options.hasSignedInUser()) return response;

    await waitForNetwork(options.waitForNetworkMs ?? 5_000);
    let token: string | null;
    try {
      token = await options.freshAccessToken();
    } catch {
      return response;
    }
    if (!token || `Bearer ${token}` === sent) return response;
    headers.set('Authorization', `Bearer ${token}`);
    return base(input, { ...init, headers });
  };
}

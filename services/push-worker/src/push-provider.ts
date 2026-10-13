import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import webPush from 'web-push';

export type PushProviderResult =
  | { status: 'accepted' }
  | { status: 'expired' }
  | { status: 'retry'; retryAfterMs?: number }
  | { status: 'configuration_error' };
export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface PushProvider {
  send(subscription: PushSubscription, payload: string): Promise<PushProviderResult>;
}
interface Address {
  address: string;
  family: number;
}
interface ProviderResponse {
  status: number;
  retryAfter?: string;
}
interface ProviderDependencies {
  resolve(hostname: string): Promise<Address[]>;
  post(
    endpoint: URL,
    address: Address,
    details: webPush.RequestDetails,
    signal: AbortSignal,
  ): Promise<ProviderResponse>;
}

export function validateEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  const allowed =
    ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(
      url.hostname,
    ) || /^[a-z0-9-]+\.notify\.windows\.com$/u.test(url.hostname);
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    endpoint.length > 2048
  )
    throw new Error('endpoint');
  return url;
}
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [first = 0, second = 0, third = 0] = address.split('.').map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 168 || second === 0 || (second === 88 && third === 99))) ||
      (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
      (first === 203 && second === 0 && third === 113)
    );
  }
  if (isIP(address) !== 6) return false;
  const normalized = address.toLowerCase();
  const first = Number.parseInt(normalized.split(':')[0] ?? '', 16);
  const second = Number.parseInt(normalized.split(':')[1] || '0', 16);
  // Nur globale Unicastadressen. Sonderbereiche, Dokumentation und eingebettetes IPv4 bleiben gesperrt.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    first !== 0x3fff &&
    !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8))
  );
}
export function normalizeRetryAfter(
  header: string | undefined,
  now = Date.now(),
): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/u.test(header.trim())) {
    const milliseconds = Number(header) * 1000;
    return Number.isFinite(milliseconds) ? Math.min(milliseconds, 86400000) : undefined;
  }
  if (!/^[A-Za-z]{3}, /u.test(header)) return undefined;
  const timestamp = Date.parse(header);
  return Number.isFinite(timestamp) ? Math.min(Math.max(0, timestamp - now), 86400000) : undefined;
}
function post(
  endpoint: URL,
  address: Address,
  details: webPush.RequestDetails,
  signal: AbortSignal,
): Promise<ProviderResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      endpoint,
      {
        method: 'POST',
        headers: details.headers,
        agent: false,
        family: address.family,
        signal,
        servername: endpoint.hostname,
        // Die Verbindung benutzt exakt die zuvor gepruefte Adresse; keine zweite DNS-Aufloesung.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      },
      (response) => {
        const retryAfter = response.headers['retry-after'];
        const result = {
          status: response.statusCode ?? 500,
          retryAfter: Array.isArray(retryAfter) ? retryAfter[0] : retryAfter,
        };
        // Keine Providertexte speichern. https.request folgt Redirects grundsaetzlich nicht.
        response.destroy();
        resolve(result);
      },
    );
    outgoing.on('error', reject);
    outgoing.end(details.body);
  });
}
export function createPushProvider(
  vapid: { publicKey: string; privateKey: string; subject: string },
  overrides: Partial<ProviderDependencies> = {},
): PushProvider {
  const dependencies: ProviderDependencies = {
    resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
    post,
    ...overrides,
  };
  return {
    async send(subscription, payload) {
      const signal = AbortSignal.timeout(10000);
      let endpoint: URL;
      let details: webPush.RequestDetails;
      try {
        endpoint = validateEndpoint(subscription.endpoint);
        if (Buffer.byteLength(payload) > 4096) throw new Error('payload');
        details = webPush.generateRequestDetails(
          {
            endpoint: endpoint.href,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 86400, urgency: 'normal', contentEncoding: 'aes128gcm', vapidDetails: vapid },
        );
      } catch {
        return { status: 'configuration_error' };
      }
      try {
        const addresses = await Promise.race([
          dependencies.resolve(endpoint.hostname),
          new Promise<never>((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }),
          ),
        ]);
        const address = addresses[0];
        if (!address || addresses.some((candidate) => !isPublicAddress(candidate.address)))
          return { status: 'configuration_error' };
        const response = await dependencies.post(endpoint, address, details, signal);
        if (response.status >= 200 && response.status < 300) return { status: 'accepted' };
        if (response.status === 404 || response.status === 410) return { status: 'expired' };
        if (response.status === 429 || response.status >= 500)
          return { status: 'retry', retryAfterMs: normalizeRetryAfter(response.retryAfter) };
        return { status: 'configuration_error' };
      } catch {
        return { status: 'retry' };
      }
    },
  };
}

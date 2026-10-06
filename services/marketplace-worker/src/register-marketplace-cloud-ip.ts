import { lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ChromiumNetworkProfiles, type ChromiumNetwork } from './chromium-network-profiles.ts';

interface Registration {
  file: string;
  networkId: string;
  orderReference: string;
  countryCode: string;
  isDedicatedIsp: boolean;
  expiresAt: string;
}
interface RegistrationOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  probe?: (
    network: Extract<ChromiumNetwork, { kind: 'proxy' }>,
  ) => Promise<{ ip: string; countryCode: string }>;
  now?: () => number;
}
const safeError = () => new Error('Cloud-IP konnte nicht sicher geprüft oder registriert werden.');
const columns =
  'network_id,exit_ip_fingerprint,provider,order_reference,country_code,is_dedicated_isp,expires_at,enabled,verified_at';
function record(candidate: unknown): candidate is Record<string, unknown> {
  return !!candidate && typeof candidate === 'object' && !Array.isArray(candidate);
}
function database(options: RegistrationOptions): {
  url: string;
  request: typeof fetch;
  headers: Record<string, string>;
} {
  const url = new URL(options.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !options.serviceRoleKey
  )
    throw safeError();
  return {
    url: `${url.origin}${url.pathname.replace(/\/$/, '')}/rest/v1/marketplace_cloud_ips`,
    request: options.fetch ?? fetch,
    headers: {
      apikey: options.serviceRoleKey,
      Authorization: `Bearer ${options.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
  };
}
function matches(row: unknown, registration: Registration, exitFingerprint: string): boolean {
  return (
    record(row) &&
    row['network_id'] === registration.networkId &&
    row['exit_ip_fingerprint'] === exitFingerprint &&
    row['provider'] === 'iproyal' &&
    row['order_reference'] === registration.orderReference &&
    row['country_code'] === 'DE' &&
    row['is_dedicated_isp'] === true &&
    row['enabled'] === true &&
    typeof row['verified_at'] === 'string' &&
    Number.isFinite(Date.parse(row['verified_at'])) &&
    typeof row['expires_at'] === 'string' &&
    Date.parse(row['expires_at']) === Date.parse(registration.expiresAt)
  );
}

/** Ein expliziter Proxytest prüft nur den Ausgang, niemals eine Vinted-Anmeldung. */
export async function probeGermanExit(
  network: Extract<ChromiumNetwork, { kind: 'proxy' }>,
): Promise<{ ip: string; countryCode: string }> {
  const { request } = await import('playwright');
  const context = await request.newContext({
    proxy: { server: network.server, username: network.username, password: network.password },
    timeout: 30_000,
    ignoreHTTPSErrors: false,
  });
  try {
    const response = await context.get('https://ipwho.is/?fields=success,ip,country_code', {
      maxRedirects: 0,
    });
    if (!response.ok()) throw safeError();
    const body: unknown = await response.json();
    if (
      !record(body) ||
      body['success'] !== true ||
      typeof body['ip'] !== 'string' ||
      typeof body['country_code'] !== 'string'
    )
      throw safeError();
    return { ip: body['ip'], countryCode: body['country_code'] };
  } finally {
    await context.dispose();
  }
}

export async function registerMarketplaceCloudIp(
  registration: Registration,
  options: RegistrationOptions,
): Promise<{ networkId: string; status: 'registered' | 'already_registered' }> {
  try {
    const now = options.now ?? Date.now;
    if (
      !isAbsolute(registration.file) ||
      !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(registration.networkId) ||
      registration.networkId === 'direct' ||
      !/^[^\p{Cc}]{1,120}$/u.test(registration.orderReference) ||
      registration.countryCode !== 'DE' ||
      !registration.isDedicatedIsp ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(registration.expiresAt) ||
      !(Date.parse(registration.expiresAt) > now())
    )
      throw safeError();
    const metadata = await lstat(registration.file);
    if (process.platform !== 'win32' && metadata.uid !== process.getuid?.()) throw safeError();
    const networks = await ChromiumNetworkProfiles.load(registration.file);
    const network = networks.resolve(registration.networkId);
    if (
      network.kind !== 'proxy' ||
      !network.username?.trim() ||
      !network.password ||
      !['http:', 'https:'].includes(new URL(network.server).protocol)
    )
      throw safeError();
    const exit = await (options.probe ?? probeGermanExit)(network);
    if (
      exit.countryCode !== 'DE' ||
      isIP(exit.ip) !== 4 ||
      !(Date.parse(registration.expiresAt) > now())
    )
      throw safeError();
    const octets = exit.ip.split('.').map(Number);
    const first = octets[0];
    const second = octets[1];
    if (
      first === undefined ||
      second === undefined ||
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127)
    )
      throw safeError();
    const exitFingerprint = createHash('sha256').update(exit.ip).digest('hex');
    const db = database(options);
    const read = async (): Promise<unknown[]> => {
      const response = await db.request(
        `${db.url}?select=${columns}&network_id=eq.${encodeURIComponent(registration.networkId)}`,
        { headers: db.headers, signal: AbortSignal.timeout(15_000) },
      );
      if (!response.ok) throw safeError();
      const rows: unknown = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw safeError();
      return rows;
    };
    const existing = await read();
    if (existing.length) {
      if (!matches(existing[0], registration, exitFingerprint)) throw safeError();
      return { networkId: registration.networkId, status: 'already_registered' };
    }
    const body = {
      network_id: registration.networkId,
      exit_ip_fingerprint: exitFingerprint,
      provider: 'iproyal',
      order_reference: registration.orderReference,
      country_code: 'DE',
      is_dedicated_isp: true,
      expires_at: new Date(registration.expiresAt).toISOString(),
      enabled: true,
      verified_at: new Date(now()).toISOString(),
    };
    try {
      const response = await db.request(`${db.url}?on_conflict=network_id`, {
        method: 'POST',
        headers: { ...db.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw safeError();
    } catch {
      /* Die bestätigte Zeile klärt eine verlorene Schreibantwort ohne weitere Bestellung. */
    }
    const confirmed = await read();
    if (!matches(confirmed[0], registration, exitFingerprint)) throw safeError();
    return { networkId: registration.networkId, status: 'registered' };
  } catch {
    throw safeError();
  }
}

export async function listMarketplaceCloudIps(
  options: RegistrationOptions,
): Promise<
  readonly { networkId: string; orderReference: string; expiresAt: string; state: string }[]
> {
  try {
    const db = database(options);
    const now = (options.now ?? Date.now)();
    const response = await db.request(
      `${db.url}?select=${columns},marketplace_cloud_setups(state)&order=id.asc&limit=1000`,
      { headers: db.headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) throw safeError();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw safeError();
    return rows.map((row: unknown) => {
      if (
        !record(row) ||
        typeof row['network_id'] !== 'string' ||
        typeof row['order_reference'] !== 'string' ||
        typeof row['expires_at'] !== 'string' ||
        !Array.isArray(row['marketplace_cloud_setups'])
      )
        throw safeError();
      const held = row['marketplace_cloud_setups'].filter(
        (setup: unknown) =>
          record(setup) && typeof setup['state'] === 'string' && setup['state'] !== 'cancelled',
      );
      const state = !row['enabled']
        ? 'disabled'
        : !(Date.parse(row['expires_at']) > now)
          ? 'expired'
          : !row['verified_at'] || row['country_code'] !== 'DE' || row['is_dedicated_isp'] !== true
            ? 'unverified'
            : held.length && record(held[0])
              ? String(held[0]['state'])
              : 'free';
      return {
        networkId: row['network_id'],
        orderReference: row['order_reference'],
        expiresAt: row['expires_at'],
        state,
      };
    });
  } catch {
    throw safeError();
  }
}

async function main(): Promise<void> {
  try {
    const { values } = parseArgs({
      options: {
        list: { type: 'boolean' },
        file: { type: 'string' },
        network: { type: 'string' },
        order: { type: 'string' },
        country: { type: 'string' },
        'dedicated-isp': { type: 'boolean' },
        expires: { type: 'string' },
      },
      strict: true,
    });
    const options = {
      url: process.env['SUPABASE_URL'] ?? '',
      serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
    };
    const result = values.list
      ? await listMarketplaceCloudIps(options)
      : await registerMarketplaceCloudIp(
          {
            file: values.file ?? '',
            networkId: values.network ?? '',
            orderReference: values.order ?? '',
            countryCode: values.country ?? '',
            isDedicatedIsp: values['dedicated-isp'] === true,
            expiresAt: values.expires ?? '',
          },
          options,
        );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('Cloud-IP konnte nicht sicher geprüft oder registriert werden.\n');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

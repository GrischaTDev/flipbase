import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { isIP } from 'node:net';
import { isAbsolute } from 'node:path';
import { ChromiumNetworkProfiles, type ChromiumNetwork } from './chromium-network-profiles.ts';
import { probeGermanExit, registerMarketplaceCloudIp } from './register-marketplace-cloud-ip.ts';

type ProxyNetwork = Extract<ChromiumNetwork, { kind: 'proxy' }>;
interface SyncOptions {
  token: string;
  file: string;
  networks: ChromiumNetworkProfiles;
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  probe?: (network: ProxyNetwork) => Promise<{ ip: string; countryCode: string }>;
  now?: () => number;
}
interface PurchasedProxy {
  orderReference: string;
  fingerprint: string;
  ip: string;
  expiresAt: string;
  network: ProxyNetwork;
}
const fail = () =>
  new Error('IPRoyal-Bestand konnte nicht sicher abgeglichen werden. Bitte versuche es erneut.');
function record(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

/** Liest nur bereits gekaufte IPs. Reservierungen bleiben ausschließlich in Flipbase. */
export class IpRoyalCloudIpSync {
  private pending?: Promise<void>;
  private readonly options: SyncOptions;
  constructor(options: SyncOptions) {
    this.options = options;
  }

  refresh(): Promise<void> {
    this.pending ??= this.synchronize()
      .catch(() => {
        throw fail();
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async readProviderResponse(
    path: string,
    parameters: Record<string, string> = {},
  ): Promise<unknown> {
    if (!this.options.token) throw fail();
    const url = new URL(`https://apid.iproyal.com/v1/reseller/${path}`);
    url.search = new URLSearchParams(parameters).toString();
    const response = await (this.options.fetch ?? fetch)(url, {
      headers: { 'X-Access-Token': this.options.token },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw fail();
    return response.json();
  }

  private async readPurchasedProxies(): Promise<PurchasedProxy[]> {
    const products = await this.readProviderResponse('products');
    if (!record(products) || !Array.isArray(products['data'])) throw fail();
    const product = products['data'].filter(
      (entry: unknown) => record(entry) && entry['name'] === 'ISP Dedicated',
    );
    if (
      product.length !== 1 ||
      !record(product[0]) ||
      !Number.isSafeInteger(product[0]['id']) ||
      Number(product[0]['id']) <= 0
    )
      throw fail();
    const orders: unknown[] = [];
    let lastPage = 1;
    let total: number | undefined;
    for (let page = 1; page <= lastPage; page++) {
      const result = await this.readProviderResponse('orders', {
        product_id: String(product[0]['id']),
        status: 'confirmed',
        page: String(page),
        per_page: '10',
      });
      if (!record(result) || !Array.isArray(result['data']) || !record(result['meta']))
        throw fail();
      const meta = result['meta'];
      if (
        meta['current_page'] !== page ||
        !Number.isSafeInteger(meta['last_page']) ||
        Number(meta['last_page']) < page ||
        Number(meta['last_page']) > 128 ||
        !Number.isSafeInteger(meta['total']) ||
        Number(meta['total']) < 0 ||
        Number(meta['total']) > 128 ||
        (total !== undefined && (total !== meta['total'] || lastPage !== meta['last_page']))
      )
        throw fail();
      lastPage = Number(meta['last_page']);
      total = Number(meta['total']);
      orders.push(...result['data']);
      if (orders.length > 128) throw fail();
    }
    if (orders.length !== total) throw fail();
    const proxies: PurchasedProxy[] = [];
    const fingerprints = new Set<string>();
    const orderIds = new Set<number>();
    for (const order of orders) {
      if (
        !record(order) ||
        !Number.isSafeInteger(order['id']) ||
        Number(order['id']) <= 0 ||
        orderIds.has(Number(order['id']))
      )
        throw fail();
      orderIds.add(Number(order['id']));
      if (
        order['status'] !== 'confirmed' ||
        order['is_test'] !== false ||
        order['product_name'] !== 'ISP Dedicated' ||
        order['location'] !== 'Germany' ||
        order['locations'] !== 'Germany'
      )
        continue;
      // Die API nennt keine Zeitzone: einen ganzen Tag vor dem Ablauftag auslaufen lassen.
      const expiration = order['expire_date'];
      if (
        typeof expiration !== 'string' ||
        !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(expiration)
      )
        throw fail();
      const midnight = Date.parse(`${expiration.slice(0, 10)}T00:00:00Z`);
      if (
        !Number.isFinite(midnight) ||
        new Date(midnight).toISOString().slice(0, 10) !== expiration.slice(0, 10) ||
        !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(expiration.slice(11))
      )
        throw fail();
      const expiresAt = new Date(midnight - 86_400_000).toISOString();
      if (
        !record(order['proxy_data']) ||
        !record(order['proxy_data']['ports']) ||
        !Array.isArray(order['proxy_data']['proxies']) ||
        order['quantity'] !== order['proxy_data']['proxies'].length
      )
        throw fail();
      const port = order['proxy_data']['ports']['http|https'];
      if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535) throw fail();
      for (const proxy of order['proxy_data']['proxies']) {
        if (
          !record(proxy) ||
          typeof proxy['ip'] !== 'string' ||
          isIP(proxy['ip']) !== 4 ||
          typeof proxy['username'] !== 'string' ||
          !proxy['username'].trim() ||
          proxy['username'].length > 1024 ||
          typeof proxy['password'] !== 'string' ||
          !proxy['password'] ||
          proxy['password'].length > 1024
        )
          throw fail();
        const fingerprint = createHash('sha256').update(proxy['ip']).digest('hex');
        if (fingerprints.has(fingerprint)) throw fail();
        fingerprints.add(fingerprint);
        proxies.push({
          orderReference: String(order['id']),
          fingerprint,
          ip: proxy['ip'],
          expiresAt,
          network: {
            kind: 'proxy',
            server: `http://${proxy['ip']}:${port}`,
            username: proxy['username'],
            password: proxy['password'],
          },
        });
        if (proxies.length > 128) throw fail();
      }
    }
    return proxies;
  }

  private async synchronize(): Promise<void> {
    const purchased = await this.readPurchasedProxies();
    const now = (this.options.now ?? Date.now)();
    const dbUrl = new URL(this.options.url);
    if (
      !['http:', 'https:'].includes(dbUrl.protocol) ||
      dbUrl.username ||
      dbUrl.password ||
      dbUrl.search ||
      dbUrl.hash ||
      !this.options.serviceRoleKey ||
      !isAbsolute(this.options.file)
    )
      throw fail();
    const endpoint = `${dbUrl.origin}${dbUrl.pathname.replace(/\/$/, '')}/rest/v1/marketplace_cloud_ips`;
    const request = this.options.fetch ?? fetch;
    const headers = {
      apikey: this.options.serviceRoleKey,
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
    const existingResponse = await request(
      `${endpoint}?select=network_id,exit_ip_fingerprint,order_reference,expires_at&provider=eq.iproyal&limit=129`,
      { headers, redirect: 'error', signal: AbortSignal.timeout(15_000) },
    );
    if (!existingResponse.ok) throw fail();
    const existing: unknown = await existingResponse.json();
    if (!Array.isArray(existing) || existing.length > 128) throw fail();
    const rows = existing.map((row: unknown) => {
      if (
        !record(row) ||
        typeof row['network_id'] !== 'string' ||
        !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row['network_id']) ||
        row['network_id'] === 'direct' ||
        typeof row['exit_ip_fingerprint'] !== 'string' ||
        typeof row['order_reference'] !== 'string' ||
        typeof row['expires_at'] !== 'string' ||
        !Number.isFinite(Date.parse(row['expires_at']))
      )
        throw fail();
      return {
        networkId: row['network_id'],
        fingerprint: row['exit_ip_fingerprint'],
        orderReference: row['order_reference'],
        expiresAt: row['expires_at'],
      };
    });
    const metadata = await lstat(this.options.file);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size > 64 * 1024 ||
      (process.platform !== 'win32' &&
        ((metadata.mode & 0o077) !== 0 || metadata.uid !== process.getuid?.()))
    )
      throw fail();
    const handle = await open(this.options.file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let contents: unknown;
    try {
      const actual = await handle.stat();
      if (actual.ino !== metadata.ino || actual.dev !== metadata.dev || actual.size > 64 * 1024)
        throw fail();
      contents = JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
    if (!record(contents) || !Array.isArray(contents['networkProfiles'])) throw fail();
    const savedProfiles = contents['networkProfiles'];
    const configured = await ChromiumNetworkProfiles.load(this.options.file);
    // Erst den vollständigen Anbieterbestand und unveränderte vorhandene Zugänge prüfen.
    const candidates = purchased.map((proxy) => {
      const row = rows.find((entry) => entry.fingerprint === proxy.fingerprint);
      if (row && row.orderReference !== proxy.orderReference) throw fail();
      const networkId =
        row?.networkId ?? `iproyal-${proxy.orderReference}-${proxy.fingerprint.slice(0, 24)}`;
      const saved = savedProfiles.find(
        (entry: unknown) => record(entry) && entry['id'] === networkId,
      );
      if (saved) {
        const network = configured.resolve(networkId);
        if (
          network.kind !== 'proxy' ||
          network.server !== proxy.network.server ||
          network.username !== proxy.network.username ||
          network.password !== proxy.network.password
        )
          throw fail();
      } else if (row) throw fail();
      return { ...proxy, networkId, row, saved };
    });
    const additions = candidates
      .filter((proxy) => !proxy.saved && Date.parse(proxy.expiresAt) > now)
      .map((proxy) => ({ id: proxy.networkId, ...proxy.network }));
    const encoded = JSON.stringify({
      ...contents,
      networkProfiles: [...savedProfiles, ...additions],
    });
    if (Buffer.byteLength(encoded) > 64 * 1024 || savedProfiles.length + additions.length > 128)
      throw fail();
    const temporary = `${this.options.file}.${randomUUID()}.tmp`;
    try {
      const staged = await open(temporary, 'wx', 0o600);
      try {
        await staged.writeFile(encoded);
        await staged.sync();
      } finally {
        await staged.close();
      }
      const validated = await ChromiumNetworkProfiles.load(temporary);
      for (const proxy of candidates) {
        if (Date.parse(proxy.expiresAt) <= now) continue;
        const network = validated.resolve(proxy.networkId);
        if (network.kind !== 'proxy') throw fail();
        const exit = await (this.options.probe ?? probeGermanExit)(network);
        if (exit.countryCode !== 'DE' || exit.ip !== proxy.ip) throw fail();
      }
      // Die bestehende Datei und ihr Eigentümer bleiben bei fehlgeschlagenem Abgleich erhalten.
      if (additions.length) await rename(temporary, this.options.file);
      await this.options.networks.reload(this.options.file);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    const patch = async (networkId: string, expiresAt: string, verified = false) => {
      const response = await request(
        `${endpoint}?network_id=eq.${encodeURIComponent(networkId)}&provider=eq.iproyal`,
        {
          method: 'PATCH',
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            expires_at: expiresAt,
            ...(verified ? { verified_at: new Date(now).toISOString() } : {}),
          }),
        },
      );
      if (!response.ok) throw fail();
    };
    for (const proxy of candidates) {
      if (proxy.row)
        await patch(proxy.networkId, proxy.expiresAt, Date.parse(proxy.expiresAt) > now);
      else if (Date.parse(proxy.expiresAt) > now)
        await registerMarketplaceCloudIp(
          {
            file: this.options.file,
            networkId: proxy.networkId,
            orderReference: proxy.orderReference,
            countryCode: 'DE',
            isDedicatedIsp: true,
            expiresAt: proxy.expiresAt,
          },
          { ...this.options, probe: async () => ({ ip: proxy.ip, countryCode: 'DE' }) },
        );
    }
    for (const row of rows) {
      if (!candidates.some((proxy) => proxy.fingerprint === row.fingerprint))
        await patch(
          row.networkId,
          new Date(Math.min(now, Date.parse(row.expiresAt))).toISOString(),
        );
    }
  }
}

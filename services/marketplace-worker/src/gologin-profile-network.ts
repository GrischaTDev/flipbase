/** Verwendet vorhandenes GoLogin-Kontingent; kauft und rotiert keine Proxys. */
export class GoLoginProfileNetwork {
  private readonly token: string;
  private readonly request: typeof fetch;
  constructor(token: string, request: typeof fetch = fetch) {
    this.token = token;
    this.request = request;
  }

  async configureNew(profileId: string): Promise<void> {
    const traffic = await this.get('/users-proxies/geolocation/traffic');
    const bucket = traffic['residentTrafficData'] ?? traffic['residentialTrafficData'];
    if (
      !isRecord(bucket) ||
      typeof bucket['trafficLimitBytes'] !== 'number' ||
      typeof bucket['trafficUsedBytes'] !== 'number' ||
      !Number.isFinite(bucket['trafficLimitBytes']) ||
      !Number.isFinite(bucket['trafficUsedBytes']) ||
      bucket['trafficLimitBytes'] <= bucket['trafficUsedBytes']
    )
      throw new Error('GoLogin-Proxykontingent fehlt');
    const response = await this.request('https://api.gologin.com/users-proxies/mobile-proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        countryCode: 'de',
        isDc: false,
        isMobile: false,
        profileIdToLink: profileId,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('GoLogin-Proxy konnte nicht zugeordnet werden');
    await this.assertConfigured(profileId);
  }

  async assertConfigured(profileId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId)) throw new Error('Ungültiges Browserprofil');
    const profile = await this.get(`/browser/${profileId}`);
    const proxy = profile['proxy'];
    if (
      profile['proxyEnabled'] !== true ||
      !isRecord(proxy) ||
      !['http', 'socks4', 'socks5', 'gologin', 'geolocation'].includes(String(proxy['mode'])) ||
      typeof proxy['host'] !== 'string' ||
      !proxy['host'] ||
      !Number.isInteger(proxy['port']) ||
      Number(proxy['port']) <= 0 ||
      Number(proxy['port']) > 65535
    )
      throw new Error('Das Browserprofil benötigt einen eingerichteten Proxy');
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const response = await this.request(`https://api.gologin.com${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('GoLogin-Netzwerkkonfiguration nicht verfügbar');
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error('Ungültige GoLogin-Netzwerkkonfiguration');
    return body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

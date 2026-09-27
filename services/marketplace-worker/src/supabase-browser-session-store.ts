import type { BrowserLease, BrowserSessionScope } from './marketplace-browser-session-broker.ts';

interface SupabaseBrowserSessionStoreOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

const profileIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export class SupabaseBrowserSessionStore {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: SupabaseBrowserSessionStoreOptions) {
    if (!options.publishableKey || !options.serviceRoleKey) throw new Error('Browser-Zugang fehlt');
    this.baseUrl = options.url.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async acquire(scope: BrowserSessionScope): Promise<BrowserLease> {
    if ((await this.authenticatedUserId(scope.userAccessToken)) !== scope.userId)
      throw new Error('Sitzungszugriff verweigert');
    const value = await this.callUserRpc(
      'marketplace_browser_session_reserve',
      scope.userAccessToken,
      {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
      },
    );
    if (
      !isRecord(value) ||
      typeof value['id'] !== 'string' ||
      value['workspaceId'] !== scope.workspaceId ||
      value['connectionId'] !== scope.connectionId ||
      value['state'] !== 'active' ||
      typeof value['expiresAt'] !== 'string'
    )
      throw new Error('Ungültige Browser-Sitzung');
    const expiresAt = Date.parse(value['expiresAt']);
    if (!Number.isFinite(expiresAt)) throw new Error('Ungültige Browser-Sitzung');
    return { id: value['id'], scope: { ...scope }, expiresAt, active: true };
  }

  async assertActive(lease: BrowserLease): Promise<boolean> {
    if ((await this.authenticatedUserId(lease.scope.userAccessToken)) !== lease.scope.userId)
      return false;
    const value = await this.callUserRpc(
      'marketplace_browser_session_check',
      lease.scope.userAccessToken,
      {
        p_workspace_id: lease.scope.workspaceId,
        p_connection_id: lease.scope.connectionId,
        p_session_id: lease.id,
      },
    );
    return (
      isRecord(value) &&
      value['id'] === lease.id &&
      value['workspaceId'] === lease.scope.workspaceId &&
      value['connectionId'] === lease.scope.connectionId &&
      value['active'] === true
    );
  }

  async resolve(lease: BrowserLease): Promise<string> {
    const url = new URL('/rest/v1/marketplace_browser_sessions', this.baseUrl);
    url.searchParams.set('select', 'provider_profile_id');
    url.searchParams.set('public_id', `eq.${lease.id}`);
    url.searchParams.set('workspace_id', `eq.${lease.scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${lease.scope.connectionId}`);
    url.searchParams.set('started_by', `eq.${lease.scope.userId}`);
    url.searchParams.set('state', 'eq.active');
    const rows = await this.read(await this.request(url, { headers: this.serverHeaders() }));
    if (
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      !isRecord(rows[0]) ||
      typeof rows[0]['provider_profile_id'] !== 'string' ||
      !profileIdPattern.test(rows[0]['provider_profile_id'])
    )
      throw new Error('Browserprofil fehlt');
    return rows[0]['provider_profile_id'];
  }

  async release(lease: BrowserLease): Promise<void> {
    const url = new URL('/rest/v1/marketplace_browser_sessions', this.baseUrl);
    url.searchParams.set('public_id', `eq.${lease.id}`);
    url.searchParams.set('workspace_id', `eq.${lease.scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${lease.scope.connectionId}`);
    url.searchParams.set('started_by', `eq.${lease.scope.userId}`);
    url.searchParams.set('state', 'in.(active,stopping)');
    const rows = await this.read(
      await this.request(url, {
        method: 'PATCH',
        headers: {
          ...this.serverHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ state: 'closed', provider_stopped_at: new Date().toISOString() }),
      }),
    );
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new Error('Browser-Sperre konnte nicht freigegeben werden');
  }

  private async authenticatedUserId(userAccessToken: string): Promise<string> {
    const response = await this.request(new URL('/auth/v1/user', this.baseUrl), {
      headers: this.userHeaders(userAccessToken),
    });
    const value = await this.read(response);
    if (!isRecord(value) || typeof value['id'] !== 'string')
      throw new Error('Anmeldung konnte nicht geprüft werden');
    return value['id'];
  }

  private async callUserRpc(
    name: string,
    userAccessToken: string,
    body: Record<string, string>,
  ): Promise<unknown> {
    return this.read(
      await this.request(new URL(`/rest/v1/rpc/${name}`, this.baseUrl), {
        method: 'POST',
        headers: { ...this.userHeaders(userAccessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  private userHeaders(userAccessToken: string): Record<string, string> {
    return { apikey: this.publishableKey, Authorization: `Bearer ${userAccessToken}` };
  }

  private serverHeaders(): Record<string, string> {
    return { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` };
  }

  private async read(response: Response): Promise<unknown> {
    if (!response.ok) throw new Error('Browser-Datenbank nicht erreichbar');
    try {
      return await response.json();
    } catch {
      throw new Error('Ungültige Browser-Datenbankantwort');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

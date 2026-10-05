import {
  MarketplaceBrowserSessionBusyError,
  type BrowserLease,
  type BrowserSessionScope,
} from './marketplace-browser-session-broker.ts';

interface SupabaseBrowserSessionStoreOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  runtime?: { workerId: string; workerEpoch: number };
  onReservationUncertain?: () => void;
}

const profileIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export class SupabaseBrowserSessionStore {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;
  private readonly runtime?: SupabaseBrowserSessionStoreOptions['runtime'];
  private readonly onReservationUncertain?: () => void;

  constructor(options: SupabaseBrowserSessionStoreOptions) {
    if (!options.publishableKey || !options.serviceRoleKey) throw new Error('Browser-Zugang fehlt');
    this.baseUrl = options.url.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
    this.runtime = options.runtime;
    this.onReservationUncertain = options.onReservationUncertain;
  }

  async acquire(scope: BrowserSessionScope): Promise<BrowserLease> {
    if (scope.syncRead) {
      const value = await this.callReadRpc(scope, 'marketplace_sync_check');
      if (
        !isRecord(value) ||
        value['active'] !== true ||
        value['sessionId'] !== scope.syncRead.sessionId
      )
        throw new Error('Sitzungszugriff verweigert');
      const expiresAt =
        typeof value['expiresAt'] === 'string' ? Date.parse(value['expiresAt']) : NaN;
      const absoluteExpiresAt =
        typeof value['absoluteExpiresAt'] === 'string'
          ? Date.parse(value['absoluteExpiresAt'])
          : NaN;
      if (
        !Number.isFinite(expiresAt) ||
        !Number.isFinite(absoluteExpiresAt) ||
        expiresAt > absoluteExpiresAt ||
        expiresAt <= Date.now()
      )
        throw new Error('Sitzungszugriff verweigert');
      return { id: scope.syncRead.sessionId, scope: { ...scope }, expiresAt, active: true };
    }
    if ((await this.authenticatedUserId(scope.userAccessToken)) !== scope.userId)
      throw new Error('Sitzungszugriff verweigert');
    const value = await this.callUserRpc(
      scope.cloudSetup
        ? 'marketplace_cloud_setup_session_reserve'
        : 'marketplace_browser_session_reserve',
      scope.userAccessToken,
      {
        p_workspace_id: scope.workspaceId,
        ...(scope.cloudSetup
          ? { p_setup_id: scope.cloudSetup.setupId }
          : { p_connection_id: scope.connectionId }),
      },
    );
    if (
      !isRecord(value) ||
      typeof value['id'] !== 'string' ||
      value['workspaceId'] !== scope.workspaceId ||
      value['connectionId'] !== scope.connectionId ||
      value['state'] !== 'active' ||
      typeof value['expiresAt'] !== 'string'
    ) {
      this.onReservationUncertain?.();
      throw new Error('Ungültige Browser-Sitzung');
    }
    const expiresAt = Date.parse(value['expiresAt']);
    if (!Number.isFinite(expiresAt)) {
      this.onReservationUncertain?.();
      throw new Error('Ungültige Browser-Sitzung');
    }
    if (this.runtime) {
      try {
        const bound = await this.read(
          await this.request(
            new URL('/rest/v1/rpc/marketplace_browser_session_bind_worker', this.baseUrl),
            {
              method: 'POST',
              headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                p_session_id: value['id'],
                p_worker_id: this.runtime.workerId,
                p_worker_epoch: this.runtime.workerEpoch,
              }),
              signal: AbortSignal.timeout(10_000),
            },
          ),
        );
        if (bound !== true) throw new Error('Sitzungszugriff verweigert');
      } catch {
        this.onReservationUncertain?.();
        throw new Error('Sitzungszugriff verweigert');
      }
    }
    return { id: value['id'], scope: { ...scope }, expiresAt, active: true };
  }

  async assertActive(lease: BrowserLease): Promise<boolean> {
    if (lease.scope.syncRead) {
      const value = await this.callReadRpc(lease.scope, 'marketplace_sync_heartbeat');
      if (
        !isRecord(value) ||
        value['active'] !== true ||
        value['sessionId'] !== lease.id ||
        typeof value['expiresAt'] !== 'string'
      )
        return false;
      const expiresAt = Date.parse(value['expiresAt']);
      const absoluteExpiresAt = Date.parse(lease.scope.syncRead.absoluteExpiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > absoluteExpiresAt)
        return false;
      lease.expiresAt = expiresAt;
      return true;
    }
    if ((await this.authenticatedUserId(lease.scope.userAccessToken)) !== lease.scope.userId)
      return false;
    const value = await this.callUserRpc(
      lease.scope.cloudSetup
        ? 'marketplace_cloud_setup_session_check'
        : 'marketplace_browser_session_check',
      lease.scope.userAccessToken,
      {
        p_workspace_id: lease.scope.workspaceId,
        ...(lease.scope.cloudSetup
          ? { p_setup_id: lease.scope.cloudSetup.setupId }
          : { p_connection_id: lease.scope.connectionId }),
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
    url.searchParams.set(
      'cloud_setup_id',
      lease.scope.cloudSetup ? `eq.${lease.scope.cloudSetup.setupId}` : 'is.null',
    );
    const rows = await this.read(
      await this.request(url, {
        headers: this.serverHeaders(),
        signal: AbortSignal.timeout(10_000),
      }),
    );
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
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new Error('Browser-Sperre konnte nicht freigegeben werden');
  }

  private async authenticatedUserId(userAccessToken: string): Promise<string> {
    const response = await this.request(new URL('/auth/v1/user', this.baseUrl), {
      headers: this.userHeaders(userAccessToken),
      signal: AbortSignal.timeout(10_000),
    });
    const value = await this.read(response);
    if (!isRecord(value) || typeof value['id'] !== 'string')
      throw new Error('Anmeldung konnte nicht geprüft werden');
    return value['id'];
  }

  private async callReadRpc(scope: BrowserSessionScope, name: string): Promise<unknown> {
    const authorization = scope.syncRead;
    if (!authorization) throw new Error('Leseauftrag fehlt');
    return this.read(
      await this.request(new URL(`/rest/v1/rpc/${name}`, this.baseUrl), {
        method: 'POST',
        headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_operation_id: authorization.operationId,
          p_runner_id: authorization.runnerId,
          p_worker_epoch: authorization.workerEpoch,
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }

  private async callUserRpc(
    name: string,
    userAccessToken: string,
    body: Record<string, string>,
  ): Promise<unknown> {
    const isReservation =
      name === 'marketplace_browser_session_reserve' ||
      name === 'marketplace_cloud_setup_session_reserve';
    let response: Response;
    try {
      response = await this.request(new URL(`/rest/v1/rpc/${name}`, this.baseUrl), {
        method: 'POST',
        headers: { ...this.userHeaders(userAccessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      if (isReservation) this.onReservationUncertain?.();
      throw new Error('Browser-Datenbank nicht erreichbar');
    }
    if (isReservation && response.status === 500) {
      let rejection: unknown;
      try {
        rejection = await response.clone().json();
      } catch {
        // Ohne lesbaren SQLSTATE bleibt eine möglicherweise geschriebene Reservierung ungeklärt.
        rejection = null;
      }
      // PostgREST liefert diese vollständig zurückgerollte Ablehnung als HTTP 500.
      // Sie darf weder eine fremde Sitzung stoppen noch die Worker-Runtime verwerfen.
      if (isRecord(rejection) && rejection['code'] === '55P03')
        throw new MarketplaceBrowserSessionBusyError();
    }
    try {
      return await this.read(response);
    } catch {
      if (isReservation && (response.ok || response.status >= 500)) this.onReservationUncertain?.();
      throw new Error('Browser-Datenbank nicht erreichbar');
    }
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

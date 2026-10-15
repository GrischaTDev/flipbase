import { CloudBrowserStoppedUncleanlyError } from './gologin-cloud-browser.ts';

interface UnresolvedBrowserSession {
  id: string;
  profileId: string;
}

export interface BrowserRecoveryStore {
  listUnresolved(): Promise<UnresolvedBrowserSession[]>;
  markStopping(sessionId: string): Promise<void>;
  markStopped(sessionId: string, unclean?: boolean): Promise<void>;
}

interface BrowserStopProvider {
  stop(profileId: string): Promise<void>;
}

export class MarketplaceBrowserRecovery {
  private readonly store: BrowserRecoveryStore;
  private readonly provider: BrowserStopProvider;
  private readonly uncleanSessions = new Set<string>();

  constructor(store: BrowserRecoveryStore, provider: BrowserStopProvider) {
    this.store = store;
    this.provider = provider;
  }

  async recover(): Promise<void> {
    const unresolved = await this.store.listUnresolved();
    let failed = false;
    for (const session of unresolved) {
      try {
        await this.store.markStopping(session.id);
        try {
          await this.provider.stop(session.profileId);
        } catch (error) {
          if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
          this.uncleanSessions.add(session.id);
        }
        await this.store.markStopped(session.id, this.uncleanSessions.has(session.id));
        this.uncleanSessions.delete(session.id);
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error('Browser-Bereinigung fehlgeschlagen');
  }
}

interface SupabaseBrowserRecoveryOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

export class SupabaseBrowserRecoveryStore implements BrowserRecoveryStore {
  private readonly baseUrl: URL;
  private readonly key: string;
  private readonly request: typeof fetch;

  constructor(options: SupabaseBrowserRecoveryOptions) {
    if (!options.serviceRoleKey) throw new Error('Serverzugang fehlt');
    this.baseUrl = new URL('/rest/v1/marketplace_browser_sessions', options.url);
    this.key = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async listUnresolved(): Promise<UnresolvedBrowserSession[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('select', 'public_id,provider_profile_id');
    url.searchParams.set('state', 'in.(active,stopping)');
    const rows = await this.read(
      await this.request(url, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }),
    );
    if (!Array.isArray(rows)) throw new Error('Browser-Sitzungen konnten nicht gelesen werden');
    return rows.map((row) => {
      if (
        !isRecord(row) ||
        typeof row['public_id'] !== 'string' ||
        typeof row['provider_profile_id'] !== 'string'
      )
        throw new Error('Ungültige Browser-Sitzung');
      return { id: row['public_id'], profileId: row['provider_profile_id'] };
    });
  }

  async markStopping(sessionId: string): Promise<void> {
    await this.patch(sessionId, { state: 'stopping', stop_reason: 'interrupted' });
  }

  async markStopped(sessionId: string, unclean = false): Promise<void> {
    if (unclean) await this.pauseUncleanSchedule(sessionId);
    await this.patch(
      sessionId,
      { state: 'closed', provider_stopped_at: new Date().toISOString() },
      'stopping',
    );
  }

  private async pauseUncleanSchedule(sessionId: string): Promise<void> {
    const sessionUrl = new URL(this.baseUrl);
    sessionUrl.searchParams.set('public_id', `eq.${sessionId}`);
    sessionUrl.searchParams.set('state', 'eq.stopping');
    sessionUrl.searchParams.set('select', 'workspace_id,connection_id,operation_id');
    const sessions = await this.read(
      await this.request(sessionUrl, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    const session: unknown = Array.isArray(sessions) && sessions.length === 1 ? sessions[0] : null;
    if (
      !isRecord(session) ||
      typeof session.workspace_id !== 'string' ||
      typeof session.connection_id !== 'string' ||
      (session.operation_id !== null && typeof session.operation_id !== 'string')
    )
      throw new Error('Browser-Sitzung konnte nicht geprüft werden');
    if (session.operation_id === null) return;
    const operationUrl = new URL('/rest/v1/marketplace_operations', this.baseUrl);
    operationUrl.searchParams.set('id', `eq.${session.operation_id}`);
    operationUrl.searchParams.set('workspace_id', `eq.${session.workspace_id}`);
    operationUrl.searchParams.set('connection_id', `eq.${session.connection_id}`);
    operationUrl.searchParams.set('select', 'schedule_id,schedule_authorization_version');
    const operations = await this.read(
      await this.request(operationUrl, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    const operation: unknown =
      Array.isArray(operations) && operations.length === 1 ? operations[0] : null;
    if (!isRecord(operation)) throw new Error('Abrufauftrag konnte nicht geprüft werden');
    if (operation.schedule_id === null && operation.schedule_authorization_version === null) return;
    if (
      typeof operation.schedule_id !== 'number' ||
      typeof operation.schedule_authorization_version !== 'number' ||
      !Number.isSafeInteger(operation.schedule_authorization_version)
    )
      throw new Error('Abruffreigabe konnte nicht geprüft werden');
    const url = new URL('/rest/v1/marketplace_sync_schedules', this.baseUrl);
    url.searchParams.set('workspace_id', `eq.${session.workspace_id}`);
    url.searchParams.set('connection_id', `eq.${session.connection_id}`);
    url.searchParams.set(
      'select',
      'id,enabled,authorization_version,updated_at,consecutive_failures',
    );
    const schedules = await this.read(
      await this.request(url, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }),
    );
    if (!Array.isArray(schedules) || schedules.length > 1)
      throw new Error('Abrufplan konnte nicht geprüft werden');
    if (schedules.length === 0) return;
    const schedule: unknown = schedules[0];
    if (
      !isRecord(schedule) ||
      typeof schedule.id !== 'number' ||
      typeof schedule.enabled !== 'boolean' ||
      typeof schedule.authorization_version !== 'number' ||
      !Number.isSafeInteger(schedule.authorization_version) ||
      typeof schedule.updated_at !== 'string' ||
      !Number.isFinite(Date.parse(schedule.updated_at)) ||
      typeof schedule.consecutive_failures !== 'number' ||
      !Number.isSafeInteger(schedule.consecutive_failures)
    )
      throw new Error('Abrufplan konnte nicht geprüft werden');
    // Automatische Fortschrittsmeldungen ändern updated_at ebenfalls. Nur die
    // unveränderliche Auftragsfreigabe entscheidet, ob die Kontopause noch zulässig ist.
    if (
      !schedule.enabled ||
      schedule.id !== operation.schedule_id ||
      schedule.authorization_version !== operation.schedule_authorization_version
    )
      return;
    url.searchParams.delete('select');
    url.searchParams.set('id', `eq.${schedule.id}`);
    url.searchParams.set('authorization_version', `eq.${schedule.authorization_version}`);
    url.searchParams.set('updated_at', `eq.${schedule.updated_at}`);
    const rows = await this.read(
      await this.request(url, {
        method: 'PATCH',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          enabled: false,
          paused_reason: 'cleanup',
          next_due_at: null,
          retry_after: null,
          authorization_version: schedule.authorization_version + 1,
          consecutive_failures: schedule.consecutive_failures + 1,
          updated_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    // Null Zeilen bedeuten eine zwischenzeitliche neue Nutzerentscheidung.
    if (!Array.isArray(rows) || rows.length > 1)
      throw new Error('Abrufplan konnte nicht angehalten werden');
  }

  private async patch(
    sessionId: string,
    body: Record<string, string>,
    state?: string,
  ): Promise<void> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('public_id', `eq.${sessionId}`);
    if (state) url.searchParams.set('state', `eq.${state}`);
    const rows = await this.read(
      await this.request(url, {
        method: 'PATCH',
        headers: {
          ...this.headers(),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new Error('Browser-Sitzung konnte nicht aktualisiert werden');
  }

  private headers(): Record<string, string> {
    return { apikey: this.key, Authorization: `Bearer ${this.key}` };
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

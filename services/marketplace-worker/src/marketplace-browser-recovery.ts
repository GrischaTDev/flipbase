interface UnresolvedBrowserSession {
  id: string;
  profileId: string;
}

export interface BrowserRecoveryStore {
  listUnresolved(): Promise<UnresolvedBrowserSession[]>;
  markStopping(sessionId: string): Promise<void>;
  markStopped(sessionId: string): Promise<void>;
}

interface BrowserStopProvider {
  stop(profileId: string): Promise<void>;
}

export class MarketplaceBrowserRecovery {
  private readonly store: BrowserRecoveryStore;
  private readonly provider: BrowserStopProvider;

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
        await this.provider.stop(session.profileId);
        await this.store.markStopped(session.id);
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
    const rows = await this.read(await this.request(url, { headers: this.headers() }));
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

  async markStopped(sessionId: string): Promise<void> {
    await this.patch(
      sessionId,
      { state: 'closed', provider_stopped_at: new Date().toISOString() },
      'stopping',
    );
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

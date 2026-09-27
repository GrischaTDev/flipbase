import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import { assertGoLoginApiAvailable, GoLoginApiLimitError } from './gologin-api-limit.ts';
import { GoLoginProfileNetwork } from './gologin-profile-network.ts';

interface GoLoginProfileProvisionerOptions {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  goLoginToken: string;
  fetch?: typeof fetch;
}

const profileIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Erstellt je freigegebener Flipbase-Verbindung höchstens ein dauerhaftes Cloudprofil. */
export class GoLoginProfileProvisioner {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey: string;
  private readonly goLoginToken: string;
  private readonly request: typeof fetch;
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly network: GoLoginProfileNetwork;

  constructor(options: GoLoginProfileProvisionerOptions) {
    this.baseUrl = options.supabaseUrl.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.serviceRoleKey = options.serviceRoleKey;
    this.goLoginToken = options.goLoginToken;
    this.request = options.fetch ?? fetch;
    this.network = new GoLoginProfileNetwork(this.goLoginToken, this.request);
  }

  async prepare(scope: BrowserSessionScope): Promise<void> {
    // Jede Anfrage wird selbst autorisiert, auch wenn dieselbe Verbindung gerade
    // durch einen anderen Aufruf vorbereitet wird.
    await this.assertConnection(scope);
    const key = `${scope.workspaceId}:${scope.connectionId}`;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const operation = this.prepareNew(scope).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation);
    return operation;
  }

  private async assertConnection(scope: BrowserSessionScope): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/rest/v1/rpc/marketplace_list_connections`,
      {
        method: 'POST',
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${scope.userAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_workspace_id: scope.workspaceId }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error('Kontozugriff verweigert');
    const result: unknown = await response.json();
    if (!isRecord(result) || !Array.isArray(result['connections']))
      throw new Error('Kontozugriff verweigert');
    const account = result['connections'].find(
      (item: unknown) =>
        isRecord(item) &&
        item['workspaceId'] === scope.workspaceId &&
        item['connectionId'] === scope.connectionId &&
        item['marketplace'] === 'vinted',
    );
    if (!isRecord(account) || account['status'] === 'paused' || account['status'] === 'blocked')
      throw new Error('Kontozugriff verweigert');
  }

  private async prepareNew(scope: BrowserSessionScope): Promise<void> {
    const savedProfile = await this.savedProfile(scope);
    if (savedProfile) {
      await this.network.assertConfigured(savedProfile);
      return;
    }
    const response = await this.request('https://api.gologin.com/browser/quick', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.goLoginToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: `Flipbase Vinted ${scope.connectionId}`, os: 'lin' }),
      signal: AbortSignal.timeout(20_000),
    });
    await assertGoLoginApiAvailable(response);
    if (response.status !== 201) throw new Error('Browserprofil konnte nicht erstellt werden');
    const created: unknown = await response.json();
    if (
      !isRecord(created) ||
      typeof created['id'] !== 'string' ||
      !profileIdPattern.test(created['id'])
    )
      throw new Error('Browserprofil konnte nicht bestätigt werden');
    const profileId = created['id'];
    try {
      // Wird die Berechtigung während des Anbieteraufrufs entzogen, darf keine
      // neue Zuordnung entstehen.
      await this.assertConnection(scope);
      await this.network.configureNew(profileId);
      await this.assertConnection(scope);
      const saved = await this.request(`${this.baseUrl}/rest/v1/marketplace_browser_profiles`, {
        method: 'POST',
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          workspace_id: scope.workspaceId,
          connection_id: scope.connectionId,
          provider_profile_id: profileId,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!saved.ok) throw new Error('Browserprofil konnte nicht zugeordnet werden');
    } catch (error) {
      // Ein verlorenes Datenbank-ACK kann bereits einen Eintrag geschrieben
      // haben. Vor dem Löschen muss deshalb die gespeicherte Zuordnung geprüft
      // werden; bei Datenbankausfall bleibt das Profil zur manuellen Klärung.
      let stored: string | null;
      try {
        stored = await this.savedProfile(scope);
      } catch {
        // Bei unklarer Datenbanklage darf ein eventuell schon verknüpftes
        // Profil keinesfalls beim Anbieter gelöscht werden.
        throw new Error('Browserprofil muss geprüft werden');
      }
      if (stored === profileId) return;
      await this.deleteProfile(profileId).catch(() => undefined);
      if (error instanceof GoLoginApiLimitError) throw error;
      // Unbekannte Anbieterfehler können Token enthalten und bleiben privat.
      // eslint-disable-next-line preserve-caught-error
      throw new Error('Browserprofil konnte nicht zugeordnet werden');
    }
  }

  private async savedProfile(scope: BrowserSessionScope): Promise<string | null> {
    const url = new URL(`${this.baseUrl}/rest/v1/marketplace_browser_profiles`);
    url.searchParams.set('select', 'provider_profile_id');
    url.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    const response = await this.request(url, {
      headers: { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('Browserprofil konnte nicht geprüft werden');
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('Ungültige Profilzuordnung');
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!isRecord(row) || typeof row['provider_profile_id'] !== 'string')
      throw new Error('Ungültige Profilzuordnung');
    return row['provider_profile_id'];
  }

  private async deleteProfile(profileId: string): Promise<void> {
    const response = await this.request('https://api.gologin.com/browser', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.goLoginToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profilesToDelete: [profileId] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 204) throw new Error('Browserprofil konnte nicht bereinigt werden');
  }
}

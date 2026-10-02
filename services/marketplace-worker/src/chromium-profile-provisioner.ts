import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import {
  ChromiumAccountProfileRegistry,
  chromiumAccountProfileIdPattern,
} from './chromium-account-profile-registry.ts';

interface ProvisionerOptions {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  registry: ChromiumAccountProfileRegistry;
  stopProfile?: (profileId: string) => Promise<void>;
  fetch?: typeof fetch;
  legacy?: {
    prepare(scope: BrowserSessionScope): Promise<void>;
    remove?(scope: BrowserSessionScope, stopSessions: () => Promise<void>): Promise<void>;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Neue Konten erhalten Chromium; bestehende Anbieterprofile werden ausschließlich explizit migriert. */
export class ChromiumProfileProvisioner {
  private readonly options: ProvisionerOptions;
  private readonly request: typeof fetch;
  private readonly pending = new Map<string, Promise<void>>();

  constructor(options: ProvisionerOptions) {
    if (!options.publishableKey || !options.serviceRoleKey) throw new Error('Browser-Zugang fehlt');
    this.options = options;
    this.request = options.fetch ?? fetch;
  }

  async prepare(scope: BrowserSessionScope): Promise<void> {
    await this.authorize(scope);
    const key = `${scope.workspaceId}:${scope.connectionId}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.prepareAccount(scope).finally(() => this.pending.delete(key));
    this.pending.set(key, operation);
    return operation;
  }

  async remove(scope: BrowserSessionScope, stopSessions: () => Promise<void>): Promise<void> {
    const status = await this.authorize(scope, true);
    const profileId = await this.mapping(scope);
    if (profileId && !this.chromium(profileId)) {
      if (!this.options.legacy?.remove) throw new Error('Bestehender Browseranbieter fehlt');
      return this.options.legacy.remove(scope, stopSessions);
    }
    if (status !== 'blocked')
      await this.userRpc(scope, 'marketplace_set_paused', {
        p_workspace_id: scope.workspaceId,
        p_connection_id: scope.connectionId,
        p_paused: true,
      });
    await stopSessions();
    await this.authorize(scope, true);
    const sessions = await this.rows('marketplace_browser_sessions', {
      select: 'id',
      workspace_id: `eq.${scope.workspaceId}`,
      connection_id: `eq.${scope.connectionId}`,
      state: 'in.(active,stopping)',
    });
    if (sessions.length) throw new Error('Browsersitzung wird noch beendet');
    if ((await this.mapping(scope)) !== profileId)
      throw new Error('Browserprofilzuordnung wurde geändert');
    if (profileId) {
      await this.assertBinding(scope, profileId);
      if (!this.options.stopProfile) throw new Error('Privater Browserstopp fehlt');
      await this.options.stopProfile(profileId);
      const remaining = await this.rows('marketplace_browser_sessions', {
        select: 'id',
        workspace_id: `eq.${scope.workspaceId}`,
        connection_id: `eq.${scope.connectionId}`,
        state: 'in.(active,stopping)',
      });
      if (remaining.length) throw new Error('Browsersitzung wird noch beendet');
    }
    await this.authorize(scope, true);
    const deleted = await this.rows(
      'marketplace_connections',
      { workspace_id: `eq.${scope.workspaceId}`, id: `eq.${scope.connectionId}`, select: 'id' },
      'DELETE',
    );
    if (deleted.length !== 1 || !record(deleted[0]) || deleted[0]['id'] !== scope.connectionId)
      throw new Error('Verbindungslöschung konnte nicht bestätigt werden');
    // Profil und eventueller GoLogin-Rückweg bleiben privat archiviert. Keine rekursive Löschung.
    if (profileId) await this.options.registry.archive(profileId);
  }

  private async prepareAccount(scope: BrowserSessionScope): Promise<void> {
    const existing = await this.mapping(scope);
    if (existing) {
      if (this.chromium(existing)) await this.assertBinding(scope, existing);
      else {
        if (!this.options.legacy) throw new Error('Bestehender Browseranbieter fehlt');
        await this.options.legacy.prepare(scope);
      }
      return;
    }
    const remembered = await this.options.registry.find(scope.workspaceId, scope.connectionId);
    if (remembered?.previousGoLoginProfileId)
      throw new Error('Ausstehende Browsermigration muss geprüft werden');
    const profile =
      remembered ??
      (await this.options.registry.create({
        workspaceId: scope.workspaceId,
        connectionId: scope.connectionId,
      }));
    await this.authorize(scope);
    try {
      const response = await this.request(
        new URL('/rest/v1/marketplace_browser_profiles', this.options.supabaseUrl),
        {
          method: 'POST',
          headers: {
            ...this.serverHeaders(),
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            workspace_id: scope.workspaceId,
            connection_id: scope.connectionId,
            provider_profile_id: profile.profileId,
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error('Browserprofil konnte nicht zugeordnet werden');
    } catch {
      // Bei verlorenem Datenbank-ACK darf das möglicherweise zugeordnete Profil nicht entfernt werden.
      if ((await this.mapping(scope)) === profile.profileId) return;
      throw new Error('Browserprofilzuordnung muss geprüft werden');
    }
    if ((await this.mapping(scope)) !== profile.profileId)
      throw new Error('Browserprofilzuordnung konnte nicht bestätigt werden');
  }

  private chromium(profileId: string): boolean {
    if (!profileId.toLowerCase().startsWith('chromium_')) return false;
    if (!chromiumAccountProfileIdPattern.test(profileId))
      throw new Error('Ungültige Chromiumprofilreferenz');
    return true;
  }

  private async assertBinding(scope: BrowserSessionScope, profileId: string): Promise<void> {
    const profile = await this.options.registry.resolve(profileId);
    if (profile.workspaceId !== scope.workspaceId || profile.connectionId !== scope.connectionId)
      throw new Error('Browserprofil gehört zu einer anderen Verbindung');
  }

  private async authorize(scope: BrowserSessionScope, allowPaused = false): Promise<string> {
    const result = await this.userRpc(scope, 'marketplace_list_connections', {
      p_workspace_id: scope.workspaceId,
    });
    if (!record(result) || !Array.isArray(result['connections']))
      throw new Error('Kontozugriff verweigert');
    const connection = result['connections'].find(
      (candidate: unknown) =>
        record(candidate) &&
        candidate['workspaceId'] === scope.workspaceId &&
        candidate['connectionId'] === scope.connectionId &&
        candidate['marketplace'] === 'vinted',
    );
    if (
      !record(connection) ||
      typeof connection['status'] !== 'string' ||
      (!allowPaused && ['paused', 'blocked'].includes(connection['status']))
    )
      throw new Error('Kontozugriff verweigert');
    return connection['status'];
  }

  private async userRpc(
    scope: BrowserSessionScope,
    name: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.request(new URL(`/rest/v1/rpc/${name}`, this.options.supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: this.options.publishableKey,
        Authorization: `Bearer ${scope.userAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Kontozugriff verweigert');
    return response.json();
  }

  private async mapping(scope: BrowserSessionScope): Promise<string | null> {
    const profiles = await this.rows('marketplace_browser_profiles', {
      select: 'provider_profile_id',
      workspace_id: `eq.${scope.workspaceId}`,
      connection_id: `eq.${scope.connectionId}`,
    });
    if (!profiles.length) return null;
    const profile = profiles[0];
    if (
      profiles.length !== 1 ||
      !record(profile) ||
      typeof profile['provider_profile_id'] !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(profile['provider_profile_id'])
    )
      throw new Error('Ungültige Profilzuordnung');
    return profile['provider_profile_id'];
  }

  private async rows(
    table: string,
    filters: Record<string, string>,
    method = 'GET',
  ): Promise<unknown[]> {
    const url = new URL(`/rest/v1/${table}`, this.options.supabaseUrl);
    for (const [name, filter] of Object.entries(filters)) url.searchParams.set(name, filter);
    const response = await this.request(url, {
      method,
      headers: { ...this.serverHeaders(), Prefer: 'return=representation' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Browserdatenbank konnte nicht geprüft werden');
    const result: unknown = await response.json();
    if (!Array.isArray(result)) throw new Error('Ungültige Browserdatenbankantwort');
    return result;
  }

  private serverHeaders(): Record<string, string> {
    return {
      apikey: this.options.serviceRoleKey,
      Authorization: `Bearer ${this.options.serviceRoleKey}`,
    };
  }
}

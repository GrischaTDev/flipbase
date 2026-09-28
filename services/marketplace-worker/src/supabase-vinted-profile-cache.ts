import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

interface ProfileCacheOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

export class SupabaseVintedProfileCache {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: ProfileCacheOptions) {
    this.baseUrl = options.url.replace(/\/$/, '');
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async save(scope: BrowserSessionScope, accountId: string, about: string): Promise<boolean> {
    if (about.length > 2000) return false;
    const response = await this.request(
      new URL('/rest/v1/rpc/marketplace_cache_profile_about', this.baseUrl),
      {
        method: 'POST',
        headers: {
          apikey: this.serviceRoleKey,
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_account_id: accountId,
          p_about: about,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error('Profilcache nicht verfügbar');
    return (await response.json()) === true;
  }
}

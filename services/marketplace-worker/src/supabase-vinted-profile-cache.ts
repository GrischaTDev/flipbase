import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedProfileDetails } from '../../../supabase/functions/_shared/marketplace-profile-contracts.d.ts';
import { parseVintedProfileDetails } from './vinted-profile-contracts.ts';

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

  async saveDetails(
    scope: BrowserSessionScope,
    accountId: string,
    input: VintedProfileDetails,
  ): Promise<boolean> {
    const profile = parseVintedProfileDetails(input);
    if (!/^[1-9][0-9]{0,31}$/.test(accountId)) return false;
    const url = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    for (const [name, identifier] of [
      ['workspace_id', scope.workspaceId],
      ['connection_id', scope.connectionId],
      ['external_id', accountId],
      ['kind', 'profile'],
    ] as const)
      url.searchParams.set(name, `eq.${identifier}`);
    url.searchParams.set('select', 'body,observed_at');
    const headers = {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json',
    };
    // Compare-and-swap erhält zeitgleiche Importdaten und fremde JSON-Felder ohne Schemaänderung.
    for (let attempt = 0; attempt < 3; attempt++) {
      const read = await this.request(url, { headers, signal: AbortSignal.timeout(10000) });
      if (!read.ok) throw new Error('Profilcache nicht verfügbar');
      const rows: unknown = await read.json();
      if (!Array.isArray(rows) || rows.length !== 1) return false;
      const row: unknown = rows[0];
      if (
        !row ||
        typeof row !== 'object' ||
        !('observed_at' in row) ||
        typeof row.observed_at !== 'string' ||
        !('body' in row) ||
        !row.body ||
        typeof row.body !== 'object' ||
        Array.isArray(row.body)
      )
        return false;
      const target = new URL(url);
      target.searchParams.set('observed_at', `eq.${row.observed_at}`);
      const write = await this.request(target, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          body: {
            ...row.body,
            bio: profile.about,
            bioState: 'loaded',
            location: profile.showCity ? profile.city : null,
            imageUrl: profile.imageUrl,
          },
          observed_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!write.ok) throw new Error('Profilcache nicht verfügbar');
      const saved: unknown = await write.json();
      if (Array.isArray(saved) && saved.length === 1) return true;
    }
    return false;
  }
}

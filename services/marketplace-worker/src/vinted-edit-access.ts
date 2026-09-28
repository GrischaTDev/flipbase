import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

interface EditAccessOptions {
  url: string;
  publishableKey: string;
  fetch?: typeof fetch;
}

interface ScopedEntry {
  externalId: string;
  accountId: string;
}

const itemIdPattern = /^[1-9][0-9]{0,31}$/;

/** Reads through the caller's RLS policy; no service-role lookup can bypass workspace access. */
export class VintedEditAccess {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly request: typeof fetch;

  constructor(options: EditAccessOptions) {
    this.baseUrl = options.url.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.request = options.fetch ?? fetch;
  }

  async entry(
    scope: BrowserSessionScope,
    kind: 'profile' | 'publication',
    entryId?: string,
  ): Promise<ScopedEntry> {
    const connectionUrl = new URL('/rest/v1/marketplace_connections', this.baseUrl);
    connectionUrl.searchParams.set('select', 'external_account_id,status');
    connectionUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    connectionUrl.searchParams.set('id', `eq.${scope.connectionId}`);
    connectionUrl.searchParams.set('marketplace', 'eq.vinted');
    const connections = await this.rows(connectionUrl, scope);
    const connection = connections.length === 1 ? connections[0] : null;
    const accountId = connection?.['external_account_id'];
    if (
      connection?.['status'] !== 'connected' ||
      typeof accountId !== 'string' ||
      !itemIdPattern.test(accountId)
    )
      throw new Error('Kontoverbindung nicht bestätigt');

    const entryUrl = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    entryUrl.searchParams.set('select', 'external_id');
    entryUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    entryUrl.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    entryUrl.searchParams.set('kind', `eq.${kind}`);
    if (entryId) entryUrl.searchParams.set('id', `eq.${entryId}`);
    else entryUrl.searchParams.set('external_id', `eq.${accountId}`);
    const entries = await this.rows(entryUrl, scope);
    const externalId = entries.length === 1 ? entries[0]?.['external_id'] : null;
    if (
      typeof externalId !== 'string' ||
      !itemIdPattern.test(externalId) ||
      (kind === 'profile' && externalId !== accountId)
    )
      throw new Error('Kontoeintrag nicht verfügbar');
    return { externalId, accountId };
  }

  private async rows(url: URL, scope: BrowserSessionScope): Promise<Record<string, unknown>[]> {
    const response = await this.request(url, {
      headers: { apikey: this.publishableKey, Authorization: `Bearer ${scope.userAccessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Kontozugriff nicht bestätigt');
    const value: unknown = await response.json();
    if (
      !Array.isArray(value) ||
      value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    )
      throw new Error('Ungültige Kontodaten');
    return value as Record<string, unknown>[];
  }
}

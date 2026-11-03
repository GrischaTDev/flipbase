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
const entryIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export class VintedRelistingEntryLockedError extends Error {
  constructor() {
    super('Dieses Inserat wird gerade relistet.');
    this.name = 'VintedRelistingEntryLockedError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

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
    kind: 'profile' | 'publication' | 'conversation',
    entryId?: string,
    mode: 'read' | 'write' = 'read',
  ): Promise<ScopedEntry> {
    const connectionUrl = new URL('/rest/v1/marketplace_connections', this.baseUrl);
    connectionUrl.searchParams.set('select', 'external_account_id,status,execution_mode');
    connectionUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    connectionUrl.searchParams.set('id', `eq.${scope.connectionId}`);
    connectionUrl.searchParams.set('marketplace', 'eq.vinted');
    const connections = await this.rows(connectionUrl, scope);
    const connection = connections.length === 1 ? connections[0] : null;
    const accountId = connection?.['external_account_id'];
    if (
      connection?.['status'] !== 'connected' ||
      connection?.['execution_mode'] !== 'cloud' ||
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
    if (kind === 'publication' && mode === 'write')
      await this.assertWritable(scope, entryId, externalId);
    return { externalId, accountId };
  }

  private async assertWritable(
    scope: BrowserSessionScope,
    entryId: string | undefined,
    externalId: string,
  ): Promise<void> {
    if (!entryId || !entryIdPattern.test(entryId)) throw new Error('Kontoeintrag nicht verfügbar');
    const response = await this.request(
      new URL('/rest/v1/rpc/marketplace_read_relisting_plans', this.baseUrl),
      {
        method: 'POST',
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${scope.userAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error('Kontozugriff nicht bestätigt');
    const value: unknown = await response.json();
    if (!isRecord(value) || !Array.isArray(value['items']))
      throw new Error('Ungültige Relisting-Aufträge');
    for (const item of value['items']) {
      const job = isRecord(item) ? item['job'] : null;
      if (
        !isRecord(job) ||
        job['workspaceId'] !== scope.workspaceId ||
        job['connectionId'] !== scope.connectionId ||
        typeof job['relistExternalId'] !== 'string' ||
        !itemIdPattern.test(job['relistExternalId']) ||
        (job['relistEntryId'] != null &&
          (typeof job['relistEntryId'] !== 'string' ||
            !entryIdPattern.test(job['relistEntryId']))) ||
        (job['externalId'] != null &&
          (typeof job['externalId'] !== 'string' || !itemIdPattern.test(job['externalId'])))
      )
        throw new Error('Ungültige Relisting-Aufträge');
      if (
        job['relistEntryId'] === entryId ||
        job['relistExternalId'] === externalId ||
        job['externalId'] === externalId
      )
        throw new VintedRelistingEntryLockedError();
    }
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

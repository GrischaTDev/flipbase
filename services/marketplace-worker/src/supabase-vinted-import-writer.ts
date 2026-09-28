import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type {
  VintedAccountImport,
  VintedConversationVersion,
  VintedImportEntry,
} from './vinted-account-import.ts';

interface ImportWriterOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class SupabaseVintedImportWriter {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: ImportWriterOptions) {
    if (!options.publishableKey || !options.serviceRoleKey) throw new Error('Serverzugang fehlt');
    this.baseUrl = options.url.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async conversationVersions(
    scope: BrowserSessionScope,
    sessionId: string,
  ): Promise<VintedConversationVersion[]> {
    await this.assertActive(scope, sessionId);
    const url = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    url.searchParams.set('select', 'external_id,body');
    url.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    url.searchParams.set('kind', 'eq.conversation');
    url.searchParams.set('limit', '500');
    const value: unknown = await this.json(
      await this.request(url, {
        headers: this.serverHeaders(),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!Array.isArray(value)) throw new Error('Gesprächscache nicht verfügbar');
    return value.flatMap((raw): VintedConversationVersion[] => {
      const row = record(raw);
      const body = record(row?.['body']);
      if (
        typeof row?.['external_id'] !== 'string' ||
        !/^[1-9][0-9]{0,31}$/.test(row['external_id']) ||
        typeof body?.['sourceUpdatedAt'] !== 'string' ||
        typeof body['detailCheckedAt'] !== 'string'
      )
        return [];
      return [
        {
          externalId: row['external_id'],
          sourceUpdatedAt: body['sourceUpdatedAt'],
          detailCheckedAt: body['detailCheckedAt'],
          text: typeof body['text'] === 'string' ? body['text'] : null,
          occurredAt: typeof body['occurredAt'] === 'string' ? body['occurredAt'] : null,
        },
      ];
    });
  }

  async write(
    scope: BrowserSessionScope,
    sessionId: string,
    snapshot: VintedAccountImport,
  ): Promise<Record<'profile' | 'publication' | 'conversation' | 'message' | 'sale', number>> {
    await this.assertActive(scope, sessionId);
    const connectionUrl = new URL('/rest/v1/marketplace_connections', this.baseUrl);
    connectionUrl.searchParams.set('select', 'status,external_account_id');
    connectionUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    connectionUrl.searchParams.set('id', `eq.${scope.connectionId}`);
    connectionUrl.searchParams.set('marketplace', 'eq.vinted');
    const connectionResponse = await this.request(connectionUrl, {
      headers: this.serverHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    const connections: unknown = await this.json(connectionResponse);
    if (
      !Array.isArray(connections) ||
      connections.length !== 1 ||
      record(connections[0])?.['status'] !== 'connected' ||
      record(connections[0])?.['external_account_id'] !== snapshot.identity.id
    )
      throw new Error('Kontozuordnung nicht bestätigt');

    const counts = { profile: 0, publication: 0, conversation: 0, message: 0, sale: 0 };
    const conversations = new Map<string, string>();
    for (const kind of ['profile', 'publication', 'conversation', 'sale'] as const) {
      const entries = snapshot.entries.filter((entry) => entry.kind === kind);
      for (let offset = 0; offset < entries.length; offset += 100) {
        await this.assertActive(scope, sessionId);
        const rows = await this.upsert(
          scope,
          snapshot.observedAt,
          entries.slice(offset, offset + 100),
        );
        if (kind === 'conversation') {
          for (const row of rows) {
            const value = record(row);
            if (typeof value?.['external_id'] === 'string' && typeof value['id'] === 'string')
              conversations.set(value['external_id'], value['id']);
          }
        }
      }
      counts[kind] = entries.length;
    }
    const messages = snapshot.entries.filter((entry) => entry.kind === 'message');
    for (let offset = 0; offset < messages.length; offset += 100) {
      await this.assertActive(scope, sessionId);
      await this.upsert(
        scope,
        snapshot.observedAt,
        messages.slice(offset, offset + 100),
        conversations,
      );
    }
    counts.message = messages.length;
    await this.assertActive(scope, sessionId);
    // Erst nach dem vollständigen Lesen und Speichern verschwundene Listenzeilen entfernen.
    // Verkäufe bleiben als historische Bestellungen erhalten.
    for (const kind of ['publication', 'conversation'] as const) {
      await this.removeMissing(scope, snapshot.observedAt, kind);
      await this.assertActive(scope, sessionId);
    }
    const confirmedSaleIds = new Set(
      snapshot.entries.filter((entry) => entry.kind === 'sale').map((entry) => entry.externalId),
    );
    const invalidatedSaleIds = (snapshot.rejectedSaleIds ?? []).filter(
      (id) => /^[1-9][0-9]{0,31}$/.test(id) && !confirmedSaleIds.has(id),
    );
    for (let offset = 0; offset < invalidatedSaleIds.length; offset += 100) {
      await this.assertActive(scope, sessionId);
      await this.removeInvalidatedSales(scope, invalidatedSaleIds.slice(offset, offset + 100));
    }
    const updateUrl = new URL('/rest/v1/marketplace_connections', this.baseUrl);
    updateUrl.searchParams.set('select', 'id');
    updateUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    updateUrl.searchParams.set('id', `eq.${scope.connectionId}`);
    updateUrl.searchParams.set('status', 'eq.connected');
    updateUrl.searchParams.set('external_account_id', `eq.${snapshot.identity.id}`);
    const updated: unknown = await this.json(
      await this.request(updateUrl, {
        method: 'PATCH',
        headers: {
          ...this.serverHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ last_synced_at: snapshot.observedAt }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!Array.isArray(updated) || updated.length !== 1)
      throw new Error('Datenabgleich konnte nicht bestätigt werden');
    return counts;
  }

  private async assertActive(scope: BrowserSessionScope, sessionId: string): Promise<void> {
    const value = await this.json(
      await this.request(new URL('/rest/v1/rpc/marketplace_browser_session_check', this.baseUrl), {
        method: 'POST',
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${scope.userAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_session_id: sessionId,
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
    const result = record(value);
    if (
      result?.['active'] !== true ||
      result['id'] !== sessionId ||
      result['workspaceId'] !== scope.workspaceId ||
      result['connectionId'] !== scope.connectionId
    )
      throw new Error('Kontozugriff abgelaufen');
  }

  private async upsert(
    scope: BrowserSessionScope,
    observedAt: string,
    entries: VintedImportEntry[],
    conversations?: Map<string, string>,
  ): Promise<unknown[]> {
    const rows = entries.map((entry) => {
      const parentId = entry.parentExternalId
        ? conversations?.get(entry.parentExternalId)
        : undefined;
      if (entry.parentExternalId && !parentId) throw new Error('Gesprächszuordnung fehlt');
      return {
        workspace_id: scope.workspaceId,
        connection_id: scope.connectionId,
        kind: entry.kind,
        external_id: entry.externalId,
        parent_id: parentId ?? null,
        body: entry.body,
        sort_at: entry.sortAt,
        observed_at: observedAt,
      };
    });
    const url = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    url.searchParams.set('on_conflict', 'workspace_id,connection_id,kind,external_id');
    url.searchParams.set('select', 'id,external_id');
    const result: unknown = await this.json(
      await this.request(url, {
        method: 'POST',
        headers: {
          ...this.serverHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
        signal: AbortSignal.timeout(20_000),
      }),
    );
    if (!Array.isArray(result) || result.length !== rows.length)
      throw new Error('Vinted-Daten konnten nicht gespeichert werden');
    return result;
  }

  private serverHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  private async removeMissing(
    scope: BrowserSessionScope,
    observedAt: string,
    kind: 'publication' | 'conversation',
  ): Promise<void> {
    const url = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    url.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    url.searchParams.set('kind', `eq.${kind}`);
    url.searchParams.set('observed_at', `lt.${observedAt}`);
    const response = await this.request(url, {
      method: 'DELETE',
      headers: this.serverHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('Vinted-Daten konnten nicht abgeglichen werden');
  }

  private async removeInvalidatedSales(scope: BrowserSessionScope, ids: string[]): Promise<void> {
    const url = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    url.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    url.searchParams.set('kind', 'eq.sale');
    url.searchParams.set('external_id', `in.(${ids.join(',')})`);
    const response = await this.request(url, {
      method: 'DELETE',
      headers: this.serverHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error('Verkaufsabgleich fehlgeschlagen');
  }

  private async json(response: Response): Promise<unknown> {
    if (!response.ok) throw new Error('Vinted-Datenbank nicht verfügbar');
    try {
      return await response.json();
    } catch {
      throw new Error('Ungültige Vinted-Datenbankantwort');
    }
  }
}

import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedAccountImport, VintedConversationVersion } from './vinted-account-import.ts';

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

  async favoriteSettingsActive(scope: BrowserSessionScope, sessionId: string): Promise<boolean> {
    await this.assertActive(scope, sessionId);
    const result: unknown = await this.json(
      await this.request(
        new URL('/rest/v1/rpc/marketplace_cloud_favorite_settings_valid', this.baseUrl),
        {
          method: 'POST',
          headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_workspace_id: scope.workspaceId,
            p_connection_id: scope.connectionId,
          }),
          signal: AbortSignal.timeout(10000),
        },
      ),
    );
    if (typeof result !== 'boolean')
      throw new Error('Favoritenfreigabe konnte nicht geprüft werden');
    return result;
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
          itemId: typeof body['itemId'] === 'string' ? body['itemId'] : null,
          itemTitle: typeof body['itemTitle'] === 'string' ? body['itemTitle'] : null,
          itemImageUrl: typeof body['itemImageUrl'] === 'string' ? body['itemImageUrl'] : null,
          itemPrice: typeof body['itemPrice'] === 'number' ? body['itemPrice'] : null,
          itemCurrency: typeof body['itemCurrency'] === 'string' ? body['itemCurrency'] : null,
          transactionStatus:
            typeof body['transactionStatus'] === 'string' ? body['transactionStatus'] : null,
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
    // Zugriff, Identität, Einträge und Abrufstände werden in derselben Transaktion geprüft.
    const result = record(
      await this.json(
        await this.request(
          new URL(
            `/rest/v1/rpc/${scope.syncRead ? 'marketplace_apply_vinted_sync_import' : 'marketplace_apply_vinted_import'}`,
            this.baseUrl,
          ),
          {
            method: 'POST',
            headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(
              scope.syncRead
                ? {
                    p_operation_id: scope.syncRead.operationId,
                    p_runner_id: scope.syncRead.runnerId,
                    p_worker_epoch: scope.syncRead.workerEpoch,
                    p_session_id: sessionId,
                    p_snapshot: snapshot,
                  }
                : {
                    p_workspace_id: scope.workspaceId,
                    p_connection_id: scope.connectionId,
                    p_session_id: sessionId,
                    p_user_id: scope.userId,
                    p_snapshot: snapshot,
                  },
            ),
            signal: AbortSignal.timeout(30_000),
          },
        ),
      ),
    );
    const counts = { profile: 0, publication: 0, conversation: 0, message: 0, sale: 0 };
    for (const kind of Object.keys(counts) as (keyof typeof counts)[]) {
      const value = result?.[kind];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new Error('Vinted-Daten konnten nicht bestätigt werden');
      counts[kind] = value;
    }
    return counts;
  }
  private async assertActive(scope: BrowserSessionScope, sessionId: string): Promise<void> {
    if (scope.messageWrite || scope.favoriteWrite || scope.negotiationWrite || scope.listingWrite)
      throw new Error('Kontozugriff abgelaufen');
    if (scope.syncRead) {
      if (sessionId !== scope.syncRead.sessionId) throw new Error('Kontozugriff abgelaufen');
      const value = record(
        await this.json(
          await this.request(new URL('/rest/v1/rpc/marketplace_sync_check', this.baseUrl), {
            method: 'POST',
            headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              p_operation_id: scope.syncRead.operationId,
              p_runner_id: scope.syncRead.runnerId,
              p_worker_epoch: scope.syncRead.workerEpoch,
            }),
            signal: AbortSignal.timeout(10_000),
          }),
        ),
      );
      if (value?.['active'] !== true || value['sessionId'] !== sessionId)
        throw new Error('Kontozugriff abgelaufen');
      return;
    }
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

  private serverHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
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

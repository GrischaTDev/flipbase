import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedImportAreas } from './vinted-account-import.ts';

export type MarketplaceSyncStage =
  'browser' | 'profile' | 'publications' | 'conversations' | 'sales' | 'persist' | 'cleanup';
export type MarketplaceSyncState = 'queued' | 'running' | 'succeeded' | 'failed';
export type MarketplaceSyncError =
  | 'browser'
  | 'identity'
  | 'profile'
  | 'publications'
  | 'conversations'
  | 'sales'
  | 'messages'
  | 'transaction'
  | 'parse'
  | 'persist'
  | 'cleanup'
  | 'access'
  | 'interrupted';

export interface MarketplaceSyncOperation {
  id: string;
  state: MarketplaceSyncState;
  stage: MarketplaceSyncStage | null;
  errorCode: MarketplaceSyncError | null;
  observedAt: string | null;
  counts: Record<string, number> | null;
  sourceResults?: VintedImportAreas;
}

interface OperationStoreOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class SupabaseMarketplaceOperationStore {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: OperationStoreOptions) {
    this.baseUrl = options.url.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async enqueue(scope: BrowserSessionScope): Promise<{ id: string; requestedBy: string }> {
    const response = await this.request(
      new URL('/rest/v1/rpc/marketplace_sync_enqueue', this.baseUrl),
      {
        method: 'POST',
        headers: this.userHeaders(scope),
        body: JSON.stringify({
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const value = record(await this.json(response));
    if (
      !value ||
      typeof value['id'] !== 'string' ||
      !uuidPattern.test(value['id']) ||
      typeof value['requestedBy'] !== 'string' ||
      !uuidPattern.test(value['requestedBy'])
    )
      throw new Error('Auftrag konnte nicht angelegt werden');
    return { id: value['id'], requestedBy: value['requestedBy'] };
  }

  async read(scope: BrowserSessionScope, id: string): Promise<MarketplaceSyncOperation | null> {
    if (!uuidPattern.test(id)) return null;
    const url = this.operationUrl(scope, id);
    url.searchParams.set('select', 'id,state,stage,error_code,observed_at,counts,source_results');
    const result = await this.json(
      await this.request(url, {
        headers: { apikey: this.publishableKey, Authorization: `Bearer ${scope.userAccessToken}` },
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (!Array.isArray(result) || result.length !== 1) return null;
    const value = record(result[0]);
    if (
      !value ||
      value['id'] !== id ||
      !['queued', 'running', 'succeeded', 'failed'].includes(String(value['state']))
    )
      return null;
    return {
      id,
      state: value['state'] as MarketplaceSyncState,
      stage: typeof value['stage'] === 'string' ? (value['stage'] as MarketplaceSyncStage) : null,
      errorCode:
        typeof value['error_code'] === 'string'
          ? (value['error_code'] as MarketplaceSyncError)
          : null,
      observedAt: typeof value['observed_at'] === 'string' ? value['observed_at'] : null,
      counts: record(value['counts']) as Record<string, number> | null,
      ...(record(value['source_results'])
        ? { sourceResults: value['source_results'] as VintedImportAreas }
        : {}),
    };
  }

  async claim(scope: BrowserSessionScope, id: string, runnerId: string): Promise<boolean> {
    const url = this.operationUrl(scope, id);
    url.searchParams.set('state', 'eq.queued');
    url.searchParams.set('requested_by', `eq.${scope.userId}`);
    return this.patch(url, {
      state: 'running',
      stage: 'browser',
      runner_id: runnerId,
      started_at: new Date().toISOString(),
    });
  }

  async stage(
    scope: BrowserSessionScope,
    id: string,
    runnerId: string,
    stage: MarketplaceSyncStage,
  ): Promise<void> {
    if (!(await this.patch(this.runningUrl(scope, id, runnerId), { stage })))
      throw new Error('Auftrag nicht mehr aktiv');
  }

  async succeed(
    scope: BrowserSessionScope,
    id: string,
    runnerId: string,
    observedAt: string,
    counts: Record<string, number>,
    cleanupPending = false,
    sourceResults?: VintedImportAreas,
  ): Promise<void> {
    if (
      !(await this.patch(this.runningUrl(scope, id, runnerId), {
        state: 'succeeded',
        stage: 'cleanup',
        observed_at: observedAt,
        counts,
        source_results: sourceResults ?? null,
        error_code: cleanupPending ? 'cleanup' : null,
        finished_at: new Date().toISOString(),
      }))
    )
      throw new Error('Auftrag nicht mehr aktiv');
  }

  async fail(
    scope: BrowserSessionScope,
    id: string,
    runnerId: string,
    errorCode: MarketplaceSyncError,
  ): Promise<void> {
    if (
      !(await this.patch(this.runningUrl(scope, id, runnerId), {
        state: 'failed',
        error_code: errorCode,
        finished_at: new Date().toISOString(),
      }))
    )
      throw new Error('Auftrag nicht mehr aktiv');
  }

  async recoverUnfinished(): Promise<void> {
    const url = new URL('/rest/v1/marketplace_operations', this.baseUrl);
    url.searchParams.set('state', 'in.(queued,running)');
    const response = await this.request(url, {
      method: 'PATCH',
      headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'failed',
        error_code: 'interrupted',
        finished_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Auftragswiederherstellung fehlgeschlagen');
  }

  private operationUrl(scope: BrowserSessionScope, id: string): URL {
    const url = new URL('/rest/v1/marketplace_operations', this.baseUrl);
    url.searchParams.set('id', `eq.${id}`);
    url.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    url.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    return url;
  }

  private runningUrl(scope: BrowserSessionScope, id: string, runnerId: string): URL {
    const url = this.operationUrl(scope, id);
    url.searchParams.set('state', 'eq.running');
    url.searchParams.set('runner_id', `eq.${runnerId}`);
    return url;
  }

  private async patch(url: URL, value: Record<string, unknown>): Promise<boolean> {
    const response = await this.request(url, {
      method: 'PATCH',
      headers: {
        ...this.serverHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await this.json(response);
    if (!Array.isArray(result)) throw new Error('Auftragsstatus nicht verfügbar');
    return result.length === 1;
  }

  private userHeaders(scope: BrowserSessionScope): Record<string, string> {
    return {
      apikey: this.publishableKey,
      Authorization: `Bearer ${scope.userAccessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private serverHeaders(): Record<string, string> {
    return { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` };
  }

  private async json(response: Response): Promise<unknown> {
    if (!response.ok) throw new Error('Auftragsstatus nicht verfügbar');
    try {
      return await response.json();
    } catch {
      throw new Error('Auftragsantwort ungültig');
    }
  }
}

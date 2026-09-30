import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedImportAreas, VintedRequestFailure } from './vinted-account-import.ts';

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
    if (scope.syncRead) {
      const result = record(await this.readRpc(scope, id, runnerId, 'marketplace_sync_check'));
      return result?.['active'] === true && result['sessionId'] === scope.syncRead.sessionId;
    }
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
    if (scope.syncRead) {
      if (
        (await this.readRpc(scope, id, runnerId, 'marketplace_sync_progress', {
          p_stage: stage,
        })) !== true
      )
        throw new Error('Auftrag nicht mehr aktiv');
      return;
    }
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
    if (scope.syncRead) {
      const failures = sourceResults
        ? Object.values(sourceResults)
            .map((area) => area.failure)
            .filter((value): value is VintedRequestFailure => Boolean(value))
        : [];
      const failure = [
        'unauthorized',
        'forbidden',
        'rate_limited',
        'provider_unavailable',
        'network',
        'timeout',
        'browser_context',
        'invalid_response',
      ].find((value) => failures.includes(value as VintedRequestFailure)) as
        VintedRequestFailure | undefined;
      const retryAfter = latestRetryAfter(
        sourceResults
          ? Object.values(sourceResults)
              .filter((area) => area.failure === 'rate_limited')
              .map((area) => area.retryAfter)
          : [],
      );
      if (
        (await this.readRpc(scope, id, runnerId, 'marketplace_sync_finish', {
          p_outcome: {
            state: 'succeeded',
            errorCode: cleanupPending ? 'cleanup' : null,
            observedAt,
            counts,
            sourceResults: sourceResults ?? null,
            pausedReason: cleanupPending ? 'cleanup' : pauseReason(failure),
            retryAfter,
          },
        })) !== true
      )
        throw new Error('Auftrag nicht mehr aktiv');
      return;
    }
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
    requestFailure?: VintedRequestFailure,
    retryAfter?: string,
  ): Promise<void> {
    if (scope.syncRead) {
      const pausedReason =
        errorCode === 'cleanup'
          ? 'cleanup'
          : requestFailure
            ? pauseReason(requestFailure)
            : errorCode === 'access'
              ? 'access_revoked'
              : errorCode === 'identity'
                ? 'needs_login'
                : errorCode === 'interrupted'
                  ? 'interrupted'
                  : 'network';
      if (
        (await this.readRpc(scope, id, runnerId, 'marketplace_sync_finish', {
          p_outcome: {
            state: 'failed',
            errorCode,
            pausedReason,
            retryAfter: requestFailure === 'rate_limited' ? latestRetryAfter([retryAfter]) : null,
          },
        })) !== true
      )
        throw new Error('Auftrag nicht mehr aktiv');
      return;
    }
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

  private async readRpc(
    scope: BrowserSessionScope,
    id: string,
    runnerId: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> {
    const authorization = scope.syncRead;
    if (!authorization || authorization.operationId !== id || authorization.runnerId !== runnerId)
      throw new Error('Auftragszugriff verweigert');
    return this.json(
      await this.request(new URL(`/rest/v1/rpc/${name}`, this.baseUrl), {
        method: 'POST',
        headers: { ...this.serverHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_operation_id: id,
          p_runner_id: runnerId,
          p_worker_epoch: authorization.workerEpoch,
          ...extra,
        }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
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

function pauseReason(failure?: VintedRequestFailure): string | null {
  switch (failure) {
    case 'unauthorized':
      return 'needs_login';
    case 'forbidden':
      return 'forbidden';
    case 'rate_limited':
      return 'rate_limited';
    case 'provider_unavailable':
    case 'invalid_response':
      return 'server';
    case 'timeout':
    case 'network':
    case 'browser_context':
      return 'network';
    default:
      return null;
  }
}

function latestRetryAfter(values: (string | undefined)[]): string | null {
  const now = Date.now();
  const valid = values.filter(
    (value): value is string =>
      typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      Date.parse(value) > now &&
      Date.parse(value) <= now + 7 * 24 * 60 * 60 * 1000,
  );
  return valid.length
    ? new Date(Math.max(...valid.map((value) => Date.parse(value)))).toISOString()
    : null;
}

import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { MarketplaceSyncDispatchStore, RuntimeLease } from './marketplace-sync-dispatcher.ts';
interface StoreOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(): Error {
  return new Error('Vinted-Auftragsantwort ungültig');
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function version(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw invalid();
  return result;
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string') throw invalid();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value,
    );
  if (!match) throw invalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    !Number.isFinite(Date.parse(value))
  )
    throw invalid();
  return value;
}

export class SupabaseMarketplaceSyncDispatchStore implements MarketplaceSyncDispatchStore {
  private readonly options: StoreOptions;
  private readonly request: typeof fetch;
  private readonly now: () => number;

  constructor(options: StoreOptions) {
    if (!options.serviceRoleKey.trim()) throw new Error('Serverzugang fehlt');
    this.options = options;
    this.request = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async acquireWorker(workerId: string): Promise<RuntimeLease | null> {
    if (!identifier(workerId)) throw invalid();
    const value = await this.rpc('marketplace_worker_claim', { p_worker_id: workerId });
    if (value === null) return null;
    const result = fields(value, ['workerId', 'workerEpoch', 'expiresAt']);
    const expiresAt = timestamp(result['expiresAt']);
    if (
      result['workerId'] !== workerId ||
      !version(result['workerEpoch']) ||
      Date.parse(expiresAt) <= this.now()
    )
      throw invalid();
    return Object.freeze({ workerId, workerEpoch: result['workerEpoch'], expiresAt });
  }

  async heartbeatWorker(workerId: string, workerEpoch: number): Promise<boolean> {
    const result = fields(
      await this.rpc('marketplace_worker_heartbeat', this.binding(workerId, workerEpoch)),
      ['active', 'expiresAt'],
    );
    if (typeof result['active'] !== 'boolean') throw invalid();
    if (!result['active']) {
      if (result['expiresAt'] !== null) throw invalid();
      return false;
    }
    if (Date.parse(timestamp(result['expiresAt'])) <= this.now()) throw invalid();
    return true;
  }

  async releaseWorker(workerId: string, workerEpoch: number): Promise<boolean> {
    const value = await this.rpc('marketplace_worker_release', this.binding(workerId, workerEpoch));
    if (typeof value !== 'boolean') throw invalid();
    return value;
  }

  async recover(workerId: string, workerEpoch: number): Promise<{ interruptedOperations: number }> {
    const result = fields(
      await this.rpc('marketplace_sync_recover', this.binding(workerId, workerEpoch)),
      ['interruptedOperations'],
    );
    const count = result['interruptedOperations'];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw invalid();
    return { interruptedOperations: count };
  }

  async claim(
    workerId: string,
    workerEpoch: number,
    runnerId: string,
    includeScheduled = false,
  ): Promise<BrowserSessionScope | null> {
    if (!identifier(runnerId) || typeof includeScheduled !== 'boolean') throw invalid();
    const value = await this.rpc('marketplace_sync_dispatch_claim', {
      ...this.binding(workerId, workerEpoch),
      p_runner_id: runnerId,
      p_include_scheduled: includeScheduled,
    });
    if (value === null) return null;
    const result = fields(value, [
      'operationId',
      'workspaceId',
      'connectionId',
      'userId',
      'runnerId',
      'workerEpoch',
      'authorizationKind',
      'authorizationVersion',
      'scheduleAuthorizationVersion',
      'sessionId',
      'expiresAt',
      'absoluteExpiresAt',
    ]);
    const expiresAt = timestamp(result['expiresAt']);
    const absoluteExpiresAt = timestamp(result['absoluteExpiresAt']);
    if (
      !identifier(result['operationId']) ||
      !identifier(result['workspaceId']) ||
      !identifier(result['connectionId']) ||
      !identifier(result['userId']) ||
      !identifier(result['sessionId']) ||
      result['runnerId'] !== runnerId ||
      result['workerEpoch'] !== workerEpoch ||
      result['authorizationVersion'] !== 1 ||
      Date.parse(expiresAt) <= this.now() ||
      Date.parse(expiresAt) > Date.parse(absoluteExpiresAt)
    )
      throw invalid();
    if (result['authorizationKind'] === 'manual_read') {
      if (result['authorizationVersion'] !== 1 || result['scheduleAuthorizationVersion'] !== null)
        throw invalid();
    } else if (result['authorizationKind'] === 'scheduled_read') {
      if (!includeScheduled || !version(result['scheduleAuthorizationVersion'])) throw invalid();
    } else throw invalid();
    return Object.freeze({
      workspaceId: result['workspaceId'],
      connectionId: result['connectionId'],
      userId: result['userId'],
      userAccessToken: '',
      syncRead: Object.freeze({
        operationId: result['operationId'],
        runnerId,
        workerEpoch,
        sessionId: result['sessionId'],
        expiresAt,
        absoluteExpiresAt,
      }),
    });
  }

  private binding(
    workerId: string,
    workerEpoch: number,
  ): { p_worker_id: string; p_worker_epoch: number } {
    if (!identifier(workerId) || !version(workerEpoch)) throw invalid();
    return { p_worker_id: workerId, p_worker_epoch: workerEpoch };
  }

  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.request(new URL(`/rest/v1/rpc/${name}`, this.options.url), {
        method: 'POST',
        headers: {
          apikey: this.options.serviceRoleKey,
          Authorization: `Bearer ${this.options.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Datenbankantwort nicht verfügbar');
      return await response.json();
    } catch {
      // Anbieterantworten und Zugangsdaten dürfen auch nicht über Error.cause nach außen gelangen.
      throw new Error('Vinted-Auftragsdienst nicht verfügbar');
    }
  }
}

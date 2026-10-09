import type { CloudNegotiationClaim } from './marketplace-negotiation-runner.ts';
import type {
  MarketplaceNegotiationCommand,
  MarketplaceNegotiationResult,
} from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';
import {
  isVintedNegotiationCommand,
  isVintedNegotiationOffer,
  isConfirmedNegotiationOffer,
} from './vinted-negotiation-contracts.ts';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

interface MessageStoreOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}
function invalid(): Error {
  return new Error('Cloud-Versandantwort ungültig');
}
function fields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const result = input as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
    throw invalid();
  return result;
}
function uuid(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
  )
    throw invalid();
  return input;
}
function version(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 1) throw invalid();
  return input;
}
function timestamp(input: unknown): string {
  if (typeof input !== 'string') throw invalid();
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      input,
    );
  if (!match || !Number.isFinite(Date.parse(input))) throw invalid();
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw invalid();
  return input;
}
function command(input: unknown): MarketplaceNegotiationCommand {
  if (!isVintedNegotiationCommand(input)) throw invalid();
  return Object.freeze(input);
}

export function validateMarketplaceNegotiationLease(
  input: unknown,
  binding: Pick<
    NonNullable<BrowserSessionScope['negotiationWrite']>,
    'sessionId' | 'expiresAt' | 'absoluteExpiresAt'
  >,
  now: number,
): number | null {
  const response = fields(input, ['active', 'sessionId', 'expiresAt', 'absoluteExpiresAt']);
  if (response['active'] === false) {
    if (
      response['sessionId'] !== null ||
      response['expiresAt'] !== null ||
      response['absoluteExpiresAt'] !== null
    )
      throw invalid();
    return null;
  }
  if (
    response['active'] !== true ||
    response['sessionId'] !== binding.sessionId ||
    timestamp(response['absoluteExpiresAt']) !== binding.absoluteExpiresAt
  )
    throw invalid();
  const expiresAt = Date.parse(timestamp(response['expiresAt']));
  if (expiresAt <= now || expiresAt > Date.parse(binding.absoluteExpiresAt)) throw invalid();
  return expiresAt;
}

export class SupabaseMarketplaceNegotiationStore {
  private readonly options: MessageStoreOptions;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  constructor(options: MessageStoreOptions) {
    if (!options.serviceRoleKey.trim()) throw new Error('Serverzugang fehlt');
    this.options = options;
    this.request = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }
  async claim(
    workerId: string,
    workerEpoch: number,
    runnerId: string,
  ): Promise<CloudNegotiationClaim | null> {
    const value = await this.rpc('marketplace_cloud_negotiation_claim', {
      p_worker_id: uuid(workerId),
      p_worker_epoch: version(workerEpoch),
      p_runner_id: uuid(runnerId),
    });
    if (value === null) return null;
    const result = fields(value, [
      'jobId',
      'claimToken',
      'workspaceId',
      'connectionId',
      'userId',
      'workerId',
      'workerEpoch',
      'runnerId',
      'authorizationVersion',
      'externalAccountId',
      'sessionId',
      'expiresAt',
      'absoluteExpiresAt',
      'command',
      'sourceOffer',
      'confirmedOffer',
    ]);
    if (
      result['workerId'] !== workerId ||
      result['workerEpoch'] !== workerEpoch ||
      result['runnerId'] !== runnerId ||
      typeof result['externalAccountId'] !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(result['externalAccountId'])
    )
      throw invalid();
    version(result['authorizationVersion']);
    if (
      (result['sourceOffer'] !== null && !isVintedNegotiationOffer(result['sourceOffer'])) ||
      (result['confirmedOffer'] !== null &&
        !isConfirmedNegotiationOffer(result['confirmedOffer'])) ||
      (result['sourceOffer'] && result['confirmedOffer'])
    )
      throw invalid();
    const expiresAt = timestamp(result['expiresAt']),
      absoluteExpiresAt = timestamp(result['absoluteExpiresAt']);
    if (
      Date.parse(expiresAt) <= this.now() ||
      Date.parse(expiresAt) > Date.parse(absoluteExpiresAt)
    )
      throw invalid();
    const jobId = uuid(result['jobId']),
      claimToken = uuid(result['claimToken']);
    const parsedCommand = command(result['command']);
    if (
      (result['sourceOffer'] && result['sourceOffer'].sellerId !== result['externalAccountId']) ||
      (result['confirmedOffer'] &&
        result['confirmedOffer'].command.externalConversationId !==
          parsedCommand.externalConversationId) ||
      (parsedCommand.kind === 'offer' && (result['sourceOffer'] || result['confirmedOffer']))
    )
      throw invalid();
    return Object.freeze({
      kind: 'negotiation',
      jobId,
      claimToken,
      accountId: result['externalAccountId'],
      command: parsedCommand,
      sourceOffer: result['sourceOffer'] === null ? null : Object.freeze(result['sourceOffer']),
      confirmedOffer:
        result['confirmedOffer'] === null ? null : Object.freeze(result['confirmedOffer']),
      scope: Object.freeze({
        workspaceId: uuid(result['workspaceId']),
        connectionId: uuid(result['connectionId']),
        userId: uuid(result['userId']),
        userAccessToken: '',
        negotiationWrite: Object.freeze({
          jobId,
          claimToken,
          workerId,
          workerEpoch,
          runnerId,
          sessionId: uuid(result['sessionId']),
          expiresAt,
          absoluteExpiresAt,
        }),
      }),
    });
  }
  async check(claim: CloudNegotiationClaim): Promise<boolean> {
    const response = await this.rpc('marketplace_cloud_negotiation_check', this.binding(claim));
    const binding = claim.scope.negotiationWrite;
    if (!binding) throw invalid();
    return validateMarketplaceNegotiationLease(response, binding, this.now()) !== null;
  }
  async begin(claim: CloudNegotiationClaim): Promise<void> {
    const response = fields(
      await this.rpc('marketplace_cloud_negotiation_begin', this.binding(claim)),
      ['ok'],
    );
    if (response['ok'] !== true) throw invalid();
  }
  async finish(claim: CloudNegotiationClaim, result: MarketplaceNegotiationResult): Promise<void> {
    if (
      !['sent', 'failed', 'outcome_unknown', 'skipped'].includes(result.outcome) ||
      (result.outcome === 'sent'
        ? typeof result.externalId !== 'string' || !/^[1-9][0-9]{0,31}$/.test(result.externalId)
        : result.externalId !== undefined) ||
      (result.errorCode !== undefined && !/^[a-z_]{1,80}$/.test(result.errorCode))
    )
      throw invalid();
    const response = fields(
      await this.rpc('marketplace_cloud_negotiation_finish', {
        ...this.binding(claim),
        p_outcome: result.outcome,
        p_external_id: result.externalId ?? null,
        p_error_code: result.errorCode ?? null,
      }),
      ['ok'],
    );
    if (response['ok'] !== true) throw invalid();
  }
  private binding(claim: CloudNegotiationClaim): Record<string, string | number> {
    const scope = claim.scope,
      binding = scope.negotiationWrite;
    if (
      !binding ||
      binding.jobId !== claim.jobId ||
      binding.claimToken !== claim.claimToken ||
      scope.syncRead ||
      scope.cloudSetup ||
      scope.favoriteWrite ||
      scope.messageWrite ||
      scope.listingWrite ||
      scope.userAccessToken
    )
      throw invalid();
    return {
      p_workspace_id: uuid(scope.workspaceId),
      p_connection_id: uuid(scope.connectionId),
      p_job_id: uuid(claim.jobId),
      p_claim_token: uuid(claim.claimToken),
      p_worker_id: uuid(binding.workerId),
      p_worker_epoch: version(binding.workerEpoch),
    };
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
      if (!response.ok) throw invalid();
      return (await response.json()) as unknown;
    } catch {
      // Netzwerk- und Anbieterdetails bleiben außerhalb der öffentlichen Fehlerkette.
      throw invalid();
    }
  }
}

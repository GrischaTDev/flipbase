import type { CloudListingClaim } from './marketplace-listing-runner.ts';
import type { MarketplaceListingResult } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { isVintedListingResult, parseVintedListingSnapshot } from './vinted-listing-contracts.ts';
import { loadMarketplaceListingCategoryPath } from './marketplace-listing-category.ts';
import { validateMarketplaceMessageLease } from './supabase-marketplace-message-store.ts';
import {
  loadMarketplaceListingPhoto,
  type MarketplaceListingPhoto,
} from './marketplace-listing-photo.ts';

interface ListingStoreOptions {
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}
function invalid(): Error {
  return new Error('Cloud-Inseratantwort ungültig');
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
function id(input: unknown): string {
  if (
    typeof input !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(input) ||
    BigInt(input) > 9223372036854775807n
  )
    throw invalid();
  return input;
}
function integer(input: unknown, minimum = 1): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < minimum) throw invalid();
  return input;
}
const snapshot = parseVintedListingSnapshot;

export class SupabaseMarketplaceListingStore {
  private readonly options: ListingStoreOptions;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  constructor(options: ListingStoreOptions) {
    if (!options.serviceRoleKey.trim()) throw new Error('Serverzugang fehlt');
    this.options = options;
    this.request = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }
  async claim(
    workerId: string,
    workerEpoch: number,
    runnerId: string,
  ): Promise<CloudListingClaim | null> {
    const input = await this.rpc('marketplace_cloud_listing_claim', {
      p_worker_id: uuid(workerId),
      p_worker_epoch: integer(workerEpoch),
      p_runner_id: uuid(runnerId),
    });
    if (input === null) return null;
    const value = fields(input, [
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
      'action',
      'snapshot',
    ]);
    if (
      value['workerId'] !== workerId ||
      value['workerEpoch'] !== workerEpoch ||
      value['runnerId'] !== runnerId ||
      typeof value['externalAccountId'] !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(value['externalAccountId']) ||
      (value['action'] !== 'publish' && value['action'] !== 'vinted_draft')
    )
      throw invalid();
    integer(value['authorizationVersion']);
    const jobId = id(value['jobId']),
      claimToken = uuid(value['claimToken']),
      workspaceId = uuid(value['workspaceId']),
      connectionId = uuid(value['connectionId']);
    if (typeof value['expiresAt'] !== 'string' || typeof value['absoluteExpiresAt'] !== 'string')
      throw invalid();
    const binding = Object.freeze({
      jobId,
      claimToken,
      workerId,
      workerEpoch,
      runnerId,
      sessionId: uuid(value['sessionId']),
      expiresAt: value['expiresAt'],
      absoluteExpiresAt: value['absoluteExpiresAt'],
    });
    validateMarketplaceMessageLease(
      {
        active: true,
        sessionId: binding.sessionId,
        expiresAt: binding.expiresAt,
        absoluteExpiresAt: binding.absoluteExpiresAt,
      },
      binding,
      this.now(),
    );
    return Object.freeze({
      kind: 'listing',
      jobId,
      claimToken,
      accountId: value['externalAccountId'],
      action: value['action'],
      snapshot: snapshot(value['snapshot'], workspaceId, connectionId),
      scope: Object.freeze({
        workspaceId,
        connectionId,
        userId: uuid(value['userId']),
        userAccessToken: '',
        listingWrite: binding,
      }),
    });
  }
  async check(claim: CloudListingClaim): Promise<boolean> {
    const result = await this.rpc('marketplace_cloud_listing_check', this.binding(claim));
    return validateMarketplaceMessageLease(result, claim.scope.listingWrite!, this.now()) !== null;
  }
  async begin(claim: CloudListingClaim): Promise<void> {
    if (
      fields(await this.rpc('marketplace_cloud_listing_begin', this.binding(claim)), ['ok'])[
        'ok'
      ] !== true
    )
      throw invalid();
  }
  async loadCategoryPath(claim: CloudListingClaim): Promise<readonly number[]> {
    try {
      this.binding(claim);
      return await loadMarketplaceListingCategoryPath(
        {
          url: this.options.url,
          serviceRoleKey: this.options.serviceRoleKey,
          request: this.request,
        },
        claim.snapshot.content.categoryId!,
        () => this.check(claim),
      );
    } catch {
      throw new Error('Der Vinted-Kategoriepfad konnte nicht geladen werden.');
    }
  }
  async loadPhoto(claim: CloudListingClaim, imageId: string): Promise<MarketplaceListingPhoto> {
    try {
      this.binding(claim);
      const original = snapshot(
        claim.snapshot,
        claim.scope.workspaceId,
        claim.scope.connectionId,
      ).images.find((image) => image.id === imageId);
      if (!original) throw invalid();
      return await loadMarketplaceListingPhoto(
        {
          url: this.options.url,
          serviceRoleKey: this.options.serviceRoleKey,
          request: this.request,
        },
        claim.scope.workspaceId,
        original,
        () => this.check(claim),
      );
    } catch {
      throw new Error('Das Foto konnte nicht geladen werden.');
    }
  }
  async finish(claim: CloudListingClaim, result: MarketplaceListingResult): Promise<void> {
    if (!isVintedListingResult(result, claim.action, claim.accountId)) throw invalid();
    const input = await this.rpc('marketplace_cloud_listing_finish', {
      ...this.binding(claim),
      p_result: result,
    });
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
    const document = input as Record<string, unknown>;
    if (
      document['id'] !== claim.jobId ||
      document['draftId'] !== claim.snapshot.images[0]?.storagePath.split('/')[1] ||
      document['workspaceId'] !== claim.scope.workspaceId ||
      (document['connectionId'] !== null &&
        document['connectionId'] !== claim.scope.connectionId) ||
      document['externalAccountId'] !== claim.accountId ||
      document['action'] !== claim.action ||
      (document['state'] !== result.outcome &&
        !(document['state'] === 'cancelled' && result.outcome === 'failed')) ||
      (result.outcome === 'confirmed' &&
        (document['externalId'] !== result.externalId ||
          document['providerState'] !== result.providerState ||
          typeof document['verifiedAt'] !== 'string' ||
          Date.parse(document['verifiedAt']) !== Date.parse(result.verifiedAt)))
    )
      throw invalid();
  }
  private binding(claim: CloudListingClaim): Record<string, string | number> {
    const scope = claim.scope,
      binding = scope.listingWrite;
    if (
      !binding ||
      binding.jobId !== claim.jobId ||
      binding.claimToken !== claim.claimToken ||
      scope.userAccessToken ||
      scope.syncRead ||
      scope.cloudSetup ||
      scope.messageWrite ||
      scope.negotiationWrite ||
      scope.favoriteWrite ||
      claim.snapshot.connectionId !== scope.connectionId
    )
      throw invalid();
    return {
      p_workspace_id: uuid(scope.workspaceId),
      p_connection_id: uuid(scope.connectionId),
      p_job_id: id(claim.jobId),
      p_claim_token: uuid(claim.claimToken),
      p_worker_id: uuid(binding.workerId),
      p_worker_epoch: integer(binding.workerEpoch),
    };
  }
  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.request(new URL('/rest/v1/rpc/' + name, this.options.url), {
        method: 'POST',
        headers: {
          apikey: this.options.serviceRoleKey,
          Authorization: 'Bearer ' + this.options.serviceRoleKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw invalid();
      return (await response.json()) as unknown;
    } catch {
      throw invalid();
    }
  }
}

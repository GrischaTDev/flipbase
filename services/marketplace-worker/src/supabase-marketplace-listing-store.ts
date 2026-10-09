import type { CloudListingClaim } from './marketplace-listing-runner.ts';
import type {
  MarketplaceListingSnapshot,
  MarketplaceListingResult,
  VintedListingContent,
} from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import { isVintedListingResult } from './vinted-listing-contracts.ts';
import { validateMarketplaceMessageLease } from './supabase-marketplace-message-store.ts';

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
function text(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > 20000 ||
    [...input].some((char) => {
      const code = char.charCodeAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  )
    throw invalid();
  return input;
}
function strings(input: unknown): readonly string[] {
  if (!Array.isArray(input) || input.length > 100) throw invalid();
  return Object.freeze(input.map(text));
}
function ids(input: unknown): readonly number[] {
  if (!Array.isArray(input) || input.length > 100) throw invalid();
  const result = input.map((value) => integer(value));
  if (new Set(result).size !== result.length) throw invalid();
  return Object.freeze(result);
}
function content(input: unknown): VintedListingContent {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const value = input as Record<string, unknown>;
  const allowed = [
    'title',
    'description',
    'priceCents',
    'currency',
    'categoryId',
    'categoryLabel',
    'brandId',
    'brandLabel',
    'sizeId',
    'sizeLabel',
    'conditionId',
    'conditionLabel',
    'colorIds',
    'colorLabels',
    'materialIds',
    'materialLabels',
    'packageSizeId',
    'attributes',
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key)) || value['currency'] !== 'EUR')
    throw invalid();
  const attributes = value['attributes'] ?? {};
  if (typeof attributes !== 'object' || !attributes || Array.isArray(attributes)) throw invalid();
  const parsedAttributes: Record<string, string> = {};
  for (const [key, entry] of Object.entries(attributes)) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(key) ||
      ['constructor', 'prototype', '__proto__'].includes(key)
    )
      throw invalid();
    parsedAttributes[key] = text(entry);
  }
  if (Object.keys(parsedAttributes).length > 100) throw invalid();
  const title = text(value['title']),
    description = text(value['description']);
  if (!title.trim() || !description.trim()) throw invalid();
  return Object.freeze({
    title,
    description,
    priceCents: integer(value['priceCents']),
    currency: 'EUR',
    categoryId: integer(value['categoryId']),
    categoryLabel: text(value['categoryLabel'] ?? ''),
    brandId: value['brandId'] == null ? null : integer(value['brandId']),
    brandLabel: text(value['brandLabel'] ?? ''),
    sizeId: value['sizeId'] == null ? null : integer(value['sizeId']),
    sizeLabel: text(value['sizeLabel'] ?? ''),
    conditionId: integer(value['conditionId']),
    conditionLabel: text(value['conditionLabel'] ?? ''),
    colorIds: ids(value['colorIds'] ?? []),
    colorLabels: strings(value['colorLabels'] ?? []),
    materialIds: ids(value['materialIds'] ?? []),
    materialLabels: strings(value['materialLabels'] ?? []),
    packageSizeId: integer(value['packageSizeId']),
    attributes: Object.freeze(parsedAttributes),
  });
}
function snapshot(
  input: unknown,
  workspaceId: string,
  connectionId: string,
): MarketplaceListingSnapshot {
  const value = fields(input, [
    'content',
    'images',
    'aiPhoto',
    'bump',
    'connectionId',
    'inventoryItemId',
  ]);
  if (
    value['connectionId'] !== connectionId ||
    typeof value['aiPhoto'] !== 'boolean' ||
    value['bump'] !== false ||
    !Array.isArray(value['images']) ||
    value['images'].length < 1 ||
    value['images'].length > 20
  )
    throw invalid();
  const seen = new Set<string>(),
    paths = new Set<string>();
  let draftId: string | undefined;
  const images = value['images'].map((input) => {
    const image = fields(input, ['id', 'storagePath', 'fileName', 'mimeType', 'byteSize']),
      imageId = id(image['id']);
    if (typeof image['storagePath'] !== 'string') throw invalid();
    const parts = image['storagePath'].split('/');
    const photoDraftId = parts[1],
      file = parts[2];
    if (
      parts.length !== 3 ||
      parts[0] !== workspaceId ||
      !photoDraftId ||
      !file ||
      !/^[1-9][0-9]{0,18}$/.test(photoDraftId) ||
      !/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(file) ||
      (draftId && draftId !== photoDraftId) ||
      seen.has(imageId) ||
      paths.has(image['storagePath'])
    )
      throw invalid();
    uuid(file.slice(0, 36));
    id(photoDraftId);
    draftId = photoDraftId;
    seen.add(imageId);
    paths.add(image['storagePath']);
    const mimeType = image['mimeType'];
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp')
      throw invalid();
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
    if (!file.endsWith('.' + extension)) throw invalid();
    const byteSize = integer(image['byteSize']);
    if (byteSize > 50 * 1024 * 1024) throw invalid();
    const fileName = text(image['fileName']);
    if (!fileName || fileName.length > 255 || /[\r\n/\\]/u.test(fileName)) throw invalid();
    return Object.freeze({
      id: imageId,
      storagePath: image['storagePath'],
      fileName,
      mimeType,
      byteSize,
    });
  });
  return Object.freeze({
    content: content(value['content']),
    images: Object.freeze(images),
    connectionId,
    inventoryItemId: value['inventoryItemId'] === null ? null : uuid(value['inventoryItemId']),
    aiPhoto: value['aiPhoto'],
    bump: false,
  });
}

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

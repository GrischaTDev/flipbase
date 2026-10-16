import type {
  KleinanzeigenDraftContent,
  KleinanzeigenTransferDraft,
  KleinanzeigenSourceReference,
  KleinanzeigenTransferSourceRead,
  VintedTransferSource,
} from '../../../../../supabase/functions/_shared/kleinanzeigen-listing-contracts';
import type { MarketplaceListingReference } from './marketplace-overview.models';
interface TransferScope {
  readonly workspaceId: string;
  readonly targetConnectionId: string;
  readonly source: MarketplaceListingReference;
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, names: readonly string[]): v is Record<string, unknown> =>
  record(v) &&
  Object.keys(v).length === names.length &&
  names.every((key) => Object.hasOwn(v, key));
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,31}$/u.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const optionalText = (v: unknown, max: number) => v === null || (text(v, max) && v.length > 0);
const cents = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 9999999900;
function strings(v: unknown): v is Record<string, string> {
  return (
    record(v) &&
    Object.keys(v).length <= 50 &&
    Object.entries(v).every(
      ([key, value]) => key.length > 0 && key.length <= 160 && text(value, 500),
    )
  );
}
function photo(value: unknown): value is string {
  if (!text(value, 2000)) return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      ['images1.vinted.net', 'images2.vinted.net'].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash
    );
  } catch {
    return false;
  }
}
function source(value: unknown, account: string, external: string): VintedTransferSource | null {
  if (
    !keys(value, [
      'externalAccountId',
      'externalId',
      'title',
      'description',
      'priceCents',
      'currency',
      'photoReferences',
      'attributeHints',
    ]) ||
    value['externalAccountId'] !== account ||
    value['externalId'] !== external ||
    !text(value['title'], 1000) ||
    !value['title'].trim() ||
    !text(value['description'], 100000) ||
    !(value['priceCents'] === null || cents(value['priceCents'])) ||
    !text(value['currency'], 12) ||
    !value['currency'] ||
    !Array.isArray(value['photoReferences']) ||
    value['photoReferences'].length < 1 ||
    value['photoReferences'].length > 40 ||
    !value['photoReferences'].every(photo) ||
    new Set(value['photoReferences']).size !== value['photoReferences'].length ||
    !strings(value['attributeHints'])
  )
    return null;
  return {
    externalAccountId: account,
    externalId: external,
    title: value['title'],
    description: value['description'],
    priceCents: value['priceCents'],
    currency: value['currency'],
    photoReferences: [...value['photoReferences']],
    attributeHints: { ...value['attributeHints'] },
  };
}
export function validTransferDraftContent(value: unknown): value is KleinanzeigenDraftContent {
  return (
    keys(value, [
      'title',
      'description',
      'priceCents',
      'currency',
      'priceType',
      'shippingType',
      'shippingPriceCents',
      'postalCode',
      'categoryId',
      'categoryFields',
      'schemaRevision',
    ]) &&
    text(value['title'], 65) &&
    !!value['title'].trim() &&
    text(value['description'], 4000) &&
    cents(value['priceCents']) &&
    value['currency'] === 'EUR' &&
    ['FIXED', 'NEGOTIABLE'].includes(String(value['priceType'])) &&
    ['pickup', 'shipping', 'both'].includes(String(value['shippingType'])) &&
    (value['shippingPriceCents'] === null || cents(value['shippingPriceCents'])) &&
    !(value['shippingType'] === 'pickup' && value['shippingPriceCents'] !== null) &&
    (value['postalCode'] === null ||
      (typeof value['postalCode'] === 'string' && /^[0-9]{5}$/u.test(value['postalCode']))) &&
    optionalText(value['categoryId'], 160) &&
    optionalText(value['schemaRevision'], 128) &&
    strings(value['categoryFields'])
  );
}
export function parseTransferSourceResponse(
  value: unknown,
  scope: TransferScope,
): KleinanzeigenTransferSourceRead | null {
  if (!record(value) || !['ready', 'needs_source'].includes(String(value['state']))) return null;
  const ready = value['state'] === 'ready';
  if (
    !keys(value, [
      'state',
      'workspaceId',
      'targetConnectionId',
      'connectionId',
      'entryId',
      'externalId',
      'externalAccountId',
      'executionMode',
      ...(ready ? ['source', 'observedAt', 'fingerprint'] : []),
    ]) ||
    value['workspaceId'] !== scope.workspaceId ||
    value['targetConnectionId'] !== scope.targetConnectionId ||
    value['connectionId'] !== scope.source.connectionId ||
    value['externalId'] !== scope.source.externalId ||
    !uuid(value['entryId']) ||
    !id(value['externalAccountId']) ||
    !['cloud', 'local'].includes(String(value['executionMode']))
  )
    return null;
  const full = ready
    ? source(value['source'], value['externalAccountId'], scope.source.externalId)
    : null;
  if (
    ready &&
    (!full ||
      typeof value['observedAt'] !== 'string' ||
      !Number.isFinite(Date.parse(value['observedAt'])) ||
      typeof value['fingerprint'] !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value['fingerprint']))
  )
    return null;
  return {
    state: ready ? 'ready' : 'needs_source',
    workspaceId: scope.workspaceId,
    targetConnectionId: scope.targetConnectionId,
    connectionId: scope.source.connectionId,
    entryId: value['entryId'],
    externalId: scope.source.externalId,
    externalAccountId: value['externalAccountId'],
    executionMode: value['executionMode'] as 'cloud' | 'local',
    ...(ready
      ? {
          source: full!,
          observedAt: value['observedAt'] as string,
          fingerprint: value['fingerprint'] as string,
        }
      : {}),
  };
}
export function parseTransferDraftResponse(
  value: unknown,
  scope: TransferScope & { readonly sourceReference: KleinanzeigenSourceReference },
): KleinanzeigenTransferDraft | null {
  if (
    !keys(value, [
      'id',
      'workspaceId',
      'targetConnectionId',
      'sourceReference',
      'revision',
      'status',
      'content',
      'imagesComplete',
    ]) ||
    !uuid(value['id']) ||
    value['workspaceId'] !== scope.workspaceId ||
    value['targetConnectionId'] !== scope.targetConnectionId ||
    typeof value['revision'] !== 'number' ||
    !Number.isSafeInteger(value['revision']) ||
    value['revision'] < 1 ||
    typeof value['imagesComplete'] !== 'boolean' ||
    !['prepared', 'online', 'ended'].includes(String(value['status'])) ||
    !validTransferDraftContent(value['content']) ||
    !keys(value['sourceReference'], [
      'platform',
      'workspaceId',
      'connectionId',
      'externalId',
      'entryId',
      'fingerprint',
    ]) ||
    Object.entries(scope.sourceReference).some(
      ([key, expected]) => (value['sourceReference'] as Record<string, unknown>)[key] !== expected,
    )
  )
    return null;
  return {
    id: value['id'],
    workspaceId: scope.workspaceId,
    targetConnectionId: scope.targetConnectionId,
    sourceReference: { ...scope.sourceReference },
    revision: value['revision'],
    status: value['status'] as KleinanzeigenTransferDraft['status'],
    content: { ...value['content'], categoryFields: { ...value['content'].categoryFields } },
    imagesComplete: value['imagesComplete'],
  };
}

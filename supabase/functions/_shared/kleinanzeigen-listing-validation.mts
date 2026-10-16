import type {
  VintedTransferSource,
  KleinanzeigenSourceReference,
  KleinanzeigenDraftContent,
  KleinanzeigenTransferRequest,
  KleinanzeigenTransferSourceRead,
  KleinanzeigenTransferDraft,
} from './kleinanzeigen-listing-contracts.ts';

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const fields = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
  record(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));

const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(v);

const externalId = (v: unknown): v is string =>
  typeof v === 'string' && /^[1-9][0-9]{0,31}$/u.test(v);

const connectionId = (v: unknown): v is string =>
  typeof v === 'string' && /^[1-9][0-9]{0,18}$/u.test(v) && BigInt(v) <= 9223372036854775807n;

const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

const optionalText = (v: unknown, max: number): v is string | null =>
  v === null || (text(v, max) && v.length > 0);

const cents = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 9999999900;

function strings(v: unknown, maxKeys = 50): v is Readonly<Record<string, string>> {
  return (
    record(v) &&
    Object.keys(v).length <= maxKeys &&
    Object.entries(v).every(
      ([key, value]) => key.length > 0 && key.length <= 160 && text(value, 500),
    )
  );
}

export function isVintedTransferPhotoUrl(value: unknown): value is string {
  if (!text(value, 2000)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      ['images1.vinted.net', 'images2.vinted.net'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function parseVintedTransferSource(
  value: unknown,
  account: string,
  item: string,
): VintedTransferSource | null {
  if (
    !fields(value, [
      'externalAccountId',
      'externalId',
      'title',
      'description',
      'priceCents',
      'currency',
      'photoReferences',
      'attributeHints',
    ]) ||
    !externalId(account) ||
    !externalId(item) ||
    value['externalAccountId'] !== account ||
    value['externalId'] !== item ||
    !text(value['title'], 1000) ||
    !value['title']['trim']() ||
    !text(value['description'], 100000) ||
    !(value['priceCents'] === null || cents(value['priceCents'])) ||
    !text(value['currency'], 12) ||
    !value['currency'] ||
    !Array.isArray(value['photoReferences']) ||
    value['photoReferences']['length'] < 1 ||
    value['photoReferences']['length'] > 40 ||
    !value['photoReferences']['every'](isVintedTransferPhotoUrl) ||
    new Set(value['photoReferences']).size !== value['photoReferences']['length'] ||
    !strings(value['attributeHints'])
  )
    return null;
  return Object.freeze({
    externalAccountId: account,
    externalId: item,
    title: value['title'],
    description: value['description'],
    priceCents: value['priceCents'],
    currency: value['currency'],
    photoReferences: [...value['photoReferences']],
    attributeHints: { ...value['attributeHints'] },
  });
}

export function parseKleinanzeigenDraftContent(value: unknown): KleinanzeigenDraftContent | null {
  if (
    !fields(value, [
      'title',
      'description',
      'priceCents',
      'currency',
      'priceType',
      'postalCode',
      'shippingType',
      'shippingPriceCents',
      'categoryId',
      'categoryFields',
      'schemaRevision',
    ]) ||
    !text(value['title'], 65) ||
    !value['title']['trim']() ||
    !text(value['description'], 4000) ||
    !cents(value['priceCents']) ||
    value['currency'] !== 'EUR' ||
    !['FIXED', 'NEGOTIABLE'].includes(String(value['priceType'])) ||
    !['pickup', 'shipping', 'both'].includes(String(value['shippingType'])) ||
    !(value['shippingPriceCents'] === null || cents(value['shippingPriceCents'])) ||
    (value['shippingType'] === 'pickup' && value['shippingPriceCents'] !== null) ||
    !(
      value['postalCode'] === null ||
      (typeof value['postalCode'] === 'string' && /^[0-9]{5}$/u.test(value['postalCode']))
    ) ||
    !optionalText(value['categoryId'], 160) ||
    !optionalText(value['schemaRevision'], 128) ||
    !strings(value['categoryFields'])
  )
    return null;
  return Object.freeze({
    ...value,
    categoryFields: { ...value['categoryFields'] },
  }) as unknown as KleinanzeigenDraftContent;
}

export function parseKleinanzeigenTransferRequest(
  value: unknown,
): KleinanzeigenTransferRequest | null {
  if (
    !record(value) ||
    !uuid(value['workspaceId']) ||
    !connectionId(value['targetConnectionId']) ||
    !uuid(value['requestId']) ||
    !record(value['source']) ||
    value['source']['platform'] !== 'vinted' ||
    value['source']['workspaceId'] !== value['workspaceId'] ||
    !uuid(value['source']['connectionId']) ||
    !externalId(value['source']['externalId'])
  )
    return null;
  if (
    value['action'] === 'prepare_transfer' &&
    fields(value, ['action', 'workspaceId', 'targetConnectionId', 'requestId', 'source']) &&
    fields(value['source'], ['platform', 'workspaceId', 'connectionId', 'externalId'])
  )
    return value as unknown as KleinanzeigenTransferRequest;
  if (
    value['action'] === 'save_transfer' &&
    fields(value, [
      'action',
      'workspaceId',
      'targetConnectionId',
      'requestId',
      'source',
      'content',
      'draftId',
      'expectedRevision',
    ]) &&
    fields(value['source'], [
      'platform',
      'workspaceId',
      'connectionId',
      'externalId',
      'entryId',
      'fingerprint',
    ]) &&
    uuid(value['source']['entryId']) &&
    typeof value['source']['fingerprint'] === 'string' &&
    /^[a-f0-9]{64}$/u.test(value['source']['fingerprint']) &&
    parseKleinanzeigenDraftContent(value['content']) &&
    ((value['draftId'] === null && value['expectedRevision'] === null) ||
      (uuid(value['draftId']) &&
        typeof value['expectedRevision'] === 'number' &&
        Number.isSafeInteger(value['expectedRevision']) &&
        value['expectedRevision'] > 0))
  )
    return value as unknown as KleinanzeigenTransferRequest;
  return null;
}

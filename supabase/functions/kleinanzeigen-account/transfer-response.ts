import {
  parseVintedTransferSource,
  parseKleinanzeigenDraftContent,
} from '../_shared/kleinanzeigen-listing-validation.mts';
import type {
  KleinanzeigenTransferRequest,
  KleinanzeigenTransferSourceRead,
  KleinanzeigenTransferDraft,
} from '../_shared/kleinanzeigen-listing-contracts.ts';
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value);
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[1-9][0-9]{0,31}$/u.test(value);
export function parseTransferSourceRead(
  value: unknown,
  input: KleinanzeigenTransferRequest,
  withTarget = true,
): KleinanzeigenTransferSourceRead | null {
  if (!record(value) || !['needs_source', 'ready'].includes(String(value.state))) return null;
  const ready = value.state === 'ready';
  const keys = [
    'state',
    'workspaceId',
    'connectionId',
    'entryId',
    'externalId',
    'externalAccountId',
    'executionMode',
    ...(withTarget ? ['targetConnectionId'] : []),
    ...(ready ? ['source', 'observedAt', 'fingerprint'] : []),
  ];
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    value.workspaceId !== input.workspaceId ||
    value.connectionId !== input.source.connectionId ||
    value.externalId !== input.source.externalId ||
    !uuid(value.entryId) ||
    !id(value.externalAccountId) ||
    !['cloud', 'local'].includes(String(value.executionMode)) ||
    (withTarget && value.targetConnectionId !== input.targetConnectionId)
  )
    return null;
  const source = ready
    ? parseVintedTransferSource(value.source, value.externalAccountId, input.source.externalId)
    : null;
  if (
    ready &&
    (!source ||
      typeof value.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.fingerprint) ||
      typeof value.observedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.observedAt)) ||
      Date.parse(value.observedAt) > Date.now() + 1000 ||
      Date.now() - Date.parse(value.observedAt) > 86400000)
  )
    return null;
  return {
    state: ready ? 'ready' : 'needs_source',
    workspaceId: input.workspaceId,
    targetConnectionId: input.targetConnectionId,
    connectionId: input.source.connectionId,
    entryId: value.entryId,
    externalId: input.source.externalId,
    externalAccountId: value.externalAccountId,
    executionMode: value.executionMode as 'cloud' | 'local',
    ...(ready
      ? {
          source: source!,
          fingerprint: value.fingerprint as string,
          observedAt: value.observedAt as string,
        }
      : {}),
  };
}
export function publicTransferDraft(value: unknown): KleinanzeigenTransferDraft | null {
  if (
    !record(value) ||
    !uuid(value.id) ||
    !uuid(value.workspace_id) ||
    !id(value.target_connection_id) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !['prepared', 'online', 'ended'].includes(String(value.status)) ||
    typeof value.transfer_images_complete !== 'boolean' ||
    !record(value.source_reference)
  )
    return null;
  const content = parseKleinanzeigenDraftContent({
    title: value.title,
    description: value.description,
    priceCents: Math.round(Number(value.price) * 100),
    currency: 'EUR',
    priceType: value.price_type,
    postalCode: value.postal_code,
    shippingType: value.shipping_type,
    shippingPriceCents:
      value.shipping_price === null ? null : Math.round(Number(value.shipping_price) * 100),
    categoryId: value.category_id,
    categoryFields: value.category_fields,
    schemaRevision: value.schema_revision,
  });
  const ref = value.source_reference;
  if (
    !content ||
    Object.keys(ref).length !== 6 ||
    ref.platform !== 'vinted' ||
    ref.workspaceId !== value.workspace_id ||
    !uuid(ref.connectionId) ||
    !uuid(ref.entryId) ||
    !id(ref.externalId) ||
    typeof ref.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(ref.fingerprint)
  )
    return null;
  return {
    id: value.id,
    workspaceId: value.workspace_id,
    targetConnectionId: value.target_connection_id,
    sourceReference: {
      platform: 'vinted',
      workspaceId: value.workspace_id,
      connectionId: ref.connectionId,
      entryId: ref.entryId,
      externalId: ref.externalId,
      fingerprint: ref.fingerprint,
    },
    revision: value.revision,
    status: value.status as KleinanzeigenTransferDraft['status'],
    content,
    imagesComplete: value.transfer_images_complete,
  };
}
export function validPublicTransferDraft(
  value: unknown,
  input: Extract<KleinanzeigenTransferRequest, { action: 'save_transfer' }>,
): value is KleinanzeigenTransferDraft {
  if (
    !record(value) ||
    Object.keys(value).sort().join(',') !==
      'content,id,imagesComplete,revision,sourceReference,status,targetConnectionId,workspaceId' ||
    !uuid(value.id) ||
    value.workspaceId !== input.workspaceId ||
    value.targetConnectionId !== input.targetConnectionId ||
    typeof value.imagesComplete !== 'boolean' ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !['prepared', 'online', 'ended'].includes(String(value.status)) ||
    !parseKleinanzeigenDraftContent(value.content) ||
    !record(value.sourceReference) ||
    Object.keys(value.sourceReference).length !== 6
  )
    return false;
  return (
    Object.entries(input.source).every(
      ([key, expected]) => (value.sourceReference as Record<string, unknown>)[key] === expected,
    ) &&
    (input.draftId === null || input.draftId === value.id)
  );
}

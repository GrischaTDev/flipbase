import {
  parseVintedListingContent,
  type VintedListingContent,
  type VintedListingTemplateFields,
} from './vinted-listing-content';

export interface VintedListingImage {
  readonly id: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteSize: number;
}
export interface VintedListingDraft {
  readonly id: string;
  readonly workspaceId: string;
  readonly connectionId: string | null;
  readonly revision: number;
  readonly content: VintedListingContent;
  readonly images: readonly VintedListingImage[];
  readonly inventoryItemId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface VintedListingTemplate {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly fields: VintedListingTemplateFields;
  readonly revision: number;
  readonly updatedAt: string;
}
function invalid(): never {
  throw new Error(
    'Die Inseratangaben konnten nicht sicher zugeordnet werden. Lade die Seite erneut.',
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  return value;
}
export function listingIdentifier(value: unknown): string {
  const id = text(value);
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return invalid();
  return id;
}
function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return invalid();
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (!/^\d{4}-\d\d-\d\dT/.test(result) || !Number.isFinite(Date.parse(result))) return invalid();
  return result;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

export function parseVintedListingDraft(
  value: unknown,
  workspaceId: string,
  expectedId?: string,
): VintedListingDraft {
  const data = record(value);
  const id = listingIdentifier(data['id']);
  if (data['workspaceId'] !== workspaceId || (expectedId && expectedId !== id)) return invalid();
  if (!Array.isArray(data['images']) || data['images'].length > 100) return invalid();
  const imageIds = new Set<string>();
  const images = data['images'].map((value): VintedListingImage => {
    const image = record(value);
    const imageId = listingIdentifier(image['id']);
    const storagePath = text(image['storagePath']);
    const mimeType = image['mimeType'];
    const byteSize = image['byteSize'];
    if (
      imageIds.has(imageId) ||
      !storagePath.startsWith(`${workspaceId}/${id}/`) ||
      storagePath.split('/').length !== 3 ||
      storagePath.includes('..') ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(String(mimeType)) ||
      typeof byteSize !== 'number' ||
      !Number.isSafeInteger(byteSize) ||
      byteSize < 1 ||
      byteSize > 52428800
    )
      return invalid();
    imageIds.add(imageId);
    return {
      id: imageId,
      storagePath,
      fileName: text(image['fileName']),
      mimeType: mimeType as VintedListingImage['mimeType'],
      byteSize,
    };
  });
  return {
    id,
    workspaceId,
    connectionId: nullableText(data['connectionId']),
    revision: revision(data['revision']),
    content: parseVintedListingContent(data['content']),
    images,
    inventoryItemId: nullableText(data['inventoryItemId']),
    createdAt: timestamp(data['createdAt']),
    updatedAt: timestamp(data['updatedAt']),
  };
}
export function parseVintedListingTemplate(
  value: unknown,
  workspaceId: string,
): VintedListingTemplate {
  const data = record(value);
  if (data['workspaceId'] !== workspaceId) return invalid();
  const fields = record(data['fields']);
  const validated = parseVintedListingContent(fields);
  return {
    id: listingIdentifier(data['id']),
    workspaceId,
    name: text(data['name']),
    revision: revision(data['revision']),
    updatedAt: timestamp(data['updatedAt']),
    fields: Object.fromEntries(
      Object.keys(fields).map((key) => [key, validated[key as keyof VintedListingContent]]),
    ),
  };
}
export class VintedListingStorageError extends Error {
  constructor(
    readonly code: 'conflict' | 'forbidden' | 'unavailable' | 'request_failed',
    message?: string,
  ) {
    super(
      message ??
        (code === 'conflict'
          ? 'Der Entwurf wurde auf einem anderen Gerät geändert. Deine Eingabe bleibt erhalten.'
          : code === 'forbidden'
            ? 'Du hast keinen Zugriff auf diesen Arbeitsbereich.'
            : code === 'unavailable'
              ? 'Die Inseratentwürfe sind auf diesem Server noch nicht verfügbar.'
              : 'Die Änderungen konnten nicht gespeichert werden. Deine Eingabe bleibt erhalten.'),
    );
  }
}
export function listingResponse(result: {
  data: unknown;
  error: { code?: string; message?: string } | null;
}): unknown {
  if (result.error)
    throw new VintedListingStorageError(
      result.error.code === '40001'
        ? 'conflict'
        : result.error.code === '42501'
          ? 'forbidden'
          : result.error.code === 'PGRST202'
            ? 'unavailable'
            : 'request_failed',
      result.error.code === '23505'
        ? 'Eine Vorlage mit diesem Namen gibt es bereits. Wähle einen anderen Namen.'
        : undefined,
    );
  return result.data;
}

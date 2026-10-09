import type {
  LocalListingPhoto,
  LocalListingPhotoRequest,
} from '../_shared/marketplace-local-listing-contracts.d.ts';
import { LocalExtensionStoreError } from './handler.ts';

interface PhotoStore {
  authorize(): Promise<boolean>;
  loadSnapshot(): Promise<unknown>;
  download(storagePath: string): Promise<Response>;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function unavailable(): Error {
  return new Error('Das Originalfoto konnte nicht geladen werden.');
}
function original(
  snapshot: unknown,
  input: LocalListingPhotoRequest,
): { path: string; mimeType: LocalListingPhoto['mimeType']; byteSize: number } {
  if (
    !record(snapshot) ||
    snapshot['connectionId'] !== input.connectionId ||
    !Array.isArray(snapshot['images']) ||
    snapshot['images'].length < 1 ||
    snapshot['images'].length > 20
  )
    throw unavailable();
  const matches = snapshot['images'].filter(
    (image: unknown) => record(image) && image['id'] === input.imageId,
  );
  if (matches.length !== 1) throw new LocalExtensionStoreError('access');
  const image = matches[0] as Record<string, unknown>;
  const mimeType = image['mimeType'];
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp')
    throw unavailable();
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
  const path = image['storagePath'];
  if (typeof path !== 'string') throw unavailable();
  const parts = path.split('/');
  if (
    parts.length !== 3 ||
    parts[0] !== input.workspaceId ||
    !/^[1-9][0-9]{0,18}$/.test(parts[1] ?? '') ||
    BigInt(parts[1]!) > 9223372036854775807n ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(
      parts[2] ?? '',
    ) ||
    !parts[2]!.endsWith('.' + extension) ||
    typeof image['byteSize'] !== 'number' ||
    !Number.isSafeInteger(image['byteSize']) ||
    image['byteSize'] < 1 ||
    image['byteSize'] > 50 * 1024 * 1024
  )
    throw unavailable();
  return { path, mimeType, byteSize: image['byteSize'] };
}
function matchesImage(bytes: Uint8Array, mimeType: LocalListingPhoto['mimeType']) {
  if (mimeType === 'image/jpeg')
    return (
      bytes.length >= 5 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217
    );
  if (mimeType === 'image/png')
    return (
      bytes.length > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    );
  return (
    bytes.length > 16 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) ===
      bytes.length - 8 &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.subarray(12, 16)))
  );
}

/** Vollständig puffern: bei Widerruf während des Abrufs gehen keine Teilbytes an die Erweiterung. */
export async function loadLocalListingPhoto(
  input: LocalListingPhotoRequest,
  store: PhotoStore,
): Promise<LocalListingPhoto> {
  const authorize = async () => {
    if (!(await store.authorize())) throw new LocalExtensionStoreError('access');
  };
  await authorize();
  const image = original(await store.loadSnapshot(), input);
  await authorize();
  const response = await store.download(image.path);
  const length = response.headers.get('content-length');
  if (
    response.status !== 200 ||
    response.redirected ||
    !response.body ||
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== image.mimeType ||
    (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== image.byteSize))
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw unavailable();
  }
  const buffer = new ArrayBuffer(image.byteSize);
  const bytes = new Uint8Array(buffer);
  const reader = response.body.getReader();
  let offset = 0,
    complete = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        complete = true;
        break;
      }
      if (chunk.value.byteLength > bytes.length - offset) throw unavailable();
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== bytes.length || !matchesImage(bytes, image.mimeType)) throw unavailable();
  await authorize();
  return { imageId: input.imageId, mimeType: image.mimeType, bytes: buffer };
}

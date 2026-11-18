import type { MarketplaceListingSnapshot } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

/** Nur Bytes und Upload-Metadaten; keine privaten URLs oder Serverzugänge. */
export interface MarketplaceListingPhoto {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly bytes: Uint8Array;
  readonly maskBytes?: Uint8Array;
  readonly maskMimeType?: 'image/png';
}
interface PhotoOptions {
  url: string;
  serviceRoleKey: string;
  request: typeof fetch;
}
const UUID_HEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MASK_BYTES = 15 * 1024 * 1024;
function invalid(): Error {
  return new Error('Das Foto konnte nicht geladen werden.');
}
async function readExactStream(
  body: ReadableStream<Uint8Array>,
  byteSize: number,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(byteSize);
  const reader = body.getReader();
  let offset = 0;
  let complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      if (value.byteLength > bytes.length - offset) throw invalid();
      bytes.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== bytes.length) throw invalid();
  return bytes;
}
async function readBoundedStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) throw invalid();
      chunks.push(value);
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (total < 1) throw invalid();
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
function matchesImageType(bytes: Uint8Array, type: MarketplaceListingPhoto['mimeType']): boolean {
  if (type === 'image/jpeg')
    return (
      bytes.length >= 5 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217
    );
  if (type === 'image/png')
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

export async function loadMarketplaceListingPhoto(
  options: PhotoOptions,
  workspaceId: string,
  image: MarketplaceListingSnapshot['images'][number],
  authorize: () => Promise<boolean>,
): Promise<MarketplaceListingPhoto> {
  try {
    const parts = image.storagePath.split('/');
    if (
      parts.length !== 3 ||
      parts[0] !== workspaceId ||
      !/^[1-9][0-9]{0,18}$/.test(parts[1] ?? '') ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i.test(
        parts[2] ?? '',
      ) ||
      !Number.isSafeInteger(image.byteSize) ||
      image.byteSize < 1 ||
      image.byteSize > 50 * 1024 * 1024
    )
      throw invalid();
    const url = new URL(
      '/storage/v1/object/marketplace-listing-media/' + parts.map(encodeURIComponent).join('/'),
      options.url,
    );
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !(await authorize())
    )
      throw invalid();
    const response = await options.request(url, {
      method: 'GET',
      headers: {
        apikey: options.serviceRoleKey,
        Authorization: 'Bearer ' + options.serviceRoleKey,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const length = response.headers.get('Content-Length');
    if (
      response.status !== 200 ||
      response.redirected ||
      !response.body ||
      response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !==
        image.mimeType ||
      (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== image.byteSize))
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw invalid();
    }
    const bytes = await readExactStream(response.body, image.byteSize);
    if (!matchesImageType(bytes, image.mimeType) || !(await authorize())) throw invalid();
    return Object.freeze({
      id: image.id,
      fileName: image.fileName,
      mimeType: image.mimeType,
      bytes,
    });
  } catch {
    throw invalid();
  }
}

export async function loadMarketplaceListingPhotoMask(
  options: PhotoOptions,
  workspaceId: string,
  maskId: string,
  authorize: () => Promise<boolean>,
): Promise<Uint8Array> {
  try {
    if (!UUID_HEX.test(workspaceId) || !UUID_HEX.test(maskId)) throw invalid();
    const url = new URL(
      `/storage/v1/object/marketplace-listing-masks/${encodeURIComponent(workspaceId)}/${encodeURIComponent(maskId.toLowerCase())}.png`,
      options.url,
    );
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !(await authorize())
    )
      throw invalid();
    const response = await options.request(url, {
      method: 'GET',
      headers: {
        apikey: options.serviceRoleKey,
        Authorization: 'Bearer ' + options.serviceRoleKey,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const length = response.headers.get('Content-Length');
    if (
      response.status !== 200 ||
      response.redirected ||
      !response.body ||
      response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'image/png' ||
      (length !== null &&
        (!/^[0-9]+$/.test(length) || Number(length) < 1 || Number(length) > MAX_MASK_BYTES))
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw invalid();
    }
    const bytes = await readBoundedStream(response.body, MAX_MASK_BYTES);
    if (!matchesImageType(bytes, 'image/png') || !(await authorize())) throw invalid();
    return bytes;
  } catch {
    throw invalid();
  }
}

import type { MarketplaceListingSnapshot } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

/** Nur Bytes und Upload-Metadaten; keine privaten URLs oder Serverzugänge. */
export interface MarketplaceListingPhoto {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly bytes: Uint8Array;
}
interface PhotoOptions {
  url: string;
  serviceRoleKey: string;
  request: typeof fetch;
}
function invalid(): Error {
  return new Error('Das Foto konnte nicht geladen werden.');
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
    const bytes = new Uint8Array(image.byteSize),
      reader = response.body.getReader();
    let offset = 0,
      complete = false;
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
    if (offset !== bytes.length || !matchesImageType(bytes, image.mimeType) || !(await authorize()))
      throw invalid();
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

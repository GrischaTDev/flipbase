import type { MarketplaceListingSnapshot } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';
import type { MarketplaceListingPhoto } from './marketplace-listing-photo.ts';

export const listingPhotoChunkBytes = 1024 * 1024;
type Original = MarketplaceListingSnapshot['images'][number];
interface PhotoChunk {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  offset: number;
  data: string;
  done: boolean;
}
function invalid(): Error {
  return new Error('Originalfotoübergabe ungültig.');
}
function validOriginal(original: Original): boolean {
  return (
    typeof original.id === 'string' &&
    /^[1-9][0-9]{0,18}$/.test(original.id) &&
    Number.isSafeInteger(original.byteSize) &&
    original.byteSize > 0 &&
    original.byteSize <= 50 * 1024 * 1024 &&
    typeof original.fileName === 'string' &&
    original.fileName.length > 0 &&
    original.fileName.length <= 255 &&
    !/[/\\\p{Cc}]/u.test(original.fileName) &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(original.mimeType)
  );
}

/** Die Fototeile enthalten ausschließlich Bytes und Metadaten, keine Speicherpfade oder Schlüssel. */
export function createVintedListingPhotoSender(
  originals: readonly Original[],
  loadPhoto: (id: string) => Promise<MarketplaceListingPhoto>,
  authorize: () => Promise<void>,
) {
  if (
    originals.length < 1 ||
    originals.length > 20 ||
    originals.some((image) => !validOriginal(image)) ||
    new Set(originals.map((image) => image.id)).size !== originals.length
  )
    throw invalid();
  let closed = false,
    busy = false,
    current: { photo: MarketplaceListingPhoto; offset: number } | undefined;
  const completed = new Set<string>();
  const check = async () => {
    if (closed) throw invalid();
    await authorize();
    if (closed) throw invalid();
  };
  return {
    close: () => {
      closed = true;
      current = undefined;
    },
    chunk: async (id: string, offset: number): Promise<PhotoChunk> => {
      const original = originals.find((image) => image.id === id);
      if (
        closed ||
        busy ||
        !original ||
        completed.has(id) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (current ? current.photo.id !== id || current.offset !== offset : offset !== 0)
      )
        throw invalid();
      busy = true;
      try {
        await check();
        if (!current) {
          const photo = await loadPhoto(id);
          await check();
          if (
            photo.id !== id ||
            photo.fileName !== original.fileName ||
            photo.mimeType !== original.mimeType ||
            !(photo.bytes instanceof Uint8Array) ||
            photo.bytes.byteLength !== original.byteSize
          )
            throw invalid();
          current = { photo, offset: 0 };
        }
        await check();
        const bytes = current.photo.bytes.subarray(offset, offset + listingPhotoChunkBytes),
          next = offset + bytes.byteLength;
        const chunk = {
          id,
          fileName: original.fileName,
          mimeType: original.mimeType,
          byteSize: original.byteSize,
          offset,
          data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
          done: next === original.byteSize,
        };
        current.offset = next;
        if (chunk.done) {
          completed.add(id);
          current = undefined;
        }
        return chunk;
      } finally {
        busy = false;
      }
    },
  };
}

/** Der Browser setzt ausschließlich vollständig bestätigte Teile desselben Originals zusammen. */
export async function receiveVintedListingPhoto(
  original: Original,
  readChunk: (id: string, offset: number) => Promise<unknown>,
): Promise<MarketplaceListingPhoto> {
  if (!validOriginal(original)) throw invalid();
  const bytes = new Uint8Array(original.byteSize);
  let offset = 0;
  while (offset < original.byteSize) {
    const input = await readChunk(original.id, offset);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
    const chunk = input as Record<string, unknown>;
    if (
      Object.keys(chunk).length !== 7 ||
      Object.keys(chunk).some(
        (key) =>
          !['id', 'fileName', 'mimeType', 'byteSize', 'offset', 'data', 'done'].includes(key),
      ) ||
      chunk['id'] !== original.id ||
      chunk['fileName'] !== original.fileName ||
      chunk['mimeType'] !== original.mimeType ||
      chunk['byteSize'] !== original.byteSize ||
      chunk['offset'] !== offset ||
      typeof chunk['data'] !== 'string' ||
      chunk['data'].length > Math.ceil(listingPhotoChunkBytes / 3) * 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(chunk['data']) ||
      typeof chunk['done'] !== 'boolean'
    )
      throw invalid();
    const part = Buffer.from(chunk['data'], 'base64'),
      expected = Math.min(listingPhotoChunkBytes, original.byteSize - offset);
    if (
      part.byteLength !== expected ||
      part.toString('base64') !== chunk['data'] ||
      chunk['done'] !== (offset + expected === original.byteSize)
    )
      throw invalid();
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return { id: original.id, fileName: original.fileName, mimeType: original.mimeType, bytes };
}

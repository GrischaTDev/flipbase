import { validateKleinanzeigenPhoto } from '../_shared/kleinanzeigen-photo.ts';
import {
  isVintedTransferPhotoUrl,
  parseVintedTransferSource,
} from '../_shared/kleinanzeigen-listing-validation.mts';
import type { VintedTransferSource } from '../_shared/kleinanzeigen-listing-contracts.ts';
export async function readVintedTransferSource(adapter: {
  authorize(): Promise<{ externalAccountId: string; externalId: string }>;
  load(): Promise<unknown>;
}): Promise<VintedTransferSource> {
  const before = await adapter.authorize();
  const source = parseVintedTransferSource(
    await adapter.load(),
    before.externalAccountId,
    before.externalId,
  );
  if (!source)
    throw new Error('Die vollständige eigene Vinted-Quelle konnte nicht bestätigt werden.');
  const after = await adapter.authorize();
  if (
    after.externalAccountId !== before.externalAccountId ||
    after.externalId !== before.externalId
  )
    throw new Error('Die Quellzuordnung hat sich geändert.');
  return source;
}
const limit = 12 * 1024 * 1024;
export async function downloadVintedTransferPhoto(
  url: string,
  request: typeof fetch = fetch,
): Promise<{
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: string;
}> {
  if (!isVintedTransferPhotoUrl(url))
    throw new Error('Die Vinted-Bildquelle ist nicht freigegeben.');
  const response = await request(url, {
    method: 'GET',
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(20000),
  });
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (
    !response.ok ||
    !response.body ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? '') ||
    Number(response.headers.get('content-length') ?? '0') > limit
  )
    throw new Error('Das Quellbild ist nicht verfügbar oder ungeeignet.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Das Quellbild überschreitet 12 MB.');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  const photo = validateKleinanzeigenPhoto(bytes, mime ?? '');
  return { bytes, ...photo };
}

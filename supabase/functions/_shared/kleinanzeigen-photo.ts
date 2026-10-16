export type KleinanzeigenPhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';
export function validateKleinanzeigenPhoto(
  bytes: Uint8Array,
  mimeType: string,
): { readonly mimeType: KleinanzeigenPhotoMime; readonly extension: 'jpg' | 'png' | 'webp' } {
  if (bytes.byteLength < 1 || bytes.byteLength > 12582912)
    throw new Error('Bildgröße nicht zulässig.');
  const jpeg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const webp =
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  if (!(
    (mimeType === 'image/jpeg' && jpeg) ||
    (mimeType === 'image/png' && png) ||
    (mimeType === 'image/webp' && webp)
  ))
    throw new Error('Der Bildinhalt passt nicht zum Dateiformat.');
  return {
    mimeType: mimeType as KleinanzeigenPhotoMime,
    extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp',
  };
}
export async function kleinanzeigenPhotoSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

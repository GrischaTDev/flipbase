/**
 * Containerformate, aus denen Metadaten gelesen werden koennen.
 *
 * `heif` fasst HEIC und AVIF zusammen - beides ist ISOBMFF und wird von
 * `exifr` ueber denselben Weg gelesen.
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'tiff' | 'heif' | 'unknown';

/**
 * Bestimmt das Format an den ersten Bytes, **nicht** an Dateiendung oder
 * MIME-Typ. Beides kann falsch sein: Ein von WhatsApp gespeichertes Bild
 * heisst gern `.jpg` und ist ein PNG, und `file.type` ist bei Dateien aus
 * manchen Quellen schlicht leer.
 */
export function detectFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';

  if (matchesText(bytes, 0, 'RIFF') && matchesText(bytes, 8, 'WEBP')) return 'webp';

  if (matches(bytes, 0, [0x49, 0x49, 0x2a, 0x00])) return 'tiff';
  if (matches(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';

  if (isHeif(bytes)) return 'heif';

  return 'unknown';
}

/**
 * ISOBMFF (HEIC/AVIF). Entscheidend ist die Liste der **kompatiblen Marken**
 * ab Byte 16, nicht die Hauptmarke ab Byte 8 - so macht es auch `exifr`.
 * Gemessen: Eine Datei mit Hauptmarke `avif`, die `avif` nicht in der Liste
 * fuehrt, lehnt `exifr` mit "Unknown file format" ab. Wuerde hier nur die
 * Hauptmarke geprueft, meldete die Anzeige ein lesbares Format und der
 * Lesevorgang schluege danach fehl.
 */
function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 20) return false;
  if (!matchesText(bytes, 4, 'ftyp')) return false;

  const boxLength = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  const end = Math.min(boxLength, bytes.length);

  for (let offset = 16; offset + 4 <= end; offset += 4) {
    const brand = readText(bytes, offset, 4);
    if (brand === 'heic' || brand === 'avif') return true;
  }

  return false;
}

function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function matchesText(bytes: Uint8Array, offset: number, text: string): boolean {
  return readText(bytes, offset, text.length) === text;
}

function readText(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return '';
  let result = '';
  for (let index = 0; index < length; index += 1)
    result += String.fromCharCode(bytes[offset + index]);
  return result;
}

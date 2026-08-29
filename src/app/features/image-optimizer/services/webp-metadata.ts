/**
 * Liest die Metadaten-Chunks aus einer WebP-Datei.
 *
 * `exifr` kann WebP **nicht** - die Bibliothek bringt Parser fuer JPEG, PNG,
 * TIFF und HEIF mit, sonst nichts; eine WebP-Datei quittiert sie mit
 * "Unknown file format" (gemessen). WebP legt EXIF aber als rohen TIFF-Block
 * in einem RIFF-Chunk ab. Den holen wir hier heraus und reichen ihn als
 * TIFF-Datei an `exifr` weiter - so bleibt die Auswertung der Felder an einer
 * einzigen Stelle.
 */
export interface WebpMetadataChunks {
  /** Roher TIFF-Block aus dem `EXIF`-Chunk. */
  readonly exif: Uint8Array | null;
  /** Inhalt des `XMP `-Chunks als Text. */
  readonly xmp: string | null;
  /** Ein `C2PA`-Chunk liegt vor. Nur festgestellt, nicht geprueft. */
  readonly hasContentCredential: boolean;
}

const EMPTY: WebpMetadataChunks = { exif: null, xmp: null, hasContentCredential: false };

const HEADER_SIZE = 12;
const FOURCC_SIZE = 4;
const LENGTH_SIZE = 4;

/**
 * Der Aufrufer muss die **ganze** Datei uebergeben, nicht nur den Anfang:
 * Laut WebP-Spezifikation stehen `EXIF` und `XMP ` hinter den Bilddaten.
 */
export function readWebpChunks(bytes: Uint8Array): WebpMetadataChunks {
  if (!isWebp(bytes)) return EMPTY;

  let exif: Uint8Array | null = null;
  let xmp: string | null = null;
  let hasContentCredential = false;

  let offset = HEADER_SIZE;

  while (offset + FOURCC_SIZE + LENGTH_SIZE <= bytes.length) {
    const name = readText(bytes, offset, FOURCC_SIZE);
    const length = readUint32LittleEndian(bytes, offset + FOURCC_SIZE);
    const start = offset + FOURCC_SIZE + LENGTH_SIZE;

    // Eine Laengenangabe, die ueber das Dateiende hinauszeigt, bedeutet eine
    // abgeschnittene oder kaputte Datei. Dann lieber abbrechen als raten.
    if (length > bytes.length - start) break;

    if (name === 'EXIF' && !exif) exif = bytes.slice(start, start + length);
    else if (name === 'XMP ' && xmp === null) xmp = decodeUtf8(bytes.slice(start, start + length));
    else if (name === 'C2PA') hasContentCredential = true;

    // Chunks ungerader Laenge werden auf gerade Laenge aufgefuellt.
    const advance = FOURCC_SIZE + LENGTH_SIZE + length + (length % 2);
    if (advance <= 0) break;
    offset += advance;
  }

  return { exif, xmp, hasContentCredential };
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= HEADER_SIZE &&
    readText(bytes, 0, 4) === 'RIFF' &&
    readText(bytes, 8, 4) === 'WEBP'
  );
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readText(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return '';
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += String.fromCharCode(bytes[offset + index]);
  }
  return result;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * Holt `DigitalSourceType` aus rohem XMP.
 *
 * Nur fuer WebP noetig: Dort kommt das XMP als Textblock aus dem Chunk, waehrend
 * `exifr` es bei den uebrigen Formaten selbst auswertet. XMP erlaubt beide
 * Schreibweisen - als Attribut und als eigenes Element -, deshalb werden beide
 * beruecksichtigt. Der Namensraumpraefix ist bewusst offen: Er ist frei
 * waehlbar, `Iptc4xmpExt` ist nur die uebliche Wahl.
 */
export function readDigitalSourceType(xmp: string): string | null {
  const attribute = /(?:^|[\s:])DigitalSourceType\s*=\s*"([^"]*)"/.exec(xmp);
  if (attribute?.[1]?.trim()) return attribute[1].trim();

  const element = /<[\w.-]+:DigitalSourceType[^>]*>([^<]*)</.exec(xmp);
  if (element?.[1]?.trim()) return element[1].trim();

  return null;
}

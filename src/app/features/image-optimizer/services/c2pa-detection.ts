const START_OF_IMAGE = 0xd8;
const APP11 = 0xeb;
const START_OF_SCAN = 0xda;

/**
 * Stellt fest, ob eine **JPEG**-Datei einen C2PA-Herkunftsnachweis traegt.
 *
 * Bewusst **nur Feststellung, keine Pruefung**: Ob die Signatur gueltig ist
 * und von wem sie stammt, beantwortet dieser Code nicht. Die offizielle
 * Bibliothek dafuer ist WASM-basiert und mehrere hundert Kilobyte gross -
 * fuer die Aussage "ein Nachweis liegt vor" waere das unverhaeltnismaessig.
 *
 * Gesucht wird ueber die Segmentstruktur, nicht ueber die ganze Datei: Ein
 * Dateiname oder ein Kommentar koennte die Zeichenfolge `c2pa` sonst
 * faelschlich ausloesen.
 */
export function hasJpegContentCredential(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== START_OF_IMAGE) return false;

  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;

    const marker = bytes[offset + 1];
    // Ab dem Bilddatenstrom gibt es keine Segmente mehr, die uns betreffen.
    if (marker === START_OF_SCAN) return false;

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return false;

    const payloadStart = offset + 4;
    const payloadEnd = payloadStart + length - 2;
    if (payloadEnd > bytes.length) return false;

    if (marker === APP11 && containsC2paLabel(bytes, payloadStart, payloadEnd)) return true;

    offset = payloadEnd;
  }

  return false;
}

/** Sucht die Kennung `c2pa` innerhalb eines APP11-Nutzdatenbereichs. */
function containsC2paLabel(bytes: Uint8Array, start: number, end: number): boolean {
  const label = [0x63, 0x32, 0x70, 0x61]; // "c2pa"

  for (let index = start; index + label.length <= end; index++) {
    let matches = true;
    for (let offset = 0; offset < label.length; offset++) {
      if (bytes[index + offset] !== label[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Stellt fest, ob eine **PNG**-Datei einen C2PA-Herkunftsnachweis traegt.
 *
 * In PNG liegt das Manifest in einem eigenen Chunk namens `caBX`. Wie bei
 * JPEG wird ueber die Chunk-Struktur gesucht und nicht ueber die ganze Datei:
 * Ein Dateiname oder ein Textchunk koennte die Zeichenfolge sonst faelschlich
 * ausloesen.
 */
export function hasPngContentCredential(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }

  let offset = PNG_SIGNATURE.length;

  // Chunk: 4 Byte Laenge, 4 Byte Name, Daten, 4 Byte Pruefsumme.
  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0;

    let name = '';
    for (let index = 0; index < 4; index += 1) {
      name += String.fromCharCode(bytes[offset + 4 + index]);
    }

    if (name === 'caBX') return true;
    if (name === 'IEND') return false;

    // Eine Laengenangabe hinter dem Dateiende heisst: abgeschnitten oder
    // kaputt. Dann abbrechen statt weiterzuraten.
    const next = offset + 8 + length + 4;
    if (length > bytes.length || next <= offset) return false;
    offset = next;
  }

  return false;
}

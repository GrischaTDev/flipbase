import { toExifDateTime } from './capture-date';

/**
 * Schreibt ein minimales EXIF-Segment mit dem Aufnahmedatum in eine
 * JPEG-Datei.
 *
 * Warum von Hand und nicht mit einer Bibliothek: Gebraucht werden drei feste
 * Tags mit festem Aufbau. `piexifjs` und Verwandte bringen einen
 * vollstaendigen Leser und Schreiber fuer alles mit, wovon hier nichts
 * benutzt wird, und wuerden den nachgeladenen Teil des Bildoptimierers ohne
 * Gegenwert vergroessern. Dasselbe Vorgehen wie bei `webp-metadata.ts` und
 * `c2pa-detection.ts`.
 *
 * Absichtlich **nur** `Uint8Array` in und aus: So laeuft der ganze Baustein
 * ohne Browser und wird als reiner Node-Test geprueft.
 */

const ASCII = 2;
const LONG = 4;

/** 19 Zeichen plus Abschluss-Null. Die Laenge ist in EXIF festgelegt. */
const DATE_BYTES = 20;

const TAG_DATE_TIME = 0x0132;
const TAG_EXIF_POINTER = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;

/** Offsets im TIFF-Block. Siehe Tabelle im Plan. */
const IFD0_AT = 8;
const DATE_TIME_AT = 38;
const EXIF_IFD_AT = 58;
const ORIGINAL_AT = 88;
const DIGITIZED_AT = 108;
const TIFF_BYTES = 128;

class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(length: number) {
    this.bytes = new Uint8Array(length);
    this.view = new DataView(this.bytes.buffer);
  }

  u16(offset: number, value: number): void {
    this.view.setUint16(offset, value, false);
  }

  u32(offset: number, value: number): void {
    this.view.setUint32(offset, value, false);
  }

  ascii(offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
      this.bytes[offset + i] = value.charCodeAt(i) & 0x7f;
    }
    // Der Rest bleibt null - das ist zugleich der Abschluss.
  }

  /** Ein Verzeichniseintrag: Tag, Typ, Anzahl, Wert oder Wertoffset. */
  entry(offset: number, tag: number, type: number, count: number, value: number): void {
    this.u16(offset, tag);
    this.u16(offset + 2, type);
    this.u32(offset + 4, count);
    this.u32(offset + 8, value);
  }
}

/** Das vollstaendige APP1-Segment einschliesslich Kennzeichen. Immer 138 Byte. */
export function buildDateExif(captured: Date): Uint8Array {
  const stamp = toExifDateTime(captured);
  const tiff = new Writer(TIFF_BYTES);

  tiff.ascii(0, 'MM');
  tiff.u16(2, 0x002a);
  tiff.u32(4, IFD0_AT);

  tiff.u16(IFD0_AT, 2);
  tiff.entry(IFD0_AT + 2, TAG_DATE_TIME, ASCII, DATE_BYTES, DATE_TIME_AT);
  tiff.entry(IFD0_AT + 14, TAG_EXIF_POINTER, LONG, 1, EXIF_IFD_AT);
  tiff.u32(IFD0_AT + 26, 0);
  tiff.ascii(DATE_TIME_AT, stamp);

  tiff.u16(EXIF_IFD_AT, 2);
  tiff.entry(EXIF_IFD_AT + 2, TAG_DATE_TIME_ORIGINAL, ASCII, DATE_BYTES, ORIGINAL_AT);
  tiff.entry(EXIF_IFD_AT + 14, TAG_DATE_TIME_DIGITIZED, ASCII, DATE_BYTES, DIGITIZED_AT);
  tiff.u32(EXIF_IFD_AT + 26, 0);
  tiff.ascii(ORIGINAL_AT, stamp);
  tiff.ascii(DIGITIZED_AT, stamp);

  // FFE1 + Laengenfeld + "Exif\0\0" + TIFF-Block.
  const segment = new Writer(2 + 2 + 6 + TIFF_BYTES);
  segment.u16(0, 0xffe1);
  // Das Laengenfeld zaehlt sich selbst mit, das Kennzeichen davor nicht.
  segment.u16(2, 2 + 6 + TIFF_BYTES);
  segment.ascii(4, 'Exif');
  segment.bytes.set(tiff.bytes, 10);

  return segment.bytes;
}

/** Ob an dieser Stelle ein APP1-Segment mit Exif-Kennung beginnt. */
function isExifSegment(jpeg: Uint8Array, offset: number): boolean {
  return (
    jpeg[offset + 4] === 0x45 && // E
    jpeg[offset + 5] === 0x78 && // x
    jpeg[offset + 6] === 0x69 && // i
    jpeg[offset + 7] === 0x66 && // f
    jpeg[offset + 8] === 0x00
  );
}

/**
 * Setzt das Segment direkt hinter den Dateianfang und entfernt dabei ein
 * bereits vorhandenes EXIF-Segment.
 *
 * Zwei EXIF-Segmente in einer Datei sind unzulaessig; Leseprogramme nehmen
 * dann willkuerlich eines davon. Der Rueckgabewert ist deshalb nie laenger
 * als noetig.
 *
 * Ist die Eingabe kein JPEG, kommt sie unveraendert zurueck. Lieber gar kein
 * Datum als eine zerstoerte Datei.
 */
export function withExif(jpeg: Uint8Array, app1: Uint8Array): Uint8Array {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  const keep: (readonly [number, number])[] = [];
  let offset = 2;

  // Die Segmente vor dem Bilddatenstrom durchgehen. Ab SOS (FFDA) stehen
  // Bilddaten, in denen FF kein Kennzeichen mehr ist - dort wird abgebrochen
  // und der Rest unveraendert uebernommen.
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;

    const length = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
    if (length < 2) break;
    const end = offset + 2 + length;
    if (end > jpeg.length) break;

    if (!(marker === 0xe1 && isExifSegment(jpeg, offset))) {
      keep.push([offset, end] as const);
    }
    offset = end;
  }

  const kept = keep.reduce((sum, [from, to]) => sum + (to - from), 0);
  const result = new Uint8Array(2 + app1.length + kept + (jpeg.length - offset));

  let at = 0;
  result.set(jpeg.subarray(0, 2), at);
  at += 2;
  result.set(app1, at);
  at += app1.length;
  for (const [from, to] of keep) {
    result.set(jpeg.subarray(from, to), at);
    at += to - from;
  }
  result.set(jpeg.subarray(offset), at);

  return result;
}

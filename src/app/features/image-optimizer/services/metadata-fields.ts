/** Ein Eintrag aus der Datei, fertig zum Anzeigen. */
export interface MetadataField {
  /** Roher Tag-Name - eindeutig, dient als Schluessel in der Liste. */
  readonly key: string;
  /** Deutsche Beschriftung, sonst der rohe Tag-Name. */
  readonly label: string;
  readonly value: string;
}

/**
 * Deutsche Beschriftungen fuer die Tags, die im Alltag vorkommen. Alles
 * andere behaelt seinen rohen Namen - lieber ein technischer Bezeichner als
 * eine erfundene Uebersetzung, die etwas anderes suggeriert als sie meint.
 */
const LABELS: Record<string, string> = {
  ImageDescription: 'Bildbeschreibung',
  ObjectName: 'Titel',
  Caption: 'Bildunterschrift',
  Headline: 'Schlagzeile',
  Keywords: 'Stichwörter',
  Byline: 'Urheber',
  Artist: 'Urheber',
  Credit: 'Bildnachweis',
  CopyrightNotice: 'Copyright',
  Copyright: 'Copyright',
  Make: 'Kamerahersteller',
  Model: 'Kameramodell',
  LensMake: 'Objektivhersteller',
  LensModel: 'Objektiv',
  HostComputer: 'Aufnahmegerät',
  DateTimeOriginal: 'Aufnahmedatum',
  CreateDate: 'Erstellt am',
  ModifyDate: 'Geändert am',
  DateCreated: 'Erstellt am',
  Software: 'Software',
  ExposureTime: 'Belichtungszeit',
  FNumber: 'Blende',
  ISO: 'ISO',
  FocalLength: 'Brennweite',
  FocalLengthIn35mmFormat: 'Brennweite (Kleinbild)',
  Flash: 'Blitz',
  ExposureProgram: 'Belichtungsprogramm',
  ExposureMode: 'Belichtungsmodus',
  MeteringMode: 'Messmethode',
  WhiteBalance: 'Weißabgleich',
  Orientation: 'Ausrichtung',
  ColorSpace: 'Farbraum',
  ImageWidth: 'Breite',
  ImageHeight: 'Höhe',
  ExifImageWidth: 'Breite (EXIF)',
  ExifImageHeight: 'Höhe (EXIF)',
  XResolution: 'Auflösung waagerecht',
  YResolution: 'Auflösung senkrecht',
  ResolutionUnit: 'Auflösungseinheit',
  UserComment: 'Kommentar',
  Rating: 'Bewertung',
  GPSAltitude: 'GPS-Höhe',
  GPSDateStamp: 'GPS-Datum',
  DigitalSourceType: 'Angegebene Herkunft',
};

/**
 * Reihenfolge nach Nutzen: Was das Bild zeigt und wem es gehoert zuerst, dann
 * Geraet und Aufnahme, dann die Technik. Alles Uebrige folgt alphabetisch.
 */
const PRIORITY: readonly string[] = [
  'ImageDescription',
  'ObjectName',
  'Caption',
  'Headline',
  'Keywords',
  'Byline',
  'Artist',
  'Credit',
  'CopyrightNotice',
  'Copyright',
  'Make',
  'Model',
  'LensMake',
  'LensModel',
  'HostComputer',
  'DateTimeOriginal',
  'CreateDate',
  'ModifyDate',
  'DateCreated',
  'Software',
  'ExposureTime',
  'FNumber',
  'ISO',
  'FocalLength',
  'FocalLengthIn35mmFormat',
  'Flash',
];

/**
 * `errors` ist exifrs eigener Fehlerkanal, kein Feld aus der Datei.
 * `latitude`/`longitude` sind von exifr abgeleitete Werte und stehen bereits
 * im hervorgehobenen Standort-Hinweis - die rohen GPS-Tags bleiben dagegen
 * in der Liste.
 */
const SKIP = new Set(['errors', 'latitude', 'longitude']);

/**
 * Genormte Aufzaehlungen, die `exifr` als blosse Zahl durchreicht. "Farbraum:
 * 1" sagt niemandem etwas, "sRGB" schon. Bewusst nur diese drei: Sie sind in
 * EXIF bzw. JFIF eindeutig festgelegt. Ein unbekannter Wert bleibt die rohe
 * Zahl, statt eine Bedeutung zu erfinden.
 */
const ENUMS: Record<string, Record<number, string>> = {
  ColorSpace: { 1: 'sRGB', 2: 'Adobe RGB', 65535: 'nicht kalibriert' },
  ResolutionUnit: { 1: 'ohne Einheit', 2: 'Zoll', 3: 'Zentimeter' },
};

/** Ab hier ist eine Bytefolge kein Wert mehr, sondern eingebettete Bilddaten. */
const MAX_BINARY_LENGTH = 8;
const MAX_TEXT_LENGTH = 300;
const MAX_LIST_ENTRIES = 12;

/**
 * Macht aus der rohen Ausgabe von `exifr` eine vollstaendige, anzeigbare
 * Liste. Bewusst **keine** Auswahl bestimmter Felder: Wer wissen will, was in
 * seiner Datei steckt, will alles sehen und nicht das, was jemand anderes fuer
 * wichtig hielt.
 */
export function toFields(raw: Record<string, unknown>): readonly MetadataField[] {
  const fields: MetadataField[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (SKIP.has(key)) continue;
    const formatted = formatFor(key, value);
    if (formatted === null) continue;
    fields.push({ key, label: LABELS[key] ?? key, value: formatted });
  }

  return fields.sort(compare);
}

function compare(a: MetadataField, b: MetadataField): number {
  const rankA = PRIORITY.indexOf(a.key);
  const rankB = PRIORITY.indexOf(b.key);
  if (rankA !== -1 && rankB !== -1) return rankA - rankB;
  if (rankA !== -1) return -1;
  if (rankB !== -1) return 1;
  return a.label.localeCompare(b.label, 'de');
}

/** Erst die genormten Sonderfaelle, dann die allgemeine Formatierung. */
function formatFor(key: string, value: unknown): string | null {
  if (typeof value === 'number') {
    const named = ENUMS[key]?.[value];
    if (named) return named;
    // JFIF speichert die Version als zwei Bytes in einer Zahl: 0x0101 = 1.1.
    if (key === 'JFIFVersion' && Number.isInteger(value)) {
      return `${(value >> 8) & 0xff}.${value & 0xff}`;
    }
  }
  return format(value);
}

/** `null` heisst: nicht darstellbar oder leer, gehoert nicht in die Liste. */
function format(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toLocaleString('de-DE');
  }

  if (typeof value === 'boolean') return value ? 'ja' : 'nein';

  if (typeof value === 'number') return formatNumber(value);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return trimmed.length > MAX_TEXT_LENGTH ? `${trimmed.slice(0, MAX_TEXT_LENGTH)}…` : trimmed;
  }

  // Kurze Bytefolgen wie GPSAltitudeRef tragen eine echte Aussage. Eine
  // eingebettete Miniaturansicht sind Tausende Bytes - die waeren als
  // Zahlenkolonne nur Laerm.
  if (ArrayBuffer.isView(value)) {
    const bytes = value as unknown as ArrayLike<number>;
    if (bytes.length === 0 || bytes.length > MAX_BINARY_LENGTH) return null;
    return Array.from(bytes).join(', ');
  }

  if (Array.isArray(value)) return formatList(value);

  return null;
}

function formatList(values: readonly unknown[]): string | null {
  if (values.length === 0) return null;

  const parts: string[] = [];
  for (const entry of values.slice(0, MAX_LIST_ENTRIES)) {
    if (typeof entry === 'number') parts.push(formatNumber(entry));
    else if (typeof entry === 'string' && entry.trim() !== '') parts.push(entry.trim());
    else return null;
  }

  if (parts.length === 0) return null;
  return values.length > MAX_LIST_ENTRIES ? `${parts.join(', ')}, …` : parts.join(', ');
}

/** Deutsches Dezimalkomma; lange Nachkommastellen werden gekuerzt. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4))).replace('.', ',');
}

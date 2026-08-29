import { Injectable } from '@angular/core';
import {
  AiProvenance,
  ContentCredentialState,
  ImageMetadata,
  pendingMetadata,
} from '../models/image-metadata';
import { hasJpegContentCredential, hasPngContentCredential } from './c2pa-detection';
import { detectFormat, ImageFormat } from './image-format';
import { readDigitalSourceType, readWebpChunks } from './webp-metadata';

/**
 * `pick` (Filterung nach einzelnen Feldnamen) wurde ausprobiert und funktioniert
 * hier nicht: GPS-Koordinaten (`latitude`/`longitude`) sind abgeleitete Werte,
 * die `exifr` erst berechnet, wenn die rohen `GPSLatitude`/`GPSLongitude`-Tags
 * durchgelassen wurden - `pick` filtert aber nur die rohen Tags, nicht die
 * abgeleiteten. Und XMP (fuer `DigitalSourceType`) wird ganz uebersprungen,
 * wenn es nicht per Segment aktiviert ist. Deshalb werden hier ganze Segmente
 * aktiviert statt einzelner Felder. Bitte nicht wieder auf `pick` "aufraeumen" -
 * das wurde gemessen und bringt GPS und XMP zum Verschwinden.
 * (`ifd0` fehlt bewusst: laut den exifr-Typen kann dieses Segment nicht
 * abgeschaltet werden, es wird also immer mitgelesen.)
 */
const PARSE_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  xmp: true,
  iptc: false,
  icc: false,
  jfif: false,
  ihdr: false,
};

/** Reicht fuer jede Formatsignatur - die laengste braucht 20 Byte. */
const SIGNATURE_BYTES = 32;

/**
 * Fuer die Suche nach dem Herkunftsnachweis. Bei JPEG stehen die APP-Segmente
 * vor dem Bilddatenstrom, bei PNG steht der `caBX`-Chunk vor den Bilddaten -
 * beides liegt also im Dateikopf. Bei vielen gleichzeitig hochgeladenen Fotos
 * verhindert die Grenze einen Speicher-Peak in Hoehe der Gesamtgroesse.
 */
const HEADER_BYTES = 2 * 1024 * 1024;

/**
 * Kapselt `exifr` vollstaendig. Kein anderer Teil des Codes kennt die
 * Bibliothek - waere sie eines Tages zu ersetzen, betrifft das nur diese
 * Datei.
 */
@Injectable({ providedIn: 'root' })
export class MetadataReaderService {
  /**
   * Liest die Metadaten einer Datei.
   *
   * Wirft **nie**. Die Metadaten sind eine Zusatzinformation; ihr Fehlen darf
   * die Arbeit am Bild nicht unterbrechen. Jeder Fehlschlag wird zu `failed`.
   */
  async read(file: File): Promise<ImageMetadata> {
    const base = pendingMetadata();

    try {
      const signature = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
      const format = detectFormat(signature);

      if (format === 'unknown') return { ...base, status: 'unsupported' };

      // Dynamischer Import: `exifr` (nur wegen XMP-Parser die volle "full"-Variante)
      // wandert dadurch in einen eigenen Chunk, der erst beim tatsaechlichen Lesen
      // nachgeladen wird. So bleibt der Editor-Chunk innerhalb seines Budgets.
      // Bitte nicht zu einem statischen Import "aufraeumen".
      const { default: exifr } = await import('exifr');

      // WebP kann `exifr` nicht - gemessen, die Bibliothek quittiert es mit
      // "Unknown file format". Die Chunks holen wir selbst heraus und reichen
      // den darin liegenden rohen TIFF-Block an `exifr` weiter.
      if (format === 'webp') {
        // Ganze Datei: Laut WebP-Spezifikation stehen `EXIF` und `XMP `
        // **hinter** den Bilddaten. Wer nur den Kopf liest, findet sie nie.
        const all = new Uint8Array(await file.arrayBuffer());
        const chunks = readWebpChunks(all);
        const raw = chunks.exif
          ? ((await exifr.parse(chunks.exif, PARSE_OPTIONS)) ?? {})
          : ({} as Record<string, unknown>);

        return {
          ...fieldsFrom(raw),
          status: 'read',
          ai: {
            contentCredential: chunks.hasContentCredential ? 'present' : 'absent',
            declaredSource: chunks.xmp ? readDigitalSourceType(chunks.xmp) : null,
          },
        };
      }

      // Wenn exifr nichts Brauchbares findet, liefert es `{ errors: [...] }`
      // statt eines echten Feldes zurueck - das ist "geprueft und leer", kein
      // Fehlschlag. `errors` selbst ist kein Metadatenfeld und darf nirgends
      // als eines gelesen werden.
      const raw = (await exifr.parse(file, PARSE_OPTIONS)) ?? {};
      const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());

      return {
        ...fieldsFrom(raw),
        status: 'read',
        ai: {
          contentCredential: credentialState(format, header),
          declaredSource: declaredSourceFrom(raw),
        },
      };
    } catch {
      // Bewusst kein Fehlerpfad nach aussen - siehe Kommentar oben.
      return { ...base, status: 'failed' };
    }
  }
}

/**
 * Wo der Nachweis nicht gesucht wird, wird das auch gesagt. "Nicht gefunden"
 * waere hier eine Behauptung ueber etwas, wonach niemand gesehen hat.
 */
function credentialState(format: ImageFormat, header: Uint8Array): ContentCredentialState {
  if (format === 'jpeg') return hasJpegContentCredential(header) ? 'present' : 'absent';
  if (format === 'png') return hasPngContentCredential(header) ? 'present' : 'absent';
  return 'unchecked';
}

/** Die Felder, die aus jedem Format gleich gelesen werden. */
function fieldsFrom(raw: Record<string, unknown>): Omit<ImageMetadata, 'status' | 'ai'> {
  return {
    gps: readGps(raw),
    cameraMake: text(raw['Make']),
    cameraModel: text(raw['Model']),
    capturedAt: readDate(raw),
    software: text(raw['Software']),
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Nur wenn beide Werte da sind - ein halber Koordinatensatz ist keiner. */
function readGps(raw: Record<string, unknown>): ImageMetadata['gps'] {
  const latitude = raw['latitude'];
  const longitude = raw['longitude'];
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  return { latitude, longitude };
}

function readDate(raw: Record<string, unknown>): string | null {
  const value = raw['DateTimeOriginal'] ?? raw['CreateDate'];
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

/**
 * `exifr` liefert das XMP-Feld als `DigitalSourceType` (grosses D) -
 * `digitalSourceType` wird zusaetzlich akzeptiert, kommt aber in der Praxis
 * von der Bibliothek nicht vor.
 */
function declaredSourceFrom(raw: Record<string, unknown>): AiProvenance['declaredSource'] {
  return text(raw['DigitalSourceType'] ?? raw['digitalSourceType']);
}

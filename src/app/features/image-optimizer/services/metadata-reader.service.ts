import { Injectable } from '@angular/core';
import { AiProvenance, ImageMetadata, pendingMetadata } from '../models/image-metadata';
import { hasContentCredential } from './c2pa-detection';

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

    if (!isJpeg(file)) return { ...base, status: 'unsupported' };

    try {
      // Dynamischer Import: `exifr` (nur wegen XMP-Parser die volle "full"-Variante)
      // wandert dadurch in einen eigenen Chunk, der erst beim tatsaechlichen Lesen
      // nachgeladen wird. So bleibt der Editor-Chunk innerhalb seines Budgets.
      // Bitte nicht zu einem statischen Import "aufraeumen".
      const { default: exifr } = await import('exifr');
      const raw = (await exifr.parse(file, PARSE_OPTIONS)) ?? {};
      // Wenn exifr nichts Brauchbares findet, liefert es `{ errors: [...] }`
      // statt eines echten Feldes zurueck - das ist "geprueft und leer", kein
      // Fehlschlag. `errors` selbst ist kein Metadatenfeld und darf nirgends
      // als eines gelesen werden.
      //
      // Nur die ersten 2 MB werden gelesen, nicht die ganze Datei: Die
      // C2PA-Erkennung (`hasContentCredential`) durchsucht ohnehin nur die
      // APP-Segmente vor dem Bilddatenstrom und bricht bei `START_OF_SCAN`
      // ab - alles, was sie sehen kann, steht im Dateikopf. Bei vielen
      // gleichzeitig hochgeladenen Fotos verhindert das einen Speicher-Peak
      // in Höhe der Gesamtgröße aller Dateien.
      const bytes = new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer());

      return {
        status: 'read',
        gps: readGps(raw),
        cameraMake: text(raw['Make']),
        cameraModel: text(raw['Model']),
        capturedAt: readDate(raw),
        software: text(raw['Software']),
        ai: readAi(raw, bytes),
      };
    } catch {
      // Bewusst kein Fehlerpfad nach aussen - siehe Kommentar oben.
      return { ...base, status: 'failed' };
    }
  }
}

function isJpeg(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return true;
  return /\.(jpe?g)$/i.test(file.name);
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

function readAi(raw: Record<string, unknown>, bytes: Uint8Array): AiProvenance {
  // `exifr` liefert das XMP-Feld als `DigitalSourceType` (grosses D) -
  // `digitalSourceType` wird zusaetzlich akzeptiert, kommt aber in der
  // Praxis von der Bibliothek nicht vor.
  return {
    contentCredential: hasContentCredential(bytes),
    declaredSource: text(raw['DigitalSourceType'] ?? raw['digitalSourceType']),
  };
}

/**
 * Das Aufnahmedatum einer Datei - das einzige Metadatum, das den Export
 * ueberlebt.
 *
 * Warum es ueberhaupt erhalten bleibt: Die Exportdateien landen nicht nur bei
 * der Plattform, sondern auch im eigenen Archiv des Verkaeufers, und dort
 * soll sich nach Aufnahmedatum sortieren lassen. Alles andere - Geraet, Ort,
 * Urheber, Software, Herkunftsnachweis - wird weiterhin entfernt.
 */

/** Reihenfolge der Herkunft: Aufnahme vor Erstellung. */
const KEYS: readonly string[] = ['DateTimeOriginal', 'CreateDate', 'DateCreated'];

/** Kleinster und groesster Jahreswert, den das vierstellige EXIF-Feld tragen kann. */
const MIN_EXIF_YEAR = 1;
const MAX_EXIF_YEAR = 9999;

/**
 * Liest das Aufnahmedatum aus der rohen Ausgabe von `exifr`.
 *
 * `exifr` reicht kaputte Zeitangaben als `Invalid Date` durch. Ein solcher
 * Wert wird zu `null` - lieber gar kein Datum in der Exportdatei als ein
 * falsches. Ebenso ein Jahr ausserhalb von 1-9999: das EXIF-Feld hat dafuer
 * nur vier Stellen, ein solches Datum liesse sich gar nicht schreiben.
 */
export function readCapturedAt(raw: Record<string, unknown>): Date | null {
  for (const key of KEYS) {
    const value = raw[key];
    if (
      value instanceof Date &&
      !Number.isNaN(value.getTime()) &&
      value.getFullYear() >= MIN_EXIF_YEAR &&
      value.getFullYear() <= MAX_EXIF_YEAR
    ) {
      return value;
    }
  }

  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Jahr immer vierstellig, wie Monat, Tag, Stunde, Minute und Sekunde zweistellig. */
function padYear(value: number): string {
  return String(value).padStart(4, '0');
}

/**
 * Das von EXIF vorgeschriebene Textformat `YYYY:MM:DD HH:MM:SS`, in Ortszeit.
 *
 * Liefert durch die Auffuellung von Jahr bis Sekunde immer genau 19 Zeichen -
 * die Feldlaenge im Block ist fest auf 20 Byte gesetzt (19 Zeichen plus
 * Abschluss-Null). Eine abweichende Laenge zerstoert den Aufbau des Segments.
 * Vorausgesetzt wird ein Jahr im Bereich 1-9999 (siehe `readCapturedAt`).
 */
export function toExifDateTime(value: Date): string {
  const date = [padYear(value.getFullYear()), pad(value.getMonth() + 1), pad(value.getDate())].join(
    ':',
  );
  const time = [pad(value.getHours()), pad(value.getMinutes()), pad(value.getSeconds())].join(':');

  return `${date} ${time}`;
}

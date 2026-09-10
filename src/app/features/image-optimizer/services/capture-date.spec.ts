import { describe, it, expect } from 'vitest';
import { readCapturedAt, toExifDateTime } from './capture-date';

describe('Aufnahmedatum aus den rohen Werten lesen', () => {
  const taken = new Date(2026, 4, 17, 9, 5, 3);

  it('nimmt das Aufnahmedatum, wenn es da ist', () => {
    expect(readCapturedAt({ DateTimeOriginal: taken })).toEqual(taken);
  });

  it('weicht auf das Erstelldatum aus', () => {
    expect(readCapturedAt({ CreateDate: taken })).toEqual(taken);
  });

  it('weicht zuletzt auf DateCreated aus', () => {
    expect(readCapturedAt({ DateCreated: taken })).toEqual(taken);
  });

  it('bevorzugt das Aufnahmedatum vor dem Erstelldatum', () => {
    // Das Aufnahmedatum sagt, wann fotografiert wurde. Das Erstelldatum kann
    // von einer spaeteren Bearbeitung stammen.
    const created = new Date(2026, 6, 1, 12, 0, 0);

    expect(readCapturedAt({ DateTimeOriginal: taken, CreateDate: created })).toEqual(taken);
  });

  it('liefert null, wenn kein Datum da ist', () => {
    expect(readCapturedAt({})).toBeNull();
  });

  it('liefert null bei einem ungueltigen Datum', () => {
    // exifr reicht kaputte Zeitangaben als Invalid Date durch. Ein solcher
    // Wert darf nicht als Datum in die Exportdatei wandern.
    expect(readCapturedAt({ DateTimeOriginal: new Date('kaputt') })).toBeNull();
  });

  it('liefert null bei einem Wert, der kein Datum ist', () => {
    expect(readCapturedAt({ DateTimeOriginal: '2026:05:17 09:05:03' })).toBeNull();
  });

  it('liefert null bei einem Jahr ueber 9999', () => {
    // Das EXIF-Feld hat nur vier Stellen fuer das Jahr - ein solches Datum
    // liesse sich gar nicht schreiben.
    const tooLate = new Date(2026, 4, 17, 9, 5, 3);
    tooLate.setFullYear(10000);

    expect(readCapturedAt({ DateTimeOriginal: tooLate })).toBeNull();
  });

  it('liefert null bei einem Jahr unter 1', () => {
    const tooEarly = new Date(2026, 4, 17, 9, 5, 3);
    tooEarly.setFullYear(0);

    expect(readCapturedAt({ DateTimeOriginal: tooEarly })).toBeNull();
  });
});

describe('EXIF-Textformat', () => {
  it('schreibt Datum und Uhrzeit im festgelegten Aufbau', () => {
    expect(toExifDateTime(new Date(2026, 4, 17, 9, 5, 3))).toBe('2026:05:17 09:05:03');
  });

  it('fuellt einstellige Werte auf', () => {
    expect(toExifDateTime(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026:01:02 03:04:05');
  });

  it('ist immer genau 19 Zeichen lang', () => {
    // Die Feldlaenge im EXIF-Block ist fest auf 20 Byte gesetzt - 19 Zeichen
    // plus Abschluss-Null. Eine andere Laenge zerstoert den Aufbau.
    expect(toExifDateTime(new Date(2026, 11, 31, 23, 59, 59))).toHaveLength(19);
  });

  it('fuellt ein Jahr unter 1000 auf vier Stellen auf', () => {
    // new Date(...) bildet Jahre 0-99 auf 1900-1999 ab, deshalb ueber
    // setFullYear ein echtes dreistelliges Jahr erzeugen.
    const date = new Date(2026, 4, 17, 9, 5, 3);
    date.setFullYear(7);

    expect(toExifDateTime(date)).toBe('0007:05:17 09:05:03');
    expect(toExifDateTime(date)).toHaveLength(19);
  });

  it('bleibt bei einem Jahr von 9999 genau 19 Zeichen lang', () => {
    const date = new Date(2026, 4, 17, 9, 5, 3);
    date.setFullYear(9999);

    expect(toExifDateTime(date)).toBe('9999:05:17 09:05:03');
    expect(toExifDateTime(date)).toHaveLength(19);
  });
});

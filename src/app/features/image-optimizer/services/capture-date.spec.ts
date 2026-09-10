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
});

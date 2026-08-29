import { describe, expect, it } from 'vitest';
import { toFields } from './metadata-fields';

const labels = (raw: Record<string, unknown>) => toFields(raw).map((f) => f.label);
const values = (raw: Record<string, unknown>) =>
  Object.fromEntries(toFields(raw).map((f) => [f.key, f.value]));

describe('Metadatenfelder auflisten', () => {
  it('nimmt jeden Eintrag mit, nicht nur eine Auswahl', () => {
    const raw = { Make: 'Apple', ISO: 400, LensModel: 'Weitwinkel', Keywords: 'sneaker' };

    expect(toFields(raw)).toHaveLength(4);
  });

  it('uebersetzt bekannte Tags und laesst unbekannte stehen', () => {
    const raw = { Make: 'Apple', ShutterSpeedValue: 7 };

    expect(labels(raw)).toEqual(['Kamerahersteller', 'ShutterSpeedValue']);
  });

  // Reihenfolge nach Nutzen: Was das Bild zeigt und wem es gehoert zuerst,
  // Aufnahmetechnik danach, alles Uebrige alphabetisch.
  it('stellt die aussagekraeftigen Felder nach vorn', () => {
    const raw = {
      ZZZUnbekannt: 1,
      ISO: 400,
      Make: 'Apple',
      Byline: 'Grischa',
      ImageDescription: 'Sneaker',
    };

    expect(labels(raw)).toEqual([
      'Bildbeschreibung',
      'Urheber',
      'Kamerahersteller',
      'ISO',
      'ZZZUnbekannt',
    ]);
  });

  it('sortiert den unbekannten Rest alphabetisch', () => {
    expect(labels({ Zeta: 1, Alpha: 2, Mitte: 3 })).toEqual(['Alpha', 'Mitte', 'Zeta']);
  });
});

describe('Werte lesbar machen', () => {
  it('formatiert ein Datum in deutscher Schreibweise', () => {
    const result = values({ DateTimeOriginal: new Date('2026-08-30T12:22:05Z') });

    expect(result['DateTimeOriginal']).toMatch(/30\.8\.2026/);
  });

  it('laesst ganze Zahlen unangetastet und kuerzt lange Kommazahlen', () => {
    const result = values({ ISO: 400, FocalLength: 6.765, ExposureTime: 0.008333333333 });

    expect(result['ISO']).toBe('400');
    expect(result['FocalLength']).toBe('6,765');
    expect(result['ExposureTime']).toBe('0,0083');
  });

  it('verbindet Zahlenreihen zu einer lesbaren Zeile', () => {
    expect(values({ GPSLatitude: [52, 30, 0] })['GPSLatitude']).toBe('52, 30, 0');
  });

  it('gibt Wahrheitswerte auf Deutsch aus', () => {
    const result = values({ Flash: true, Modified: false });

    expect(result['Flash']).toBe('ja');
    expect(result['Modified']).toBe('nein');
  });

  // Ein einzelnes Byte wie GPSAltitudeRef traegt eine echte Aussage und wird
  // gezeigt. Eine eingebettete Miniaturansicht sind Tausende Bytes - die
  // waeren als Zahlenkolonne nur Laerm.
  it('zeigt kurze Bytefolgen, verschweigt aber grosse Binaerblöcke', () => {
    const kurz = new Uint8Array([0]);
    const lang = new Uint8Array(4000);

    const result = values({ GPSAltitudeRef: kurz, ThumbnailData: lang });

    expect(result['GPSAltitudeRef']).toBe('0');
    expect(result['ThumbnailData']).toBeUndefined();
  });

  it('kuerzt sehr lange Texte sichtbar statt sie stillschweigend abzuschneiden', () => {
    const result = values({ UserComment: 'x'.repeat(500) });

    expect(result['UserComment']).toHaveLength(301);
    expect(result['UserComment'].endsWith('…')).toBe(true);
  });
});

describe('Was nicht in die Liste gehoert', () => {
  it('laesst leere Werte weg', () => {
    const raw = { Make: 'Apple', Model: null, Software: undefined, Artist: '   ' };

    expect(labels(raw)).toEqual(['Kamerahersteller']);
  });

  // `errors` ist exifrs eigener Fehlerkanal, kein Feld aus der Datei.
  it('laesst exifrs errors-Feld weg', () => {
    expect(toFields({ errors: [{}], Make: 'Apple' })).toHaveLength(1);
  });

  // Die Koordinaten stehen bereits im hervorgehobenen Warnkasten darueber.
  it('laesst die abgeleiteten Koordinaten weg, aber nicht die rohen GPS-Tags', () => {
    const raw = { latitude: 52.5, longitude: 13.4, GPSLatitudeRef: 'N', GPSAltitude: 34 };

    expect(labels(raw)).toEqual(['GPS-Höhe', 'GPSLatitudeRef']);
  });

  it('laesst verschachtelte Objekte weg, die sich nicht als Zeile darstellen lassen', () => {
    expect(toFields({ Nested: { a: 1 }, Make: 'Apple' })).toHaveLength(1);
  });

  it('kommt mit einem leeren Ergebnis zurecht', () => {
    expect(toFields({})).toEqual([]);
  });
});

describe('Genormte Zahlenwerte lesbar machen', () => {
  // "Farbraum: 1" sagt niemandem etwas, "sRGB" schon. Uebersetzt werden nur
  // die drei genormten Aufzaehlungen; alles andere bleibt die rohe Zahl,
  // damit keine Bedeutung erfunden wird.
  it('benennt den Farbraum', () => {
    expect(values({ ColorSpace: 1 })['ColorSpace']).toBe('sRGB');
    expect(values({ ColorSpace: 65535 })['ColorSpace']).toBe('nicht kalibriert');
  });

  it('benennt die Auflösungseinheit', () => {
    expect(values({ ResolutionUnit: 2 })['ResolutionUnit']).toBe('Zoll');
    expect(values({ ResolutionUnit: 3 })['ResolutionUnit']).toBe('Zentimeter');
  });

  it('schreibt die JFIF-Version als Versionsnummer', () => {
    expect(values({ JFIFVersion: 257 })['JFIFVersion']).toBe('1.1');
    expect(values({ JFIFVersion: 258 })['JFIFVersion']).toBe('1.2');
  });

  it('laesst unbekannte Zahlen roh stehen, statt eine Bedeutung zu erfinden', () => {
    expect(values({ ColorSpace: 42 })['ColorSpace']).toBe('42');
    expect(values({ ResolutionUnit: 0 })['ResolutionUnit']).toBe('0');
  });
});

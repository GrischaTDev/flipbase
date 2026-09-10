import { describe, it, expect } from 'vitest';
import { buildDateExif, withExif } from './exif-writer';

const taken = new Date(2026, 4, 17, 9, 5, 3);

/** Liest einen ASCII-Text fester Laenge, ohne die Abschluss-Null. */
function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length - 1));
}

/** Ein winziges, aber gueltiges JPEG-Geruest: SOI, ein APP0, SOS, EOI. */
function minimalJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
  ]);
}

describe('EXIF-Segment bauen', () => {
  it('faengt mit dem APP1-Kennzeichen an', () => {
    const app1 = buildDateExif(taken);

    expect(app1[0]).toBe(0xff);
    expect(app1[1]).toBe(0xe1);
  });

  it('ist genau 138 Byte lang', () => {
    expect(buildDateExif(taken)).toHaveLength(138);
  });

  it('traegt die Laenge ohne das Kennzeichen ein', () => {
    // Das Laengenfeld zaehlt sich selbst mit, aber nicht die zwei Bytes
    // FFE1 davor. 136 = 2 + 6 + 128.
    const app1 = buildDateExif(taken);

    expect((app1[2] << 8) | app1[3]).toBe(136);
  });

  it('traegt die Exif-Kennung ein', () => {
    const app1 = buildDateExif(taken);

    expect(textAt(app1, 4, 5)).toBe('Exif');
    expect(app1[8]).toBe(0);
    expect(app1[9]).toBe(0);
  });

  it('schreibt den TIFF-Kopf gross zuerst', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect(textAt(tiff, 0, 3)).toBe('MM');
    expect((tiff[2] << 8) | tiff[3]).toBe(0x002a);
  });

  it('schreibt das Aufnahmedatum an die festgelegte Stelle', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect(textAt(tiff, 88, 20)).toBe('2026:05:17 09:05:03');
  });

  it('schreibt dasselbe Datum in alle drei Felder', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect(textAt(tiff, 38, 20)).toBe('2026:05:17 09:05:03');
    expect(textAt(tiff, 108, 20)).toBe('2026:05:17 09:05:03');
  });

  it('traegt genau zwei Eintraege je Verzeichnis ein', () => {
    const tiff = buildDateExif(taken).subarray(10);

    expect((tiff[8] << 8) | tiff[9]).toBe(2);
    expect((tiff[58] << 8) | tiff[59]).toBe(2);
  });

  it('enthaelt keine Angabe zu Geraet, Software oder Ort', () => {
    // Die Grenze der Entscheidung: nur Datum, sonst nichts. Die Tags
    // Make (0x010F), Model (0x0110), Software (0x0131) und der
    // GPS-Zeiger (0x8825) duerfen nirgends vorkommen.
    const tiff = buildDateExif(taken).subarray(10);
    const tags: number[] = [];
    for (const start of [10, 60]) {
      for (let i = 0; i < 2; i++) {
        const at = start + i * 12;
        tags.push((tiff[at] << 8) | tiff[at + 1]);
      }
    }

    expect(tags).toEqual([0x0132, 0x8769, 0x9003, 0x9004]);
  });
});

describe('Segment in ein JPEG einsetzen', () => {
  it('setzt es unmittelbar hinter den Dateianfang', () => {
    const result = withExif(minimalJpeg(), buildDateExif(taken));

    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
    expect(result[2]).toBe(0xff);
    expect(result[3]).toBe(0xe1);
  });

  it('laesst die Bilddaten unveraendert', () => {
    const jpeg = minimalJpeg();
    const result = withExif(jpeg, buildDateExif(taken));

    // Der Bilddatenstrom ab SOS steht am Ende weiterhin unveraendert.
    //
    // Korrektur gegenueber dem Plan: Die Vorlage enthaelt kein vorhandenes
    // EXIF-Segment, das ersetzt wuerde - das neue 138-Byte-Segment kommt rein
    // hinzu. Die Gesamtlaenge kann sich deshalb nur um genau 138 erhoehen
    // (16 + 138 = 154), nicht um 136. Ebenso gehoert die EOI-Markierung
    // (FF D9) mit zu den letzten sechs Byte, nicht das SOS-Kennzeichen davor.
    expect(Array.from(result.subarray(result.length - 6))).toEqual([
      0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
    ]);
    expect(result).toHaveLength(jpeg.length + 138);
  });

  it('behaelt andere Segmente', () => {
    const result = withExif(minimalJpeg(), buildDateExif(taken));

    // Das APP0 aus der Vorlage muss hinter unserem APP1 wieder auftauchen.
    expect(result[140]).toBe(0xff);
    expect(result[141]).toBe(0xe0);
  });

  it('ersetzt ein bereits vorhandenes EXIF-Segment, statt zwei zu erzeugen', () => {
    // Zwei EXIF-Segmente in einer Datei sind laut Spezifikation unzulaessig;
    // Leseprogramme nehmen dann willkuerlich eines davon.
    const once = withExif(minimalJpeg(), buildDateExif(taken));
    const twice = withExif(once, buildDateExif(taken));

    expect(twice).toHaveLength(once.length);
  });

  it('laesst etwas, das kein JPEG ist, unangetastet', () => {
    // Lieber gar kein Datum als eine zerstoerte Datei.
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    expect(withExif(notJpeg, buildDateExif(taken))).toBe(notJpeg);
  });

  it('wird von exifr wieder als Aufnahmedatum gelesen', async () => {
    // Gegenprobe mit einem unabhaengigen Leser: Der eigene Aufbau nuetzt
    // nichts, wenn ihn niemand sonst versteht.
    const exifr = (await import('exifr')).default;
    const jpeg = withExif(minimalJpeg(), buildDateExif(taken));

    const parsed = await exifr.parse(jpeg, { tiff: true, exif: true });

    expect(parsed.DateTimeOriginal.getFullYear()).toBe(2026);
    expect(parsed.DateTimeOriginal.getMonth()).toBe(4);
    expect(parsed.DateTimeOriginal.getDate()).toBe(17);
  });
});

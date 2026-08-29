import { describe, expect, it } from 'vitest';
import { readDigitalSourceType, readWebpChunks } from './webp-metadata';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** Baut einen RIFF-Chunk inklusive der vom Format verlangten Auffuellung. */
function chunk(fourcc: string, data: readonly number[]): number[] {
  const size = data.length;
  const padding = size % 2 === 1 ? [0] : [];
  return [
    ...ascii(fourcc),
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    (size >> 24) & 0xff,
    ...data,
    ...padding,
  ];
}

function webp(...chunks: number[][]): Uint8Array {
  const body = [...ascii('WEBP'), ...chunks.flat()];
  const size = body.length;
  return new Uint8Array([
    ...ascii('RIFF'),
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    (size >> 24) & 0xff,
    ...body,
  ]);
}

const tiffBlock = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];

describe('WebP-Chunks lesen', () => {
  it('findet den EXIF-Block', () => {
    const result = readWebpChunks(webp(chunk('VP8L', [1, 2, 3, 4]), chunk('EXIF', tiffBlock)));

    expect(result.exif && [...result.exif]).toEqual(tiffBlock);
  });

  it('findet den XMP-Text', () => {
    const text = '<x:xmpmeta>hallo</x:xmpmeta>';
    const result = readWebpChunks(webp(chunk('XMP ', ascii(text))));

    expect(result.xmp).toBe(text);
  });

  it('erkennt einen C2PA-Chunk', () => {
    expect(readWebpChunks(webp(chunk('C2PA', [1, 2, 3]))).hasContentCredential).toBe(true);
    expect(readWebpChunks(webp(chunk('VP8L', [1, 2]))).hasContentCredential).toBe(false);
  });

  // EXIF und XMP stehen laut WebP-Spezifikation **hinter** den Bilddaten. Ein
  // Leser, der nur den Dateianfang ansieht, findet sie nie - deshalb muss der
  // Aufrufer hier die ganze Datei uebergeben.
  it('findet Metadaten auch hinter grossen Bilddaten', () => {
    const bild = new Array(5000).fill(0x42);
    const result = readWebpChunks(webp(chunk('VP8L', bild), chunk('EXIF', tiffBlock)));

    expect(result.exif && [...result.exif]).toEqual(tiffBlock);
  });

  it('kommt mit ungerader Chunk-Laenge zurecht - danach folgt ein Fuellbyte', () => {
    const result = readWebpChunks(
      webp(chunk('VP8L', [1, 2, 3]), chunk('EXIF', tiffBlock), chunk('C2PA', [9])),
    );

    expect(result.exif && [...result.exif]).toEqual(tiffBlock);
    expect(result.hasContentCredential).toBe(true);
  });

  it('liefert bei einer Datei ohne Metadaten leere Werte statt zu werfen', () => {
    const result = readWebpChunks(webp(chunk('VP8L', [1, 2, 3, 4])));

    expect(result).toEqual({ exif: null, xmp: null, hasContentCredential: false });
  });

  it('bricht bei abgeschnittenen Dateien ab, statt ins Leere zu greifen', () => {
    const truncated = webp(chunk('EXIF', tiffBlock)).slice(0, 20);

    expect(() => readWebpChunks(truncated)).not.toThrow();
    expect(readWebpChunks(truncated).exif).toBeNull();
  });

  it('liefert fuer eine Datei, die gar kein WebP ist, leere Werte', () => {
    expect(readWebpChunks(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      exif: null,
      xmp: null,
      hasContentCredential: false,
    });
  });

  // Eine Laengenangabe, die ueber das Dateiende hinauszeigt, darf nicht in eine
  // Endlosschleife oder einen Zugriff ausserhalb des Puffers laufen.
  it('haelt einer unsinnigen Laengenangabe stand', () => {
    const bad = new Uint8Array([
      ...ascii('RIFF'),
      0xff,
      0xff,
      0xff,
      0xff,
      ...ascii('WEBP'),
      ...ascii('EXIF'),
      0xff,
      0xff,
      0xff,
      0xff,
      1,
      2,
      3,
    ]);

    expect(() => readWebpChunks(bad)).not.toThrow();
    expect(readWebpChunks(bad).exif).toBeNull();
  });
});

describe('Angegebene Herkunft aus XMP lesen', () => {
  const wert = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

  it('liest die Attribut-Schreibweise', () => {
    const xmp = `<rdf:Description rdf:about="" Iptc4xmpExt:DigitalSourceType="${wert}"/>`;

    expect(readDigitalSourceType(xmp)).toBe(wert);
  });

  it('liest die Element-Schreibweise', () => {
    const xmp = `<Iptc4xmpExt:DigitalSourceType>${wert}</Iptc4xmpExt:DigitalSourceType>`;

    expect(readDigitalSourceType(xmp)).toBe(wert);
  });

  // Der Namensraumpraefix ist frei waehlbar; "Iptc4xmpExt" ist nur ueblich.
  it('haengt nicht am ueblichen Namensraumpraefix', () => {
    expect(readDigitalSourceType(`<x:Description ext:DigitalSourceType="${wert}"/>`)).toBe(wert);
  });

  it('liefert null, wenn nichts dasteht', () => {
    expect(readDigitalSourceType('<rdf:Description rdf:about=""/>')).toBeNull();
    expect(readDigitalSourceType('')).toBeNull();
  });

  it('liefert null bei leerem Wert statt einer leeren Zeichenkette', () => {
    expect(readDigitalSourceType('<x Iptc4xmpExt:DigitalSourceType="   "/>')).toBeNull();
  });

  // Ein Feld, das nur so aehnlich heisst, darf nicht durchrutschen.
  it('trifft nicht auf einen aehnlich benannten Nachbarn', () => {
    expect(readDigitalSourceType('<x MyDigitalSourceTypeNote="egal"/>')).toBeNull();
  });
});

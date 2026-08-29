import { describe, it, expect } from 'vitest';
import { hasJpegContentCredential, hasPngContentCredential } from './c2pa-detection';

/** Baut ein minimales JPEG mit beliebigen Segmenten. */
function jpeg(segments: readonly { marker: number; payload: Uint8Array }[]): Uint8Array {
  const parts: number[] = [0xff, 0xd8];

  for (const segment of segments) {
    const length = segment.payload.length + 2;
    parts.push(0xff, segment.marker, (length >> 8) & 0xff, length & 0xff);
    parts.push(...segment.payload);
  }

  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

function ascii(text: string): number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/** Eine JUMBF-Box, wie C2PA sie in ein APP11-Segment legt. */
function jumbfBox(label: string): Uint8Array {
  return new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x20,
    ...ascii('jumb'),
    0x00,
    0x00,
    0x00,
    0x18,
    ...ascii('jumd'),
    ...ascii(label),
    0x00,
  ]);
}

describe('C2PA-Herkunftsnachweis feststellen', () => {
  it('erkennt einen Nachweis in einem APP11-Segment', () => {
    const file = jpeg([{ marker: 0xeb, payload: jumbfBox('c2pa') }]);

    expect(hasJpegContentCredential(file)).toBe(true);
  });

  it('meldet nichts bei einem gewoehnlichen Foto', () => {
    const file = jpeg([{ marker: 0xe1, payload: new Uint8Array(ascii('Exif\0\0')) }]);

    expect(hasJpegContentCredential(file)).toBe(false);
  });

  it('faellt nicht auf die Zeichenfolge in einem fremden Segment herein', () => {
    // Ein Kommentar oder Dateiname darf keinen Treffer ausloesen - deshalb
    // laeuft die Erkennung ueber die Segmentstruktur und nicht ueber die
    // ganze Datei.
    const file = jpeg([{ marker: 0xfe, payload: new Uint8Array(ascii('foto-c2pa-jumb.jpg')) }]);

    expect(hasJpegContentCredential(file)).toBe(false);
  });

  it('meldet nichts bei einer Datei, die kein JPEG ist', () => {
    expect(hasJpegContentCredential(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('kommt mit einer abgeschnittenen Datei zurecht', () => {
    expect(hasJpegContentCredential(new Uint8Array([0xff, 0xd8, 0xff, 0xeb]))).toBe(false);
  });
});

/** Baut ein minimales PNG mit beliebigen Chunks (Pruefsumme wird nicht geprueft). */
function png(chunks: readonly { name: string; data: readonly number[] }[]): Uint8Array {
  const parts: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  for (const chunk of chunks) {
    const size = chunk.data.length;
    parts.push((size >> 24) & 0xff, (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff);
    parts.push(...ascii(chunk.name));
    parts.push(...chunk.data);
    parts.push(0, 0, 0, 0);
  }

  return new Uint8Array(parts);
}

describe('C2PA in PNG feststellen', () => {
  it('erkennt einen Nachweis im caBX-Chunk', () => {
    const file = png([
      { name: 'IHDR', data: new Array(13).fill(0) },
      { name: 'caBX', data: ascii('jumbfc2pa') },
      { name: 'IEND', data: [] },
    ]);

    expect(hasPngContentCredential(file)).toBe(true);
  });

  it('meldet nichts bei einem gewoehnlichen PNG', () => {
    const file = png([
      { name: 'IHDR', data: new Array(13).fill(0) },
      { name: 'IDAT', data: [1, 2, 3, 4] },
      { name: 'IEND', data: [] },
    ]);

    expect(hasPngContentCredential(file)).toBe(false);
  });

  it('faellt nicht auf die Zeichenfolge in einem Textchunk herein', () => {
    const file = png([
      { name: 'IHDR', data: new Array(13).fill(0) },
      { name: 'tEXt', data: ascii('Kommentar\u0000erzeugt mit caBX und c2pa') },
      { name: 'IEND', data: [] },
    ]);

    expect(hasPngContentCredential(file)).toBe(false);
  });

  it('meldet nichts bei einer Datei, die kein PNG ist', () => {
    expect(hasPngContentCredential(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
  });

  it('kommt mit einer abgeschnittenen Datei zurecht', () => {
    const file = png([{ name: 'caBX', data: ascii('jumbf') }]).slice(0, 12);

    expect(() => hasPngContentCredential(file)).not.toThrow();
    expect(hasPngContentCredential(file)).toBe(false);
  });

  it('haelt einer unsinnigen Laengenangabe stand', () => {
    const bad = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0xff,
      0xff,
      0xff,
      0xff,
      ...ascii('IDAT'),
      1,
      2,
      3,
    ]);

    expect(() => hasPngContentCredential(bad)).not.toThrow();
    expect(hasPngContentCredential(bad)).toBe(false);
  });
});

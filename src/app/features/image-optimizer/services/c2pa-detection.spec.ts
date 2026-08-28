import { describe, it, expect } from 'vitest';
import { hasContentCredential } from './c2pa-detection';

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

    expect(hasContentCredential(file)).toBe(true);
  });

  it('meldet nichts bei einem gewoehnlichen Foto', () => {
    const file = jpeg([{ marker: 0xe1, payload: new Uint8Array(ascii('Exif\0\0')) }]);

    expect(hasContentCredential(file)).toBe(false);
  });

  it('faellt nicht auf die Zeichenfolge in einem fremden Segment herein', () => {
    // Ein Kommentar oder Dateiname darf keinen Treffer ausloesen - deshalb
    // laeuft die Erkennung ueber die Segmentstruktur und nicht ueber die
    // ganze Datei.
    const file = jpeg([{ marker: 0xfe, payload: new Uint8Array(ascii('foto-c2pa-jumb.jpg')) }]);

    expect(hasContentCredential(file)).toBe(false);
  });

  it('meldet nichts bei einer Datei, die kein JPEG ist', () => {
    expect(hasContentCredential(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });

  it('kommt mit einer abgeschnittenen Datei zurecht', () => {
    expect(hasContentCredential(new Uint8Array([0xff, 0xd8, 0xff, 0xeb]))).toBe(false);
  });
});

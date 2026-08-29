import { describe, expect, it } from 'vitest';
import { detectFormat } from './image-format';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** ISOBMFF-Kopf: Laenge, "ftyp", Hauptmarke, Version, dann kompatible Marken. */
function isoBmff(major: string, compatible: readonly string[]): Uint8Array {
  const body = [...ascii(major), 0, 0, 0, 0, ...compatible.flatMap(ascii)];
  const length = 8 + body.length;
  return bytes(
    (length >> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
    ...ascii('ftyp'),
    ...body,
  );
}

describe('Format erkennen', () => {
  it('erkennt JPEG an der Signatur', () => {
    expect(detectFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
  });

  it('erkennt PNG an der Signatur', () => {
    expect(detectFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
  });

  it('erkennt WebP an RIFF und der WEBP-Kennung', () => {
    expect(detectFormat(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')))).toBe('webp');
  });

  it('erkennt RIFF ohne WEBP-Kennung nicht als WebP', () => {
    expect(detectFormat(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBe('unknown');
  });

  it('erkennt TIFF in beiden Byte-Reihenfolgen', () => {
    expect(detectFormat(bytes(0x49, 0x49, 0x2a, 0x00))).toBe('tiff');
    expect(detectFormat(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe('tiff');
  });

  // exifr entscheidet ueber die **kompatiblen** Marken ab Byte 16, nicht ueber
  // die Hauptmarke. Gemessen: eine Datei mit Hauptmarke "avif", die "avif"
  // nicht in der Liste fuehrt, wird von exifr abgelehnt.
  it('erkennt HEIC und AVIF an den kompatiblen Marken', () => {
    expect(detectFormat(isoBmff('heic', ['mif1', 'heic']))).toBe('heif');
    expect(detectFormat(isoBmff('avif', ['avif', 'mif1', 'miaf']))).toBe('heif');
  });

  it('meldet eine ISOBMFF-Datei ohne passende Marke als unbekannt', () => {
    expect(detectFormat(isoBmff('mp42', ['isom', 'mp42']))).toBe('unknown');
  });

  it('kommt mit zu kurzen Dateien zurecht', () => {
    expect(detectFormat(bytes())).toBe('unknown');
    expect(detectFormat(bytes(0xff))).toBe('unknown');
    expect(detectFormat(bytes(0x89, 0x50))).toBe('unknown');
  });

  it('haelt GIF und BMP fuer unbekannt - dort wird nichts ausgewertet', () => {
    expect(detectFormat(bytes(...ascii('GIF89a'), 0, 0))).toBe('unknown');
    expect(detectFormat(bytes(0x42, 0x4d, 0, 0, 0, 0, 0, 0))).toBe('unknown');
  });
});

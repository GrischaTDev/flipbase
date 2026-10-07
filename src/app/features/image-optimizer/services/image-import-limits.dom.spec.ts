import { describe, expect, it, vi } from 'vitest';
import {
  assertImageBatch,
  assertImageSize,
  MAX_IMAGE_FILE_BYTES,
  parseImageSize,
  readImageSize,
} from './image-import-limits';

function png(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function box(kind: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8 + payload.length);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(kind), 4);
  bytes.set(payload, 8);
  return bytes;
}

function gif(width: number, height: number, frames: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(14 + frames * 12);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('GIF89a'));
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  for (let offset = 13; offset < bytes.length - 1; offset += 12) {
    bytes[offset] = 0x2c;
    view.setUint16(offset + 5, width, true);
    view.setUint16(offset + 7, height, true);
    bytes[offset + 10] = 2;
    bytes[offset + 11] = 0;
    // Ein leeres Datenfeld reicht für die Containerprüfung; kein Decoder startet.
  }
  bytes[bytes.length - 1] = 0x3b;
  return bytes;
}

describe('image import bounds', () => {
  it('liest PNG und progressives JPEG vor dem Dekodieren und erlaubt große Handyfotos', async () => {
    expect(parseImageSize(png(8000, 6000))).toEqual({ width: 8000, height: 6000 });
    expect(
      parseImageSize(new Uint8Array([255, 216, 255, 194, 0, 11, 8, 3, 232, 3, 232, 1, 1, 17, 0])),
    ).toEqual({ width: 1000, height: 1000 });
    await expect(
      readImageSize(new File([png(8000, 6000)], 'photo.png', { type: 'image/png' })),
    ).resolves.toEqual({ width: 8000, height: 6000 });
  });

  it('stoppt extreme Abmessungen, Batchanzahl und die kumulierte Auflösung', () => {
    expect(() => assertImageSize(parseImageSize(png(100000, 100000)))).toThrow();
    expect(() =>
      assertImageBatch(Array.from({ length: 25 }, () => new File([], 'photo.jpg'))),
    ).toThrow(/24/);
    expect(() =>
      assertImageBatch(
        [],
        Array.from({ length: 3 }, () => ({ width: 8000, height: 6000 })),
      ),
    ).toThrow(/128/);
    expect(() => assertImageSize({ width: NaN, height: 100 })).toThrow();
  });

  it('weist große Dateien vor dem ersten Lesen ab und zählt die Gesamtbytes', async () => {
    const file = new File([], 'large.png');
    Object.defineProperty(file, 'size', { value: MAX_IMAGE_FILE_BYTES + 1 });
    const slice = vi.spyOn(file, 'slice');
    await expect(readImageSize(file)).rejects.toThrow(/20 MB/);
    expect(slice).not.toHaveBeenCalled();
    const allowed = new File([], 'photo.png');
    Object.defineProperty(allowed, 'size', { value: MAX_IMAGE_FILE_BYTES });
    expect(() => assertImageBatch(Array.from({ length: 6 }, () => allowed))).toThrow(/100 MB/);
  });

  it('behandelt gefälschte MIME-Angaben und abgeschnittene Header als ungültig', async () => {
    await expect(
      readImageSize(new File(['not an image'], 'photo.png', { type: 'image/png' })),
    ).rejects.toThrow();
    expect(() => parseImageSize(new Uint8Array([255, 216, 255, 192, 255, 255]))).toThrow();
  });

  it('erhält statisches HEIC, TIFF und WebP ohne native Dekodierung', () => {
    const dimensions = new Uint8Array(12);
    new DataView(dimensions.buffer).setUint32(4, 4000);
    new DataView(dimensions.buffer).setUint32(8, 3000);
    const heic = new Uint8Array(60);
    heic.set(box('ftyp', new TextEncoder().encode('heic\0\0\0\0heic')));
    heic.set(
      box('meta', new Uint8Array([0, 0, 0, 0, ...box('ipco', box('ispe', dimensions))])),
      20,
    );
    expect(parseImageSize(heic)).toEqual({ width: 4000, height: 3000 });

    const tiff = new Uint8Array(38);
    tiff.set([73, 73, 42, 0, 8, 0, 0, 0, 2, 0]);
    const view = new DataView(tiff.buffer);
    for (const [index, dimension] of [4000, 3000].entries()) {
      const offset = 10 + index * 12;
      view.setUint16(offset, 256 + index, true);
      view.setUint16(offset + 2, 4, true);
      view.setUint32(offset + 4, 1, true);
      view.setUint32(offset + 8, dimension, true);
    }
    expect(parseImageSize(tiff)).toEqual({ width: 4000, height: 3000 });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode('RIFF'));
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
    webp.set([0x9f, 0x0f, 0], 24);
    webp.set([0xb7, 0x0b, 0], 27);
    expect(parseImageSize(webp)).toEqual({ width: 4000, height: 3000 });
  });

  it('begrenzt GIF-Einzelbilder und bewahrt deren Budget über weitere Batches', async () => {
    expect(parseImageSize(gif(1000, 1000, 2))).toEqual({
      width: 1000,
      height: 1000,
      decodedPixels: 2_000_000,
    });
    expect(() => parseImageSize(gif(8000, 6000, 2))).toThrow();
    const files = Array.from({ length: 3 }, () => new File([gif(4000, 3000, 5)], 'animation.gif'));
    const sizes = await Promise.all(files.map(readImageSize));
    expect(() => assertImageBatch(files.slice(0, 2), sizes.slice(0, 2))).not.toThrow();
    expect(() => assertImageBatch(files, sizes)).toThrow(/128/);
  });
});

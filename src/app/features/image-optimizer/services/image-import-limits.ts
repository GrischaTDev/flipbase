import { Size } from '../models/platform-profile';
import { detectFormat } from './image-format';

export const MAX_IMAGE_FILES = 24;
export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 64_000_000;
export const MAX_IMAGE_BATCH_PIXELS = 128_000_000;
const HEADER_BYTES = 2 * 1024 * 1024;
interface ImageContainerSize extends Size {
  decodedPixels?: number;
}
const decodedPixelsByFile = new WeakMap<File, number>();

export function assertImageSize(size: Size): void {
  if (
    !Number.isSafeInteger(size.width) ||
    !Number.isSafeInteger(size.height) ||
    size.width < 1 ||
    size.height < 1 ||
    size.width > 16_000 ||
    size.height > 16_000 ||
    size.width * size.height > MAX_IMAGE_PIXELS
  )
    throw new Error('Ein Bild darf höchstens 64 Megapixel und 16.000 Pixel je Seite haben.');
}

export function assertImageBatch(files: readonly File[], sizes: readonly Size[] = []): void {
  if (files.length > MAX_IMAGE_FILES)
    throw new Error('Du kannst höchstens 24 Bilder gleichzeitig bearbeiten.');
  if (files.some((file) => file.size > MAX_IMAGE_FILE_BYTES))
    throw new Error('Ein Bild darf höchstens 20 MB groß sein.');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_IMAGE_BATCH_BYTES)
    throw new Error('Alle Bilder zusammen dürfen höchstens 100 MB groß sein.');
  sizes.forEach(assertImageSize);
  if (
    Math.max(
      sizes.reduce((sum, size) => sum + size.width * size.height, 0),
      files.reduce((sum, file) => sum + (decodedPixelsByFile.get(file) ?? 0), 0),
    ) > MAX_IMAGE_BATCH_PIXELS
  )
    throw new Error('Alle Bilder zusammen dürfen höchstens 128 Megapixel haben.');
}

// Größen werden vor Object-URLs, Metadaten und nativen Bilddekodern gelesen.
async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(new Uint8Array(reader.result))
        : reject(new Error('Das Bild konnte nicht gelesen werden.'));
    reader.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
    reader.readAsArrayBuffer(blob);
  });
}

export async function readImageSize(file: File): Promise<Size> {
  assertImageBatch([file]);
  const header = await readBytes(file.slice(0, HEADER_BYTES));
  const size = parseImageSize(
    String.fromCharCode(...header.subarray(0, 3)) === 'GIF' ||
      detectFormat(header) === 'png' ||
      (detectFormat(header) === 'webp' && header[20] & 2)
      ? await readBytes(file)
      : header,
  );
  assertImageSize(size);
  decodedPixelsByFile.set(file, size.decodedPixels ?? size.width * size.height);
  return size;
}

export function parseImageSize(bytes: Uint8Array): ImageContainerSize {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const word = (offset: number, little = false) => view.getUint16(offset, little);
  const integer = (offset: number, little = false) => view.getUint32(offset, little);
  const text = (offset: number, length: number) =>
    new TextDecoder('latin1').decode(bytes.subarray(offset, offset + length));
  const format = detectFormat(bytes);
  if (format === 'png' && bytes.length >= 24 && text(12, 4) === 'IHDR') {
    const size: ImageContainerSize = { width: integer(16), height: integer(20) };
    let framePixels = 0;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = integer(offset),
        kind = text(offset + 4, 4);
      if (kind === 'acTL' && offset + 16 <= bytes.length) {
        const frames = integer(offset + 8);
        size.decodedPixels = frames * size.width * size.height;
        if (!frames || frames > 100 || size.decodedPixels > MAX_IMAGE_PIXELS)
          throw new Error('Das animierte Bild enthält zu viele oder zu große Einzelbilder.');
      }
      if (kind === 'fcTL' && length >= 26 && offset + length + 12 <= bytes.length) {
        const frame = { width: integer(offset + 12), height: integer(offset + 16) };
        assertImageSize(frame);
        framePixels += Math.max(frame.width * frame.height, size.width * size.height);
        if (framePixels > MAX_IMAGE_PIXELS) throw new Error('Die PNG-Einzelbilder sind zu groß.');
      }
      if (offset + length + 12 > bytes.length) break;
      offset += length + 12;
    }
    if (size.decodedPixels !== undefined || framePixels)
      size.decodedPixels = Math.max(size.decodedPixels ?? 0, framePixels, size.width * size.height);
    return size;
  }
  if (format === 'jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = word(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        length >= 8
      )
        return { width: word(offset + 5), height: word(offset + 3) };
      offset += length;
    }
  }
  if (format === 'webp' && bytes.length >= 30) {
    const chunk = text(12, 4);
    const three = (offset: number) =>
      bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    if (chunk === 'VP8X') {
      const size: ImageContainerSize = { width: three(24) + 1, height: three(27) + 1 };
      if (bytes[20] & 2) {
        let frames = 0;
        let framePixels = 0;
        for (let offset = 12; offset + 8 <= bytes.length;) {
          const length = integer(offset + 4, true);
          if (offset + length + 8 > bytes.length)
            throw new Error('Das WebP-Bild ist unvollständig.');
          if (text(offset, 4) === 'ANMF') {
            if (length < 16) throw new Error('Der WebP-Bildrahmen ist unvollständig.');
            const frame = { width: three(offset + 14) + 1, height: three(offset + 17) + 1 };
            assertImageSize(frame);
            framePixels += Math.max(frame.width * frame.height, size.width * size.height);
            frames++;
            if (frames > 100 || framePixels > MAX_IMAGE_PIXELS)
              throw new Error('Das animierte Bild enthält zu viele oder zu große Einzelbilder.');
          }
          offset += 8 + length + (length % 2);
        }
        if (!frames)
          throw new Error('Das animierte WebP-Bild enthält keine lesbaren Einzelbilder.');
        size.decodedPixels = framePixels;
      }
      return size;
    }
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)
      return { width: word(26, true) & 0x3fff, height: word(28, true) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = integer(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (format === 'tiff') {
    const little = bytes[0] === 0x49;
    const offset = integer(4, little);
    if (offset + 2 <= bytes.length) {
      const entries = word(offset, little);
      if (entries <= 4096 && offset + 2 + entries * 12 <= bytes.length) {
        let width = 0,
          height = 0;
        for (let index = 0; index < entries; index++) {
          const entry = offset + 2 + index * 12;
          const tag = word(entry, little),
            type = word(entry + 2, little);
          if (
            (tag === 256 || tag === 257) &&
            integer(entry + 4, little) === 1 &&
            [3, 4].includes(type)
          ) {
            const dimension = type === 3 ? word(entry + 8, little) : integer(entry + 8, little);
            if (tag === 256) width = dimension;
            else height = dimension;
          }
        }
        if (width && height) return { width, height };
      }
    }
  }
  if (text(4, 4) === 'ftyp') {
    const brands = text(8, Math.min(integer(0), bytes.length) - 8);
    if (/avis|msf1/.test(brands))
      throw new Error('Bitte speichere animierte HEIC-/AVIF-Bilder zuerst als einzelnes Foto.');
    // HEIC/AVIF: alle Bildausdehnungen prüfen, einschließlich des großen Hauptbildes.
    const sizes: Size[] = [];
    const visit = (start: number, end: number, depth: number): void => {
      if (depth > 8) throw new Error('Der Bildcontainer ist zu tief verschachtelt.');
      for (let offset = start; offset + 8 <= end;) {
        const length = integer(offset),
          kind = text(offset + 4, 4);
        if (length < 8 || offset + length > end) break;
        if (kind === 'ispe' && length >= 20) {
          const size = { width: integer(offset + 12), height: integer(offset + 16) };
          assertImageSize(size);
          sizes.push(size);
        }
        if (['meta', 'iprp', 'ipco'].includes(kind))
          visit(offset + (kind === 'meta' ? 12 : 8), offset + length, depth + 1);
        offset += length;
      }
    };
    visit(0, bytes.length, 0);
    if (sizes.length)
      return sizes.reduce((largest, size) =>
        size.width * size.height > largest.width * largest.height ? size : largest,
      );
  }
  if (text(0, 2) === 'BM' && bytes.length >= 26 && integer(14, true) >= 40)
    return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  if (text(0, 3) === 'GIF' && bytes.length >= 13) {
    const size: ImageContainerSize = {
      width: word(6, true),
      height: word(8, true),
      decodedPixels: 0,
    };
    assertImageSize(size);
    let offset = 13 + (bytes[10] & 0x80 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0);
    let frames = 0;
    const skipBlocks = () => {
      while (offset < bytes.length) {
        const length = bytes[offset++];
        if (length === 0) return;
        offset += length;
      }
      throw new Error('Das GIF-Bild ist unvollständig.');
    };
    while (offset < bytes.length) {
      const marker = bytes[offset++];
      if (marker === 0x3b && frames > 0) return size;
      if (marker === 0x21) {
        offset++;
        skipBlocks();
        continue;
      }
      if (marker !== 0x2c || offset + 9 > bytes.length) break;
      const frame = { width: word(offset + 4, true), height: word(offset + 6, true) };
      assertImageSize(frame);
      size.decodedPixels =
        (size.decodedPixels ?? 0) + Math.max(size.width * size.height, frame.width * frame.height);
      frames++;
      if (size.decodedPixels > MAX_IMAGE_PIXELS || frames > 100)
        throw new Error('Das animierte Bild enthält zu viele oder zu große Einzelbilder.');
      const flags = bytes[offset + 8];
      offset += 9 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1;
      skipBlocks();
    }
  }
  if (typeof DOMParser !== 'undefined' && /<svg[\s>]/i.test(new TextDecoder().decode(bytes))) {
    const source = new TextDecoder().decode(bytes);
    const document = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = document.documentElement;
    if (
      svg.localName === 'svg' &&
      !document.querySelector('parsererror') &&
      !/<!DOCTYPE|<!ENTITY/i.test(source) &&
      !document.querySelector('image, foreignObject, filter, use, script, style') &&
      document.querySelectorAll('*').length <= 1000 &&
      ![...document.querySelectorAll('*')].some((element) =>
        [...element.attributes].some(
          (attribute) =>
            /href|style|filter|mask/i.test(attribute.name) || /url\s*\(/i.test(attribute.value),
        ),
      )
    ) {
      const dimension = (name: string) => Number(svg.getAttribute(name)?.replace(/px$/, ''));
      const box = svg
        .getAttribute('viewBox')
        ?.trim()
        .split(/[\s,]+/)
        .map(Number);
      return {
        width: dimension('width') || box?.[2] || 0,
        height: dimension('height') || box?.[3] || 0,
      };
    }
  }
  throw new Error(
    'Die Bildgröße konnte nicht sicher gelesen werden. Speichere das Bild als JPEG, PNG oder WebP und versuche es erneut.',
  );
}

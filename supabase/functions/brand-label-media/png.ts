const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** Prüft begrenzte RGB/RGBA-PNGs aus dem Canvas und entfernt sämtliche Metadaten. */
export async function inspectLabelPng(bytes: Uint8Array) {
  if (bytes.length > 6000000 || !signature.every((byte, index) => bytes[index] === byte)) {
    throw new Error('invalid_png');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let ended = false;
  let imageEnded = false;
  const imageData: Uint8Array[] = [];
  const retained: Uint8Array[] = [signature];
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error('invalid_png');
    const end = offset + length + 12;
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const payload = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      throw new Error('invalid_png');
    if (!width && type !== 'IHDR') throw new Error('invalid_png');
    if (type === 'IHDR') {
      if (width || length !== 13) throw new Error('invalid_png');
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      channels = payload[9] === 2 ? 3 : payload[9] === 6 ? 4 : 0;
      if (
        width < 1 ||
        height < 1 ||
        width > 1200 ||
        height > 1200 ||
        payload[8] !== 8 ||
        !channels ||
        payload[10] !== 0 ||
        payload[11] !== 0 ||
        payload[12] !== 0
      )
        throw new Error('invalid_png');
      retained.push(bytes.subarray(offset, end));
    } else if (type === 'IDAT') {
      if (imageEnded) throw new Error('invalid_png');
      imageData.push(payload);
      retained.push(bytes.subarray(offset, end));
    } else if (type === 'IEND') {
      if (length || !imageData.length || end !== bytes.length) throw new Error('invalid_png');
      retained.push(bytes.subarray(offset, end));
      ended = true;
    } else {
      if (
        type === 'acTL' ||
        type === 'fcTL' ||
        type === 'fdAT' ||
        !/^[a-z][A-Za-z]{3}$/.test(type)
      ) {
        throw new Error('invalid_png');
      }
      if (imageData.length) imageEnded = true;
    }
    offset = end;
  }
  if (!ended || offset !== bytes.length) throw new Error('invalid_png');
  const rowBytes = width * channels + 1;
  const expectedBytes = rowBytes * height;
  const compressed = join(imageData);
  const stream = new Blob([new Uint8Array(compressed)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  let decodedBytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (decodedBytes + value.length > expectedBytes) throw new Error('invalid_png');
      for (let index = 0; index < value.length; index++) {
        if ((decodedBytes + index) % rowBytes === 0 && (value[index] ?? 255) > 4)
          throw new Error('invalid_png');
      }
      decodedBytes += value.length;
    }
    if (decodedBytes !== expectedBytes) throw new Error('invalid_png');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return { width, height, bytes: join(retained) };
}

export function originalLabelMime(bytes: Uint8Array): string {
  if (signature.every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (
    new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  throw new Error('invalid_original');
}

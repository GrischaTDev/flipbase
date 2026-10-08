import { inspectLabelPng, originalLabelMime } from './png.ts';
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function join(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
function chunk(name: string, payload: Uint8Array) {
  const result = new Uint8Array(payload.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.length);
  result.set(new TextEncoder().encode(name), 4);
  result.set(payload, 8);
  let checksum = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(result.length - 4, (checksum ^ 0xffffffff) >>> 0);
  return result;
}
async function png(
  options: { width?: number; height?: number; pixels?: Uint8Array; extra?: Uint8Array[] } = {},
) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, options.width ?? 1);
  view.setUint32(4, options.height ?? 1);
  header[8] = 8;
  header[9] = 6;
  const pixels = options.pixels ?? new Uint8Array([0, 255, 0, 0, 255]);
  const compressed = new Uint8Array(
    await new Response(
      new Blob([new Uint8Array(pixels)]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  return join([
    signature,
    chunk('IHDR', header),
    ...(options.extra ?? []),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array()),
  ]);
}
async function rejected(bytes: Uint8Array) {
  try {
    await inspectLabelPng(bytes);
  } catch {
    return;
  }
  throw new Error('Malformed PNG accepted');
}
Deno.test('bounded canvas PNG is accepted and pixels preserved', async () => {
  const bytes = await png();
  const result = await inspectLabelPng(bytes);
  if (result.width !== 1 || result.height !== 1 || String(result.bytes) !== String(bytes))
    throw new Error('Invalid result');
});
Deno.test('metadata is removed from the derived image', async () => {
  const clean = await png();
  const withMetadata = await png({
    extra: [chunk('tEXt', new TextEncoder().encode('private location'))],
  });
  if (String((await inspectLabelPng(withMetadata)).bytes) !== String(clean))
    throw new Error('Metadata retained');
});
Deno.test('CRC corruption is rejected', async () => {
  const bytes = await png();
  bytes[30] ^= 1;
  await rejected(bytes);
});
Deno.test('trailing bytes are rejected', async () =>
  rejected(join([await png(), new Uint8Array([0])])),
);
Deno.test('oversize dimensions are rejected', async () => rejected(await png({ width: 1201 })));
Deno.test('animated images are rejected', async () =>
  rejected(await png({ extra: [chunk('acTL', new Uint8Array(8))] })),
);
Deno.test('unknown critical chunk is rejected', async () =>
  rejected(await png({ extra: [chunk('ABCD', new Uint8Array())] })),
);
Deno.test('decompressed overflow is rejected', async () =>
  rejected(await png({ pixels: new Uint8Array(1000000) })),
);
Deno.test('missing scanlines are rejected', async () => rejected(await png({ height: 2 })));
Deno.test('invalid row filter is rejected', async () =>
  rejected(await png({ pixels: new Uint8Array([5, 0, 0, 0, 0]) })),
);
Deno.test('original type is sniffed rather than trusting a filename', () => {
  if (
    originalLabelMime(signature) !== 'image/png' ||
    originalLabelMime(new Uint8Array([255, 216, 255])) !== 'image/jpeg'
  )
    throw new Error('Incorrect type');
  try {
    originalLabelMime(new TextEncoder().encode('<svg/>'));
  } catch {
    return;
  }
  throw new Error('SVG accepted');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Image } from 'jsr:@matmen/imagescript@3.20.3';
import { validateAiConnectionImage } from './image-validation.ts';

test('real PNG, JPEG and WebP bytes are decoded without changing originals', async () => {
  const image = new Image(2, 2);
  for (const [mime, bytes] of [
    ['image/png', await image.encodePNG()],
    ['image/jpeg', await image.encodeJPEG()],
    ['image/webp', await image.encodeWebP()],
  ] as const) {
    const original = bytes.slice();
    await validateAiConnectionImage(bytes, mime, bytes.length);
    assert.deepEqual(bytes, original);
    await assert.rejects(() => validateAiConnectionImage(bytes, mime, bytes.length + 1));
    await assert.rejects(() => validateAiConnectionImage(bytes, 'application/pdf', bytes.length));
  }
});
test('a matching filename or image signature cannot make broken bytes readable', async () => {
  for (const [mime, bytes] of [
    ['image/jpeg', new Uint8Array([255, 216, 0, 0])],
    ['image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/webp', new TextEncoder().encode('RIFF0000WEBP0000')],
  ] as const) {
    await assert.rejects(() => validateAiConnectionImage(bytes, mime, bytes.length));
  }
  await assert.rejects(() => validateAiConnectionImage(new Uint8Array(), 'image/png', 0));
});

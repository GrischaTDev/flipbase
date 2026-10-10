import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalExtensionHandler, hashLocalExtensionSecret } from './handler.ts';
import { loadLocalListingPhoto } from './listing-photo.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  jobId: '9007199254740999',
  claimToken: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  imageId: '9007199254740998',
  action: 'listing_photo' as const,
};
const secret = 'ab'.repeat(32);
const bytes = new Uint8Array([255, 216, 255, 1, 255, 217]);
const image = {
  id: scope.imageId,
  storagePath: scope.workspaceId + '/42/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg',
  mimeType: 'image/jpeg' as const,
  fileName: 'Original.jpg',
  byteSize: bytes.length,
};
const metadata = { connectionId: scope.connectionId, images: [image] };
function request(body: unknown = scope) {
  return new Request('https://fixture.test', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function photoResponse() {
  return new Response(bytes, {
    headers: { 'content-type': image.mimeType, 'content-length': String(bytes.length) },
  });
}

test('photo route returns original bytes without URLs, secrets or JSON encoding', async () => {
  const handler = createLocalExtensionHandler({
    ingest: () => assert.fail('wrong importer'),
    listings: () => assert.fail('wrong listing command'),
    listingPhoto: async (tokenHash, input) => {
      assert.equal(tokenHash, await hashLocalExtensionSecret(secret));
      assert.deepEqual(input, scope);
      return { imageId: scope.imageId, mimeType: image.mimeType, bytes: bytes.buffer };
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), image.mimeType);
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-listing-image-id'), scope.imageId);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('photo route rejects paths, numeric or excessive IDs and never falls back', async () => {
  let calls = 0;
  const handler = createLocalExtensionHandler({
    ingest: () => assert.fail('wrong importer'),
    listingPhoto: () => {
      calls++;
      return Promise.reject(new Error('should not be called'));
    },
  });
  for (const bad of [
    { ...scope, imageId: Number(scope.imageId) },
    { ...scope, imageId: '9223372036854775808' },
    { ...scope, storagePath: image.storagePath },
    { ...scope, url: 'https://private.test/original.jpg' },
    { ...scope, claimToken: null },
    { ...scope, imageId: '../42' },
  ])
    assert.equal((await handler(request(bad))).status, 400);
  assert.equal(calls, 0);
  assert.equal(
    (await createLocalExtensionHandler({ ingest: () => assert.fail() })(request())).status,
    503,
  );
});

test('photo loading checks authority before metadata, before download and before return', async () => {
  const calls: string[] = [];
  const photo = await loadLocalListingPhoto(scope, {
    authorize: () => {
      calls.push('authorize');
      return Promise.resolve(true);
    },
    loadSnapshot: () => {
      calls.push('snapshot');
      return Promise.resolve(metadata);
    },
    download: (path) => {
      assert.equal(path, image.storagePath);
      calls.push('download');
      return Promise.resolve(photoResponse());
    },
  });
  assert.deepEqual(calls, ['authorize', 'snapshot', 'authorize', 'download', 'authorize']);
  assert.deepEqual(photo, {
    imageId: scope.imageId,
    mimeType: image.mimeType,
    bytes: bytes.buffer,
  });
});

test('revocation at any boundary withholds the original bytes', async () => {
  for (const deniedAt of [1, 2, 3]) {
    let checks = 0,
      reads = 0,
      downloads = 0;
    await assert.rejects(
      loadLocalListingPhoto(scope, {
        authorize: () => Promise.resolve(++checks !== deniedAt),
        loadSnapshot: () => {
          reads++;
          return Promise.resolve(metadata);
        },
        download: () => {
          downloads++;
          return Promise.resolve(photoResponse());
        },
      }),
    );
    assert.equal(reads, deniedAt > 1 ? 1 : 0);
    assert.equal(downloads, deniedAt === 3 ? 1 : 0);
  }
});

test('photo metadata cannot escape account, workspace, original image or bounded storage paths', async () => {
  for (const bad of [
    { ...metadata, connectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    { ...metadata, images: [] },
    { ...metadata, images: [image, image] },
    { ...metadata, images: [{ ...image, id: '43' }] },
    { ...metadata, images: [{ ...image, storagePath: 'foreign/42/x.jpg' }] },
    { ...metadata, images: [{ ...image, storagePath: image.storagePath + '/..' }] },
    { ...metadata, images: [{ ...image, byteSize: 50 * 1024 * 1024 + 1 }] },
    { ...metadata, images: [{ ...image, mimeType: 'image/svg+xml' }] },
    { ...metadata, images: [{ ...image, mimeType: 'image/png' }] },
    { ...metadata, images: [{ ...image, byteSize: 0 }] },
  ])
    await assert.rejects(
      loadLocalListingPhoto(scope, {
        authorize: () => Promise.resolve(true),
        loadSnapshot: () => Promise.resolve(bad),
        download: () => assert.fail('invalid snapshot must not download'),
      }),
    );
});

test('storage redirects, wrong types, sizes, truncated or invalid bytes remain unavailable', async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { location: 'https://foreign.test' } }),
    new Response(bytes, { status: 206, headers: { 'content-type': image.mimeType } }),
    new Response(bytes, { headers: { 'content-type': 'image/png' } }),
    new Response(bytes, { headers: { 'content-type': image.mimeType, 'content-length': '1' } }),
    new Response(bytes.subarray(0, 5), { headers: { 'content-type': image.mimeType } }),
    new Response(new Uint8Array(7), { headers: { 'content-type': image.mimeType } }),
    new Response(new Uint8Array(6), { headers: { 'content-type': image.mimeType } }),
  ])
    await assert.rejects(
      loadLocalListingPhoto(scope, {
        authorize: () => Promise.resolve(true),
        loadSnapshot: () => Promise.resolve(metadata),
        download: () => Promise.resolve(response),
      }),
    );
});

test('PNG and WebP originals keep their exact bytes and reject a corrupt WebP length', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const webp = new Uint8Array([82, 73, 70, 70, 10, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 1, 2]);
  for (const [mimeType, extension, originalBytes] of [
    ['image/png', 'png', png],
    ['image/webp', 'webp', webp],
  ] as const) {
    const photo = await loadLocalListingPhoto(scope, {
      authorize: () => Promise.resolve(true),
      loadSnapshot: () =>
        Promise.resolve({
          ...metadata,
          images: [
            {
              ...image,
              mimeType,
              byteSize: originalBytes.length,
              storagePath: image.storagePath.replace(/jpg$/, extension),
            },
          ],
        }),
      download: () =>
        Promise.resolve(new Response(originalBytes, { headers: { 'content-type': mimeType } })),
    });
    assert.deepEqual(new Uint8Array(photo.bytes), originalBytes);
  }
  webp[4] = 11;
  await assert.rejects(
    loadLocalListingPhoto(scope, {
      authorize: () => Promise.resolve(true),
      loadSnapshot: () =>
        Promise.resolve({
          ...metadata,
          images: [
            {
              ...image,
              mimeType: 'image/webp',
              byteSize: webp.length,
              storagePath: image.storagePath.replace(/jpg$/, 'webp'),
            },
          ],
        }),
      download: () =>
        Promise.resolve(new Response(webp, { headers: { 'content-type': 'image/webp' } })),
    }),
  );
});

test('an oversized stream is cancelled and a malformed store result never becomes an image response', async () => {
  let cancelled = false;
  await assert.rejects(
    loadLocalListingPhoto(scope, {
      authorize: () => Promise.resolve(true),
      loadSnapshot: () => Promise.resolve(metadata),
      download: () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(7));
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { 'content-type': image.mimeType } },
          ),
        ),
    }),
  );
  assert.equal(cancelled, true);
  for (const malformed of [
    { imageId: '42', mimeType: image.mimeType, bytes: bytes.buffer },
    { imageId: scope.imageId, mimeType: 'text/html', bytes: bytes.buffer },
    { imageId: scope.imageId, mimeType: image.mimeType, bytes: new ArrayBuffer(0) },
  ]) {
    const handler = createLocalExtensionHandler({
      ingest: () => assert.fail(),
      listingPhoto: () =>
        Promise.resolve(malformed as Awaited<ReturnType<typeof loadLocalListingPhoto>>),
    });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'unavailable' });
  }
});

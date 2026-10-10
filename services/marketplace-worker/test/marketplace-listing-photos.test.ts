import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseMarketplaceListingStore } from '../src/supabase-marketplace-listing-store.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';

const bytes = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64',
  ),
);
const image = {
  ...listingClaimFixture.snapshot.images[0]!,
  storagePath: listingClaimFixture.snapshot.images[0]!.storagePath.replace('.jpg', '.png'),
  fileName: 'jacke.png',
  mimeType: 'image/png' as const,
  byteSize: bytes.length,
};
const claim = {
  ...listingClaimFixture,
  snapshot: { ...listingClaimFixture.snapshot, images: [image] },
};
function fixture(
  options: {
    response?: () => Response;
    revokeAfterRead?: boolean;
    revoked?: boolean;
    storageThrows?: boolean;
  } = {},
) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  let checks = 0;
  const store = new SupabaseMarketplaceListingStore({
    url: 'https://supabase.example.test',
    serviceRoleKey: 'private-test-secret',
    now: () => Date.parse('2026-10-09T12:00:00Z'),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      if (url.pathname.endsWith('_check')) {
        checks++;
        if (options.revoked || (options.revokeAfterRead && checks > 1))
          return Response.json({
            active: false,
            sessionId: null,
            expiresAt: null,
            absoluteExpiresAt: null,
          });
        return Response.json({
          active: true,
          sessionId: claim.scope.listingWrite!.sessionId,
          expiresAt: claim.scope.listingWrite!.expiresAt,
          absoluteExpiresAt: claim.scope.listingWrite!.absoluteExpiresAt,
        });
      }
      if (options.storageThrows) throw new Error('private-test-secret/sensitive-object-path');
      return (
        options.response?.() ??
        new Response(bytes, {
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(bytes.length),
          },
        })
      );
    },
  });
  return { store, calls };
}
test('downloads only a claimed original through the private bucket and rechecks permission', async () => {
  const f = fixture();
  const photo = await f.store.loadPhoto(claim, image.id);
  assert.deepEqual(photo, { id: image.id, fileName: 'jacke.png', mimeType: 'image/png', bytes });
  assert.deepEqual(Object.keys(photo).sort(), ['bytes', 'fileName', 'id', 'mimeType']);
  assert.equal(f.calls.length, 3);
  const download = f.calls[1]!;
  assert.equal(download.url.origin, 'https://supabase.example.test');
  assert.equal(
    download.url.pathname,
    '/storage/v1/object/marketplace-listing-media/' + image.storagePath,
  );
  assert.equal(download.url.search, '');
  assert.equal(download.init?.redirect, 'error');
  assert.equal(
    new Headers(download.init?.headers).get('Authorization'),
    'Bearer private-test-secret',
  );
});
test('revoked permission prevents download and revocation during reading prevents handing over bytes', async () => {
  const f = fixture({ revoked: true });
  await assert.rejects(f.store.loadPhoto(claim, image.id), /Foto/);
  assert.equal(f.calls.length, 1);
  const late = fixture({ revokeAfterRead: true });
  await assert.rejects(late.store.loadPhoto(claim, image.id), /Foto/);
  assert.equal(late.calls.length, 3);
});
test('foreign, absent or unsafe photo references never produce an HTTP request', async () => {
  for (const storagePath of [
    'other/12/photo.png',
    image.storagePath + '?token=x',
    image.storagePath.replace('/12/', '/../'),
  ]) {
    const f = fixture();
    await assert.rejects(
      f.store.loadPhoto(
        { ...claim, snapshot: { ...claim.snapshot, images: [{ ...image, storagePath }] } },
        image.id,
      ),
      /Foto/,
    );
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  await assert.rejects(f.store.loadPhoto(claim, '9007199254740995'), /Foto/);
  assert.equal(f.calls.length, 0);
});
test('metadata, partial replies and invalid image signatures are rejected', async () => {
  for (const response of [
    () => new Response(bytes, { status: 206, headers: { 'Content-Type': 'image/png' } }),
    () => new Response(bytes, { headers: { 'Content-Type': 'text/html' } }),
    () =>
      new Response(bytes, {
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.length + 1) },
      }),
    () => new Response(new Uint8Array(bytes.length), { headers: { 'Content-Type': 'image/png' } }),
    () => new Response(bytes.slice(0, -1), { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    await assert.rejects(fixture({ response }).store.loadPhoto(claim, image.id), /Foto/);
  }
});
test('chunked originals with no length header are checked after the complete stream', async () => {
  const f = fixture({
    response: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.slice(0, 7));
            controller.enqueue(bytes.slice(7, 30));
            controller.enqueue(bytes.slice(30));
            controller.close();
          },
        }),
        { headers: { 'Content-Type': 'image/png' } },
      ),
  });
  assert.deepEqual((await f.store.loadPhoto(claim, image.id)).bytes, bytes);
});
test('oversized metadata and mixed browser rights cannot open the private download route', async () => {
  for (const unsafeClaim of [
    {
      ...claim,
      snapshot: { ...claim.snapshot, images: [{ ...image, byteSize: 50 * 1024 * 1024 + 1 }] },
    },
    { ...claim, scope: { ...claim.scope, userAccessToken: 'other-token' } },
  ]) {
    const f = fixture();
    await assert.rejects(f.store.loadPhoto(unsafeClaim, image.id), /Foto/);
    assert.equal(f.calls.length, 0);
  }
});
test('stream overflow is cancelled before reading the rest or rechecking authorization', async () => {
  let cancelled = false;
  const f = fixture({
    response: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes.length + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'image/png' } },
      ),
  });
  await assert.rejects(f.store.loadPhoto(claim, image.id), /Foto/);
  assert.equal(cancelled, true);
  assert.equal(f.calls.length, 2);
});
test('network errors do not expose server credentials or private object paths', async () => {
  const f = fixture({ storageThrows: true });
  await assert.rejects(f.store.loadPhoto(claim, image.id), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes('private-test-secret'));
    assert.ok(!error.message.includes('sensitive-object-path'));
    assert.equal(error.cause, undefined);
    return true;
  });
});

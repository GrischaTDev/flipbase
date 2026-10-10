import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createVintedListingPhotoSender,
  receiveVintedListingPhoto,
  listingPhotoChunkBytes,
} from '../src/vinted-listing-photo-transfer.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';

test('private photos cross the browser boundary in ordered bounded chunks without storage paths', async () => {
  const bytes = new Uint8Array(listingPhotoChunkBytes * 2 + 13).fill(37);
  const original = { ...listingClaimFixture.snapshot.images[0]!, byteSize: bytes.length };
  let loads = 0,
    checks = 0;
  const sender = createVintedListingPhotoSender(
    [original],
    () => {
      loads++;
      return Promise.resolve({ ...original, bytes });
    },
    () => {
      checks++;
      return Promise.resolve();
    },
  );
  const packets: unknown[] = [];
  const photo = await receiveVintedListingPhoto(original, async (id, offset) => {
    const packet = await sender.chunk(id, offset);
    packets.push(packet);
    return packet;
  });
  assert.deepEqual(photo.bytes, bytes);
  assert.equal(loads, 1);
  assert.equal(packets.length, 3);
  assert.ok(checks >= 6);
  for (const packet of packets) {
    assert.ok(JSON.stringify(packet).length < 2 * 1024 * 1024);
    assert.equal(JSON.stringify(packet).includes('storagePath'), false);
  }
  await assert.rejects(sender.chunk(original.id, 0));
  sender.close();
  await assert.rejects(sender.chunk(original.id, 0));
});

test('foreign IDs, offset drift, parallel requests and revoked authority do not return bytes', async () => {
  const original = listingClaimFixture.snapshot.images[0]!;
  let release!: () => void,
    loads = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sender = createVintedListingPhotoSender(
    [original],
    async () => {
      loads++;
      await pending;
      return { ...original, bytes: new Uint8Array(original.byteSize) };
    },
    () => Promise.resolve(),
  );
  await assert.rejects(sender.chunk('999', 0));
  await assert.rejects(sender.chunk(original.id, 1));
  const first = sender.chunk(original.id, 0);
  await assert.rejects(sender.chunk(original.id, 0));
  sender.close();
  release();
  await assert.rejects(first);
  assert.equal(loads, 1);
  let checks = 0;
  const revoked = createVintedListingPhotoSender(
    [original],
    () => Promise.resolve({ ...original, bytes: new Uint8Array(original.byteSize) }),
    () => (++checks === 2 ? Promise.reject(new Error('revoked')) : Promise.resolve()),
  );
  await assert.rejects(revoked.chunk(original.id, 0), /revoked/);
});

test('the receiving browser rejects wrong metadata, oversized, incomplete and noncanonical chunks', async () => {
  const original = listingClaimFixture.snapshot.images[0]!;
  const packet = {
    id: original.id,
    fileName: original.fileName,
    mimeType: original.mimeType,
    byteSize: original.byteSize,
    offset: 0,
    data: Buffer.alloc(original.byteSize).toString('base64'),
    done: true,
  };
  for (const change of [
    { id: '999' },
    { fileName: 'other.jpg' },
    { mimeType: 'image/png' },
    { byteSize: original.byteSize + 1 },
    { offset: 1 },
    { done: false },
    { data: 'AA==' },
    { data: packet.data + '\n' },
    { data: '_'.repeat(16) },
    { storagePath: original.storagePath },
    { data: 'A'.repeat(2 * 1024 * 1024) },
  ])
    await assert.rejects(
      receiveVintedListingPhoto(original, () => Promise.resolve({ ...packet, ...change })),
    );
});

test('revocation between photo chunks prevents returning a partial original', async () => {
  const original = {
    ...listingClaimFixture.snapshot.images[0]!,
    byteSize: listingPhotoChunkBytes + 17,
  };
  let active = true,
    packets = 0;
  const sender = createVintedListingPhotoSender(
    [original],
    () => Promise.resolve({ ...original, bytes: new Uint8Array(original.byteSize) }),
    () => (active ? Promise.resolve() : Promise.reject(new Error('revoked'))),
  );
  await assert.rejects(
    receiveVintedListingPhoto(original, async (id, offset) => {
      const packet = await sender.chunk(id, offset);
      packets++;
      active = false;
      return packet;
    }),
    /revoked/,
  );
  assert.equal(packets, 1);
  sender.close();
});

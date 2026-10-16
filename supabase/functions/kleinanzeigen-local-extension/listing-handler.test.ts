import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kleinanzeigenJobFixture } from '../../test-support/kleinanzeigen-job-fixture.ts';
import { createKleinanzeigenExtensionHandler } from './handler.ts';
import { kleinanzeigenPhotoSha256 } from '../_shared/kleinanzeigen-photo.ts';
const job = kleinanzeigenJobFixture();
const input = {
  action: 'job_claim',
  workspaceId: job.workspaceId,
  connectionId: job.connectionId,
  generation: 2,
  jobId: job.id,
  claimToken: 'c'.repeat(64),
};
const reply = {
  ...job,
  state: 'claimed',
  version: 2,
  claimToken: input.claimToken,
  leaseUntil: new Date(Date.now() + 120000).toISOString(),
  absoluteExpiresAt: new Date(Date.now() + 900000).toISOString(),
};
function request(body: unknown = input) {
  return new Request('https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'ab'.repeat(32), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
test('Auftragsausführung verwendet Installationshash und den ursprünglichen Versuch', async () => {
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail(),
    job: async (hash, parsed) => {
      assert.notEqual(hash, 'ab'.repeat(32));
      assert.equal(hash.length, 64);
      assert.deepEqual(parsed, input);
      return reply;
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), reply);
});
test('Falsche Versuchkennung oder zusätzliche interne Daten werden nicht weitergegeben', async () => {
  for (const changed of [
    { ...reply, claimToken: 'd'.repeat(64) },
    { ...reply, claimInstallationHash: 'secret' },
    { ...reply, id: '13' },
  ]) {
    const handler = createKleinanzeigenExtensionHandler({
      session: async () => assert.fail(),
      job: async () => changed,
    });
    assert.equal((await handler(request())).status, 502);
  }
});
test('Auftragsbild wird als begrenzter privater Binärinhalt mit gebundener Kennung ausgegeben', async () => {
  const bytes = new Uint8Array([255, 216, 255, 0]);
  const sha256 = await kleinanzeigenPhotoSha256(bytes);
  const image = job.immutableSnapshot.images[0];
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail(),
    photo: async () => ({
      bytes,
      imageId: image.imageId,
      fileName: 'Bild.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4,
      sha256,
    }),
  });
  const response = await handler(
    request({ ...input, action: 'job_photo', imageId: image.imageId }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-flipbase-job-id'), job.id);
  assert.equal(response.headers.get('x-flipbase-image-id'), image.imageId);
  assert.equal(response.headers.get('x-flipbase-image-sha256'), sha256);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
test('Bildantwort eines anderen Bildes wird nicht ausgegeben', async () => {
  const bytes = new Uint8Array([255, 216, 255, 0]);
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail(),
    photo: async () => ({
      bytes,
      imageId: '51000000-0000-4000-8000-000000000072',
      fileName: 'Bild.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4,
      sha256: 'b'.repeat(64),
    }),
  });
  assert.equal(
    (
      await handler(
        request({
          ...input,
          action: 'job_photo',
          imageId: job.immutableSnapshot.images[0].imageId,
        }),
      )
    ).status,
    502,
  );
});

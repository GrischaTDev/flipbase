import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import { loadKleinanzeigenListingPhoto } from './listing-photo.ts';
import { kleinanzeigenPhotoSha256 } from '../_shared/kleinanzeigen-photo.ts';
const workspace = '51000000-0000-4000-8000-000000000011';
const imageId = '51000000-0000-4000-8000-000000000071';
const request = {
  action: 'job_photo' as const,
  workspaceId: workspace,
  connectionId: '9',
  generation: 2,
  jobId: '12',
  claimToken: 'c'.repeat(64),
  imageId,
};
async function fixture() {
  const bytes = new Uint8Array([255, 216, 255, 0]);
  const image = {
    imageId,
    storagePath:
      'kleinanzeigen-jobs/' +
      workspace +
      '/51000000-0000-4000-8000-000000000061/51000000-0000-4000-8000-000000000062/' +
      imageId +
      '.jpg',
    fileName: 'Bild.jpg',
    mimeType: 'image/jpeg',
    byteSize: 4,
    sha256: await kleinanzeigenPhotoSha256(bytes),
  };
  let reads = 0;
  const store = {
    authorize: async () => ({ workspaceId: workspace, connectionId: '9', jobId: '12', image }),
    download: async () => {
      reads++;
      return { bytes, mimeType: 'image/jpeg' };
    },
  };
  return {
    bytes,
    image,
    store,
    get reads() {
      return reads;
    },
  };
}
Deno.test(
  'Nur das beanspruchte unveränderliche Bild mit gleichem Hash verlässt den Endpoint',
  async () => {
    const f = await fixture();
    const result = await loadKleinanzeigenListingPhoto(request, f.store);
    assertEquals(result.bytes, f.bytes);
    assertEquals(result.sha256, f.image.sha256);
    assertEquals(result.imageId, imageId);
  },
);
Deno.test('Fremde oder ausgetauschte Bildreferenz wird vor einem Abruf abgelehnt', async () => {
  const f = await fixture();
  f.image.storagePath = 'https://foreign.test/private';
  await assertRejects(() => loadKleinanzeigenListingPhoto(request, f.store));
  assertEquals(f.reads, 0);
});
Deno.test(
  'Gleiche Dateigröße mit verändertem Inhalt besteht die Inhaltsprüfung nicht',
  async () => {
    const f = await fixture();
    f.store.download = async () => ({
      bytes: new Uint8Array([255, 216, 255, 1]),
      mimeType: 'image/jpeg',
    });
    await assertRejects(() => loadKleinanzeigenListingPhoto(request, f.store));
  },
);
Deno.test('Widerruf oder Ablauf während Abruf verhindert die Ausgabe des Bildes', async () => {
  const f = await fixture();
  const before = f.store.authorize;
  let calls = 0;
  f.store.authorize = async () => {
    calls++;
    if (calls === 2) throw new Error('Freigabe widerrufen');
    return await before();
  };
  await assertRejects(() => loadKleinanzeigenListingPhoto(request, f.store));
  assertEquals(f.reads, 1);
  assertEquals(calls, 2);
});

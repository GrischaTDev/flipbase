import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import { executeKleinanzeigenListingJob, type KleinanzeigenJobStore } from './listing-jobs.ts';
const workspace = '51000000-0000-4000-8000-000000000011';
const draft = '51000000-0000-4000-8000-000000000041';
const requestId = '51000000-0000-4000-8000-000000000061';
const attempt = '51000000-0000-4000-8000-000000000062';
const imageId = '51000000-0000-4000-8000-000000000071';
const content = {
  title: 'Jacke',
  description: 'Ganz',
  priceCents: 1200,
  currency: 'EUR',
  priceType: 'FIXED',
  postalCode: '12345',
  shippingType: 'pickup',
  shippingPriceCents: null,
  categoryId: '153/160/shirts',
  categoryFields: { 'kleidung_herren.condition': 'ok' },
  schemaRevision: 'a'.repeat(64),
};
const input = {
  action: 'listing_enqueue' as const,
  workspaceId: workspace,
  connectionId: '9',
  draftId: draft,
  expectedRevision: 4,
  requestId,
};
const bytes = new Uint8Array([255, 216, 255, 0]);
const preflight = {
  workspaceId: workspace,
  connectionId: '9',
  draftId: draft,
  draftRevision: 4,
  grantGeneration: 2,
  externalAccountId: '88',
  content,
  images: [
    {
      imageId,
      storagePath: 'listings/' + workspace + '/' + draft + '/' + imageId + '.jpg',
      fileName: 'Bild.jpg',
      mimeType: 'image/jpeg',
      byteSize: 4,
      sortOrder: 0,
    },
  ],
};
function job(images: unknown[]) {
  const at = new Date().toISOString();
  return {
    id: '12',
    workspaceId: workspace,
    connectionId: '9',
    draftId: draft,
    draftRevision: 4,
    grantGeneration: 2,
    requestedBy: '51000000-0000-4000-8000-000000000001',
    immutableSnapshot: { ...preflight, images },
    state: 'queued',
    version: 1,
    externalId: null,
    providerState: null,
    verifiedAt: null,
    errorCode: null,
    createdAt: at,
    updatedAt: at,
  };
}
function fixture() {
  const calls: string[] = [];
  let completed: unknown = null;
  let prepared = 0;
  const store: KleinanzeigenJobStore = {
    uuid: () => attempt,
    find: async () => completed,
    prepare: async () => {
      prepared++;
      calls.push('prepare');
      return structuredClone(preflight);
    },
    download: async () => {
      calls.push('download');
      return { bytes, mimeType: 'image/jpeg' };
    },
    upload: async (path) => {
      calls.push('upload:' + path);
    },
    enqueue: async (_input, photos) => {
      calls.push('enqueue');
      completed = job([...photos]);
      return completed;
    },
    load: async () => completed,
    remove: async (paths) => {
      calls.push('remove:' + paths.length);
    },
  };
  return {
    store,
    calls,
    get prepared() {
      return prepared;
    },
    get completed() {
      return completed;
    },
    set completed(value: unknown) {
      completed = value;
    },
  };
}
Deno.test('Auftrag erhält geprüfte private Fotokopie vor atomarer Annahme', async () => {
  const f = fixture();
  const result = await executeKleinanzeigenListingJob(input, f.store);
  assertEquals(result.state, 'queued');
  assertEquals(
    result.immutableSnapshot.images[0].storagePath,
    'kleinanzeigen-jobs/' + workspace + '/' + requestId + '/' + attempt + '/' + imageId + '.jpg',
  );
  assertEquals(result.immutableSnapshot.images[0].sha256.length, 64);
  assertEquals(f.calls.filter((value) => value === 'enqueue').length, 1);
  assertEquals(
    f.calls.some((value) => value.startsWith('remove:')),
    false,
  );
});
Deno.test('Verlorene Annahme wird vor erneutem Herunterladen gefunden', async () => {
  const f = fixture();
  const first = await executeKleinanzeigenListingJob(input, f.store);
  const previous = f.prepared;
  const downloads = f.calls.filter((value) => value === 'download').length;
  assertEquals((await executeKleinanzeigenListingJob(input, f.store)).id, first.id);
  assertEquals(f.prepared, previous);
  assertEquals(f.calls.filter((value) => value === 'download').length, downloads);
});
Deno.test(
  'Geänderte Revision während Fotoarbeit verhindert Annahme und entfernt nur eigene unverwendete Kopien',
  async () => {
    const f = fixture();
    let prepared = 0;
    f.store.prepare = async () => {
      prepared++;
      return { ...preflight, draftRevision: prepared > 3 ? 5 : 4 };
    };
    await assertRejects(() => executeKleinanzeigenListingJob(input, f.store));
    assertEquals(f.calls.includes('enqueue'), false);
    assertEquals(
      f.calls.some((value) => value.startsWith('remove:')),
      true,
    );
  },
);
Deno.test('Unpassender Dateiinhalt kann kein veröffentlichbares Foto werden', async () => {
  const f = fixture();
  f.store.download = async () => ({ bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'image/jpeg' });
  await assertRejects(() => executeKleinanzeigenListingJob(input, f.store));
  assertEquals(
    f.calls.some((value) => value.startsWith('upload:')),
    false,
  );
  assertEquals(f.calls.includes('enqueue'), false);
});
Deno.test(
  'Nach möglicherweise gespeicherter Annahme werden keine eventuell verknüpften Dateien gelöscht',
  async () => {
    const f = fixture();
    const accept = f.store.enqueue;
    f.store.enqueue = async (request, photos) => {
      await accept(request, photos);
      throw new Error('Antwort verloren');
    };
    await assertRejects(() => executeKleinanzeigenListingJob(input, f.store));
    assertEquals(
      f.calls.some((value) => value.startsWith('remove:')),
      false,
    );
    assertEquals((await executeKleinanzeigenListingJob(input, f.store)).state, 'queued');
  },
);
Deno.test(
  'Gleichzeitige gleiche Anfrage darf einen anderen privaten Kopierversuch verwenden',
  async () => {
    const f = fixture();
    f.store.enqueue = async (_input, photos) =>
      job(
        photos.map((photo) => ({
          ...photo,
          storagePath: photo.storagePath.replace(attempt, '51000000-0000-4000-8000-000000000063'),
        })),
      );
    assertEquals((await executeKleinanzeigenListingJob(input, f.store)).state, 'queued');
    assertEquals(
      f.calls.filter((value) => value.startsWith('remove:')),
      ['remove:1'],
    );
  },
);

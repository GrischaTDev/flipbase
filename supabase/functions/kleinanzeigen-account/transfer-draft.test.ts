import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import { saveVintedTransferDraft } from './transfer-draft.ts';
const workspaceId = '50200000-0000-4000-8000-000000000011';
const source = {
  platform: 'vinted' as const,
  workspaceId,
  connectionId: '50200000-0000-4000-8000-000000000021',
  externalId: '123',
  entryId: '50200000-0000-4000-8000-000000000031',
  fingerprint: 'a'.repeat(64),
};
const content = {
  title: 'Jacke',
  description: 'Ganz',
  priceCents: 1200,
  currency: 'EUR' as const,
  priceType: 'FIXED' as const,
  shippingType: 'pickup' as const,
  shippingPriceCents: null,
  postalCode: null,
  categoryId: null,
  categoryFields: {},
  schemaRevision: null,
};
const input = {
  action: 'save_transfer' as const,
  workspaceId,
  targetConnectionId: '12',
  requestId: '50200000-0000-4000-8000-000000000041',
  source,
  content,
  draftId: null,
  expectedRevision: null,
};
function fixture() {
  let copies = 0;
  let finalized = 0;
  const removed: string[][] = [];
  const row = {
    id: '50200000-0000-4000-8000-000000000051',
    workspace_id: workspaceId,
    target_connection_id: '12',
    source_reference: source,
    revision: 1,
    transfer_images_complete: false,
    status: 'prepared',
  };
  const store = {
    authorize: async () => ({
      sourceReference: source,
      photoReferences: ['https://images1.vinted.net/a.jpg', 'https://images2.vinted.net/b.jpg'],
    }),
    save: async () => row,
    copy: async (_id: string, index: number) => {
      copies++;
      return {
        storagePath: 'listings/' + workspaceId + '/' + row.id + '/' + index + '.jpg',
        fileName: index + '.jpg',
        sortOrder: index,
      };
    },
    finalize: async () => {
      finalized++;
      return { ...row, revision: 2, transfer_images_complete: true };
    },
    remove: async (paths: string[]) => {
      removed.push(paths);
    },
  };
  return { store, row, removed, copies: () => copies, finalized: () => finalized };
}
Deno.test(
  'Transfer speichert denselben Entwurf und bestätigt Bilder erst nach vollständiger Übernahme',
  async () => {
    const f = fixture();
    const result = await saveVintedTransferDraft(input, f.store);
    assertEquals(result.transfer_images_complete, true);
    assertEquals(f.copies(), 2);
    assertEquals(f.finalized(), 1);
    assertEquals(f.removed, []);
  },
);
Deno.test(
  'Bereits vollständig gesicherte Fassung kopiert bei Wiederholung keine Fotos erneut',
  async () => {
    const f = fixture();
    f.row.transfer_images_complete = true;
    await saveVintedTransferDraft(input, f.store);
    assertEquals(f.copies(), 0);
    assertEquals(f.finalized(), 0);
  },
);
Deno.test(
  'Teilweise Fotoübernahme bleibt unbestätigt und räumt nur eigene neue Dateien auf',
  async () => {
    const f = fixture();
    const copy = f.store.copy;
    f.store.copy = async (id, index) => {
      if (index === 1) throw new Error('abgelaufen');
      return copy(id, index);
    };
    await assertRejects(() => saveVintedTransferDraft(input, f.store));
    assertEquals(f.finalized(), 0);
    assertEquals(f.removed[0].length, 1);
  },
);
Deno.test(
  'Geänderter Quellfingerprint und verlorene Rechte nach Fotoabruf verhindern Abschluss',
  async () => {
    const f = fixture();
    f.store.authorize = async () => ({
      sourceReference: { ...source, fingerprint: 'b'.repeat(64) },
      photoReferences: [],
    });
    await assertRejects(() => saveVintedTransferDraft(input, f.store));
    assertEquals(f.copies(), 0);
    const g = fixture();
    let checks = 0;
    g.store.authorize = async () => {
      if (checks++) throw new Error('revoked');
      return { sourceReference: source, photoReferences: ['https://images1.vinted.net/a.jpg'] };
    };
    await assertRejects(() => saveVintedTransferDraft(input, g.store));
    assertEquals(g.finalized(), 0);
  },
);

Deno.test(
  'Verlorene Abschlussantwort löscht keine möglicherweise bereits verknüpften Bilder',
  async () => {
    const f = fixture();
    f.store.finalize = async () => {
      throw new Error('Antwort verloren nach Commit');
    };
    await assertRejects(() => saveVintedTransferDraft(input, f.store));
    assertEquals(f.copies(), 2);
    assertEquals(f.removed, []);
  },
);

import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import { readVintedTransferSource, downloadVintedTransferPhoto } from './transfer-source.ts';
const source = {
  externalAccountId: '99',
  externalId: '123',
  title: 'Jacke',
  description: 'Vollständig',
  priceCents: 1200,
  currency: 'EUR',
  photoReferences: ['https://images1.vinted.net/a.jpg'],
  attributeHints: {},
};
Deno.test('Quellenabruf verwendet nur autorisierten vollständigen Bestand', async () => {
  let checks = 0;
  assertEquals(
    (
      await readVintedTransferSource({
        authorize: async () => {
          checks++;
          return { externalAccountId: '99', externalId: '123' };
        },
        load: async () => source,
      })
    ).description,
    'Vollständig',
  );
  assertEquals(checks, 2);
  await assertRejects(() =>
    readVintedTransferSource({
      authorize: async () => ({ externalAccountId: '98', externalId: '123' }),
      load: async () => source,
    }),
  );
});
Deno.test(
  'Bildübernahme verweigert Fremdhosts, Weiterleitungen, falsche MIME-Daten und Übergröße',
  async () => {
    let calls = 0;
    const fetchPhoto = async () => {
      calls++;
      return new Response(new Uint8Array([255, 216, 255, 1]), {
        headers: { 'content-type': 'image/jpeg' },
      });
    };
    assertEquals(
      (await downloadVintedTransferPhoto(source.photoReferences[0], fetchPhoto)).mimeType,
      'image/jpeg',
    );
    await assertRejects(() => downloadVintedTransferPhoto('https://localhost/a', fetchPhoto));
    assertEquals(calls, 1);
    for (const response of [
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } }),
      new Response('<svg>', { headers: { 'content-type': 'image/jpeg' } }),
      new Response('x', {
        headers: { 'content-type': 'image/jpeg', 'content-length': '12582913' },
      }),
    ])
      await assertRejects(() =>
        downloadVintedTransferPhoto(source.photoReferences[0], async () => response),
      );
  },
);
Deno.test('Verlorene Berechtigung nach Quellabruf gibt keine Quelle zurück', async () => {
  let calls = 0;
  await assertRejects(() =>
    readVintedTransferSource({
      authorize: async () => {
        if (calls++) throw new Error('revoked');
        return { externalAccountId: '99', externalId: '123' };
      },
      load: async () => source,
    }),
  );
});

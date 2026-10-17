import { assertEquals, assertThrows } from 'jsr:@std/assert@1.0.14';
import {
  parseKleinanzeigenDraftContent,
  parseVintedTransferSource,
  parseKleinanzeigenTransferRequest,
} from './kleinanzeigen-listing-validation.mts';
const source = {
  externalAccountId: '99',
  externalId: '123',
  title: 'Langer Titel',
  description: 'Vollständig',
  priceCents: 1200,
  currency: 'EUR',
  photoReferences: ['https://images1.vinted.net/a.jpg'],
  attributeHints: { brand: 'Marke' },
};
Deno.test(
  'Vinted-Quelle bleibt vollständig und ist an genau ein Konto und Inserat gebunden',
  () => {
    assertEquals(
      parseVintedTransferSource(
        { ...source, title: 'x'.repeat(66), description: 'y'.repeat(4001) },
        '99',
        '123',
      )?.description.length,
      4001,
    );
    assertEquals(parseVintedTransferSource(source, '98', '123'), null);
    assertEquals(parseVintedTransferSource(source, '99', '124'), null);
    assertEquals(
      parseVintedTransferSource(
        { ...source, photoReferences: ['https://127.0.0.1/a'] },
        '99',
        '123',
      ),
      null,
    );
    assertEquals(
      parseVintedTransferSource({ ...source, photoReferences: [] }, '99', '123')?.photoReferences,
      [],
    );
  },
);
Deno.test('Speicherinhalt hat strikte Basisgrenzen und keine erfundenen Europreise', () => {
  const content = {
    title: 'Jacke',
    description: 'Text',
    priceCents: 1200,
    currency: 'EUR',
    priceType: 'FIXED',
    postalCode: null,
    shippingType: 'pickup',
    shippingPriceCents: null,
    categoryId: null,
    categoryFields: {},
    schemaRevision: null,
  };
  assertEquals(parseKleinanzeigenDraftContent(content)?.priceCents, 1200);
  for (const change of [
    { title: 'x'.repeat(66) },
    { priceCents: null },
    { priceCents: 12.5 },
    { currency: 'GBP' },
    { categoryFields: { size: 12 } },
    { shippingPriceCents: 200 },
    { schemaRevision: 'x'.repeat(129) },
    { secret: 'private' },
  ])
    assertEquals(parseKleinanzeigenDraftContent({ ...content, ...change }), null);
});
Deno.test(
  'Transferanfrage erlaubt nur eigene Vinted-Referenz und geschlossene Aktionsfelder',
  () => {
    const ref = {
      platform: 'vinted',
      workspaceId: '50000000-0000-4000-8000-000000000011',
      connectionId: '50000000-0000-4000-8000-000000000021',
      externalId: '123',
    };
    const request = {
      action: 'prepare_transfer',
      workspaceId: ref.workspaceId,
      targetConnectionId: '9007199254740993',
      source: ref,
      requestId: '50000000-0000-4000-8000-000000000041',
    };
    assertEquals(parseKleinanzeigenTransferRequest(request)?.action, 'prepare_transfer');
    assertEquals(
      parseKleinanzeigenTransferRequest({ ...request, source: { ...ref, platform: 'ebay' } }),
      null,
    );
    assertEquals(parseKleinanzeigenTransferRequest({ ...request, url: 'http://127.0.0.1' }), null);
  },
);

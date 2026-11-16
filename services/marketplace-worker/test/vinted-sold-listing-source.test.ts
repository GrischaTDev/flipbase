import { VintedListingReadError } from '../src/vinted-listing-read-error.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import {
  readVintedSoldListingSource,
  parseVintedSoldListingDocument,
} from '../src/vinted-sold-listing-source.ts';

function fixture(
  overrides: Record<string, unknown> = {},
  description = 'Vollständige Beschreibung\nGröße 45 – Weiß',
  resourceHints = '',
) {
  const record = (id: string, value: unknown) => id + ':' + JSON.stringify(value) + '\n';
  const photos = Array.from({ length: 9 }, (_, index) => ({
    id: 200 + index,
    url: `https://images1.vinted.net/f800/${index}.webp`,
    full_size_url: `https://images1.vinted.net/tc/${index}.webp`,
    is_hidden: false,
  }));
  const flight =
    resourceHints +
    record('1', {
      id: 123,
      seller_id: 456,
      catalog_id: 1453,
      title: 'Laufschuhe',
      price: { amount: '98.9', currency_code: 'EUR' },
      photos: '$a:props:value:photos',
      plugins: '$b:props:plugins',
      ...overrides,
    }) +
    record('a', ['$', '$L4', null, { value: { photos } }]) +
    record('b', [
      '$',
      '$L5',
      null,
      {
        plugins: [
          { type: 'description', data: { item_id: 123, description: '$c' } },
          {
            type: 'attributes',
            data: {
              item_id: 123,
              attributes: [
                { type: 'favouritable', code: 'brand', data: { id: 331974, value: 'On Cloud' } },
                { type: 'faq', code: 'size', data: { id: 511, value: '45' } },
                { type: 'faq', code: 'status', data: { id: 50, value: 'Neu, ohne Etikett' } },
                { code: 'color', data: { value: 'Weiß, Grau' } },
              ],
            },
          },
        ],
      },
    ]) +
    'c:T' +
    Buffer.byteLength(description).toString(16) +
    ',' +
    description +
    record('d', {
      item_id: 123,
      breadcrumbs: [{ url: '/catalog/1453-laufschuhe', title: 'Laufschuhe' }],
    });
  // Auch innerhalb eines Textdatensatzes getrennte Streaming-Blöcke müssen vollständig zusammenkommen.
  return [flight.slice(0, 71), flight.slice(71, -15), flight.slice(-15)].map(
    (chunk) => 'self.__next_f.push(' + JSON.stringify([1, chunk]) + ')',
  );
}

test('übernimmt Beschreibung, Kategorie, Kennungen und alle neun Originalgrößen eines verkauften Artikels', () => {
  const source = parseVintedSoldListingDocument(fixture(), '456', '123');
  assert.equal(source.description, 'Vollständige Beschreibung\nGröße 45 – Weiß');
  assert.equal(source.priceCents, 9890);
  assert.equal(source.attributeHints.category_id, '1453');
  assert.equal(source.attributeHints.category, 'Laufschuhe');
  assert.equal(source.attributeHints.brand_id, '331974');
  assert.equal(source.attributeHints.size, '45');
  assert.equal(source.attributeHints.size_id, undefined);
  assert.equal(source.attributeHints.status, 'Neu, ohne Etikett');
  assert.equal(source.attributeHints.status_id, undefined);
  assert.equal(source.photoReferences.length, 9);
  assert.equal(source.photoReferences[8], 'https://images1.vinted.net/tc/8.webp');
});

test('verwirft fremde Artikel, Konten, fehlende Bezüge und nicht freigegebene Bilder', () => {
  for (const override of [
    { seller_id: 999 },
    { id: 999 },
    { photos: '$dead' },
    { photos: [{ id: 1, url: 'https://example.com/private.webp' }] },
    { plugins: '$b:__proto__' },
    { photos: '$1:photos' },
  ])
    assert.throws(() => parseVintedSoldListingDocument(fixture(override), '456', '123'));
});

test('liest alle Artikeldaten trotz wiederholter unnummerierter Next-Ladehinweise', () => {
  const hints =
    ':HL["https://marketplace-web-assets.vinted.com/_next/static/chunks/fixture.css","style"]\n';
  const source = parseVintedSoldListingDocument(
    fixture({}, undefined, hints.repeat(2)),
    '456',
    '123',
  );
  assert.deepEqual(source, parseVintedSoldListingDocument(fixture(), '456', '123'));
});

test('verwirft ungültige oder abgeschnittene unnummerierte Ladehinweise', () => {
  for (const hints of [':HL[invalid]\n', ':HL{}\n', ':HL["style"]', ':[]\n', ':HL["style"]\n:[]\n'])
    assert.throws(() =>
      parseVintedSoldListingDocument(fixture({}, undefined, hints), '456', '123'),
    );
});

test('führt Skriptinhalt nicht aus und bricht bei abgeschnittenen Streaming-Daten ab', () => {
  assert.throws(() =>
    parseVintedSoldListingDocument(['self.__next_f.push(alert(1))'], '456', '123'),
  );
  assert.throws(() => parseVintedSoldListingDocument(fixture().slice(0, -1), '456', '123'));
});

test('meldet einen fehlgeschlagenen Artikelabruf als Lesefehler und schließt die eigene Seite', async () => {
  let closed = false;
  const page = {
    url: () => 'about:blank',
    goto: async (url: string) => {
      assert.equal(url, 'https://www.vinted.de/items/123');
      throw new Error('navigation failed');
    },
    close: async () => {
      closed = true;
    },
  } as unknown as Page;
  await assert.rejects(
    readVintedSoldListingSource(page, '456', '123', async () => undefined),
    (error: unknown) => error instanceof VintedListingReadError && error.step === 'navigate',
  );
  assert.equal(closed, true);
});

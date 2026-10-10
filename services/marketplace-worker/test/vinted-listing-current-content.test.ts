import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVintedListingCurrentContent } from '../src/vinted-listing-contracts.ts';
import { listingCurrentContentFixture } from './fixtures/vinted-listing-current-content.ts';

test('accepts a complete current listing bound to the expected account and item', () => {
  const input = listingCurrentContentFixture();
  assert.deepEqual(parseVintedListingCurrentContent(input, '123', '98765'), input);
  const withoutBrand = listingCurrentContentFixture();
  withoutBrand.content.brandId = null as unknown as number;
  withoutBrand.content.brandLabel = '';
  withoutBrand.schema.fields[0]!.choices[0]!.selected = false;
  assert.deepEqual(parseVintedListingCurrentContent(withoutBrand, '123', '98765'), withoutBrand);
});

test('rejects foreign bindings, extra data and content that differs from the selected choices', () => {
  const cases: ((value: ReturnType<typeof listingCurrentContentFixture>) => unknown)[] = [
    (value) => ({ ...value, externalId: '98766' }),
    (value) => ({ ...value, externalAccountId: '124' }),
    (value) => ({ ...value, cookies: 'private' }),
    (value) => ({ ...value, content: { ...value.content, sessionToken: 'private' } }),
    (value) => ({ ...value, content: { ...value.content, priceCents: 0 } }),
    (value) => ({ ...value, content: { ...value.content, priceCents: 20.5 } }),
    (value) => ({ ...value, content: { ...value.content, title: 'A\u0000B' } }),
    (value) => ({ ...value, content: { ...value.content, categoryId: 1223 } }),
    (value) => ({ ...value, content: { ...value.content, brandId: 1 } }),
    (value) => ({ ...value, content: { ...value.content, brandLabel: 'Andere Marke' } }),
    (value) => ({ ...value, content: { ...value.content, colorIds: [2, 1] } }),
    (value) => ({ ...value, content: { ...value.content, colorIds: [1], colorLabels: ['Blau'] } }),
    (value) => ({ ...value, content: { ...value.content, packageSizeId: 3 } }),
    (value) => ({ ...value, content: { ...value.content, attributes: { isbn: '1' } } }),
    (value) => ({ ...value, aiPhoto: 'true' }),
    (value) => ({ ...value, photoUrls: [] }),
    (value) => ({ ...value, photoUrls: [value.photoUrls[0], value.photoUrls[0]] }),
    (value) => ({ ...value, photoUrls: ['https://www.vinted.de/unsafe.png'] }),
    (value) => ({ ...value, photoUrls: ['http://images1.vinted.net/t/a/f800/1.webp'] }),
    (value) => ({ ...value, schema: { ...value.schema, categoryId: 1223 } }),
    (value) => ({ ...value, schema: { ...value.schema, aiPhoto: false } }),
  ];
  for (const [index, change] of cases.entries())
    assert.throws(
      () =>
        parseVintedListingCurrentContent(change(listingCurrentContentFixture()), '123', '98765'),
      `case ${index}`,
    );
  assert.throws(() => parseVintedListingCurrentContent(null, '123', '98765'));
  assert.throws(() =>
    parseVintedListingCurrentContent(listingCurrentContentFixture(), '0123', '98765'),
  );
});

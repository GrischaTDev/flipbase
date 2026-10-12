import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import {
  mapVintedListingPhotoIds,
  readVintedListingItem,
} from '../src/vinted-browser-listing-item.ts';

const photo = 'https://images1.vinted.net/tc/fixtureA/f800/1.webp';
const item = {
  id: 98765,
  catalog_id: 2738,
  title: 'Meine Schuhe',
  description: 'Erste Zeile\r\nZweite Zeile',
  price: { amount: '20.5', currency_code: 'EUR' },
  brand_id: 254956,
  color1_id: 1,
  color2_id: null,
  package_size_id: 2,
  item_attributes: [
    { code: 'size', ids: [607] },
    { code: 'condition', ids: [2] },
    { code: 'material', ids: [149, 150] },
    { code: 'unknown', ids: ['x'] },
  ],
  photos: [{ id: 7, url: photo + '?s=1', full_size_url: photo, thumbnails: [{ url: photo }] }],
};
const page = (value: unknown, address = 'https://www.vinted.de/items/98765/edit') =>
  ({ url: () => address, evaluate: () => Promise.resolve(value) }) as unknown as Page;

test('reads the saved state of an own listing from the item query', async () => {
  assert.deepEqual(await readVintedListingItem(page(item), '98765'), {
    title: 'Meine Schuhe',
    description: 'Erste Zeile\nZweite Zeile',
    priceCents: 2050,
    categoryId: 2738,
    brandId: 254956,
    sizeId: 607,
    conditionId: 2,
    colorIds: [1],
    materialIds: [149, 150],
    packageSizeId: 2,
    photos: [{ id: 7, urls: [photo + '?s=1', photo, photo] }],
  });
  // Ein ganzzahliger Betrag und fehlende Merkmale sind gültig.
  const plain = await readVintedListingItem(
    page({ ...item, price: { amount: 10 }, brand_id: null, item_attributes: [] }),
    '98765',
  );
  assert.equal(plain?.priceCents, 1000);
  assert.equal(plain?.brandId, null);
  assert.equal(plain?.sizeId, null);
});

test('returns nothing for a foreign listing, another shape, currency or page', async () => {
  for (const value of [
    null,
    { ...item, id: 1 },
    { ...item, price: { amount: '20.5', currency_code: 'PLN' } },
    { ...item, price: { amount: '20,50', currency_code: 'EUR' } },
    { ...item, catalog_id: 0 },
    { ...item, brand_id: 'x' },
    { ...item, photos: [{ id: 7 }, { id: 7 }] },
    { ...item, item_attributes: [{ code: 'size', ids: [1, 2] }] },
    { ...item, item_attributes: [{ code: 'material', ids: ['x'] }] },
    { ...item, item_attributes: null },
  ])
    assert.equal(await readVintedListingItem(page(value), '98765'), null);
  assert.equal(await readVintedListingItem(page(item, 'https://example.org/'), '98765'), null);
  assert.equal(await readVintedListingItem(page(item), '../98765'), null);
  const failing = {
    url: () => 'https://www.vinted.de/items/98765',
    evaluate: () => Promise.reject(new Error('navigation')),
  } as unknown as Page;
  assert.equal(await readVintedListingItem(failing, '98765'), null);
});

test('maps grid photos to their ids only with matching count, order and address', () => {
  const second = 'https://images1.vinted.net/tc/fixtureB/f800/2.webp';
  const photos = [
    { id: 7, urls: [photo + '?s=1'] },
    { id: 8, urls: ['https://images1.vinted.net/other.webp', second] },
  ];
  assert.deepEqual(
    [...(mapVintedListingPhotoIds([photo, second + '?s=2'], photos) ?? [])],
    [
      [photo, 7],
      [second + '?s=2', 8],
    ],
  );
  assert.equal(mapVintedListingPhotoIds([second, photo], photos), null);
  assert.equal(mapVintedListingPhotoIds([photo], photos), null);
  assert.equal(mapVintedListingPhotoIds([photo, photo], photos), null);
});

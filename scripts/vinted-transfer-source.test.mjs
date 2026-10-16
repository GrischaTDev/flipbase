import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({ URL });
vm.runInContext(
  readFileSync('tools/flipbase-extension/vinted-transfer-source.js', 'utf8'),
  context,
);
const reader = context.FlipbaseVintedTransferSource;
const item = {
  item: {
    id: 123,
    user: { id: 99 },
    title: 'x'.repeat(66),
    description: 'y'.repeat(4001),
    price: { amount: '12.34', currency_code: 'EUR' },
    photos: [
      { id: 1, full_size_url: 'https://images1.vinted.net/a.jpg' },
      { id: 2, url: 'https://images2.vinted.net/b.jpg' },
    ],
    brand: { title: 'Marke' },
    size_title: 'M',
  },
};
test('Lokaler Vollabruf liest nur den bereits belegten eigenen Upload-Endpunkt und bewahrt Text und Fotoreihenfolge', async () => {
  const paths = [];
  const source = await reader.read(
    {
      read: async (path) => {
        paths.push(path);
        return path === '/api/v2/users/current' ? { user: { id: 99 } } : item;
      },
    },
    '99',
    '123',
  );
  assert.equal(source.title.length, 66);
  assert.equal(source.description.length, 4001);
  assert.equal(source.priceCents, 1234);
  assert.deepEqual(Array.from(source.photoReferences), [
    'https://images1.vinted.net/a.jpg',
    'https://images2.vinted.net/b.jpg',
  ]);
  assert.deepEqual(paths, [
    '/api/v2/users/current',
    '/api/v2/item_upload/items/123',
    '/api/v2/users/current',
  ]);
  assert.equal(source.attributeHints.brand, 'Marke');
});
test('Lokaler Quellenabruf verweigert fremdes Konto, fremdes Inserat und unvollständige Fotos', async () => {
  for (const change of [
    { user: { id: 98 } },
    { id: 124 },
    { photos: [] },
    { photos: [{ id: 1, url: 'https://localhost/a.jpg' }] },
    { photos: [{ id: 1, url: 'https://images1.vinted.net/a.jpg' }, { id: 2 }] },
  ])
    await assert.rejects(() =>
      reader.read(
        {
          read: async (path) =>
            path === '/api/v2/users/current'
              ? { user: { id: 99 } }
              : { item: { ...item.item, ...change } },
        },
        '99',
        '123',
      ),
    );
});
test('Kontowechsel nach Detailabruf liefert keine kopierbare Quelle', async () => {
  let reads = 0;
  await assert.rejects(() =>
    reader.read(
      {
        read: async (path) =>
          path === '/api/v2/users/current' ? { user: { id: ++reads === 1 ? 99 : 98 } } : item,
      },
      '99',
      '123',
    ),
  );
});
test('Nicht-Euro-Preis bleibt sichtbar und wird nicht umgerechnet', async () => {
  const source = await reader.read(
    {
      read: async (path) =>
        path === '/api/v2/users/current'
          ? { user: { id: 99 } }
          : { item: { ...item.item, price: { amount: '12.34', currency_code: 'GBP' } } },
    },
    '99',
    '123',
  );
  assert.equal(source.currency, 'GBP');
  assert.equal(source.priceCents, 1234);
});

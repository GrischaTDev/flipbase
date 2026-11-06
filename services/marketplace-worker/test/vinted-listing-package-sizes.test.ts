import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseVintedListingCatalogRead,
  parseVintedListingPackageField,
} from '../src/vinted-listing-catalog.ts';

// Antworten wie am 06.11.2026 im angemeldeten Verkaufsformular gelesen (gekürzt).
const standard = {
  package_sizes: [
    { id: 1, code: 'SMALL', title: 'Klein', standard: true, type: 'standard' },
    { id: 2, code: 'MEDIUM', title: 'Mittel', standard: true, type: 'standard' },
    { id: 3, code: 'LARGE', title: 'Groß', standard: true, type: 'standard' },
  ],
  parcel_measurements: { enabled: false },
};
const heavy = {
  package_sizes: [
    { id: 8, code: 'HEAVY_SMALL', title: '5 kg', type: 'heavy' },
    { id: 9, code: 'HEAVY_MEDIUM', title: '10 kg', type: 'heavy' },
    { id: 10, code: 'HEAVY_LARGE', title: '20 kg', type: 'heavy' },
  ],
};

test('übernimmt Paketgrößen einer Kategorie mit Vinteds Vorschlag', () => {
  assert.deepEqual(parseVintedListingPackageField(standard, { package_size_id: 3 }, 4), {
    code: 'package',
    position: 4,
    required: true,
    selectionType: 'single',
    limit: 1,
    display: 'package',
    title: 'Paketgröße',
    options: [
      { id: 1, title: 'Klein' },
      { id: 2, title: 'Mittel' },
      { id: 3, title: 'Groß' },
    ],
    recommendedId: 3,
  });
  // Schwere Kategorien haben eigene Größen; Vinted schlägt dort zum Beispiel 5 kg vor.
  const parcel = parseVintedListingPackageField(heavy, { package_size_id: 8 }, 0);
  assert.deepEqual(
    parcel.options?.map((option) => option.id),
    [8, 9, 10],
  );
  assert.equal(parcel.recommendedId, 8);
});

test('lässt den Vorschlag weg, wenn Vinted keinen oder einen fremden Wert nennt', () => {
  assert.equal(
    'recommendedId' in parseVintedListingPackageField(standard, { package_size_id: null }, 0),
    false,
  );
  assert.equal(
    'recommendedId' in parseVintedListingPackageField(heavy, { package_size_id: 2 }, 0),
    false,
  );
});

test('lehnt leere, doppelte oder ungültige Paketgrößen ab', () => {
  assert.throws(() => parseVintedListingPackageField({ package_sizes: [] }, {}, 0));
  assert.throws(() =>
    parseVintedListingPackageField(
      { package_sizes: [standard.package_sizes[0], standard.package_sizes[0]] },
      {},
      0,
    ),
  );
  assert.throws(() =>
    parseVintedListingPackageField({ package_sizes: [{ id: 0, title: 'Klein' }] }, {}, 0),
  );
  assert.throws(() => parseVintedListingPackageField(standard, { package_size_id: 'groß' }, 0));
});

test('hält den Vorschlag an der Prozessgrenze und prüft ihn erneut', () => {
  const read = {
    observedAt: '2026-11-06T20:00:00.000Z',
    categories: [
      {
        categoryId: 1193,
        fields: [parseVintedListingPackageField(heavy, { package_size_id: 8 }, 0)],
      },
    ],
  };
  assert.deepEqual(parseVintedListingCatalogRead(read), read);
  assert.throws(() =>
    parseVintedListingCatalogRead({
      ...read,
      categories: [
        { categoryId: 1193, fields: [{ ...read.categories[0]!.fields[0]!, recommendedId: 2 }] },
      ],
    }),
  );
});

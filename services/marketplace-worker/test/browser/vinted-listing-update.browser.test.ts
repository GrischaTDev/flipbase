import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { updateVintedListingContent } from '../../src/vinted-browser-listing-update.ts';
import {
  createVintedListingEditFormFixture,
  editFormPhotoUrls,
} from '../fixtures/vinted-listing-edit-form.ts';
import { parseVintedListingPhotoArrangement } from '../../src/vinted-browser-listing-photo-order.ts';
import { listingCurrentContentFixture } from '../fixtures/vinted-listing-current-content.ts';

const base = listingCurrentContentFixture().content;
const desired = {
  ...base,
  title: 'Fußballschuhe Jako',
  description: 'Kaum getragen.',
  priceCents: 1800,
  brandId: 317425,
  brandLabel: 'Jako-o',
  sizeId: 608,
  sizeLabel: '39',
  conditionId: 3,
  conditionLabel: 'Gut',
  colorIds: [3],
  colorLabels: ['Rot'],
  materialIds: [149, 150],
  materialLabels: ['Acryl', 'Wolle'],
  packageSizeId: 3,
};
const allow = () => Promise.resolve();

test('writes only into an own fresh tab, saves once and confirms by reading the listing again', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      f = await createVintedListingEditFormFixture(page);
    assert.equal(
      await updateVintedListingContent(page, '123', '98765', base, desired, allow),
      'confirmed',
    );
    assert.equal(page.isClosed(), true);
    assert.equal(f.saves(), 1);
    assert.equal(f.writes(), 1);
    assert.deepEqual(f.state(), {
      title: 'Fußballschuhe Jako',
      description: 'Kaum getragen.',
      price: '18,00',
      brand: 317425,
      size: 608,
      condition: 3,
      colors: [3],
      materials: [149, 150],
      packageSize: 3,
      photos: [editFormPhotoUrls[0]],
    });
  } finally {
    await browser.close();
  }
});

test('reports a conflict without writing when the listing changed at Vinted since it was read', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      f = await createVintedListingEditFormFixture(page, { state: { price: '25,00 €' } });
    assert.equal(
      await updateVintedListingContent(page, '123', '98765', base, desired, allow),
      'conflict',
    );
    assert.equal(page.isClosed(), true);
    assert.equal(f.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('does not save an unchanged listing and never reports an ignored save as confirmed', async () => {
  const browser = await chromium.launch();
  try {
    const unchanged = await browser.newPage(),
      first = await createVintedListingEditFormFixture(unchanged);
    assert.equal(
      await updateVintedListingContent(unchanged, '123', '98765', base, base, allow),
      'confirmed',
    );
    assert.equal(first.writes(), 0);
    const ignored = await browser.newPage(),
      second = await createVintedListingEditFormFixture(ignored, { ignoreSave: true });
    assert.equal(
      await updateVintedListingContent(ignored, '123', '98765', base, desired, allow, 1500),
      'unconfirmed',
    );
    assert.equal(second.saves(), 1);
    assert.equal(ignored.isClosed(), true);
  } finally {
    await browser.close();
  }
});

test('rejects locked choices, category changes, foreign accounts and revoked rights before saving', async () => {
  const browser = await chromium.launch();
  try {
    for (const [options, wanted, authorize] of [
      [{}, { ...desired, brandId: 1, brandLabel: 'Gesperrte Marke' }, allow],
      [{}, { ...desired, brandId: 99, brandLabel: 'Unbekannt' }, allow],
      [{}, { ...desired, categoryId: 1223, categoryLabel: 'Bomberjacken' }, allow],
      [{}, { ...desired, priceCents: 0 }, allow],
      [{}, { ...desired, colorIds: [1, 2, 3], colorLabels: ['Blau', 'Gelb', 'Rot'] }, allow],
      [{ foreign: true }, desired, allow],
    ] as const) {
      const page = await browser.newPage(),
        f = await createVintedListingEditFormFixture(page, options);
      await assert.rejects(
        updateVintedListingContent(page, '123', '98765', base, wanted, authorize),
      );
      assert.equal(page.isClosed(), true);
      assert.equal(f.writes(), 0);
    }
    const revoked = await browser.newPage(),
      f = await createVintedListingEditFormFixture(revoked);
    let checks = 0;
    await assert.rejects(
      updateVintedListingContent(revoked, '123', '98765', base, desired, async () => {
        if (++checks > 12) throw new Error('revoked');
      }),
      /revoked/,
    );
    assert.equal(f.writes(), 0);
    const used = await browser.newPage(),
      userWork = await createVintedListingEditFormFixture(used);
    await used.goto('https://www.vinted.de/items/98765/edit');
    await assert.rejects(updateVintedListingContent(used, '123', '98765', base, desired, allow));
    assert.equal(used.isClosed(), false);
    assert.equal(userWork.writes(), 0);
  } finally {
    await browser.close();
  }
});

test('removes and reorders photos before saving and confirms the new order after reading again', async () => {
  const [first, second, third] = editFormPhotoUrls;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      f = await createVintedListingEditFormFixture(page, {
        state: { photos: [first, second, third] },
      });
    // Titelbild wird das dritte Foto, das zweite entfällt; die übrigen Angaben bleiben gleich.
    assert.equal(
      await updateVintedListingContent(page, '123', '98765', base, base, allow, 20_000, {
        base: [first, second, third],
        desired: [third, first],
      }),
      'confirmed',
    );
    assert.equal(f.saves(), 1);
    assert.deepEqual(f.state().photos, [third, first]);
    assert.equal(f.state().title, 'Meine Schuhe');
  } finally {
    await browser.close();
  }
});

test('moves a photo to the front together with a content change', async () => {
  const [first, second, third] = editFormPhotoUrls;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      f = await createVintedListingEditFormFixture(page, {
        state: { photos: [first, second, third] },
      });
    assert.equal(
      await updateVintedListingContent(
        page,
        '123',
        '98765',
        base,
        { ...base, title: 'Neuer Titel' },
        allow,
        20_000,
        { base: [first, second, third], desired: [second, third, first] },
      ),
      'confirmed',
    );
    assert.deepEqual(f.state().photos, [second, third, first]);
    assert.equal(f.state().title, 'Neuer Titel');
    assert.equal(f.saves(), 1);
  } finally {
    await browser.close();
  }
});

test('does not touch photos that changed at Vinted since they were read', async () => {
  const [first, second, third] = editFormPhotoUrls;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      f = await createVintedListingEditFormFixture(page, { state: { photos: [first, third] } });
    assert.equal(
      await updateVintedListingContent(page, '123', '98765', base, base, allow, 20_000, {
        base: [first, second, third],
        desired: [third, first],
      }),
      'conflict',
    );
    assert.equal(f.writes(), 0);
    assert.deepEqual(f.state().photos, [first, third]);
  } finally {
    await browser.close();
  }
});

test('accepts only an arrangement of the known photos', () => {
  const [first, second] = editFormPhotoUrls;
  assert.deepEqual(
    parseVintedListingPhotoArrangement({ base: [first, second], desired: [second] }),
    {
      base: [first, second],
      desired: [second],
    },
  );
  for (const input of [
    { base: [first], desired: [] },
    { base: [first], desired: [second] },
    { base: [first, first], desired: [first] },
    { base: [first], desired: [first, first] },
    { base: [first], desired: ['https://example.org/photo.webp'] },
    { base: ['https://example.org/photo.webp'], desired: ['https://example.org/photo.webp'] },
    { base: [first], desired: [first], extra: true },
    { base: [first] },
    null,
    'text',
  ])
    assert.throws(() => parseVintedListingPhotoArrangement(input), JSON.stringify(input));
});

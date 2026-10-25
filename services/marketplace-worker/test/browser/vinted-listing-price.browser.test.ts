import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { updateVintedListingPrice } from '../../src/vinted-browser-listing-price.ts';
import { createVintedListingEditFormFixture } from '../fixtures/vinted-listing-edit-form.ts';

test('ändert nur den Preis ohne Auswahllisten und bestätigt den gespeicherten Stand', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page);
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      1000,
      async () => undefined,
    );
    assert.equal(result.status, 'confirmed');
    assert.deepEqual(result.fields, {
      title: 'Meine Schuhe',
      description: 'Sehr gut erhalten.',
      price: '10,00',
    });
    assert.equal(form.saves(), 1);
    assert.equal(form.listOpens(), 0);
    assert.equal(form.state().price, '10,00 €');
    assert.equal(form.state().title, 'Meine Schuhe');
    assert.equal(page.isClosed(), true);
  } finally {
    await browser.close();
  }
});

test('weist einen inzwischen geänderten Preis ohne Speichern ab', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page);
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      1800,
      1000,
      async () => undefined,
    );
    assert.equal(result.status, 'conflict');
    assert.equal(result.priceCents, 2050);
    assert.equal(form.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('bestätigt ignoriertes Speichern nicht und klickt nur einmal', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, { ignoreSave: true });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      1000,
      async () => undefined,
      50,
    );
    assert.equal(result.status, 'unconfirmed');
    assert.equal(result.fields, undefined);
    assert.equal(form.saves(), 1);
  } finally {
    await browser.close();
  }
});
test('bestätigt einen bereits gespeicherten Zielpreis ohne einen zweiten Speicherklick', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, { state: { price: '10,00 €' } });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      1000,
      async () => undefined,
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(result.fields?.price, '10,00');
    assert.equal(form.saves(), 0);
  } finally {
    await browser.close();
  }
});

test('fremdes Konto, widerrufene Freigabe und bestehende Benutzerseite werden nicht beschrieben', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, { foreign: true });
    await assert.rejects(
      updateVintedListingPrice(page, '98765', '123', 2050, 1000, async () => undefined),
    );
    assert.equal(form.writes(), 0);
    const revoked = await browser.newPage();
    const revokedForm = await createVintedListingEditFormFixture(revoked);
    let calls = 0;
    await assert.rejects(
      updateVintedListingPrice(revoked, '98765', '123', 2050, 1000, async () => {
        if (++calls === 3) throw new Error('Widerrufen');
      }),
    );
    assert.equal(revokedForm.writes(), 0);
    const used = await browser.newPage();
    const userForm = await createVintedListingEditFormFixture(used);
    await used.goto('https://www.vinted.de/items/98765/edit');
    await assert.rejects(
      updateVintedListingPrice(used, '98765', '123', 2050, 1000, async () => undefined),
    );
    assert.equal(used.isClosed(), false);
    assert.equal(userForm.writes(), 0);
  } finally {
    await browser.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { updateVintedListing } from '../../src/vinted-browser-listing-edit.ts';
import { updateVintedListingPrice } from '../../src/vinted-browser-listing-price.ts';
import { readVintedListingPresence } from '../../src/vinted-browser-listing-delete.ts';
import { createVintedListingEditFormFixture } from '../fixtures/vinted-listing-edit-form.ts';
import { recordVintedWriteRequests } from '../../src/vinted-write-request-shape.ts';

test('fehlende dauerhafte Schreibfreigabe verhindert den echten Speicherklick', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(),
      form = await createVintedListingEditFormFixture(page);
    let markers = 0;
    const authorize = Object.assign(async () => undefined, {
      beforeWrite: async () => {
        markers++;
        throw new Error('begin ACK fehlt');
      },
    });
    const result = await updateVintedListingPrice(page, '98765', '123', 2050, 1000, authorize);
    assert.equal(result.status, 'unconfirmed');
    assert.equal(form.saves(), 0);
    assert.equal(markers, 1);
  } finally {
    await browser.close();
  }
});

test('Lösch-Nachprüfung unterscheidet 404 und technische Fehler ohne eine Schreibanfrage', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await createVintedListingEditFormFixture(page);
    await page.goto('https://www.vinted.de/items/98765/edit');
    let status = 404,
      writes = 0;
    await page.route('https://www.vinted.de/api/v2/item_upload/items/98765', (route) => {
      if (route.request().method() !== 'GET') writes++;
      return route.fulfill({ status, json: status === 200 ? { item: { id: 98765 } } : {} });
    });
    assert.equal(
      await readVintedListingPresence(page, '123', '98765', async () => undefined),
      'absent',
    );
    status = 503;
    assert.equal(
      await readVintedListingPresence(page, '123', '98765', async () => undefined),
      'unknown',
    );
    status = 200;
    assert.equal(
      await readVintedListingPresence(page, '123', '98765', async () => undefined),
      'present',
    );
    assert.equal(writes, 0);
  } finally {
    await browser.close();
  }
});

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

test('bestätigt den gespeicherten Preis auch ohne Seitenwechsel und klickt nur einmal', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, {
      noSaveNavigation: true,
      itemApi: 'full',
      saveResponseDelayMs: 100,
    });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      3990,
      async () => undefined,
      2000,
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(form.saves(), 1);
    assert.equal(form.state().price, '39,90 €');
  } finally {
    await browser.close();
  }
});

test('normalisierter Titel macht eine gespeicherte Preisänderung nicht unklar', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, {
      noSaveNavigation: true,
      itemApi: 'full',
      itemApiTitle: 'Meine Schuhe ',
    });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      3990,
      async () => undefined,
      2000,
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(form.saves(), 1);
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
      2000,
    );
    assert.equal(result.status, 'unconfirmed');
    // Vinted zeigt nach dem ignorierten Klick lesbar weiter den alten Preis.
    assert.equal(result.reason, 'price_pending');
    assert.equal(result.fields, undefined);
    assert.equal(form.saves(), 1);
  } finally {
    await browser.close();
  }
});
test('bestätigt den Preis über Vinteds Speicherantwort, auch wenn das Nachlesen noch den alten Stand zeigt', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, {
      saveApi: 'saved',
      staleItemReads: true,
      noSaveNavigation: true,
    });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      1000,
      async () => undefined,
      5000,
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(result.fields?.price, '10,00');
    assert.equal(form.saves(), 1);
    // Die Messung beschreibt den echten Speicheraufruf nur mit Feldnamen, ohne Werte.
    assert.equal(result.requestShapes?.length, 1);
    assert.deepEqual(
      { ...result.requestShapes![0], fields: undefined },
      {
        method: 'PUT',
        path: '/api/v2/item_upload/items/:id',
        contentType: 'json',
        status: 200,
        fields: undefined,
      },
    );
    assert.ok(result.requestShapes![0]!.fields.includes('price:string'));
    assert.equal(JSON.stringify(result.requestShapes).includes('10,00'), false);
    assert.equal(JSON.stringify(result.requestShapes).includes('Meine Schuhe'), false);
  } finally {
    await browser.close();
  }
});

test('eine abgelehnte Speicherantwort beendet das Warten sofort und bleibt zur Nachprüfung offen', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, {
      saveApi: 'rejected',
      noSaveNavigation: true,
    });
    const started = Date.now();
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      1000,
      async () => undefined,
      30_000,
    );
    assert.equal(result.status, 'unconfirmed');
    assert.equal(result.reason, 'save_rejected');
    assert.ok(Date.now() - started < 20_000);
    assert.equal(form.saves(), 1);
    assert.equal(form.state().price, '20,50 €');
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

test('übernimmt den neuen Preis auch wenn Vinted beim Fokussieren den bisherigen Preis neu rendert', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, { formatPriceOnFocus: true });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      1675,
      async () => undefined,
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(form.saves(), 1);
    assert.equal(form.state().price, '16,75 €');
  } finally {
    await browser.close();
  }
});

test('auch der einfache Bearbeitungs-Fallback fokussiert das Preisfeld vor der Eingabe', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const f = await createVintedListingEditFormFixture(page, {
      formatPriceOnFocus: true,
      saveResponseDelayMs: 200,
    });
    await page.goto('https://www.vinted.de/items/98765');
    assert.equal(
      await updateVintedListing(
        page,
        '98765',
        '123',
        { title: 'Meine Schuhe', description: 'Sehr gut erhalten.', price: '16,75' },
        async () => undefined,
      ),
      'confirmed',
    );
    assert.equal(f.saves(), 1);
    assert.equal(f.state().price, '16,75 €');
    assert.equal(f.readsDuringSave(), 0);
  } finally {
    await browser.close();
  }
});

test('Preisänderung erlaubt fehlende KI- und Push-Auswahl bei gepushten Inseraten, blockiert aber aktive oder unbekannte Checkboxen', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const form = await createVintedListingEditFormFixture(page, {
      missingAiPhoto: true,
      missingBump: true,
    });
    const result = await updateVintedListingPrice(
      page,
      '98765',
      '123',
      2050,
      3990,
      async () => undefined,
    );
    assert.equal(result.status, 'confirmed');
    assert.equal(form.saves(), 1);
    assert.equal(form.state().price, '39,90 €');
    assert.equal(form.state().title, 'Meine Schuhe');
    assert.equal(form.listOpens(), 0);
    for (const blockedOptions of [
      { missingAiPhoto: true, missingBump: true, unknownCheckbox: true },
      { missingAiPhoto: true, bumpChecked: true },
    ]) {
      const blocked = await browser.newPage();
      const blockedForm = await createVintedListingEditFormFixture(blocked, blockedOptions);
      await assert.rejects(
        updateVintedListingPrice(blocked, '98765', '123', 2050, 3990, async () => undefined),
        /Speichern abgebrochen bei lesen/,
      );
      assert.equal(blockedForm.saves(), 0);
      assert.equal(blockedForm.writes(), 0);
    }
  } finally {
    await browser.close();
  }
});

test('die Messung hört nur Vinteds schreibende Schnittstellenaufrufe des Hauptframes mit', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://www.vinted.de/**', (route) =>
      route.request().url().endsWith('/start')
        ? route.fulfill({ contentType: 'text/html', body: '<h1>Vinted</h1>' })
        : route.fulfill({ status: 204 }),
    );
    await page.goto('https://www.vinted.de/start');
    const recorder = await recordVintedWriteRequests(page);
    await page.evaluate(async () => {
      await fetch('/api/v2/items/98765', { method: 'GET' });
      await fetch('/api/v2/items/98765/delete', { method: 'POST' });
      await fetch('/api/v2/item_upload/items/98765', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { price: '10.00', title: 'Geheim' } }),
      });
      await fetch('/fixture/delete/98765', { method: 'DELETE' });
    });
    await recorder.close();
    assert.deepEqual(recorder.shapes(), [
      {
        method: 'POST',
        path: '/api/v2/items/:id/delete',
        contentType: 'none',
        fields: [],
        status: 204,
      },
      {
        method: 'PUT',
        path: '/api/v2/item_upload/items/:id',
        contentType: 'json',
        fields: ['item:object', 'item.price:string', 'item.title:string'],
        status: 204,
      },
    ]);
  } finally {
    await browser.close();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type BrowserContext } from 'playwright';
import { deleteVintedListing } from '../../src/vinted-browser-listing-delete.ts';

type DirectAnswer = 200 | 403 | 'abort' | 'none';

/** Eigene aktive Inseratseite wie bei Vinted, mit Löschdialog und optionalem CSRF-Token. */
async function listingFixture(context: BrowserContext, direct: DirectAnswer) {
  let removed = false;
  const calls = { direct: 0, formDeletes: 0, directHeaders: [] as string[] };
  await context.route('https://www.vinted.de/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v2/users/current')
      return route.fulfill({ json: { user: { id: 123, login: 'fixture' } } });
    if (url.pathname === '/api/v2/item_upload/items/98765')
      return route.fulfill(
        removed
          ? { status: 404, json: { code: 100 } }
          : { json: { item: { id: 98765, is_draft: false } } },
      );
    if (url.pathname === '/api/v2/items/98765/delete' && request.method() === 'POST') {
      calls.direct++;
      calls.directHeaders.push(request.headers()['x-csrf-token'] ?? '');
      if (direct === 'abort') {
        // Vinted hat gelöscht, die Antwort geht aber unterwegs verloren.
        removed = true;
        return route.abort('connectionreset');
      }
      if (direct === 200) removed = true;
      return route.fulfill({ status: direct === 'none' ? 404 : direct, json: {} });
    }
    if (url.pathname === '/fixture/delete/98765') {
      calls.formDeletes++;
      removed = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname === '/member/123')
      return route.fulfill({ contentType: 'text/html', body: '<h1>Profil</h1>' });
    if (url.pathname === '/items/98765')
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<html><head>${direct === 'none' ? '' : '<meta name="csrf-token" content="fixture-csrf">'}</head><body>
          <main id="content"><a href="/member/123">Verkäufer</a>
          <a href="/member/items/close">Als verkauft markieren</a>
          <a href="/member/items/reservation">Als reserviert markieren</a>
          <button data-testid="item-edit-button">Angebot bearbeiten</button>
          <button data-testid="item-delete-button" onclick="document.querySelector('[data-testid=item-delete-modal]').hidden=false">Löschen</button></main>
          <div hidden data-testid="item-delete-modal"><h2>Artikel löschen?</h2>
          <button data-testid="item-delete-confirmation-button" onclick="fetch('/fixture/delete/98765', {method:'DELETE'}).then(()=>{location.href='/member/123'})">Löschen</button></div>
          </body></html>`,
      });
    return route.fulfill({ status: 404, body: '' });
  });
  return calls;
}

async function run(direct: DirectAnswer) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const calls = await listingFixture(context, direct);
    const page = await context.newPage();
    let acknowledgements = 0;
    const authorize = Object.assign(async () => undefined, {
      beforeWrite: async () => {
        acknowledgements++;
      },
    });
    const result = await deleteVintedListing(page, '98765', '123', authorize, 3_000);
    return { result, calls, acknowledgements };
  } finally {
    await browser.close();
  }
}

test('löscht direkt über Vinteds Schnittstelle und bestätigt erst über das nachgelesene 404', async () => {
  const { result, calls, acknowledgements } = await run(200);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.step, 'verify');
  assert.equal(result.via, 'direct');
  assert.equal(calls.direct, 1);
  assert.deepEqual(calls.directHeaders, ['fixture-csrf']);
  assert.equal(calls.formDeletes, 0, 'Kein zusätzlicher Klick im Löschdialog');
  assert.equal(acknowledgements, 1);
  assert.deepEqual(result.requestShapes, [
    {
      method: 'POST',
      path: '/api/v2/items/:id/delete',
      contentType: 'none',
      fields: [],
      status: 200,
    },
  ]);
});

test('eine eindeutige Ablehnung fällt auf die Knöpfe der Seite zurück', async () => {
  const { result, calls } = await run(403);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.via, 'form');
  assert.equal(calls.direct, 1);
  assert.equal(calls.formDeletes, 1);
});

test('ein unklarer direkter Aufruf führt zu keinem zweiten Löschversuch', async () => {
  const { result, calls } = await run('abort');
  assert.equal(result.via, 'direct');
  assert.equal(calls.direct, 1);
  assert.equal(calls.formDeletes, 0, 'Kein zweiter Löschversuch über die Knöpfe');
  // Vinted hatte gelöscht; das Nachlesen belegt es trotz verlorener Antwort.
  assert.equal(result.status, 'confirmed');
});

test('ohne CSRF-Token bleibt es beim bisherigen Weg über die Knöpfe', async () => {
  const { result, calls } = await run('none');
  assert.equal(result.status, 'confirmed');
  assert.equal(result.via, 'form');
  assert.equal(calls.direct, 0);
  assert.equal(calls.formDeletes, 1);
});

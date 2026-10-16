import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
function fixture() {
  const dom = new JSDOM(
    '<input id="ad-title"><textarea id="ad-description"></textarea><input id="ad-price-amount"><input id="ad-zip-code"><input id="ad-city" value="Berlin"><input id="ad-name" value="Privat"><input type="radio" id="ad-type-OFFER" checked><input type="radio" id="ad-buy-now-false" checked><input type="radio" id="ad-shipping-enabled-no" checked><button type="button" id="ad-price-type">Festpreis</button><button type="button" id="submit">Anzeige aufgeben</button>',
    {
      url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html',
      runScripts: 'outside-only',
    },
  );
  const win = dom.window;
  let clicks = 0;
  win.document.getElementById('submit').addEventListener('click', () => clicks++);
  win.FlipbaseKleinanzeigenReader = {
    pageIdentity: () => ({ externalAccountId: '88', accountType: 'private' }),
  };
  win.FlipbaseKleinanzeigenFormReader = { readBase: () => ({ externalAccountId: '88' }) };
  let fee = 'free';
  let photos = ['https://images.test/1.jpg'];
  win.FlipbaseKleinanzeigenPublicationReader = {
    readFee: () => ({ state: fee, observedAt: new Date().toISOString() }),
    readPhotos: () => photos,
    postingButton: () => win.document.getElementById('submit'),
  };
  for (const file of ['autofill-core', 'kleinanzeigen-publication-content'])
    win.eval(readFileSync('tools/flipbase-extension/' + file + '.js', 'utf8'));
  const adapter = win.FlipbaseKleinanzeigenPublicationContent.create(win.document);
  const job = {
    id: '12',
    externalAccountId: '88',
    content: {
      title: 'Jacke',
      description: 'Vollständig',
      priceCents: 1200,
      priceType: 'FIXED',
      postalCode: '10115',
      shippingType: 'pickup',
      categoryFields: {},
    },
    images: [{ imageId: 'one' }],
  };
  const schema = { fields: [] };
  return {
    win,
    adapter,
    job,
    schema,
    get clicks() {
      return clicks;
    },
    set fee(value) {
      fee = value;
    },
    set photos(value) {
      photos = value;
    },
  };
}
test('fills whole euros through the existing native setter without turning 12.00 into 1200', async () => {
  const f = fixture();
  assert.equal((await f.adapter.fill(f.job, f.schema)).valid, true);
  assert.equal(f.win.document.getElementById('ad-price-amount').value, '12');
  assert.equal(f.win.document.getElementById('ad-description').value, 'Vollständig');
  f.job.content.priceCents = 1234;
  await assert.rejects(() => f.adapter.fill(f.job, f.schema));
});
test('checks the actual fields, complete images and fees before a single durable click', async () => {
  const f = fixture();
  await f.adapter.fill(f.job, f.schema);
  await f.adapter.submitOnce(f.job);
  assert.equal(f.clicks, 1);
  await assert.rejects(() => f.adapter.submitOnce(f.job));
  const restarted = f.win.FlipbaseKleinanzeigenPublicationContent.create(f.win.document);
  await assert.rejects(() => restarted.submitOnce(f.job));
  assert.equal(f.clicks, 1);
});
for (const invalid of ['paid', 'unknown', 'photos', 'changed', 'required'])
  test('blocks final click for ' + invalid, async () => {
    const f = fixture();
    await f.adapter.fill(f.job, f.schema);
    if (['paid', 'unknown'].includes(invalid)) f.fee = invalid;
    else if (invalid === 'photos') f.photos = [];
    else if (invalid === 'required')
      f.win.document.body.insertAdjacentHTML(
        'beforeend',
        '<input required aria-label="Neue Pflichtangabe">',
      );
    else f.win.document.getElementById('ad-title').value = 'Geändert';
    await assert.rejects(() => f.adapter.submitOnce(f.job));
    assert.equal(f.clicks, 0);
  });

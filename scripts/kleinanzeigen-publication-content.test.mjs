import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
function fixture() {
  const dom = new JSDOM(
    '<input type="file"><input id="ad-title"><textarea id="ad-description"></textarea><input id="ad-price-amount"><input id="ad-zip-code"><input id="ad-city" value="Berlin"><input id="ad-name" value="Privat"><input type="radio" id="ad-type-OFFER" checked><input type="radio" id="ad-buy-now-false" checked><input type="radio" id="ad-shipping-enabled-no" checked><button type="button" id="ad-price-type">Festpreis</button><button type="button" id="submit">Anzeige aufgeben</button>',
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
  win.eval(readFileSync('tools/flipbase-extension/kleinanzeigen-form-reader.js', 'utf8'));
  win.FlipbaseKleinanzeigenFormReader = {
    readBase: () => ({ externalAccountId: '88' }),
    readCategory: win.FlipbaseKleinanzeigenFormReader.readCategory,
  };
  win.document.body.insertAdjacentHTML(
    'beforeend',
    '<div id="ad-category-path">Mode &amp; Beauty &gt; Herrenbekleidung</div><button role="combobox" id="kleidung_herren.art" aria-required="false">Shirts</button><input type="hidden" name="attributeMap[kleidung_herren.art]" value="shirts">',
  );
  let fee = 'free';
  let photos = [];
  win.FlipbaseKleinanzeigenPublicationReader = {
    readFee: () => ({ state: fee, observedAt: new Date().toISOString() }),
    readPhotos: () => photos,
    postingButton: () => win.document.getElementById('submit'),
  };
  for (const file of ['autofill-core', 'kleinanzeigen-publication-content'])
    win.eval(readFileSync('tools/flipbase-extension/' + file + '.js', 'utf8'));
  Object.defineProperty(win.crypto, 'subtle', {
    value: { digest: async () => new Uint8Array(32).buffer },
  });
  win.FlipbaseAutofill = {
    ...win.FlipbaseAutofill,
    attachImages: () => {
      photos = [...photos, 'https://images.test/' + (photos.length + 1) + '.jpg'];
      return true;
    },
  };
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
      categoryId: '153/160/shirts',
      categoryFields: {},
    },
    images: [
      {
        imageId: 'one',
        fileName: 'eins.png',
        mimeType: 'image/png',
        byteSize: 1,
        sha256: '0'.repeat(64),
      },
    ],
  };
  const schema = {
    fields: [],
    categoryPath: '153/160/shirts',
    categoryLabel: 'Mode & Beauty > Herrenbekleidung > Shirts',
  };
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
async function fillAndUpload(f) {
  await f.adapter.fill(f.job, f.schema);
  for (const image of f.job.images) await f.adapter.upload(f.job, image, 'eA==');
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
  await fillAndUpload(f);
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
    await fillAndUpload(f);
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

for (const change of ['initial', 'visible', 'hidden', 'parent'])
  test('blocks publication when native category changes: ' + change, async () => {
    const f = fixture();
    f.job.content.categoryId = '153/160/shirts';
    f.schema.categoryPath = '153/160/shirts';
    f.schema.categoryLabel = 'Mode & Beauty > Herrenbekleidung > Shirts';
    if (change === 'initial') {
      f.win.document.getElementById('kleidung_herren.art').textContent = 'Pullover';
      await assert.rejects(() => f.adapter.fill(f.job, f.schema));
    } else {
      await fillAndUpload(f);
      if (change === 'visible')
        f.win.document.getElementById('kleidung_herren.art').textContent = 'Pullover';
      if (change === 'hidden')
        f.win.document.querySelector('input[name="attributeMap[kleidung_herren.art]"]').value =
          'pullover';
      if (change === 'parent')
        f.win.document.getElementById('ad-category-path').textContent =
          'Mode & Beauty > Damenbekleidung';
      await assert.rejects(() => f.adapter.submitOnce(f.job));
    }
    assert.equal(f.clicks, 0);
  });
test('verhindert Bildaustausch trotz unveränderter Bildanzahl vor Löschen und Veröffentlichen', async () => {
  const f = fixture();
  await fillAndUpload(f);
  f.photos = ['https://images.test/anderes-bild.jpg'];
  assert.equal(f.adapter.verify(f.job).complete, false);
  await assert.rejects(() => f.adapter.submitOnce(f.job));
  assert.equal(f.clicks, 0);
});

test('verhindert geänderte Bildreihenfolge trotz gleicher Anzahl', async () => {
  const f = fixture();
  f.job.images.push({ ...f.job.images[0], imageId: 'two', fileName: 'zwei.png' });
  await fillAndUpload(f);
  f.photos = ['https://images.test/2.jpg', 'https://images.test/1.jpg'];
  assert.equal(f.adapter.verify(f.job).complete, false);
  await assert.rejects(() => f.adapter.submitOnce(f.job));
  assert.equal(f.clicks, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const context = vm.createContext({ URL, Blob });
for (const file of [
  'kleinanzeigen-provider-reader',
  'kleinanzeigen-form-reader',
  'kleinanzeigen-publication-reader',
  'kleinanzeigen-relisting-images',
])
  vm.runInContext(readFileSync('tools/flipbase-extension/' + file + '.js', 'utf8'), context);
const reader = context.FlipbaseKleinanzeigenPublicationReader;
const relistingImages = context.FlipbaseKleinanzeigenRelistingImages;
test('relisting downloads the large gallery variant instead of the signed edit thumbnail', () => {
  const address =
    'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/00000000-0000-4000-8000-000000000099';
  const result = new URL(relistingImages.sourceUrl(address + '?AccessKeyId=fixture&jwt=thumbnail'));
  assert.equal(result.origin + result.pathname, address);
  assert.equal(result.searchParams.get('rule'), '$_59.AUTO');
  assert.deepEqual([...result.searchParams.keys()], ['rule']);
  for (const invalid of [
    'http://img.kleinanzeigen.de/a',
    'https://img.kleinanzeigen.de.evil.test/a',
    'https://user:password@img.kleinanzeigen.de/a',
  ])
    assert.throws(() => relistingImages.sourceUrl(invalid));
});
test('relisting rejects small, corrupt and undecodable photos before deleting the source', async () => {
  for (const [width, height] of [
    [96, 72],
    [72, 96],
    [0, 900],
  ]) {
    let closed = false;
    await assert.rejects(
      relistingImages.verify(new Uint8Array([1]), 'image/jpeg', async () => ({
        width,
        height,
        close: () => {
          closed = true;
        },
      })),
      /image_quality_insufficient/,
    );
    assert.equal(closed, true);
  }
  await assert.rejects(
    relistingImages.verify(new Uint8Array([1]), 'image/jpeg', async () => {
      throw Error('invalid image');
    }),
    /image_quality_insufficient/,
  );
  for (const [width, height] of [
    [900, 675],
    [675, 900],
  ]) {
    const result = await relistingImages.verify(new Uint8Array([1]), 'image/jpeg', async () => ({
      width,
      height,
      close() {},
    }));
    assert.equal(result.width, width);
    assert.equal(result.height, height);
  }
});
function form(extraValues = ['0:204', '0:914', '0:62', '0:488']) {
  return new JSDOM(
    '<script type="application/json" id="astroSharedData">' +
      JSON.stringify({
        user: { userId: 88, accountType: 'PRIVATE' },
        userProfile: { userId: 88, commercialUser: false, contactName: 'Privat' },
      }) +
      '</script><main><input id="ad-title" maxlength="65"><textarea id="ad-description" maxlength="4000"></textarea><input id="ad-price-amount" maxlength="8"><input id="ad-zip-code" maxlength="5"><div id="ad-category-path">Mode &amp; Beauty &gt; Herrenbekleidung</div><label for="kleidung_herren.art">Art</label><button role="combobox" id="kleidung_herren.art" aria-required="false">Shirts</button><label for="kleidung_herren.groesse">Größe</label><button role="combobox" id="kleidung_herren.groesse" aria-required="false">M</button><input type="hidden" name="attributeMap[kleidung_herren.condition]"><button aria-haspopup="dialog">Zustand auswählenGut</button><input type="radio" id="ad-shipping-enabled-yes"><input type="radio" id="ad-shipping-enabled-no"><button id="ad-shipping-options">Versandmethoden auswählen</button><input type="radio" id="ad-type-OFFER" checked><input type="radio" id="ad-buy-now-false" checked><input type="checkbox" id="ad-address-visibility"><input type="checkbox" id="ad-marketing-consent"><h3>Kostenpflichtige Optionen</h3>' +
      extraValues
        .map(
          (value, i) =>
            '<div role="group"><input type="checkbox" name="articles" value="' +
            value +
            '" data-includedfp="false"><label>Option ' +
            i +
            ' 4,99 €</label></div>',
        )
        .join('') +
      '<button type="button">Anzeige aufgeben</button></main>',
    { url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html' },
  ).window.document;
}
test('recognizes the measured normal form with all paid extras unchecked, without treating Buy Now copy as zero posting cost', () => {
  const doc = form();
  assert.equal(reader.readFee(doc, '88').state, 'free');
  assert.equal(reader.readFee(doc, '89').state, 'unknown');
  doc.getElementById('ad-buy-now-false').checked = false;
  doc.body.append('kostenlos nutzen');
  assert.equal(reader.readFee(doc, '88').state, 'unknown');
});
test('a selected paid add-on or explicit charge takes precedence over the normal posting button', () => {
  const doc = form();
  doc.querySelector('input[name="articles"]').checked = true;
  assert.equal(reader.readFee(doc, '88').state, 'paid');
  const other = form();
  other
    .querySelector('main')
    .insertAdjacentHTML(
      'beforeend',
      '<div role="alert">Für diese Anzeige fällt eine Gebühr von 1,99 € an.</div>',
    );
  assert.equal(reader.readFee(other, '88').state, 'paid');
});

test('recognizes the measured shoe add-ons and blocks every selected paid option', () => {
  const doc = form(['0:202', '0:912', '0:60', '0:486']);
  doc.getElementById('ad-category-path').textContent = 'Mode & Beauty > Herrenschuhe';
  assert.equal(reader.readFee(doc, '88').state, 'free');
  for (const extra of doc.querySelectorAll('input[name="articles"]')) {
    extra.checked = true;
    assert.equal(reader.readFee(doc, '88').state, 'paid');
    extra.checked = false;
  }
});

test('unknown, mixed and duplicate add-on values cannot pass as a measured free form', () => {
  for (const values of [
    ['0:202', '0:912', '0:60', '0:999'],
    ['0:202', '0:914', '0:60', '0:486'],
    ['0:202', '0:912', '0:60', '0:60'],
  ])
    assert.equal(reader.readFee(form(values), '88').state, 'unknown');
});
for (const change of [
  (doc) => doc.querySelector('input[name="articles"]').remove(),
  (doc) =>
    doc
      .querySelector('main')
      .insertAdjacentHTML('beforeend', '<div>Unbekannter Zahlungsschritt</div>'),
  (doc) =>
    doc.querySelector('main').insertAdjacentHTML('beforeend', '<dialog open>Prüfen</dialog>'),
  (doc) => (doc.getElementById('ad-address-visibility').checked = true),
  (doc) => (doc.querySelector('button[type="button"]').textContent = 'Kostenpflichtig aufgeben'),
])
  test('a changed or ambiguous posting form stops', () => {
    const doc = form();
    change(doc);
    assert.notEqual(reader.readFee(doc, '88').state, 'free');
  });

test('closed dialogs and seller-written description do not masquerade as currently payable provider fees', () => {
  const doc = form();
  doc
    .querySelector('main')
    .insertAdjacentHTML('beforeend', '<dialog><p>Gebühr von 4,99 €</p></dialog>');
  doc.getElementById('ad-description').textContent =
    'Keine kostenpflichtige Nachnahme, Gebühr 4,99 €';
  assert.equal(reader.readFee(doc, '88').state, 'free');
});
test('a new selected option outside the measured provider contract cannot pass the free guard', () => {
  const doc = form();
  doc
    .querySelector('main')
    .insertAdjacentHTML(
      'beforeend',
      '<label><input type="checkbox" name="new-promotion" checked>Neues Paket 9,99 €</label>',
    );
  assert.equal(reader.readFee(doc, '88').state, 'unknown');
});

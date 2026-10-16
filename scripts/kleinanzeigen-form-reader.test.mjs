import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const scope = vm.createContext({ URL, URLSearchParams });
for (const name of ['kleinanzeigen-provider-reader', 'kleinanzeigen-form-reader'])
  vm.runInContext(readFileSync('tools/flipbase-extension/' + name + '.js', 'utf8'), scope);
const reader = scope.FlipbaseKleinanzeigenFormReader;
function categories(path = '153') {
  return new JSDOM(
    '<div id="postad-category-select-box"><a id="cat_153" href="#?path=153&isParent=true">Mode &amp; Beauty</a><a id="cat_160" href="#?path=153/160&isParent=true">Herrenbekleidung</a><a id="cat_shirts" href="#?path=153/160/shirts&isParent=undefined">Shirts</a></div><form action="/p-anzeige-aufgeben-schritt2.html" method="post"><button type="submit">Weiter</button></form>',
    {
      url: 'https://www.kleinanzeigen.de/p-kategorie-aendern.html#?path=' + path + '&isParent=true',
    },
  ).window.document;
}
test('Kategoriebaum wird aus tatsächlichen sichtbaren Links gelesen und auf die nächste Ebene begrenzt', () => {
  const result = reader.readCategories(categories());
  assert.equal(result.path, '153');
  assert.deepEqual(JSON.parse(JSON.stringify(result.choices)), [
    { path: '153/160', label: 'Herrenbekleidung', isParent: true },
  ]);
  const leaf = reader.readCategories(categories('153/160/shirts'));
  assert.equal(leaf.selectedLeaf, true);
  assert.equal(leaf.canContinue, true);
  assert.equal(leaf.label, 'Mode & Beauty > Herrenbekleidung > Shirts');
});
test('Fremde Links, widersprüchliche Pfade und geänderte Kategorieformulare stoppen den Leser', () => {
  for (const mutate of [
    (doc) => (doc.querySelector('#cat_160').href = 'https://evil.test/#?path=153/160'),
    (doc) => (doc.querySelector('#cat_160').id = 'cat_999'),
    (doc) => (doc.querySelector('form').action = '/anderes'),
  ]) {
    const doc = categories();
    mutate(doc);
    assert.equal(reader.readCategories(doc), null);
  }
});
test('Formularoptionen bewahren echte Labels und interne Zustandswerte ohne erratene IDs', () => {
  const doc = new JSDOM(
    '<div role="listbox"><div role="option" id="kleidung_herren.groesse-menu-option-0">Bitte wählen</div><div role="option" id="kleidung_herren.groesse-menu-option-1">M</div><div role="option" id="kleidung_herren.groesse-menu-option-2">8XL &amp; mehr</div></div><dialog open aria-labelledby="modal-conditions-title"><h2 id="modal-conditions-title">Zustand</h2><input type="radio" id="new" value="new_with_tag"><label for="new">Neu mit Etikett</label></dialog>',
  ).window.document;
  assert.deepEqual(
    JSON.parse(JSON.stringify(reader.readSelectOptions(doc, 'kleidung_herren.groesse'))),
    [
      { value: 'M', label: 'M' },
      { value: '8XL & mehr', label: '8XL & mehr' },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(reader.readConditionOptions(doc))), [
    { value: 'new_with_tag', label: 'Neu mit Etikett' },
  ]);
});

function form() {
  return new JSDOM(
    '<script type="application/json" id="astroSharedData">' +
      JSON.stringify({
        user: { userId: 88, accountType: 'PRIVATE' },
        userProfile: { userId: 88, commercialUser: false, contactName: 'Privat' },
      }) +
      '</script><input id="ad-title" maxlength="65"><textarea id="ad-description" maxlength="4000"></textarea><input id="ad-price-amount" maxlength="8"><input id="ad-zip-code" maxlength="5"><div id="ad-category-path">Mode &amp; Beauty &gt; Herrenbekleidung</div><label for="kleidung_herren.art">Art</label><button role="combobox" id="kleidung_herren.art" aria-required="false">Shirts</button><label for="kleidung_herren.groesse">Größe</label><button role="combobox" id="kleidung_herren.groesse" aria-required="false">Bitte wählen</button><label for="kleidung_herren.brand">Marke</label><input role="combobox" id="kleidung_herren.brand" aria-required="false"><input type="hidden" name="attributeMap[kleidung_herren.condition]"><button aria-haspopup="dialog">Zustand auswählenBitte wählen</button><input type="radio" id="ad-shipping-enabled-yes"><input type="radio" id="ad-shipping-enabled-no"><button id="ad-shipping-options">Versandmethoden auswählen</button>',
    { url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html' },
  ).window.document;
}
test('Basisfelder werden nur mit passender Identität und gemessenen Zielgrenzen gelesen', () => {
  const doc = form();
  const base = reader.readBase(doc, '88');
  assert.equal(base.externalAccountId, '88');
  assert.equal(base.priceStepCents, 100);
  assert.deepEqual(JSON.parse(JSON.stringify(base.fields)), [
    {
      key: 'kleidung_herren.groesse',
      label: 'Größe',
      kind: 'select',
      selection: 'label',
      required: false,
    },
    {
      key: 'kleidung_herren.brand',
      label: 'Marke',
      kind: 'search',
      selection: 'label',
      required: false,
    },
    {
      key: 'kleidung_herren.condition',
      label: 'Zustand',
      kind: 'select',
      selection: 'value',
      required: false,
    },
  ]);
  assert.equal(reader.readBase(doc, '89'), null);
  doc.querySelector('#ad-title').maxLength = 100;
  assert.equal(reader.readBase(doc, '88'), null);
});
test('Versandwerte und Größen kommen aus den geöffneten Dialogfeldern', () => {
  const doc = new JSDOM(
    '<dialog open><h2>Versandmethoden</h2><label for="small">Klein</label><input id="small" type="radio" value="SMALL" checked><label for="medium">Mittel</label><input id="medium" type="radio" value="MEDIUM"></dialog>',
  ).window.document;
  assert.equal(reader.readShippingGroups(doc)[1].value, 'MEDIUM');
  doc.querySelector('dialog').innerHTML =
    '<h2>Versandmethoden</h2><div><input type="checkbox" id="dhl" value="DHL_001" checked aria-describedby="desc"><label for="dhl">DHL Paket 2 kg</label><p id="desc">6,19 €; Käufer zahlt</p></div>';
  const methods = reader.readShippingMethods(doc);
  assert.equal(methods.choices[0].value, 'DHL_001');
  assert.equal(methods.choices[0].description, '6,19 €; Käufer zahlt');
  assert.equal(methods.selected[0], 'DHL_001');
});

test('Die Versandbeschreibung erhält den tatsächlich sichtbaren Preis außerhalb des aria-describedby-Blocks', () => {
  const doc = new JSDOM(
    '<dialog open><h2>Versandmethoden</h2><div><div><input type="checkbox" value="DHL_001" id="shipping" aria-describedby="details"></div><label for="shipping">DHL Paket 2 kg</label><span>6,19 €</span><div id="details">Max. 2 kg</div></div></dialog>',
  ).window.document;
  assert.match(reader.readShippingMethods(doc).choices[0].description, /6,19 €/u);
});

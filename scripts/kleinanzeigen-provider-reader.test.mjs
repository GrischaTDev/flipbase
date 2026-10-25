import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { JSDOM } from 'jsdom';
const context = vm.createContext({ URL });
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-provider-reader.js', 'utf8'),
  context,
);
const reader = context.FlipbaseKleinanzeigenReader;
const identity = {
  user: { userId: 123, accountType: 'PRIVATE' },
  userProfile: { userId: '123', contactName: 'Testkonto', commercialUser: false },
};
function doc(html, path = '/p-anzeige-aufgeben-schritt2.html') {
  return new JSDOM(
    '<script id="astroSharedData" type="application/json">' +
      JSON.stringify(identity) +
      '</script>' +
      html,
    { url: 'https://www.kleinanzeigen.de' + path },
  ).window.document;
}
test('reads only a matching stable account identity, never email or tokens', () => {
  const result = reader.parseIdentity(identity);
  assert.equal(result?.externalAccountId, '123');
  assert.equal(result?.accountType, 'private');
  assert.deepEqual(Object.keys(result).sort(), ['accountType', 'displayName', 'externalAccountId']);
  assert.equal(
    reader.parseIdentity({ ...identity, userProfile: { ...identity.userProfile, userId: '124' } }),
    null,
  );
  assert.equal(reader.parseIdentity({}), null);
});
test('unknown commercial status is never inferred from missing PRO', () => {
  assert.equal(
    reader.parseIdentity({
      ...identity,
      user: { ...identity.user, accountType: 'BUSINESS' },
      userProfile: { ...identity.userProfile, commercialUser: true },
    })?.accountType,
    'commercial',
  );
  assert.equal(
    reader.parseIdentity({
      ...identity,
      user: { userId: 123 },
      userProfile: { userId: '123', contactName: 'Test' },
    }),
    null,
  );
});
test('reads official activity, not active ads as the 30-day count', () => {
  const page = doc(
    '<main><div>Du hast aktuell 17 Anzeigen online. Du hast in den letzten 30 Tagen 8 Anzeigen aufgegeben.</div></main>',
    '/m-einstellungen.html',
  );
  const result = reader.readQuota(page, '2026-10-16T06:00:00Z');
  assert.equal(result?.used, 8);
  assert.equal(result?.externalAccountId, '123');
  assert.equal(result?.source, 'account_settings');
  assert.equal(
    reader.readQuota(doc('<main>17 Anzeigen online</main>'), '2026-10-16T06:00:00Z'),
    null,
  );
});
test('conflicting or malformed counters remain unknown', () => {
  assert.equal(
    reader.readQuota(
      doc(
        '<main>Du hast in den letzten 30 Tagen 8 Anzeigen aufgegeben. Du hast in den letzten 30 Tagen 9 Anzeigen aufgegeben.</main>',
        '/m-einstellungen.html',
      ),
      '2026-10-16T06:00:00Z',
    ),
    null,
  );
  assert.equal(
    reader.readQuota(
      doc(
        '<main>Du hast in den letzten 30 Tagen 8 Anzeigen aufgegeben.</main>',
        '/m-einstellungen.html',
      ),
      'bad',
    ),
    null,
  );
});
test('login pages and incomplete lists cannot become a complete empty snapshot', () => {
  assert.equal(
    reader.readPublicationPage(doc('<main>Bitte anmelden</main>', '/m-meine-anzeigen.html')),
    null,
  );
  assert.equal(
    reader.readPublicationPage(
      doc('<ul id="my-manageitems-adlist"></ul>', '/m-meine-anzeigen.html'),
    ),
    null,
  );
});
test('reads external ID and unknown published date without using expiry date', () => {
  const page = doc(
    '<main><h1>Mein Profil und meine Anzeigen</h1><ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="999"><h3><a href="https://www.kleinanzeigen.de/s-anzeige/test/999-160-1">Anzeige Test</a></h3><span class="managead-listitem-enddate">20.10.2026</span><button>Reservieren</button></li></ul><nav aria-label="Seiten-Navigation"><button disabled>Zurück</button><button aria-current="page" aria-disabled="true">Seite 1</button><button disabled>Nächste</button></nav></main>',
    '/m-meine-anzeigen.html',
  );
  const result = reader.readPublicationPage(page);
  assert.equal(result?.items[0]?.externalId, '999');
  assert.equal(result?.items[0]?.publishedAt, null);
  assert.equal(result?.items[0]?.state, 'active');
  assert.equal(result?.complete, true);
});

test('legacy own listings prove account identity from their observed render call', () => {
  const page = doc(
    '<main><h1>Mein Profil und meine Anzeigen</h1><h2><span>Profil von</span>Testkonto</h2><p>Privater Nutzer</p><ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="999"><h3><a href="https://www.kleinanzeigen.de/s-anzeige/test/999-160-1">Anzeige Test</a></h3><button>Reservieren</button></li></ul><nav aria-labelledby="pages"><span id="pages">Seiten-Navigation</span><button aria-current="page" aria-disabled="true">Seite 1</button><button aria-label="Nächste" aria-disabled="true">Nächste</button></nav></main><script>window.myAdsFrontend.render({containerId: "my-ads-frontend", userId: 123});</script>',
    '/m-meine-anzeigen.html',
  );
  page.querySelector('#astroSharedData').remove();
  assert.equal(reader.readPublicationPage(page)?.identity.externalAccountId, '123');
  assert.equal(reader.readPublicationPage(page)?.complete, true);
});
test('a second conflicting legacy identity cannot pass', () => {
  const page = doc(
    '<script>window.myAdsFrontend.render({userId: 124});</script>',
    '/m-meine-anzeigen.html',
  );
  assert.equal(reader.pageIdentity(page, '/m-meine-anzeigen.html'), null);
});

test('returns verifiable page cursors instead of reusing an unbounded next token', () => {
  const page = doc(
    '<main><h1>Mein Profil und meine Anzeigen</h1><ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="999"><h3><a href="/s-anzeige/test/999-160-1">Anzeige Test</a></h3><button>Reservieren</button></li></ul><nav aria-label="Seiten-Navigation"><button aria-current="page">Seite 1</button><button aria-label="Nächste" aria-disabled="false">Nächste</button></nav></main>',
    '/m-meine-anzeigen.html',
  );
  const result = reader.readPublicationPage(page);
  assert.equal(result?.pageCursor, 'page:1');
  assert.equal(result?.nextCursor, 'page:2');
  assert.equal(result?.complete, false);
  page.querySelector('[aria-current]').textContent = 'Seite 2';
  page.querySelector('[aria-label="Nächste"]').setAttribute('aria-disabled', 'true');
  const last = reader.readPublicationPage(page);
  assert.equal(last?.pageCursor, 'page:2');
  assert.equal(last?.nextCursor, null);
  assert.equal(last?.complete, true);
});
test('a missing or contradictory current page cannot confirm an empty list', () => {
  const page = doc(
    '<main><h1>Mein Profil und meine Anzeigen</h1><ul id="my-manageitems-adlist"></ul><nav aria-label="Seiten-Navigation"><button aria-label="Nächste" aria-disabled="true">Nächste</button></nav></main>',
    '/m-meine-anzeigen.html',
  );
  assert.equal(reader.readPublicationPage(page), null);
  page
    .querySelector('nav')
    .insertAdjacentHTML(
      'afterbegin',
      '<button aria-current="page">Seite 1</button><button aria-current="page">Seite 2</button>',
    );
  assert.equal(reader.readPublicationPage(page), null);
});

test('reads only the own-card price and image without paid option prices or expiry', () => {
  const page = doc(
    '<main><h1>Mein Profil und meine Anzeigen</h1><ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="999"><a href="/s-anzeige/test/999-160-1"><img data-testid="ad-image" src="https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/test?rule=$_2.JPG"></a><div><h3><a href="/s-anzeige/test/999-160-1">Anzeige Test</a></h3><ul class="list"><li class="text-title3">1.234,56 € VB</li><li>Endet am 20.10.2026</li></ul></div><section><span>2,99 €</span></section><button>Reservieren</button></li></ul><nav aria-label="Seiten-Navigation"><button aria-current="page">Seite 1</button><button disabled>Nächste</button></nav></main>',
    '/m-meine-anzeigen.html',
  );
  const item = reader.readPublicationPage(page).items[0];
  assert.equal(item.priceCents, 123456);
  assert.equal(item.currency, 'EUR');
  assert.equal(
    item.imageUrl,
    'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/test?rule=$_2.JPG',
  );
  assert.equal(item.publishedAt, null);
  assert.equal(item.publishedOn, null);
});

test('reads a detail calendar day without inventing a publication time', () => {
  const detail = doc(
    '<div id="viewad-main-info"><h1 id="viewad-title">Test</h1><div><svg data-title="calendarOutline"></svg><span>21.08.2026</span></div></div>',
    '/s-anzeige/test/999-160-1',
  );
  assert.equal(
    reader.readPublicationDetails(detail, { externalId: '999', title: 'Test' }).publishedOn,
    '2026-08-21',
  );
  detail.querySelector('span').textContent = '31.02.2026';
  assert.equal(
    reader.readPublicationDetails(detail, { externalId: '999', title: 'Test' }).publishedOn,
    null,
  );
  assert.equal(reader.readPublicationDetails(detail, { externalId: '998', title: 'Test' }), null);
  assert.equal(reader.readPublicationDetails(detail, { externalId: '999', title: 'Other' }), null);
});

test('an absent price, pure VB and untrusted images stay unknown', () => {
  const page = doc(
    '<main><h1>Mein Profil und meine Anzeigen</h1><ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="999"><img data-testid="ad-image" src="https://foreign.example/a.jpg"><div><h3><a href="/s-anzeige/test/999-160-1">Anzeige Test</a></h3><ul class="list"><li class="text-title3">VB</li></ul></div><button>Reservieren</button></li></ul><nav aria-label="Seiten-Navigation"><button aria-current="page">Seite 1</button><button disabled>N&auml;chste</button></nav></main>',
    '/m-meine-anzeigen.html',
  );
  const item = reader.readPublicationPage(page).items[0];
  assert.equal(item.priceCents, null);
  assert.equal(item.currency, null);
  assert.equal(item.imageUrl, null);
  page.querySelector('.text-title3').textContent = '0 \u20ac';
  assert.equal(reader.readPublicationPage(page).items[0].priceCents, 0);
});
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-relisting-content.js', 'utf8'),
  context,
);
function relistingDocument() {
  return doc(
    `<main><input type="hidden" name="adId" value="999"><input id="ad-title" value="Jacke"><textarea id="ad-description">Originaltext</textarea><input id="ad-price-amount" value="12"><button id="ad-price-type">VB Preistyp</button><input id="ad-zip-code" value="12345"><input type="radio" id="ad-type-OFFER" checked><input type="radio" id="ad-shipping-enabled-no" checked><span id="ad-category-path">Mode &amp; Beauty &gt; Herrenbekleidung</span><button id="kleidung_herren.art">Shirts</button><input type="hidden" name="attributeMap[kleidung_herren.art]" value="shirts"><input type="hidden" name="attributeMap[kleidung_herren.condition]" value="ok"><input type="hidden" name="adImages[0].url" value="https://img.kleinanzeigen.de/api/v1/prod-ads/images/original"><img alt="Bild zur Anzeige" src="https://img.kleinanzeigen.de/thumbnail"></main>`,
    '/p-anzeige-bearbeiten.html?adId=999',
  );
}
test('sichert bei erneutem Inserieren Texte, Originalquelle und Anbieterwerte aus der eigenen Bearbeitung', () => {
  const source = context.FlipbaseKleinanzeigenRelistingContent.readSource(
    relistingDocument(),
    '123',
    '999',
  );
  assert.equal(source.content.title, 'Jacke');
  assert.equal(source.content.description, 'Originaltext');
  assert.equal(source.content.priceType, 'NEGOTIABLE');
  assert.equal(source.categoryLabel, 'Mode & Beauty > Herrenbekleidung > Shirts');
  assert.equal(source.imageUrls[0], 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/original');
  assert.equal(source.content.categoryFields['kleidung_herren.condition'], 'ok');
});
for (const change of [
  (document) => (document.querySelector('input[name="adId"]').value = '998'),
  (document) => document.querySelector('input[name="adImages[0].url"]').remove(),
  (document) =>
    (document.querySelector('input[name="adImages[0].url"]').value = 'https://evil.test/image'),
  (document) => document.body.insertAdjacentHTML('beforeend', '<div role="progressbar"></div>'),
])
  test('löscht nicht bei widersprüchlicher Quellanzeige oder noch ladenden Bildern', () => {
    const document = relistingDocument();
    change(document);
    assert.throws(() =>
      context.FlipbaseKleinanzeigenRelistingContent.readSource(document, '123', '999'),
    );
  });

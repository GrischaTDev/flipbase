import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { JSDOM } from 'jsdom';
const extensionId = 'a'.repeat(32);
function fixture({ stale = false, account = '88' } = {}) {
  const now = Date.now();
  const doc = new JSDOM(
    '<script id="astroSharedData" type="application/json">' +
      JSON.stringify({
        user: { userId: account, accountType: 'PRIVATE' },
        userProfile: { userId: account, commercialUser: false, contactName: 'Test' },
      }) +
      '</script><a href="#">Kategorie ändern</a>',
    { url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html#flipbase-form-read' },
  ).window.document;
  let listener;
  let clicks = 0;
  doc.querySelector('a').addEventListener('click', (event) => {
    event.preventDefault();
    clicks++;
  });
  const win = {};
  win.top = win;
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Date,
    Number,
    setTimeout,
    KeyboardEvent: doc.defaultView.KeyboardEvent,
    document: doc,
    window: win,
    performance: { timeOrigin: now - (stale ? 10000 : 0) },
    chrome: { runtime: { id: extensionId, onMessage: { addListener: (fn) => (listener = fn) } } },
  });
  for (const file of [
    'kleinanzeigen-provider-reader',
    'kleinanzeigen-form-reader',
    'kleinanzeigen-form-content',
  ])
    vm.runInContext(readFileSync('tools/flipbase-extension/' + file + '.js', 'utf8'), context);
  const message = {
    type: 'KLEINANZEIGEN_FORM_STEP',
    minimumDocumentTime: now - 100,
    expectedExternalAccountId: '88',
    categoryPath: '',
    action: 'enter_categories',
  };
  const send = (input = message, sender = { id: extensionId }) =>
    new Promise((resolve) => {
      const active = listener(input, sender, resolve);
      if (active === false) resolve(null);
    });
  return { doc, listener, message, send, clicks: () => clicks };
}
test('Kategorieeinstieg ist frisch, kontogebunden und führt keinen Speichern- oder Inserierenklick aus', async () => {
  const f = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(await f.send())), {
    success: true,
    result: { moving: true },
  });
  assert.equal(f.clicks(), 1);
});
test('Fremde Erweiterung, Anbietertab als Sender und alte Dokumente werden ignoriert', async () => {
  const f = fixture();
  for (const sender of [{ id: 'b'.repeat(32) }, { id: extensionId, tab: { id: 1 } }])
    assert.equal(await f.send(f.message, sender), null);
  assert.equal(await fixture({ stale: true }).send(), null);
  assert.equal(f.clicks(), 0);
});
test('Kontowechsel und unerwartete Befehle stoppen ohne Formularklick', async () => {
  const f = fixture({ account: '89' });
  assert.equal((await f.send()).errorCode, 'account_changed');
  assert.equal(f.clicks(), 0);
  const other = fixture();
  assert.equal((await other.send({ ...other.message, action: 'submit' })).errorCode, 'unsupported');
  assert.equal(other.clicks(), 0);
});
test('Nicht angebotene Kategorien und zusätzliche Kategorie-Links werden nicht geraten', async () => {
  const f = fixture();
  assert.equal(
    (await f.send({ ...f.message, action: 'choose_category', categoryPath: '153/160/shirts' }))
      .errorCode,
    'schema_changed',
  );
  const second = f.doc.createElement('a');
  second.textContent = 'Kategorie ändern';
  f.doc.body.append(second);
  assert.equal((await f.send()).errorCode, 'schema_changed');
  assert.equal(f.clicks(), 0);
});

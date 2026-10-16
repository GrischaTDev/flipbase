import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { JSDOM } from 'jsdom';
const extensionId = 'a'.repeat(32);
function fixture({ stale = false, login = false, publications = false } = {}) {
  const now = Date.now();
  const dom = new JSDOM(
    (login
      ? ''
      : '<script id="astroSharedData" type="application/json">' +
        JSON.stringify({
          user: { userId: 123, accountType: 'PRIVATE' },
          userProfile: {
            userId: '123',
            contactName: 'Testkonto',
            commercialUser: false,
            email: 'private@example.test',
            csrfToken: 'never-return',
          },
        }) +
        '</script>') +
      (publications
        ? '<main><h1>Mein Profil und meine Anzeigen</h1><ul id="my-manageitems-adlist"><li data-testid="ad-card" data-adid="101"><h3><a href="/s-anzeige/test/101-160-1">Anzeige Test</a></h3><button>Reservieren</button></li></ul><nav aria-label="Seiten-Navigation"><button aria-current="page">Seite 1</button><button aria-label="Nächste" aria-disabled="false">Nächste</button></nav></main>'
        : '<main>Du hast aktuell 17 Anzeigen online. Du hast in den letzten 30 Tagen 8 Anzeigen aufgegeben.</main>'),
    {
      url:
        'https://www.kleinanzeigen.de/' +
        (publications ? 'm-meine-anzeigen.html' : 'm-einstellungen.html'),
    },
  );
  let listener;
  const win = {};
  win.top = win;
  const context = vm.createContext({
    URL,
    document: dom.window.document,
    window: win,
    performance: { timeOrigin: now - (stale ? 10000 : 0) },
    chrome: { runtime: { id: extensionId, onMessage: { addListener: (fn) => (listener = fn) } } },
  });
  for (const file of ['kleinanzeigen-provider-reader.js', 'kleinanzeigen-local-content.js'])
    vm.runInContext(readFileSync('tools/flipbase-extension/' + file, 'utf8'), context);
  assert.equal(typeof listener, 'function');
  return { now, listener, document: dom.window.document };
}
test('reads only public identity and official quota from a fresh account document', () => {
  const f = fixture();
  let response;
  f.listener(
    { type: 'KLEINANZEIGEN_READ_ACCOUNT', minimumDocumentTime: f.now - 100 },
    { id: extensionId },
    (value) => (response = value),
  );
  assert.equal(response.success, true);
  assert.equal(response.result.quota.used, 8);
  assert.equal(response.result.identity.externalAccountId, '123');
  assert.ok(!JSON.stringify(response).includes('private@example.test'));
  assert.ok(!JSON.stringify(response).includes('never-return'));
});
test('rejects other extensions and unrecognized commands', () => {
  const f = fixture();
  assert.equal(
    f.listener(
      { type: 'KLEINANZEIGEN_READ_ACCOUNT', minimumDocumentTime: f.now },
      { id: 'b'.repeat(32) },
      () => assert.fail(),
    ),
    false,
  );
  assert.equal(
    f.listener({ type: 'CLICK_SUBMIT' }, { id: extensionId }, () => assert.fail()),
    false,
  );
});
test('does not timestamp an old document as a fresh quota observation', () => {
  const f = fixture({ stale: true });
  let result;
  f.listener(
    { type: 'KLEINANZEIGEN_READ_ACCOUNT', minimumDocumentTime: f.now - 100 },
    { id: extensionId },
    (value) => (result = value),
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'not_ready');
});
test('a login page cannot prove a connected empty account', () => {
  const f = fixture({ login: true });
  let result;
  f.listener(
    { type: 'KLEINANZEIGEN_READ_ACCOUNT', minimumDocumentTime: f.now - 100 },
    { id: extensionId },
    (value) => (result = value),
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'needs_login');
});

test('publication reads require the requested page and bound account', () => {
  const f = fixture({ publications: true });
  let reply;
  const message = {
    type: 'KLEINANZEIGEN_READ_PAGE',
    minimumDocumentTime: f.now - 100,
    expectedExternalAccountId: '123',
    expectedCursor: 'page:1',
  };
  f.listener(message, { id: extensionId }, (value) => {
    reply = value;
  });
  assert.equal(reply.success, true);
  assert.equal(reply.result.pageCursor, 'page:1');
  assert.equal(reply.result.nextCursor, 'page:2');
  f.listener({ ...message, expectedCursor: 'page:2' }, { id: extensionId }, (value) => {
    reply = value;
  });
  assert.equal(reply.success, false);
  assert.equal(reply.errorCode, 'not_ready');
  f.listener({ ...message, expectedExternalAccountId: '124' }, { id: extensionId }, (value) => {
    reply = value;
  });
  assert.equal(reply.errorCode, 'account_changed');
});
test('advances exactly one observed page and never clicks a mismatching or disabled navigation', () => {
  const f = fixture({ publications: true });
  let clicks = 0;
  const next = f.document.querySelector('[aria-label="Nächste"]');
  next.addEventListener('click', () => {
    clicks++;
  });
  let reply;
  const message = {
    type: 'KLEINANZEIGEN_ADVANCE_PAGE',
    minimumDocumentTime: f.now - 100,
    expectedExternalAccountId: '123',
    expectedCursor: 'page:1',
    nextCursor: 'page:2',
  };
  f.listener({ ...message, expectedExternalAccountId: '124' }, { id: extensionId }, (value) => {
    reply = value;
  });
  assert.equal(clicks, 0);
  assert.equal(reply.errorCode, 'account_changed');
  f.listener(message, { id: extensionId }, (value) => {
    reply = value;
  });
  assert.equal(clicks, 1);
  assert.equal(reply.success, true);
  next.setAttribute('aria-disabled', 'true');
  f.listener(message, { id: extensionId }, (value) => {
    reply = value;
  });
  assert.equal(clicks, 1);
  assert.equal(reply.success, false);
});

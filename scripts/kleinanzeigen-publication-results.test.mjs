import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const context = vm.createContext({ URL });
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-publication-results.js', 'utf8'),
  context,
);
const results = context.FlipbaseKleinanzeigenPublicationResults;
const job = { externalAccountId: '88', content: { title: 'Jacke' } };
const item = {
  externalId: '999',
  title: 'Jacke',
  state: 'active',
  url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2',
};
const receipt = {
  url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt3.html',
  candidates: [item.url],
};
const page = {
  identity: { externalAccountId: '88', accountType: 'private' },
  items: [item],
  complete: true,
};
test('confirms only a new exact receipt target also present as active in the same complete account list', () => {
  const result = results.confirm(job, ['77'], receipt, [page], Date.now());
  assert.equal(result.outcome, 'confirmed');
  assert.equal(result.externalId, '999');
  assert.equal(result.url, item.url);
});
for (const patch of [
  'existing',
  'different_account',
  'different_title',
  'not_active',
  'incomplete',
  'ambiguous',
  'no_receipt',
  'ordinary_list',
])
  test('keeps ' + patch + ' uncertain without inventing a successful publication', () => {
    let baseline = ['77'],
      r = structuredClone(receipt),
      p = structuredClone(page);
    if (patch === 'existing') baseline.push('999');
    if (patch === 'different_account') p.identity.externalAccountId = '89';
    if (patch === 'different_title') p.items[0].title = 'Anders';
    if (patch === 'not_active') p.items[0].state = 'unknown';
    if (patch === 'incomplete') p.complete = false;
    if (patch === 'ambiguous') {
      p.items.push({ ...item, externalId: '998', url: item.url.replace('999-', '998-') });
      r.candidates.push(item.url.replace('999-', '998-'));
    }
    if (patch === 'no_receipt') r.candidates = [];
    if (patch === 'ordinary_list') r.url = 'https://www.kleinanzeigen.de/m-meine-anzeigen.html';
    assert.equal(results.confirm(job, baseline, r, [p], Date.now()).outcome, 'outcome_unknown');
  });

test('manuelle Erfolgsmeldung bleibt nach Navigation erhalten, fremder Versuch wird abgewiesen', () => {
  const dom = new JSDOM('<a href="' + item.url + '">Anzeige ansehen</a>', {
    url: receipt.url,
    runScripts: 'outside-only',
  });
  const win = dom.window;
  const marker = { jobId: '12', attemptId: 'a'.repeat(36), minimumDocumentTime: 1 };
  win.sessionStorage.setItem('flipbase_kleinanzeigen_attempt', JSON.stringify(marker));
  let listener;
  win.chrome = {
    runtime: { id: 'extension', onMessage: { addListener: (value) => (listener = value) } },
  };
  win.eval(readFileSync('tools/flipbase-extension/kleinanzeigen-publication-results.js', 'utf8'));
  assert.ok(
    JSON.parse(
      win.sessionStorage.getItem('flipbase_kleinanzeigen_receipt'),
    ).receipt.candidates.includes(item.url),
  );
  dom.reconfigure({ url: 'https://www.kleinanzeigen.de/m-meine-anzeigen.html' });
  win.document.body.replaceChildren();
  const message = { type: 'KLEINANZEIGEN_READ_RECEIPT', ...marker };
  let response;
  assert.equal(
    listener(message, { id: 'extension' }, (value) => (response = value)),
    true,
  );
  assert.ok(response.result.receipt.candidates.includes(item.url));
  assert.equal(
    listener({ ...message, attemptId: 'b'.repeat(36) }, { id: 'extension' }, () => assert.fail()),
    false,
  );
  win.close();
});
test('ordnet den erfolgreichen Klick statt eines früheren Versuchs dem gespeicherten Beleg zu', () => {
  const dom = new JSDOM('<button id="submit">Anzeige aufgeben</button>', {
    url: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html',
    runScripts: 'outside-only',
  });
  const win = dom.window;
  let now = Date.parse('2026-11-01T22:59:00Z');
  win.Date = class extends Date {
    constructor() {
      super(now);
    }
  };
  let listener;
  win.chrome = {
    runtime: { id: 'extension', onMessage: { addListener: (value) => (listener = value) } },
  };
  win.FlipbaseKleinanzeigenPublicationReader = {
    postingButton: (doc) => doc.getElementById('submit'),
  };
  const marker = { jobId: '12', attemptId: 'a'.repeat(36), minimumDocumentTime: 1 };
  win.sessionStorage.setItem('flipbase_kleinanzeigen_attempt', JSON.stringify(marker));
  win.eval(readFileSync('tools/flipbase-extension/kleinanzeigen-publication-results.js', 'utf8'));
  win.document.getElementById('submit').click();
  now = Date.parse('2026-11-02T00:01:00Z');
  win.document.getElementById('submit').click();
  dom.reconfigure({ url: receipt.url });
  win.document.body.innerHTML = '<a href="' + item.url + '">Anzeige ansehen</a>';
  const read = () => {
    let response;
    listener(
      { type: 'KLEINANZEIGEN_READ_RECEIPT', ...marker },
      { id: 'extension' },
      (value) => (response = value),
    );
    return response.result.receipt;
  };
  assert.equal(read().submittedAt, new Date(now).toISOString());
  dom.reconfigure({ url: 'https://www.kleinanzeigen.de/m-meine-anzeigen.html' });
  win.document.body.replaceChildren();
  win.sessionStorage.setItem(
    'flipbase_kleinanzeigen_attempt',
    JSON.stringify({ ...marker, submittedAt: '2026-11-03T00:01:00Z' }),
  );
  assert.equal(
    read().submittedAt,
    new Date(now).toISOString(),
    'Ein vorhandener Erfolgsbeleg behält seinen Klickzeitpunkt',
  );
  win.close();
});

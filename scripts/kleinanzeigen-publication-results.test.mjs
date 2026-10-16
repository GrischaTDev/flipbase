import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
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

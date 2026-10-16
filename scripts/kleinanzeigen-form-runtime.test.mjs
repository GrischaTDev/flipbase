import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const scope = vm.createContext({ Date });
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-form-runtime.js', 'utf8'),
  scope,
);
const runtime = scope.FlipbaseKleinanzeigenForm;
function fixture(path = '153/160/shirts') {
  const calls = [];
  const binding = { workspaceId: 'w', connectionId: '9', generation: 2, externalAccountId: '88' };
  const installation = { phase: 'connected', appOrigin: 'https://app.flipbase.de', binding };
  const pages = {
    '': { path: '', label: '', choices: [{ path: '153', label: 'Mode', isParent: true }] },
    153: {
      path: '153',
      label: 'Mode',
      choices: [{ path: '153/160', label: 'Herren', isParent: true }],
    },
    '153/160': {
      path: '153/160',
      label: 'Mode > Herren',
      choices: [{ path: '153/160/shirts', label: 'Shirts', isParent: false }],
    },
    '153/160/shirts': {
      path: '153/160/shirts',
      label: 'Mode > Herren > Shirts',
      choices: [],
      selectedLeaf: true,
      canContinue: true,
    },
  };
  const adapter = {
    now: () => Date.now(),
    check: async () => binding,
    readIdentity: async () => ({ externalAccountId: '88', accountType: 'private' }),
    open: async () => {
      calls.push('open');
      return pages[''];
    },
    choose: async (next) => {
      calls.push(next);
      return pages[next];
    },
    continue: async () => calls.push('continue'),
    readSchema: async () => {
      calls.push('schema');
      return { categoryPath: path };
    },
    seal: async (schema) => {
      calls.push('seal');
      return { schema, schemaRevision: 'sealed' };
    },
  };
  return {
    calls,
    pages,
    binding,
    installation,
    input: { ...binding, categoryPath: path },
    adapter,
  };
}
test('durchläuft ausschließlich beobachtete Kategoriepfade und versiegelt erst nach erneuter Identität', async () => {
  const f = fixture();
  const result = await runtime.run(f.installation, f.input, 'https://app.flipbase.de', f.adapter);
  assert.equal(result.schemaRevision, 'sealed');
  assert.deepEqual(f.calls, [
    'open',
    '153',
    '153/160',
    '153/160/shirts',
    'continue',
    'schema',
    'seal',
  ]);
});
test('Kategorieebene liefert Auswahl ohne Weiter oder Formularabruf', async () => {
  const f = fixture('153');
  const result = await runtime.run(f.installation, f.input, 'https://app.flipbase.de', f.adapter);
  assert.equal(result.schema, null);
  assert.equal(result.choices[0].path, '153/160');
  assert.deepEqual(f.calls, ['open', '153']);
});
for (const problem of ['origin', 'generation', 'identity', 'path', 'revoked'])
  test('stoppt vor weiterer Formulararbeit bei ' + problem, async () => {
    const f = fixture();
    let origin = 'https://app.flipbase.de';
    if (problem === 'origin') origin = 'https://foreign.test';
    if (problem === 'generation') f.input.generation = 1;
    if (problem === 'identity')
      f.adapter.readIdentity = async () => ({ externalAccountId: '89', accountType: 'private' });
    if (problem === 'path') f.pages['153'].choices = [];
    if (problem === 'revoked') f.adapter.check = async () => ({ ...f.binding, generation: 3 });
    await assert.rejects(runtime.run(f.installation, f.input, origin, f.adapter));
    assert.equal(f.calls.includes('seal'), false);
  });

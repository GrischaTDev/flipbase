import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKleinanzeigenExtensionHandler } from './handler.ts';
const schema = {
  categoryPath: '153/160/shirts',
  categoryLabel: 'Shirts',
  titleMax: 65,
  descriptionMax: 4000,
  photoCountMax: 20,
  photoBytesMax: 12582912,
  priceStepCents: 100,
  fields: [],
  shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
};
const input = {
  action: 'form_schema',
  workspaceId: '50300000-0000-4000-8000-000000000011',
  connectionId: '9007199254740993',
  externalAccountId: '123',
  generation: 2,
  schema,
  observedAt: new Date().toISOString(),
};
function request(body: unknown) {
  return new Request('https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'ab'.repeat(32), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const reply = {
  workspaceId: input.workspaceId,
  connectionId: input.connectionId,
  externalAccountId: '123',
  generation: 2,
  categoryPath: schema.categoryPath,
  categoryLabel: schema.categoryLabel,
  choices: [],
  schema,
  schemaRevision: 'a'.repeat(64),
  observedAt: input.observedAt,
};
test('Formularimport verwendet Secret-Hash und gibt ausschließlich den passenden versiegelten Stand zurück', async () => {
  let calls = 0;
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail(),
    formSchema: async (hash, body) => {
      assert.notEqual(hash, 'ab'.repeat(32));
      assert.deepEqual(body, input);
      calls++;
      return reply;
    },
  });
  const response = await handler(request(input));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), reply);
  assert.equal(calls, 1);
});
test('Ungültige Formularantworten oder zusätzliche Secrets verlassen den Endpoint nicht', async () => {
  for (const changed of [
    { ...reply, generation: 3 },
    { ...reply, secret: 'private' },
    { ...reply, schemaRevision: null },
    { ...reply, categoryPath: '153/155' },
  ]) {
    const handler = createKleinanzeigenExtensionHandler({
      session: async () => assert.fail(),
      formSchema: async () => changed,
    });
    assert.equal((await handler(request(input))).status, 502);
  }
});
test('Alte oder unbekannte Formularfelder erreichen keine Datenbank', async () => {
  const handler = createKleinanzeigenExtensionHandler({
    session: async () => assert.fail(),
    formSchema: async () => assert.fail(),
  });
  for (const changed of [
    { ...input, observedAt: '2000-01-01T00:00:00Z' },
    { ...input, schema: { ...schema, titleMax: 100 } },
    { ...input, csrf: 'secret' },
  ])
    assert.equal((await handler(request(changed))).status, 400);
});

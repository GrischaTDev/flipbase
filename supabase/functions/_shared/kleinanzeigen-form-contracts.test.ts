import { assertEquals } from 'jsr:@std/assert@1.0.14';
import {
  parseKleinanzeigenFormImport,
  parseKleinanzeigenFormResult,
  parseKleinanzeigenProviderSchema,
} from './kleinanzeigen-form-contracts.ts';
const schema = {
  categoryPath: '153/160/shirts',
  categoryLabel: 'Shirts',
  titleMax: 65,
  descriptionMax: 4000,
  photoCountMax: 20,
  photoBytesMax: 12582912,
  priceStepCents: 100,
  fields: [
    {
      key: 'kleidung_herren.condition',
      label: 'Zustand',
      kind: 'select',
      selection: 'value',
      required: false,
      choices: [{ value: 'ok', label: 'Gut', description: '' }],
    },
  ],
  shipping: { defaultGroup: null, defaultMethods: [], groups: [] },
};
const now = Date.parse('2026-10-16T12:00:00Z');
const input = {
  action: 'form_schema',
  workspaceId: '50300000-0000-4000-8000-000000000011',
  connectionId: '9007199254740993',
  generation: 2,
  externalAccountId: '123',
  schema,
  observedAt: new Date(now).toISOString(),
};
Deno.test('Formularimport enthält ausschließlich frische vollständige gebundene Felder', () => {
  assertEquals<unknown>(parseKleinanzeigenFormImport(input, now), input);
  for (const value of [
    { ...input, token: 'secret' },
    { ...input, connectionId: 9007199254740993 },
    { ...input, generation: 0 },
    { ...input, observedAt: new Date(now - 60001).toISOString() },
    { ...input, observedAt: new Date(now + 5001).toISOString() },
    { ...input, schema: { ...schema, priceStepCents: 1 } },
  ])
    assertEquals(parseKleinanzeigenFormImport(value, now), null);
});
Deno.test('Unbekannte und doppelte Formular- oder Versandwerte werden abgelehnt', () => {
  assertEquals(
    parseKleinanzeigenProviderSchema({ ...schema, fields: [...schema.fields, ...schema.fields] }),
    null,
  );
  assertEquals(
    parseKleinanzeigenProviderSchema({
      ...schema,
      shipping: {
        defaultGroup: 'SMALL',
        defaultMethods: ['FAKE'],
        groups: [
          {
            value: 'SMALL',
            label: 'Klein',
            choices: [{ value: 'DHL_001', label: 'DHL', description: '' }],
          },
        ],
      },
    }),
    null,
  );
  assertEquals(parseKleinanzeigenProviderSchema({ ...schema, csrf: 'secret' }), null);
});
Deno.test(
  'Öffentliche Antwort muss Konto, Generation, Kategorie und Schema eindeutig zuordnen',
  () => {
    const scope = {
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      externalAccountId: '123',
      generation: 2,
      categoryPath: schema.categoryPath,
    };
    const reply = {
      ...scope,
      categoryLabel: 'Shirts',
      choices: [],
      schema,
      schemaRevision: 'a'.repeat(64),
      observedAt: input.observedAt,
    };
    assertEquals<unknown>(parseKleinanzeigenFormResult(reply, scope), reply);
    assertEquals(parseKleinanzeigenFormResult({ ...reply, generation: 3 }, scope), null);
    assertEquals(parseKleinanzeigenFormResult({ ...reply, schemaRevision: null }, scope), null);
    assertEquals(parseKleinanzeigenFormResult({ ...reply, secret: 'never' }, scope), null);
  },
);

import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { createLocalExtensionHandler } from './handler.ts';
const scope = {
  workspaceId: '50100000-0000-4000-8000-000000000011',
  connectionId: '50100000-0000-4000-8000-000000000021',
};
const entryId = '50100000-0000-4000-8000-000000000031';
const source = {
  externalAccountId: '99',
  externalId: '123',
  title: 'Jacke',
  description: 'Vollständig',
  priceCents: 1200,
  currency: 'EUR',
  photoReferences: ['https://images1.vinted.net/a.jpg'],
  attributeHints: {},
};
function request(body: unknown) {
  return new Request('https://api.example.test', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'a'.repeat(64), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
Deno.test(
  'Lokaler Quellenabruf benötigt nur die eigene Lesefreigabe und gibt keine Quelldaten oder Secrets zurück',
  async () => {
    let calls = 0;
    const handler = createLocalExtensionHandler({
      ingest: async () => {
        throw new Error('wrong');
      },
      sourceDetails: async (hash, input) => {
        calls++;
        assertEquals(hash.length, 64);
        return {
          ok: true,
          ...scope,
          entryId,
          externalId: '123',
          externalAccountId: '99',
          generation: 3,
          expiresAt: '2099-01-01T00:00:00Z',
          ...(input.action === 'source_details_import' ? { fingerprint: 'b'.repeat(64) } : {}),
        };
      },
    });
    for (const body of [
      { action: 'source_details_state', ...scope, entryId, externalId: '123' },
      {
        action: 'source_details_import',
        ...scope,
        entryId,
        externalId: '123',
        generation: 3,
        source,
      },
    ]) {
      const response = await handler(request(body));
      assertEquals(response.status, 200);
      const result = await response.json();
      assertEquals(result.externalAccountId, '99');
      assertEquals('source' in result, false);
    }
    assertEquals(calls, 2);
  },
);
Deno.test(
  'Ungültige Quellimporte und fremde Antworten werden vor der Übernahme abgelehnt',
  async () => {
    let calls = 0;
    const handler = createLocalExtensionHandler({
      ingest: async () => null,
      sourceDetails: async () => {
        calls++;
        return {
          ok: true,
          ...scope,
          entryId,
          externalId: '124',
          externalAccountId: '99',
          generation: 3,
          expiresAt: '2099-01-01T00:00:00Z',
        };
      },
    });
    const base = {
      action: 'source_details_import',
      ...scope,
      entryId,
      externalId: '123',
      generation: 3,
      source,
    };
    for (const change of [
      { source: { ...source, photoReferences: ['https://localhost/a'] } },
      { generation: 0 },
      { source: { ...source, externalId: '124' } },
      { cookie: 'private' },
    ])
      assertEquals((await handler(request({ ...base, ...change }))).status, 400);
    assertEquals(calls, 0);
    assertEquals(
      (
        await handler(
          request({ action: 'source_details_state', ...scope, entryId, externalId: '123' }),
        )
      ).status,
      502,
    );
  },
);

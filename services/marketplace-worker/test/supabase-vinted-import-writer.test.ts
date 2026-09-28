import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedImportWriter } from '../src/supabase-vinted-import-writer.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userAccessToken: 'user-token',
};

test('verweigert fremde Vinted-Identität vor dem ersten Datenbankeintrag', async () => {
  const calls: string[] = [];
  const writer = new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      if (url.includes('marketplace_browser_session_check'))
        return Response.json({
          active: true,
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
        });
      if (url.includes('marketplace_connections'))
        return Response.json([{ status: 'connected', external_account_id: '123' }]);
      throw new Error('Eintrag darf nicht geschrieben werden');
    },
  });
  await assert.rejects(
    writer.write(scope, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      identity: { id: '999', username: 'fremd' },
      observedAt: '2026-09-28T10:00:00Z',
      entries: [],
    }),
  );
  assert.deepEqual(calls, [
    'POST /rest/v1/rpc/marketplace_browser_session_check',
    'GET /rest/v1/marketplace_connections',
  ]);
});

test('verweigert abgelaufenen oder fremden Sitzungszugriff vor dem Schreiben', async () => {
  const calls: string[] = [];
  const writer = new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async (input) => {
      calls.push(new URL(String(input)).pathname);
      return Response.json({ active: false, workspaceId: 'another-workspace' });
    },
  });
  await assert.rejects(
    writer.write(scope, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
      identity: { id: '123', username: 'testkonto' },
      observedAt: '2026-09-28T10:00:00Z',
      entries: [],
    }),
    /Kontozugriff abgelaufen/,
  );
  assert.deepEqual(calls, ['/rest/v1/rpc/marketplace_browser_session_check']);
});

test('speichert Nachrichten nur unter dem Gespräch desselben Kontos', async () => {
  const written: Record<string, unknown>[] = [];
  const removed: URL[] = [];
  const writer = new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('marketplace_browser_session_check'))
        return Response.json({
          active: true,
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
        });
      if (url.pathname.endsWith('marketplace_connections') && init?.method === 'PATCH')
        return Response.json([{ id: scope.connectionId }]);
      if (url.pathname.endsWith('marketplace_connections'))
        return Response.json([{ status: 'connected', external_account_id: '123' }]);
      if (url.pathname.endsWith('marketplace_account_entries') && init?.method === 'DELETE') {
        removed.push(url);
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith('marketplace_account_entries')) {
        const rows = JSON.parse(String(init?.body)) as Record<string, unknown>[];
        written.push(...rows);
        return Response.json(
          rows.map((row) => ({
            id:
              row['kind'] === 'conversation'
                ? 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
                : 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            external_id: row['external_id'],
          })),
        );
      }
      throw new Error('Unerwartete Anfrage');
    },
  });
  const counts = await writer.write(scope, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
    identity: { id: '123', username: 'testkonto' },
    observedAt: '2026-09-28T10:00:00Z',
    entries: [
      {
        kind: 'conversation',
        externalId: '51',
        sortAt: '2026-09-28T09:00:00Z',
        body: { title: 'Gespräch' },
      },
      {
        kind: 'message',
        externalId: '61',
        parentExternalId: '51',
        sortAt: '2026-09-28T09:00:00Z',
        body: { text: 'Hallo' },
      },
    ],
  });
  assert.equal(counts.conversation, 1);
  assert.equal(counts.message, 1);
  assert.equal(
    written.find((row) => row['kind'] === 'message')?.['parent_id'],
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  assert.ok(
    written.every(
      (row) =>
        row['workspace_id'] === scope.workspaceId && row['connection_id'] === scope.connectionId,
    ),
  );
  assert.deepEqual(
    removed.map((url) => url.searchParams.get('kind')),
    ['eq.publication', 'eq.conversation'],
  );
  assert.ok(
    removed.every(
      (url) =>
        url.searchParams.get('workspace_id') === `eq.${scope.workspaceId}` &&
        url.searchParams.get('connection_id') === `eq.${scope.connectionId}` &&
        url.searchParams.get('observed_at') === 'lt.2026-09-28T10:00:00Z',
    ),
  );
});

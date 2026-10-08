import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseVintedImportWriter } from '../src/supabase-vinted-import-writer.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userAccessToken: 'user-token',
};

test('liest Gesprächsversionen nur für die aktive Sitzung und das gebundene Konto', async () => {
  const calls: URL[] = [];
  const writer = new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async (input) => {
      const url = new URL(String(input));
      calls.push(url);
      if (url.pathname.endsWith('marketplace_browser_session_check'))
        return Response.json({
          active: true,
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
        });
      return Response.json([
        {
          external_id: '51',
          body: {
            sourceUpdatedAt: '2026-09-28T09:00:00Z',
            detailCheckedAt: '2026-09-28T09:30:00Z',
            text: 'Letzte Nachricht',
            occurredAt: '2026-09-28T09:20:00Z',
            itemId: '81',
            itemTitle: 'Saved article',
            itemImageUrl: 'https://images.example.test/article.jpg',
            itemPrice: 24,
            itemCurrency: 'EUR',
            transactionStatus: 'Offer received',
          },
        },
      ]);
    },
  });
  const versions = await writer.conversationVersions(scope, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  assert.equal(versions.length, 1);
  assert.equal(versions[0]?.text, 'Letzte Nachricht');
  assert.equal(versions[0]?.itemTitle, 'Saved article');
  assert.equal(versions[0]?.itemPrice, 24);
  assert.equal(calls[1]?.searchParams.get('workspace_id'), `eq.${scope.workspaceId}`);
  assert.equal(calls[1]?.searchParams.get('connection_id'), `eq.${scope.connectionId}`);
  assert.equal(calls[1]?.searchParams.get('kind'), 'eq.conversation');
});

const sessionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const snapshot = {
  identity: { id: '123', username: 'testkonto' },
  observedAt: '2026-09-28T10:00:00Z',
  entries: [],
  areas: {
    profile: { status: 'complete' },
    publications: { status: 'complete' },
    conversations: { status: 'complete' },
    messages: { status: 'partial' },
    sales: { status: 'partial' },
    feedback: { status: 'failed', failure: 'network' },
  },
} satisfies import('../src/vinted-account-import.ts').VintedAccountImport;
const counts = { profile: 1, publication: 0, conversation: 0, message: 0, sale: 0 };

test('imports a durable read only through the bound operation and fenced server RPC', async () => {
  const readScope = {
    ...scope,
    userAccessToken: '',
    syncRead: {
      operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      runnerId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      workerEpoch: 2,
      sessionId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
  const paths: string[] = [];
  let importBody: unknown;
  const writer = new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-token');
      if (path.endsWith('marketplace_sync_check'))
        return Response.json({
          active: true,
          sessionId,
          expiresAt: readScope.syncRead.expiresAt,
          absoluteExpiresAt: readScope.syncRead.absoluteExpiresAt,
        });
      importBody = JSON.parse(String(init?.body));
      return Response.json(counts);
    },
  });
  assert.deepEqual(await writer.write(readScope, sessionId, snapshot), counts);
  assert.deepEqual(paths, [
    '/rest/v1/rpc/marketplace_sync_check',
    '/rest/v1/rpc/marketplace_apply_vinted_sync_import',
  ]);
  assert.deepEqual(importBody, {
    p_operation_id: readScope.syncRead.operationId,
    p_runner_id: readScope.syncRead.runnerId,
    p_worker_epoch: 2,
    p_session_id: sessionId,
    p_snapshot: snapshot,
  });
});
function writerWithRpc(
  rpc: (init?: RequestInit) => Response | Promise<Response>,
  calls: string[] = [],
) {
  return new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path.endsWith('marketplace_browser_session_check'))
        return Response.json({
          active: true,
          id: sessionId,
          workspaceId: scope.workspaceId,
          connectionId: scope.connectionId,
        });
      if (path.endsWith('marketplace_apply_vinted_import')) return rpc(init);
      throw new Error('Unabhängige Tabellen-Schreiboperation ist nicht erlaubt');
    },
  });
}
test('übernimmt Daten, Bereichsergebnisse und Eigentümer in genau einer Worker-Transaktion', async () => {
  const calls: string[] = [];
  const writer = writerWithRpc((init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-token');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
      p_session_id: sessionId,
      p_user_id: scope.userId,
      p_snapshot: snapshot,
    });
    assert.equal(String(init?.body).includes(scope.userAccessToken), false);
    return Response.json(counts);
  }, calls);
  assert.deepEqual(await writer.write(scope, sessionId, snapshot), counts);
  assert.deepEqual(calls, [
    '/rest/v1/rpc/marketplace_browser_session_check',
    '/rest/v1/rpc/marketplace_apply_vinted_import',
  ]);
});
test('RPC-Ablehnung führt zu keinem nachfolgenden Teil-Schreibversuch', async () => {
  const calls: string[] = [];
  const writer = writerWithRpc(
    () => Response.json({ message: 'private-database-response' }, { status: 403 }),
    calls,
  );
  await assert.rejects(writer.write(scope, sessionId, snapshot));
  assert.equal(calls.length, 2);
});
test('fehlerhafte oder fehlende RPC-Zähler bestätigen keine Speicherung', async () => {
  for (const result of [
    { profile: 1 },
    { ...counts, message: -1 },
    { ...counts, sale: 0.5 },
    { ...counts, publication: '1' },
  ]) {
    await assert.rejects(
      writerWithRpc(() => Response.json(result)).write(scope, sessionId, snapshot),
    );
  }
});
test('abgelaufener Zugriff verhindert den Transaktionsaufruf', async () => {
  let requests = 0;
  const writer = new SupabaseVintedImportWriter({
    url: 'https://db.example.test',
    publishableKey: 'public-token',
    serviceRoleKey: 'server-token',
    fetch: async () => {
      requests++;
      return Response.json({ active: false });
    },
  });
  await assert.rejects(writer.write(scope, sessionId, snapshot), /Kontozugriff abgelaufen/);
  assert.equal(requests, 1);
});

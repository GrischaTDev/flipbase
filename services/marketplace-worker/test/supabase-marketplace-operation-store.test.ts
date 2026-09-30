import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SupabaseMarketplaceOperationStore } from '../src/supabase-marketplace-operation-store.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userAccessToken: 'private-user-token',
};
const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const runnerId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

test('Teilfehler bleiben im dauerhaften Auftrag sichtbar', async () => {
  const sourceResults = {
    profile: { status: 'complete' },
    publications: { status: 'complete' },
    conversations: { status: 'complete' },
    messages: { status: 'partial' },
    sales: { status: 'partial' },
    feedback: { status: 'failed', failure: 'network' },
  } as const;
  let saved: Record<string, unknown> = {};
  const store = new SupabaseMarketplaceOperationStore({
    url: 'https://db.example.test',
    publishableKey: 'public-key',
    serviceRoleKey: 'server-key',
    fetch: async (_input, init) => {
      if (init?.method === 'PATCH')
        saved = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json([
        { id: operationId, state: 'succeeded', source_results: sourceResults },
      ]);
    },
  });
  await store.succeed(
    scope,
    operationId,
    runnerId,
    '2026-09-30T10:00:00Z',
    {},
    false,
    sourceResults,
  );
  assert.deepEqual(saved['source_results'], sourceResults);
  assert.deepEqual((await store.read(scope, operationId))?.sourceResults, sourceResults);
});

test('Auftrag und Status bleiben an Nutzer, Workspace und Konto gebunden', async () => {
  const requests: { url: URL; authorization: string | undefined; body: string | undefined }[] = [];
  const store = new SupabaseMarketplaceOperationStore({
    url: 'https://db.example.test',
    publishableKey: 'public-key',
    serviceRoleKey: 'server-key',
    fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization') ?? undefined,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      if (url.pathname.endsWith('marketplace_sync_enqueue'))
        return Response.json({ id: operationId, requestedBy: scope.userId });
      return Response.json([
        {
          id: operationId,
          state: 'running',
          stage: 'profile',
          error_code: null,
          observed_at: null,
          counts: null,
          source_results: null,
        },
      ]);
    },
  });
  assert.equal((await store.enqueue(scope)).id, operationId);
  assert.equal((await store.read(scope, operationId))?.stage, 'profile');
  assert.equal(Object.hasOwn((await store.read(scope, operationId)) ?? {}, 'sourceResults'), false);
  assert.deepEqual(JSON.parse(requests[0]!.body!), {
    p_workspace_id: scope.workspaceId,
    p_connection_id: scope.connectionId,
  });
  assert.ok(requests.every((request) => request.authorization === 'Bearer private-user-token'));
  assert.equal(requests[1]!.url.searchParams.get('workspace_id'), `eq.${scope.workspaceId}`);
  assert.equal(requests[1]!.url.searchParams.get('connection_id'), `eq.${scope.connectionId}`);
  assert.equal(requests[1]!.url.searchParams.get('id'), `eq.${operationId}`);
});

test('nur der gebundene Runner kann einen aktiven Auftrag fortschreiben', async () => {
  const patches: URL[] = [];
  const store = new SupabaseMarketplaceOperationStore({
    url: 'https://db.example.test',
    publishableKey: 'public-key',
    serviceRoleKey: 'server-key',
    fetch: async (input) => {
      const url = new URL(String(input));
      patches.push(url);
      return Response.json(patches.length === 1 ? [{ id: operationId }] : []);
    },
  });
  assert.equal(await store.claim(scope, operationId, runnerId), true);
  await assert.rejects(
    store.stage(scope, operationId, runnerId, 'profile'),
    /Auftrag nicht mehr aktiv/,
  );
  assert.equal(patches[0]!.searchParams.get('state'), 'eq.queued');
  assert.equal(patches[0]!.searchParams.get('requested_by'), `eq.${scope.userId}`);
  assert.equal(patches[1]!.searchParams.get('runner_id'), `eq.${runnerId}`);
  assert.equal(patches[1]!.searchParams.get('connection_id'), `eq.${scope.connectionId}`);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MarketplaceBrowserRecovery,
  SupabaseBrowserRecoveryStore,
} from '../src/marketplace-browser-recovery.ts';

test('stops every unresolved profile before releasing its database lock', async () => {
  const events: string[] = [];
  const recovery = new MarketplaceBrowserRecovery(
    {
      listUnresolved: async () => [
        { id: 'session-a', profileId: 'profile-a' },
        { id: 'session-b', profileId: 'profile-b' },
      ],
      markStopping: async (id) => {
        events.push(`stopping:${id}`);
      },
      markStopped: async (id) => {
        events.push(`closed:${id}`);
      },
    },
    {
      stop: async (id) => {
        events.push(`provider:${id}`);
      },
    },
  );

  await recovery.recover();
  assert.deepEqual(events, [
    'stopping:session-a',
    'provider:profile-a',
    'closed:session-a',
    'stopping:session-b',
    'provider:profile-b',
    'closed:session-b',
  ]);
});

test('keeps a failed provider stop unresolved and retries after restart', async () => {
  const unresolved = new Map([['session-a', 'profile-a']]);
  let fail = true;
  const store = {
    listUnresolved: async () => [...unresolved].map(([id, profileId]) => ({ id, profileId })),
    markStopping: async () => undefined,
    markStopped: async (id: string) => {
      unresolved.delete(id);
    },
  };
  const provider = {
    stop: async () => {
      if (fail) throw new Error('private token');
    },
  };

  await assert.rejects(
    new MarketplaceBrowserRecovery(store, provider).recover(),
    /Browser-Bereinigung fehlgeschlagen/,
  );
  assert.equal(unresolved.size, 1);
  fail = false;
  await new MarketplaceBrowserRecovery(store, provider).recover();
  assert.equal(unresolved.size, 0);
});

test('reads provider profiles only with the server key and closes after stop', async () => {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
    });
    assert.equal(new Headers(init?.headers).get('apikey'), 'server-test-key');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-test-key');
    return Response.json(
      method === 'GET'
        ? [{ public_id: 'session-a', provider_profile_id: 'profile-a' }]
        : [{ public_id: 'session-a' }],
    );
  };
  const store = new SupabaseBrowserRecoveryStore({
    url: 'https://example.test',
    serviceRoleKey: 'server-test-key',
    fetch: request,
  });
  const sessions = await store.listUnresolved();
  assert.deepEqual(sessions, [{ id: 'session-a', profileId: 'profile-a' }]);
  await store.markStopping(sessions[0]!.id);
  await store.markStopped(sessions[0]!.id);
  assert.equal(calls.length, 3);
  assert.ok(calls[0]!.url.includes('state=in.%28active%2Cstopping%29'));
  assert.deepEqual(calls[1]!.body, { state: 'stopping', stop_reason: 'interrupted' });
  assert.equal((calls[2]!.body as Record<string, unknown>)['state'], 'closed');
  assert.equal(calls[2]!.method, 'PATCH');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CloudBrowserStoppedUncleanlyError } from '../src/gologin-cloud-browser.ts';
import { ChromiumStopResults } from '../src/chromium-stop-results.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('restart recovery closes a physically stopped unclean session and continues with the next account', async () => {
  const closed: string[] = [];
  const recovery = new MarketplaceBrowserRecovery(
    {
      listUnresolved: async () => [
        { id: 'a', profileId: 'a' },
        { id: 'b', profileId: 'b' },
      ],
      markStopping: async () => undefined,
      markStopped: async (id) => {
        closed.push(id);
      },
    },
    {
      stop: async (id) => {
        if (id === 'a') throw new CloudBrowserStoppedUncleanlyError();
      },
    },
  );
  await recovery.recover();
  assert.deepEqual(closed, ['a', 'b']);
});

test('a database failure followed by a new worker cannot lose the durable unclean stop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-recovery-restart-'));
  try {
    await new ChromiumStopResults(root).write('profile-a');
    let databaseAvailable = false;
    let closed = false;
    const paused: boolean[] = [];
    const store = {
      listUnresolved: async () => [{ id: 'session-a', profileId: 'profile-a' }],
      markStopping: async () => undefined,
      markStopped: async (_id: string, unclean = false) => {
        if (!databaseAvailable) throw new Error('Database unavailable');
        paused.push(unclean);
        closed = true;
      },
    };
    const provider = () => ({
      stop: async (profileId: string) => {
        if (await new ChromiumStopResults(root).read(profileId))
          throw new CloudBrowserStoppedUncleanlyError();
      },
    });
    await assert.rejects(new MarketplaceBrowserRecovery(store, provider()).recover());
    assert.equal(closed, false);
    databaseAvailable = true;
    await new MarketplaceBrowserRecovery(store, provider()).recover();
    assert.equal(closed, true);
    assert.deepEqual(paused, [true]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

for (const newerAuthorization of [false, true]) {
  test(`restart cleanup pauses only the affected old schedule before releasing capacity, newer authorization=${newerAuthorization}`, async () => {
    const patches: { path: string; body: Record<string, unknown>; url: URL }[] = [];
    const store = new SupabaseBrowserRecoveryStore({
      url: 'https://example.test',
      serviceRoleKey: 'fixture-key',
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (init?.method === 'PATCH') {
          patches.push({
            path: url.pathname,
            body: JSON.parse(String(init.body)) as Record<string, unknown>,
            url,
          });
          return Response.json([{}]);
        }
        return Response.json(
          url.pathname.endsWith('marketplace_browser_sessions')
            ? [
                {
                  workspace_id: 'workspace-a',
                  connection_id: 'account-a',
                  operation_id: 'operation-a',
                },
              ]
            : url.pathname.endsWith('marketplace_operations')
              ? [{ schedule_id: 7, schedule_authorization_version: 4 }]
              : [
                  {
                    id: 7,
                    enabled: true,
                    authorization_version: newerAuthorization ? 5 : 4,
                    consecutive_failures: 0,
                    updated_at: '2026-10-15T18:00:00Z',
                  },
                ],
        );
      },
    });
    await store.markStopped('session-a', true);
    assert.equal(patches.at(-1)?.path, '/rest/v1/marketplace_browser_sessions');
    assert.equal(patches.at(-1)?.body.state, 'closed');
    if (newerAuthorization) assert.equal(patches.length, 1);
    else {
      assert.equal(patches.length, 2);
      const pause = patches[0]!;
      assert.equal(pause.url.searchParams.get('workspace_id'), 'eq.workspace-a');
      assert.equal(pause.url.searchParams.get('connection_id'), 'eq.account-a');
      assert.equal(pause.url.searchParams.get('authorization_version'), 'eq.4');
      assert.equal(pause.url.searchParams.get('updated_at'), 'eq.2026-10-15T18:00:00Z');
      assert.equal(pause.body.enabled, false);
      assert.equal(pause.body.authorization_version, 5);
      assert.equal(pause.body.paused_reason, 'cleanup');
    }
  });
}

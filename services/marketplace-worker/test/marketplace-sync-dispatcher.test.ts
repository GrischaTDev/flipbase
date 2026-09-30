import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MarketplaceSyncDispatcher,
  type MarketplaceSyncDispatchStore,
  type MarketplaceSyncTimers,
} from '../src/marketplace-sync-dispatcher.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';
import { MarketplaceSyncRunner } from '../src/marketplace-sync-runner.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { SupabaseMarketplaceOperationStore } from '../src/supabase-marketplace-operation-store.ts';
import { VintedImportReadError, VintedImportRequestError } from '../src/vinted-account-import.ts';

const workerId = '20000000-0000-4000-8000-000000000001';
const runnerIds = ['20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'];
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('an uncertain interactive reservation disables capabilities and future claims exactly once', async () => {
  const { dispatcher, calls, lost } = fixture({}, undefined, true);
  await dispatcher.initialize();
  dispatcher.start();
  dispatcher.invalidate();
  dispatcher.invalidate();
  await dispatcher.poll();
  assert.equal(dispatcher.scheduledEnabled, false);
  assert.equal(calls.includes('claim'), false);
  assert.equal(lost(), 1);
  await dispatcher.drain();
});

test('a rejected preclaimed runner loses runtime before another claim', async () => {
  const { dispatcher, calls, lost } = fixture(
    {},
    async () => {
      throw new Error('Uncertain reserved session');
    },
    true,
  );
  await dispatcher.initialize();
  dispatcher.start();
  await dispatcher.poll();
  await dispatcher.poll();
  assert.equal(calls.filter((call) => call === 'claim').length, 1);
  assert.equal(lost(), 1);
  assert.equal(dispatcher.scheduledEnabled, false);
  await dispatcher.drain();
});
function scope(
  connectionId = '20000000-0000-4000-8000-000000000004',
  runnerId = runnerIds[0]!,
): BrowserSessionScope {
  return Object.freeze({
    workspaceId: '20000000-0000-4000-8000-000000000005',
    connectionId,
    userId: '20000000-0000-4000-8000-000000000006',
    userAccessToken: '',
    syncRead: Object.freeze({
      operationId: '20000000-0000-4000-8000-000000000007',
      runnerId,
      workerEpoch: 4,
      sessionId: '20000000-0000-4000-8000-000000000008',
      expiresAt: '2026-10-01T12:01:30Z',
      absoluteExpiresAt: '2026-10-01T12:10:00Z',
    }),
  });
}
function fixture(
  overrides: Partial<MarketplaceSyncDispatchStore> = {},
  run: (scope: BrowserSessionScope) => Promise<void> = async () => undefined,
  includeScheduled = false,
) {
  let current = Date.parse('2026-10-01T12:00:00Z');
  let lost = 0;
  let nextRunner = 0;
  const calls: string[] = [];
  const callbacks = new Map<number, () => void>();
  const timers: MarketplaceSyncTimers = {
    setInterval: (callback, milliseconds) => {
      callbacks.set(milliseconds, callback);
      return milliseconds;
    },
    clearInterval: (handle) => {
      callbacks.delete(handle as number);
    },
  };
  const store: MarketplaceSyncDispatchStore = {
    acquireWorker: async (id) => {
      calls.push('acquire');
      assert.equal(id, workerId);
      return { workerId, workerEpoch: 4, expiresAt: '2026-10-01T12:01:30Z' };
    },
    heartbeatWorker: async (id, epoch) => {
      calls.push('heartbeat');
      assert.equal(id, workerId);
      assert.equal(epoch, 4);
      return true;
    },
    releaseWorker: async (id, epoch) => {
      calls.push('release');
      assert.equal(id, workerId);
      assert.equal(epoch, 4);
      return true;
    },
    recover: async () => {
      calls.push('recover');
      return { interruptedOperations: 0 };
    },
    claim: async (id, epoch, runnerId, scheduled) => {
      calls.push('claim');
      assert.equal(id, workerId);
      assert.equal(epoch, 4);
      assert.equal(scheduled, includeScheduled);
      return scope(undefined, runnerId);
    },
    ...overrides,
  };
  const dispatcher = new MarketplaceSyncDispatcher({
    store,
    run,
    onRuntimeLost: () => {
      lost++;
    },
    includeScheduled,
    workerId,
    createRunnerId: () => runnerIds[nextRunner++ % runnerIds.length]!,
    timers,
    now: () => current,
  });
  return {
    dispatcher,
    calls,
    callbacks,
    lost: () => lost,
    advance: (milliseconds: number) => {
      current += milliseconds;
    },
  };
}

test('Runtime wird vor Recovery beansprucht und Fähigkeiten erst beim Start aktiviert', async () => {
  const { dispatcher, calls } = fixture({}, undefined, true);
  assert.equal(dispatcher.runtimeActive, false);
  assert.equal(dispatcher.ready, false);
  assert.equal(dispatcher.scheduledEnabled, false);
  const lease = await dispatcher.initialize();
  assert.deepEqual(calls, ['acquire']);
  assert.equal(lease.workerEpoch, 4);
  assert.equal(dispatcher.runtimeActive, true);
  assert.equal(dispatcher.ready, false);
  dispatcher.start();
  assert.equal(dispatcher.ready, true);
  assert.equal(dispatcher.scheduledEnabled, true);
  dispatcher.stop();
  await dispatcher.drain();
});

test('ein zweiter Prozess darf ohne Runtime keine Claims oder Recovery ausführen', async () => {
  const { dispatcher, calls } = fixture({ acquireWorker: async () => null });
  await assert.rejects(dispatcher.initialize(), /bereits/);
  await dispatcher.poll();
  assert.equal(await dispatcher.heartbeat(), false);
  assert.equal(dispatcher.ready, false);
  assert.deepEqual(calls, []);
});

test('gleichzeitige Initialisierung reserviert dieselbe Runtime nur einmal', async () => {
  const waiting = pending<Awaited<ReturnType<MarketplaceSyncDispatchStore['acquireWorker']>>>();
  let acquires = 0;
  const { dispatcher } = fixture({
    acquireWorker: async () => {
      acquires++;
      return waiting.promise;
    },
  });
  const first = dispatcher.initialize();
  const second = dispatcher.initialize();
  waiting.resolve({ workerId, workerEpoch: 4, expiresAt: '2026-10-01T12:01:30Z' });
  assert.deepEqual(await first, await second);
  assert.equal(acquires, 1);
});

test('manuelle Aufträge laufen bei ausgeschalteter Planung mit frischem Runner je Claim', async () => {
  const seen: string[] = [];
  const { dispatcher } = fixture({}, async (value) => {
    seen.push(value.syncRead!.runnerId);
    assert.equal(value.userAccessToken, '');
  });
  await dispatcher.initialize();
  await dispatcher.poll();
  await dispatcher.poll();
  assert.deepEqual(seen, [
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
  ]);
  assert.equal(dispatcher.scheduledEnabled, false);
});

test('laufender Abruf sperrt Doppelclaims aber nicht das Runtime-Lebenszeichen', async () => {
  const work = pending<void>();
  let runs = 0;
  const { dispatcher, calls } = fixture({}, async () => {
    runs++;
    await work.promise;
  });
  await dispatcher.initialize();
  const first = dispatcher.poll();
  await Promise.resolve();
  await dispatcher.poll();
  assert.equal(await dispatcher.heartbeat(), true);
  assert.equal(calls.filter((call) => call === 'claim').length, 1);
  work.resolve();
  await first;
  assert.equal(runs, 1);
});

test('parallel angefragte Heartbeats teilen einen RPC und Verlust bleibt endgültig', async () => {
  const answer = pending<boolean>();
  let heartbeatCalls = 0;
  const { dispatcher, lost } = fixture({
    heartbeatWorker: async () => {
      heartbeatCalls++;
      return answer.promise;
    },
  });
  await dispatcher.initialize();
  const first = dispatcher.heartbeat();
  const second = dispatcher.heartbeat();
  answer.resolve(false);
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(heartbeatCalls, 1);
  assert.equal(lost(), 1);
  assert.equal(await dispatcher.heartbeat(), false);
  await dispatcher.poll();
  assert.equal(lost(), 1);
});

test('lokal abgelaufene Runtime startet keinen Browser und meldet Verlust einmal', async () => {
  let runs = 0;
  const { dispatcher, calls, lost, advance } = fixture({}, async () => {
    runs++;
  });
  await dispatcher.initialize();
  dispatcher.start();
  advance(90_000);
  await dispatcher.poll();
  assert.equal(dispatcher.runtimeActive, false);
  assert.equal(dispatcher.scheduledEnabled, false);
  assert.equal(runs, 0);
  assert.equal(lost(), 1);
  assert.equal(calls.includes('claim'), false);
});

test('Heartbeat hält lange laufende Arbeit über die ursprüngliche Lease hinaus aktiv', async () => {
  const { dispatcher, advance, lost } = fixture();
  await dispatcher.initialize();
  advance(60_000);
  assert.equal(await dispatcher.heartbeat(), true);
  advance(60_000);
  assert.equal(dispatcher.runtimeActive, true);
  assert.equal(lost(), 0);
});

test('ungültig gewordene Runtime verwirft verspäteten Claim vor dem Anbieterstart', async () => {
  const answer = pending<BrowserSessionScope | null>();
  let runs = 0;
  const { dispatcher, lost } = fixture(
    { claim: async () => answer.promise, heartbeatWorker: async () => false },
    async () => {
      runs++;
    },
  );
  await dispatcher.initialize();
  const poll = dispatcher.poll();
  await dispatcher.heartbeat();
  answer.resolve(scope());
  await poll;
  assert.equal(runs, 0);
  assert.equal(lost(), 1);
});

test('Shutdown lässt einen bereits laufenden Claim geordnet ausführen und wartet vor Freigabe', async () => {
  const answer = pending<BrowserSessionScope | null>();
  const work = pending<void>();
  let runs = 0;
  const { dispatcher, calls } = fixture(
    {
      claim: async () => {
        calls.push('claim');
        return answer.promise;
      },
    },
    async () => {
      runs++;
      await work.promise;
    },
  );
  await dispatcher.initialize();
  dispatcher.start();
  const poll = dispatcher.poll();
  dispatcher.stop();
  await dispatcher.poll();
  const releasing = dispatcher.release();
  answer.resolve(scope());
  await Promise.resolve();
  assert.equal(calls.includes('release'), false);
  assert.equal(await dispatcher.heartbeat(), true);
  work.resolve();
  await poll;
  await releasing;
  assert.equal(runs, 1);
  assert.equal(calls.filter((call) => call === 'claim').length, 1);
  assert.equal(calls.at(-1), 'release');
  assert.equal(dispatcher.runtimeActive, false);
});

test('Timer treiben Polls und Heartbeats unabhängig und werden beim Shutdown entfernt', async () => {
  const { dispatcher, callbacks, calls } = fixture();
  await dispatcher.initialize();
  dispatcher.start();
  dispatcher.start();
  assert.equal(callbacks.size, 2);
  callbacks.get(20_000)!();
  callbacks.get(15_000)!();
  await dispatcher.drain();
  assert.ok(calls.includes('heartbeat'));
  assert.ok(calls.includes('claim'));
  assert.equal(callbacks.size, 0);
  assert.equal(dispatcher.ready, false);
});

test('bestätigte Abruffehler sperren keine späteren manuellen Aufträge dauerhaft', async () => {
  let runs = 0;
  const runner = new MarketplaceSyncRunner(
    {
      open: async () => scope().syncRead!.sessionId,
      run: async <T>(
        _scope: BrowserSessionScope,
        _id: string,
        operation: (browser: BrowserInfo) => Promise<T>,
      ) =>
        operation({
          version: () => 'test',
          importAccount: async () => {
            throw new VintedImportReadError(
              'profile',
              new VintedImportRequestError('unauthorized'),
            );
          },
        }),
      close: async () => undefined,
    },
    {
      write: async () => {
        assert.fail('Failed import must not persist');
      },
    },
    {
      claim: async () => true,
      stage: async () => undefined,
      fail: async () => {
        runs++;
      },
    } as unknown as SupabaseMarketplaceOperationStore,
    { record: () => undefined },
  );
  const { dispatcher, lost } = fixture({}, (claimed) => runner.runDispatched(claimed));
  await dispatcher.initialize();
  await dispatcher.poll();
  await dispatcher.poll();
  assert.equal(runs, 2);
  assert.equal(lost(), 0);
});

test('unklarer Claim beendet Runtime statt eine mögliche reservierte Sitzung zu vergessen', async () => {
  let claims = 0;
  let reservedSession = false;
  let runs = 0;
  const { dispatcher, lost } = fixture(
    {
      claim: async () => {
        claims++;
        reservedSession = true;
        throw new Error('claim response lost');
      },
    },
    async () => {
      runs++;
    },
  );
  await dispatcher.initialize();
  await dispatcher.poll();
  await dispatcher.poll();
  assert.equal(claims, 1);
  assert.equal(reservedSession, true);
  assert.equal(runs, 0);
  assert.equal(lost(), 1);
  assert.equal(dispatcher.runtimeActive, false);
});

test('zwei kontogebundene Aufträge behalten ihren unveränderlichen eigenen Scope', async () => {
  const first = scope('20000000-0000-4000-8000-000000000010', runnerIds[0]);
  const second = scope('20000000-0000-4000-8000-000000000011', runnerIds[1]);
  let claimNumber = 0;
  const executed: BrowserSessionScope[] = [];
  const { dispatcher } = fixture(
    { claim: async () => (++claimNumber === 1 ? first : second) },
    async (value) => {
      executed.push(value);
    },
  );
  await dispatcher.initialize();
  await dispatcher.poll();
  await dispatcher.poll();
  assert.deepEqual(
    executed.map((value) => value.connectionId),
    ['20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000011'],
  );
  assert.equal(executed[0], first);
  assert.equal(executed[1], second);
});

test('späte erfolgreiche Heartbeatantwort reaktiviert keine inzwischen verlorene Runtime', async () => {
  const answer = pending<boolean>();
  const { dispatcher, lost, advance } = fixture({ heartbeatWorker: async () => answer.promise });
  await dispatcher.initialize();
  advance(80_000);
  const heartbeat = dispatcher.heartbeat();
  advance(20_000);
  await dispatcher.poll();
  assert.equal(lost(), 1);
  answer.resolve(true);
  assert.equal(await heartbeat, false);
  assert.equal(dispatcher.runtimeActive, false);
  assert.equal(lost(), 1);
});

test('Shutdown während Runtime-Reservierung wartet auf ihren Abschluss vor Freigabe', async () => {
  const answer = pending<Awaited<ReturnType<MarketplaceSyncDispatchStore['acquireWorker']>>>();
  let released = false;
  const { dispatcher } = fixture({
    acquireWorker: async () => answer.promise,
    releaseWorker: async () => {
      released = true;
      return true;
    },
  });
  const initializing = dispatcher.initialize();
  const releasing = dispatcher.release();
  await Promise.resolve();
  assert.equal(released, false);
  answer.resolve({ workerId, workerEpoch: 4, expiresAt: '2026-10-01T12:01:30Z' });
  await initializing;
  await releasing;
  assert.equal(released, true);
  assert.equal(dispatcher.runtimeActive, false);
});

test('ungeklärte Browserbereinigung erlaubt keine erfolgreiche Runtimefreigabe', async () => {
  const { dispatcher } = fixture({ releaseWorker: async () => false });
  await dispatcher.initialize();
  await assert.rejects(dispatcher.release(), /Browserbereinigung/);
  assert.equal(dispatcher.ready, false);
  await dispatcher.poll();
});

test('fehlgeschlagener Runtime-Heartbeat setzt Fähigkeiten sofort zurück', async () => {
  const { dispatcher, lost } = fixture(
    {
      heartbeatWorker: async () => {
        throw new Error('private response');
      },
    },
    undefined,
    true,
  );
  await dispatcher.initialize();
  dispatcher.start();
  assert.equal(await dispatcher.heartbeat(), false);
  assert.equal(dispatcher.ready, false);
  assert.equal(dispatcher.scheduledEnabled, false);
  assert.equal(lost(), 1);
});

test('lange Recovery hält Runtime per Monitoring aktiv ohne vorzeitig Aufträge zu starten', async () => {
  const { dispatcher, callbacks, calls, advance } = fixture({}, undefined, true);
  await dispatcher.initialize();
  dispatcher.startMonitoring();
  assert.equal(callbacks.has(20_000), true);
  assert.equal(callbacks.has(15_000), false);
  advance(60_000);
  callbacks.get(20_000)!();
  await dispatcher.heartbeat();
  advance(60_000);
  assert.equal(dispatcher.runtimeActive, true);
  assert.equal(dispatcher.ready, false);
  assert.equal(dispatcher.scheduledEnabled, false);
  assert.equal(calls.includes('claim'), false);
  dispatcher.start();
  assert.equal(dispatcher.ready, true);
  assert.equal(callbacks.size, 2);
  dispatcher.stop();
  await dispatcher.drain();
});

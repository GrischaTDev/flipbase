import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketplaceSyncRunner } from '../src/marketplace-sync-runner.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import { MarketplaceBrowserSessionEndedError } from '../src/marketplace-browser-session-broker.ts';
import type { SupabaseMarketplaceOperationStore } from '../src/supabase-marketplace-operation-store.ts';
import {
  VintedImportReadError,
  VintedImportRequestError,
  type VintedImportAreas,
  type VintedBrowserReadFailure,
} from '../src/vinted-account-import.ts';
import type { MarketplaceOperationEvent } from '../src/marketplace-operation-events.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userAccessToken: 'private-user-token',
};
const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sessionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const areas: VintedImportAreas = {
  profile: { status: 'complete' },
  publications: { status: 'complete' },
  conversations: { status: 'complete' },
  messages: { status: 'partial' },
  sales: { status: 'partial' },
  feedback: { status: 'failed', failure: 'network' },
};

for (const failure of ['denied', 'lost', 'open_failed'] as const) {
  test(`preclaimed browser requires recovery if authorization or startup is uncertain: ${failure}`, async () => {
    const dispatched = {
      ...scope,
      userAccessToken: '',
      syncRead: {
        operationId,
        runnerId: operationId,
        workerEpoch: 2,
        sessionId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
    };
    let opens = 0;
    const operations = {
      claim: async () => {
        if (failure === 'lost') throw new Error('network');
        return failure !== 'denied';
      },
      fail: async () => undefined,
    } as unknown as SupabaseMarketplaceOperationStore;
    const runner = new MarketplaceSyncRunner(
      {
        open: async () => {
          opens++;
          throw new Error('startup');
        },
        run: async () => {
          throw new Error('not started');
        },
        close: async () => {
          assert.fail('No known local handle');
        },
      },
      {
        write: async () => {
          throw new Error('not started');
        },
      },
      operations,
      { record: () => undefined },
    );
    await assert.rejects(runner.runDispatched(dispatched));
    assert.equal(opens, failure === 'open_failed' ? 1 : 0);
  });
}

test('new durable dispatcher queues a manual read without opening an inline browser', async () => {
  let nudges = 0;
  let opens = 0;
  const operations = {
    enqueue: async () => ({ id: operationId, requestedBy: scope.userId }),
    claim: async () => true,
    fail: async () => undefined,
  } as unknown as SupabaseMarketplaceOperationStore;
  const runner = new MarketplaceSyncRunner(
    {
      open: async () => {
        opens++;
        return sessionId;
      },
      run: async () => {
        throw new Error('Must not execute inline');
      },
      close: async () => undefined,
    },
    { write: async () => ({ profile: 0, publication: 0, conversation: 0, message: 0, sale: 0 }) },
    operations,
    undefined,
    () => {
      nudges++;
    },
  );
  assert.equal(await runner.start(scope), operationId);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(opens, 0);
  assert.equal(nudges, 1);
});

test('doppelter Start nutzt einen Auftrag und öffnet nur einen Browser', async () => {
  let claimed = false;
  let opens = 0;
  let writes = 0;
  let closes = 0;
  let savedSources: unknown;
  const events: MarketplaceOperationEvent[] = [];
  let done!: () => void;
  const completed = new Promise<void>((resolve) => {
    done = resolve;
  });
  const operations = {
    enqueue: async () => ({ id: operationId, requestedBy: scope.userId }),
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    stage: async () => undefined,
    succeed: async (...args: unknown[]) => {
      savedSources = args[6];
      done();
    },
    fail: async () => {
      throw new Error('Auftrag darf nicht fehlschlagen');
    },
  } as unknown as SupabaseMarketplaceOperationStore;
  const broker = {
    open: async () => {
      opens += 1;
      return sessionId;
    },
    run: async <T>(
      _scope: typeof scope,
      _id: string,
      operation: (browser: BrowserInfo) => Promise<T>,
    ) =>
      operation({
        version: () => 'test',
        importAccount: async (authorize, onStage) => {
          await authorize();
          await onStage?.('profile');
          return {
            identity: { id: '123', username: 'test' },
            observedAt: '2026-09-28T10:00:00Z',
            entries: [],
            areas,
            sourceRequestCount: 7,
            browserReadFailures: ['navigation'] as VintedBrowserReadFailure[],
          };
        },
      }),
    close: async () => {
      closes += 1;
    },
  };
  const imports = {
    write: async () => {
      writes += 1;
      return { profile: 1, publication: 0, conversation: 0, message: 0, sale: 0 };
    },
  };
  const runner = new MarketplaceSyncRunner(broker, imports, operations, {
    record: (event) => events.push(event),
  });
  assert.equal(await runner.start(scope), operationId);
  assert.equal(await runner.start(scope), operationId);
  await completed;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(savedSources, areas);
  assert.equal(opens, 1);
  assert.equal(writes, 1);
  assert.equal(closes, 1);
  assert.equal(
    events.find((event) => event.stage === 'cleanup' && event.outcome === 'completed')
      ?.sourceRequestCount,
    7,
  );
  assert.deepEqual(events.at(-1)?.browserReadFailures, ['navigation']);
});

test('abgelaufener Zugriff beendet den Auftrag ohne Datenübernahme', async () => {
  let failedCode: string | null = null;
  let writes = 0;
  let done!: () => void;
  const completed = new Promise<void>((resolve) => {
    done = resolve;
  });
  const operations = {
    enqueue: async () => ({ id: operationId, requestedBy: scope.userId }),
    claim: async () => true,
    stage: async () => undefined,
    succeed: async () => {
      throw new Error('Darf nicht erfolgreich sein');
    },
    fail: async (_scope: typeof scope, _id: string, _runnerId: string, code: string) => {
      failedCode = code;
      done();
    },
  } as unknown as SupabaseMarketplaceOperationStore;
  const runner = new MarketplaceSyncRunner(
    {
      open: async () => sessionId,
      run: async () => {
        throw new MarketplaceBrowserSessionEndedError('expired');
      },
      close: async () => undefined,
    },
    {
      write: async () => {
        writes += 1;
        return { profile: 0, publication: 0, conversation: 0, message: 0, sale: 0 };
      },
    },
    operations,
  );
  await runner.start(scope);
  await completed;
  assert.equal(failedCode, 'access');
  assert.equal(writes, 0);
});

for (const requestFailure of ['unauthorized', 'browser_context'] as const) {
  test(`a failed profile read preserves its diagnosis without importing data: ${requestFailure}`, async () => {
    let failedCode: string | null = null;
    let writes = 0;
    let closes = 0;
    let done!: () => void;
    const completed = new Promise<void>((resolve) => {
      done = resolve;
    });
    const events: MarketplaceOperationEvent[] = [];
    const operations = {
      enqueue: async () => ({ id: operationId, requestedBy: scope.userId }),
      claim: async () => true,
      stage: async () => undefined,
      succeed: async () => assert.fail('Eine ungültige Anmeldung darf nicht bestätigt werden'),
      fail: async (_scope: typeof scope, _id: string, _runnerId: string, code: string) => {
        failedCode = code;
        done();
      },
    } as unknown as SupabaseMarketplaceOperationStore;
    const runner = new MarketplaceSyncRunner(
      {
        open: async () => sessionId,
        run: async <T>(
          _scope: typeof scope,
          _id: string,
          operation: (browser: BrowserInfo) => Promise<T>,
        ) =>
          operation({
            version: () => 'test',
            importAccount: async (_authorize, onStage) => {
              await onStage?.('profile');
              throw new VintedImportReadError(
                'profile',
                new VintedImportRequestError(
                  requestFailure,
                  undefined,
                  requestFailure === 'browser_context' ? 'navigation' : undefined,
                ),
              );
            },
          }),
        close: async () => {
          closes += 1;
        },
      },
      {
        write: async () => {
          writes += 1;
          return { profile: 0, publication: 0, conversation: 0, message: 0, sale: 0 };
        },
      },
      operations,
      { record: (event) => events.push(event) },
    );
    await runner.start(scope);
    await completed;
    assert.equal(failedCode, requestFailure === 'unauthorized' ? 'identity' : 'profile');
    assert.equal(writes, 0);
    assert.equal(closes, 1);
    assert.equal(events.at(-1)?.requestFailure, requestFailure);
    assert.deepEqual(
      events.at(-1)?.browserReadFailures,
      requestFailure === 'browser_context' ? ['navigation'] : undefined,
    );
  });
}

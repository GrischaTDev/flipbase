import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketplaceSyncRunner } from '../src/marketplace-sync-runner.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import { MarketplaceBrowserSessionEndedError } from '../src/marketplace-browser-session-broker.ts';
import type { SupabaseMarketplaceOperationStore } from '../src/supabase-marketplace-operation-store.ts';

const scope = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  connectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  userAccessToken: 'private-user-token',
};
const operationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sessionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

test('doppelter Start nutzt einen Auftrag und öffnet nur einen Browser', async () => {
  let claimed = false;
  let opens = 0;
  let writes = 0;
  let closes = 0;
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
    succeed: async () => {
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
  const runner = new MarketplaceSyncRunner(broker, imports, operations);
  assert.equal(await runner.start(scope), operationId);
  assert.equal(await runner.start(scope), operationId);
  await completed;
  assert.equal(opens, 1);
  assert.equal(writes, 1);
  assert.equal(closes, 1);
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

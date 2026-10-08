import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { BrowserSessionScope } from '../src/marketplace-browser-session-broker.ts';
import { MarketplaceBrowserSessionBroker } from '../src/marketplace-browser-session-broker.ts';
import type { MarketplaceMessageResult } from '../../../supabase/functions/_shared/marketplace-message-contracts.d.ts';
import {
  MarketplaceMessageRunner,
  type CloudMessageClaim,
} from '../src/marketplace-message-runner.ts';

const scope: BrowserSessionScope = {
  workspaceId: '20000000-0000-4000-8000-000000000001',
  connectionId: '20000000-0000-4000-8000-000000000002',
  userId: '20000000-0000-4000-8000-000000000003',
  userAccessToken: '',
  messageWrite: {
    messageId: '20000000-0000-4000-8000-000000000004',
    claimToken: '20000000-0000-4000-8000-000000000005',
    workerId: '20000000-0000-4000-8000-000000000006',
    workerEpoch: 4,
    runnerId: '20000000-0000-4000-8000-000000000007',
    sessionId: '20000000-0000-4000-8000-000000000008',
    expiresAt: '2026-10-08T12:01:30Z',
    absoluteExpiresAt: '2026-10-08T12:10:00Z',
  },
};
const claim: CloudMessageClaim = {
  kind: 'message',
  messageId: '20000000-0000-4000-8000-000000000004',
  claimToken: '20000000-0000-4000-8000-000000000005',
  scope,
  accountId: '123',
  command: { externalConversationId: '777', text: 'Hallo', attachment: null },
};

function fixture(
  options: {
    beginLost?: boolean;
    finishLost?: boolean;
    stopped?: boolean;
    authorized?: boolean;
    providerThrows?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const results: MarketplaceMessageResult[] = [];
  const store = {
    check: async (job: CloudMessageClaim) => {
      assert.equal(job, claim);
      calls.push('check');
      return options.authorized !== false;
    },
    begin: async (job: CloudMessageClaim) => {
      assert.equal(job, claim);
      calls.push('begin');
      if (options.beginLost) throw new Error('lost begin');
    },
    finish: async (job: CloudMessageClaim, result: MarketplaceMessageResult) => {
      assert.equal(job, claim);
      calls.push('finish');
      results.push(result);
      if (options.finishLost) throw new Error('lost finish');
    },
  };
  const browser: BrowserInfo = {
    version: () => 'test',
    sendMessage: async (account, command, authorize) => {
      assert.equal(account, '123');
      assert.deepEqual(command, claim.command);
      await authorize();
      calls.push('provider');
      if (options.providerThrows) throw new Error('private-cookie-and-proxy-password');
      return { outcome: 'sent', externalMessageId: '999' };
    },
  };
  const broker = {
    open: async (binding: BrowserSessionScope) => {
      assert.equal(binding, scope);
      calls.push('open');
      return '20000000-0000-4000-8000-000000000008';
    },
    run: async <T>(
      binding: BrowserSessionScope,
      id: string,
      operation: (browser: BrowserInfo) => Promise<T>,
    ): Promise<T> => {
      assert.equal(binding, scope);
      assert.equal(id, '20000000-0000-4000-8000-000000000008');
      calls.push('browser');
      return operation(browser);
    },
    close: async () => {
      calls.push('close');
      if (options.stopped === false) throw new Error('private stop data');
    },
  };
  return { runner: new MarketplaceMessageRunner(broker, store), calls, results, store, browser };
}

test('persists begin before the provider, finishes the original claim and closes its browser', async () => {
  const { runner, calls, results } = fixture();
  await runner.run(claim);
  assert.ok(calls.indexOf('begin') < calls.indexOf('provider'));
  assert.ok(calls.indexOf('provider') < calls.indexOf('finish'));
  assert.equal(calls.at(-1), 'close');
  assert.deepEqual(results, [{ outcome: 'sent', externalMessageId: '999' }]);
});

test('an unacknowledged begin cannot start any provider action', async () => {
  const { runner, calls, results } = fixture({ beginLost: true });
  await runner.run(claim);
  assert.equal(calls.includes('provider'), false);
  assert.deepEqual(results, [{ outcome: 'outcome_unknown', errorCode: 'begin_unconfirmed' }]);
  assert.equal(calls.at(-1), 'close');
});

test('a revoked job has no provider attempt', async () => {
  const { runner, calls, results } = fixture({ authorized: false });
  await runner.run(claim);
  assert.equal(calls.includes('begin'), false);
  assert.equal(calls.includes('provider'), false);
  assert.deepEqual(results, [{ outcome: 'failed', errorCode: 'authorization_expired' }]);
});

test('a possibly started provider attempt exposes only a fixed error code', async () => {
  const { runner, calls, results } = fixture({ providerThrows: true });
  await runner.run(claim);
  assert.equal(calls.filter((call) => call === 'provider').length, 1);
  assert.deepEqual(results, [{ outcome: 'outcome_unknown', errorCode: 'provider_unavailable' }]);
});

test('an unresolved stop rejects so the dispatcher cannot start another job', async () => {
  const { runner, calls } = fixture({ stopped: false });
  await assert.rejects(runner.run(claim), /^Error: Cloud-Versand verlangt Wiederherstellung$/);
  assert.equal(calls.filter((call) => call === 'provider').length, 1);
});

test('lost finish still closes the browser and rejects without provider retry', async () => {
  const { runner, calls } = fixture({ finishLost: true });
  await assert.rejects(runner.run(claim), /^Error: Cloud-Versand verlangt Wiederherstellung$/);
  assert.equal(calls.at(-1), 'close');
  assert.equal(calls.filter((call) => call === 'provider').length, 1);
});

test('a different message cannot borrow the scope of the reserved claim', async () => {
  const { runner, calls } = fixture();
  await assert.rejects(
    runner.run({ ...claim, messageId: '20000000-0000-4000-8000-000000000009' }),
    /Versandclaim/,
  );
  assert.deepEqual(calls, []);
});

test('the real broker stops a browser after lost begin without starting a provider reply', async () => {
  const { store, browser, results, calls } = fixture({ beginLost: true });
  const cleanup: string[] = [];
  const broker = new MarketplaceBrowserSessionBroker({
    leases: {
      acquire: async () => ({
        id: '20000000-0000-4000-8000-000000000008',
        scope,
        active: true,
        expiresAt: Date.now() + 60_000,
      }),
      assertActive: async () => true,
      release: async () => {
        cleanup.push('release');
      },
    },
    profiles: { resolve: async () => 'bound-test-profile' },
    recovery: { recover: async () => undefined },
    browsers: {
      open: async () => ({
        run: async (operation) => operation(browser),
        close: async () => {
          cleanup.push('stop');
        },
      }),
      stop: async () => undefined,
    },
  });
  await new MarketplaceMessageRunner(broker, store).run(claim);
  assert.equal(calls.includes('provider'), false);
  assert.deepEqual(results, [{ outcome: 'outcome_unknown', errorCode: 'begin_unconfirmed' }]);
  assert.deepEqual(cleanup, ['stop', 'release']);
});

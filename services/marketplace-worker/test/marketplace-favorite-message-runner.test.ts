import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MarketplaceFavoriteMessageRunner,
  type CloudFavoriteClaim,
  type FavoriteWriteResult,
} from '../src/marketplace-favorite-message-runner.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
const scope = {
  workspaceId: 'w',
  connectionId: 'c',
  userId: 'u',
  userAccessToken: '',
  favoriteWrite: {
    eventId: 'e',
    claimToken: 't',
    workerId: 'worker',
    workerEpoch: 1,
    runnerId: 'runner',
    sessionId: 's',
    expiresAt: '2026-10-08T12:01:30Z',
    absoluteExpiresAt: '2026-10-08T12:10:00Z',
    phase: 'message' as const,
  },
};
const claim: CloudFavoriteClaim = {
  kind: 'favorite_message',
  eventId: 'e',
  claimToken: 't',
  scope,
  accountId: '123',
  authorizationVersion: 1,
  settingsVersion: 1,
  command: { recipientId: '789', itemId: '456', text: 'Hallo' },
};
function fixture(
  options: {
    lostBegin?: boolean;
    lostFinish?: boolean;
    lostStop?: boolean;
    revoked?: boolean;
    offer?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const results: FavoriteWriteResult[] = [];
  const store = {
    check: async () => {
      calls.push('check');
      return !options.revoked;
    },
    begin: async () => {
      calls.push('begin');
      if (options.lostBegin) throw new Error('lost');
    },
    finish: async (_claim: CloudFavoriteClaim, result: FavoriteWriteResult) => {
      calls.push('finish');
      results.push(result);
      if (options.lostFinish) throw new Error('lost');
    },
  };
  const browser: BrowserInfo = {
    version: () => '',
    sendFavoriteMessage: async (_account, _command, authorize) => {
      await authorize();
      calls.push('provider');
      return {
        outcome: 'sent',
        externalMessageId: '999',
        conversationId: '777',
        transactionId: '666',
      };
    },
    sendFavoriteOffer: async (_account, _command, authorize, confirm) => {
      await authorize();
      await confirm(4000, 3600);
      calls.push('provider');
      return { outcome: 'sent', externalOfferId: '555' };
    },
  };
  const broker = {
    open: async () => {
      calls.push('open');
      return 's';
    },
    run: async <T>(
      _scope: typeof scope,
      _id: string,
      operation: (browser: BrowserInfo) => Promise<T>,
    ) => operation(browser),
    close: async () => {
      calls.push('close');
      if (options.lostStop) throw new Error('lost');
    },
  };
  return { runner: new MarketplaceFavoriteMessageRunner(broker, store), calls, results };
}
test('persists favorite begin before sending and closes the original browser', async () => {
  const { runner, calls, results } = fixture();
  await runner.run(claim);
  assert.ok(calls.indexOf('begin') < calls.indexOf('provider'));
  assert.equal(results[0]?.outcome, 'sent');
  assert.equal(calls.at(-1), 'close');
});
test('does not send after revocation or missing begin acknowledgement', async () => {
  for (const options of [{ revoked: true }, { lostBegin: true }]) {
    const { runner, calls, results } = fixture(options);
    await runner.run(claim);
    assert.ok(!calls.includes('provider'));
    assert.equal(results[0]?.outcome, options.lostBegin ? 'outcome_unknown' : 'failed');
  }
});
test('fences runtime after unconfirmed persistence or physical stop', async () => {
  for (const options of [{ lostFinish: true }, { lostStop: true }]) {
    const { runner } = fixture(options);
    await assert.rejects(runner.run(claim), /Wiederherstellung/);
  }
});
test('begins an offer only through the server price acknowledgement', async () => {
  const { runner, calls, results } = fixture();
  await runner.run({
    ...claim,
    kind: 'favorite_offer',
    scope: { ...scope, favoriteWrite: { ...scope.favoriteWrite, phase: 'offer' } },
    command: {
      ...claim.command,
      conversationId: '777',
      transactionId: '666',
      externalMessageId: '999',
      offer: { type: 'percentage', value: 10 },
    },
  });
  assert.ok(calls.indexOf('begin') < calls.indexOf('provider'));
  assert.deepEqual(results[0], { outcome: 'sent', externalOfferId: '555' });
});

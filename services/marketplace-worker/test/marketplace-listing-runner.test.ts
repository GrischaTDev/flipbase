import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MarketplaceListingRunner,
  type CloudListingClaim,
} from '../src/marketplace-listing-runner.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import type { MarketplaceListingResult } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

import { listingClaimFixture as claim } from './fixtures/marketplace-listing-claim.ts';

const confirmed: MarketplaceListingResult = {
  outcome: 'confirmed',
  action: 'publish',
  externalId: '999',
  externalAccountId: '123',
  providerState: 'processing',
  verifiedAt: '2026-10-09T12:00:00.000Z',
};
function fixture(
  options: {
    beginLost?: boolean;
    finishLost?: boolean;
    stopLost?: boolean;
    providerThrows?: boolean;
    authorized?: boolean;
    unsupported?: boolean;
    result?: MarketplaceListingResult;
  } = {},
) {
  const calls: string[] = [],
    results: MarketplaceListingResult[] = [];
  const browser: BrowserInfo = {
    version: () => 'fixture',
    ...(options.unsupported
      ? {}
      : ({
          submitListing: async (_account, _action, _snapshot, beforeWrite, authorize) => {
            calls.push('preflight');
            await authorize();
            await beforeWrite();
            calls.push('provider');
            if (options.providerThrows) throw new Error('secret-provider-detail');
            return options.result ?? confirmed;
          },
        } satisfies Pick<BrowserInfo, 'submitListing'>)),
  };
  const store = {
    check: async () => {
      calls.push('check');
      return options.authorized !== false;
    },
    begin: async () => {
      calls.push('begin');
      if (options.beginLost) throw new Error('lost');
    },
    finish: async (_job: CloudListingClaim, result: MarketplaceListingResult) => {
      calls.push('finish');
      results.push(result);
      if (options.finishLost) throw new Error('lost');
    },
  };
  const broker = {
    open: async () => {
      calls.push('open');
      return claim.scope.listingWrite!.sessionId;
    },
    run: async <T>(_scope: unknown, _id: string, operation: (browser: BrowserInfo) => Promise<T>) =>
      operation(browser),
    close: async () => {
      calls.push('close');
      if (options.stopLost) throw new Error('lost');
    },
  };
  return { calls, results, runner: new MarketplaceListingRunner(broker, store) };
}
test('preflight happens before the single durable write start and receipt', async () => {
  const f = fixture();
  await f.runner.run(claim);
  assert.ok(f.calls.indexOf('preflight') < f.calls.indexOf('begin'));
  assert.ok(f.calls.indexOf('begin') < f.calls.indexOf('provider'));
  assert.equal(f.calls.filter((x) => x === 'begin').length, 1);
  assert.deepEqual(f.results, [confirmed]);
  assert.equal(f.calls.at(-1), 'close');
});
test('a missing Begin acknowledgment prevents every provider write', async () => {
  const f = fixture({ beginLost: true });
  await f.runner.run(claim);
  assert.ok(!f.calls.includes('provider'));
  assert.deepEqual(f.results, [{ outcome: 'outcome_unknown', errorCode: 'begin_unconfirmed' }]);
});
test('unavailable adapter fails without recording a write start', async () => {
  const f = fixture({ unsupported: true });
  await f.runner.run(claim);
  assert.ok(!f.calls.includes('begin'));
  assert.deepEqual(f.results, [{ outcome: 'failed', errorCode: 'unsupported' }]);
});
test('authorization failure prevents provider preparation and write', async () => {
  const f = fixture({ authorized: false });
  await f.runner.run(claim);
  assert.ok(!f.calls.includes('preflight'));
  assert.ok(!f.calls.includes('begin'));
});
test('provider exception after begin is unknown and hides provider details', async () => {
  const f = fixture({ providerThrows: true });
  await f.runner.run(claim);
  assert.deepEqual(f.results, [{ outcome: 'outcome_unknown', errorCode: 'provider_unavailable' }]);
});
test('wrong-account provider success never becomes a confirmed receipt', async () => {
  const f = fixture({ result: { ...confirmed, externalAccountId: '124' } });
  await f.runner.run(claim);
  assert.deepEqual(f.results, [
    { outcome: 'outcome_unknown', errorCode: 'provider_result_invalid' },
  ]);
});
test('lost receipt or physical stop requires recovery without a second write', async () => {
  for (const options of [{ finishLost: true }, { stopLost: true }]) {
    const f = fixture(options);
    await assert.rejects(f.runner.run(claim), /Wiederherstellung/);
    assert.equal(f.calls.filter((x) => x === 'provider').length, 1);
    assert.equal(f.calls.at(-1), 'close');
  }
});
test('mixed internal permissions are rejected before opening a browser', async () => {
  const f = fixture();
  await assert.rejects(
    f.runner.run({
      ...claim,
      scope: { ...claim.scope, negotiationWrite: { ...claim.scope.listingWrite!, jobId: 'other' } },
    }),
    /ungültig/,
  );
  assert.deepEqual(f.calls, []);
});

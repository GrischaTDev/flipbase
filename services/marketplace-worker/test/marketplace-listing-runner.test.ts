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
    readPhoto?: boolean;
    photoThrows?: boolean;
    photoAfterBegin?: boolean;
    revokeAfterPhoto?: boolean;
    concurrentBegin?: boolean;
    result?: MarketplaceListingResult;
  } = {},
) {
  const calls: string[] = [],
    results: MarketplaceListingResult[] = [];
  let revoked = false;
  let latePhoto: (() => Promise<unknown>) | undefined;
  const browser: BrowserInfo = {
    version: () => 'fixture',
    ...(options.unsupported
      ? {}
      : ({
          submitListing: async (
            _account,
            _action,
            _snapshot,
            beforeWrite,
            authorize,
            loadPhoto,
          ) => {
            calls.push('preflight');
            await authorize();
            latePhoto = () => loadPhoto(claim.snapshot.images[0]!.id);
            if (options.readPhoto && !options.photoAfterBegin) {
              await latePhoto();
              calls.push('photo-received');
            }
            if (options.concurrentBegin) {
              const starts = await Promise.allSettled([beforeWrite(), beforeWrite()]);
              assert.equal(starts.filter((start) => start.status === 'fulfilled').length, 1);
              assert.equal(starts.filter((start) => start.status === 'rejected').length, 1);
            } else await beforeWrite();
            if (options.readPhoto && options.photoAfterBegin) await latePhoto();
            calls.push('provider');
            if (options.providerThrows) throw new Error('secret-provider-detail');
            return options.result ?? confirmed;
          },
        } satisfies Pick<BrowserInfo, 'submitListing'>)),
  };
  const store = {
    check: async () => {
      calls.push('check');
      return options.authorized !== false && !revoked;
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
    loadPhoto: async (_job: CloudListingClaim, imageId: string) => {
      assert.equal(_job, claim);
      assert.equal(imageId, claim.snapshot.images[0]!.id);
      calls.push('photo');
      if (options.photoThrows) throw new Error('private-photo-path');
      revoked = options.revokeAfterPhoto === true;
      return {
        id: imageId,
        fileName: 'jacke.jpg',
        mimeType: 'image/jpeg' as const,
        bytes: new Uint8Array([1]),
      };
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
  return {
    calls,
    results,
    runner: new MarketplaceListingRunner(broker, store),
    latePhoto: () => latePhoto!(),
  };
}

test('private photo preparation precedes Begin and closed adapters cannot load more photos', async () => {
  const f = fixture({ readPhoto: true });
  await f.runner.run(claim);
  assert.ok(f.calls.indexOf('photo') < f.calls.indexOf('begin'));
  assert.ok(f.calls.includes('photo-received'));
  const count = f.calls.length;
  await assert.rejects(f.latePhoto());
  assert.equal(f.calls.length, count);
});
test('photo failure before Begin cannot create an uncertain write or trigger the provider', async () => {
  const f = fixture({ readPhoto: true, photoThrows: true });
  await f.runner.run(claim);
  assert.ok(f.calls.includes('photo'));
  assert.ok(!f.calls.includes('begin'));
  assert.ok(!f.calls.includes('provider'));
  assert.equal(f.results[0]?.outcome, 'failed');
});
test('photo failure after an upload may have begun stays unknown', async () => {
  const f = fixture({ readPhoto: true, photoThrows: true, photoAfterBegin: true });
  await f.runner.run(claim);
  assert.ok(f.calls.includes('begin'));
  assert.equal(f.results[0]?.outcome, 'outcome_unknown');
});
test('revocation between photo download and transfer blocks the adapter and Begin', async () => {
  const f = fixture({ readPhoto: true, revokeAfterPhoto: true });
  await f.runner.run(claim);
  assert.ok(f.calls.includes('photo'));
  assert.ok(!f.calls.includes('photo-received'));
  assert.ok(!f.calls.includes('begin'));
});
test('preflight happens before the single durable write start and receipt', async () => {
  const f = fixture();
  await f.runner.run(claim);
  assert.ok(f.calls.indexOf('preflight') < f.calls.indexOf('begin'));
  assert.ok(f.calls.indexOf('begin') < f.calls.indexOf('provider'));
  assert.equal(f.calls.filter((x) => x === 'begin').length, 1);
  assert.deepEqual(f.results, [confirmed]);
  assert.equal(f.calls.at(-1), 'close');
});

test('concurrent write callbacks cannot request a second Begin while authorization is pending', async () => {
  const f = fixture({ concurrentBegin: true });
  await f.runner.run(claim);
  assert.equal(f.calls.filter((call) => call === 'begin').length, 1);
  assert.equal(f.calls.filter((call) => call === 'provider').length, 1);
  assert.deepEqual(f.results, [confirmed]);
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

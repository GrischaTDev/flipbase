import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { VintedListingReadError } from '../src/vinted-listing-read-error.ts';
import { MarketplaceBrowserSessionBroker } from '../src/marketplace-browser-session-broker.ts';
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
    providerThrows?: boolean | Error;
    authorized?: boolean;
    unsupported?: boolean;
    readPhoto?: boolean;
    photoThrows?: boolean;
    photoAfterBegin?: boolean;
    revokeAfterPhoto?: boolean;
    concurrentBegin?: boolean;
    categoryThrows?: boolean;
    requireCategory?: boolean;
    preflightError?: Error;
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
            categoryPath,
          ) => {
            if (options.requireCategory) assert.deepEqual(categoryPath, [5, 6]);
            calls.push('preflight');
            await authorize();
            if (options.preflightError) throw options.preflightError;
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
            if (options.providerThrows)
              throw options.providerThrows instanceof Error
                ? options.providerThrows
                : new Error('secret-provider-detail');
            return options.result ?? confirmed;
          },
        } satisfies Pick<BrowserInfo, 'submitListing'>)),
  };
  const store = {
    loadCategoryPath: async (_claim: CloudListingClaim) => {
      assert.equal(_claim, claim);
      calls.push('category');
      if (options.categoryThrows) throw new Error('private-category-path');
      return Object.freeze([5, 6]);
    },
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
    browser,
    store,
    calls,
    results,
    runner: new MarketplaceListingRunner(broker, store),
    latePhoto: () => latePhoto!(),
  };
}

test('the real session broker preserves a safe failure and confirms cleanup once for the listing runner', async () => {
  const output: string[] = [];
  const stderr = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    output.push(String(chunk));
    return true;
  });
  try {
    for (const mode of ['preflight', 'private', 'after_begin', 'uncertain_stop'] as const) {
      output.length = 0;
      const listing = fixture(
        mode === 'after_begin'
          ? { providerThrows: true }
          : {
              preflightError:
                mode === 'private'
                  ? new Error('Private provider response 123')
                  : new VintedListingReadError('category'),
            },
      );
      let stops = 0;
      let released = false;
      const broker = new MarketplaceBrowserSessionBroker({
        leases: {
          acquire: async (scope) => ({
            id: claim.scope.listingWrite?.sessionId ?? '',
            scope,
            expiresAt: Date.now() + 60000,
            active: true,
          }),
          assertActive: async () => !released,
          release: async () => {
            released = true;
          },
        },
        profiles: { resolve: async () => 'listing-profile' },
        recovery: { recover: async () => undefined },
        browsers: {
          open: async () => ({
            run: async (operation) => operation(listing.browser),
            close: async () => {
              stops++;
              if (mode === 'uncertain_stop') throw new Error('Private stop failure');
            },
          }),
          stop: async () => undefined,
        },
      });
      const runner = new MarketplaceListingRunner(broker, listing.store);
      if (mode === 'uncertain_stop') {
        await assert.rejects(runner.run(claim), /Wiederherstellung/);
        assert.equal(released, false);
      } else {
        await runner.run(claim);
        assert.equal(released, true);
        assert.equal(stops, 1);
        assert.equal(
          listing.results[0]?.outcome,
          mode === 'after_begin' ? 'outcome_unknown' : 'failed',
        );
        assert.deepEqual(
          output.map((line) => JSON.parse(line)),
          mode === 'after_begin'
            ? []
            : [
                {
                  event: 'marketplace_listing_preflight_failed',
                  jobId: claim.jobId,
                  stage: mode === 'preflight' ? 'category' : 'provider',
                },
              ],
        );
      }
      assert.ok(output.every((line) => !line.includes('Private')));
    }
  } finally {
    stderr.mock.restore();
  }
});

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

test('passes the verified category navigation path to preparation before Begin', async () => {
  const f = fixture({ requireCategory: true });
  await f.runner.run(claim);
  assert.ok(f.calls.indexOf('category') < f.calls.indexOf('preflight'));
  assert.deepEqual(f.results, [confirmed]);
});

test('a missing category path fails before provider preparation or Begin', async () => {
  const f = fixture({ categoryThrows: true });
  await f.runner.run(claim);
  assert.ok(!f.calls.includes('preflight'));
  assert.ok(!f.calls.includes('begin'));
  assert.equal(f.results[0]?.outcome, 'failed');
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

test('preflight diagnostics contain only the fixed step and keep the failed write boundary', async () => {
  const output: string[] = [];
  const stderr = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    output.push(String(chunk));
    return true;
  });
  try {
    for (const stage of [
      'size',
      'brand_open',
      'brand_options',
      'brand_parse',
      'brand_search',
      'brand_match',
      'brand_choice',
      'brand_selected',
    ] as const) {
      const diagnostic = fixture({ preflightError: new VintedListingReadError(stage) });
      await diagnostic.runner.run(claim);
      assert.deepEqual(diagnostic.results, [
        { outcome: 'failed', errorCode: 'provider_unavailable' },
      ]);
      assert.ok(!diagnostic.calls.includes('begin'));
      assert.deepEqual(
        output.map((line) => JSON.parse(line)),
        [{ event: 'marketplace_listing_preflight_failed', jobId: claim.jobId, stage }],
      );
      output.length = 0;
    }
    output.length = 0;
    const privateFailure = fixture({ preflightError: new Error('Private provider response 123') });
    await privateFailure.runner.run(claim);
    assert.deepEqual(
      output.map((line) => JSON.parse(line)),
      [{ event: 'marketplace_listing_preflight_failed', jobId: claim.jobId, stage: 'provider' }],
    );
    output.length = 0;
    const photoFailure = fixture({ readPhoto: true, photoThrows: true });
    await photoFailure.runner.run(claim);
    assert.deepEqual(
      output.map((line) => JSON.parse(line)),
      [
        {
          event: 'marketplace_listing_preflight_failed',
          jobId: claim.jobId,
          stage: 'photo_download',
        },
      ],
    );
    output.length = 0;
    const afterBegin = fixture({ providerThrows: new VintedListingReadError('photos') });
    await afterBegin.runner.run(claim);
    assert.deepEqual(afterBegin.results, [
      { outcome: 'outcome_unknown', errorCode: 'provider_unavailable' },
    ]);
    assert.deepEqual(output, []);
    for (const stage of ['finish', 'cleanup'] as const) {
      const recovery = fixture(stage === 'finish' ? { finishLost: true } : { stopLost: true });
      await assert.rejects(recovery.runner.run(claim), /Wiederherstellung/);
      assert.deepEqual(
        output.map((line) => JSON.parse(line)),
        [{ event: 'marketplace_listing_recovery_required', jobId: claim.jobId, stage }],
      );
      output.length = 0;
    }
  } finally {
    stderr.mock.restore();
  }
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

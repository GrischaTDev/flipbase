import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMarketplaceCloudWriteDispatch } from '../src/marketplace-cloud-write-dispatch.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';
import { MarketplaceSyncDispatcher } from '../src/marketplace-sync-dispatcher.ts';
import type { MarketplaceCloudWriteClaim } from '../src/marketplace-cloud-write-dispatch.ts';

test('a due listing reserves one browser after manual replies and before automatic favorite work', async () => {
  const calls: string[] = [];
  const binding = ['worker', 4, 'runner'] as const;
  const dispatch = createMarketplaceCloudWriteDispatch({
    listingWritesEnabled: true,
    messages: {
      claim: (...args) => {
        assert.deepEqual(args, binding);
        calls.push('message');
        return Promise.resolve(null);
      },
      run: () => Promise.reject(),
    },
    negotiations: {
      claim: () => {
        calls.push('negotiation');
        return Promise.resolve(null);
      },
      run: () => Promise.reject(),
    },
    listings: {
      claim: (...args) => {
        assert.deepEqual(args, binding);
        calls.push('listing');
        return Promise.resolve(listingClaimFixture);
      },
      run: (job) => {
        assert.equal(job, listingClaimFixture);
        calls.push('run');
        return Promise.resolve();
      },
    },
    favorites: {
      claim: () => {
        calls.push('favorite');
        return Promise.reject(new Error('must not reserve'));
      },
      run: () => Promise.reject(),
    },
  });
  const claim = await dispatch.claim(...binding);
  assert.equal(claim, listingClaimFixture);
  await dispatch.run(claim!);
  assert.deepEqual(calls, ['message', 'negotiation', 'listing', 'run']);
});

test('a lost listing claim aborts without reserving a second browser or falling through', async () => {
  let favorites = 0;
  const dispatch = createMarketplaceCloudWriteDispatch({
    listingWritesEnabled: true,
    messages: { claim: () => Promise.resolve(null), run: () => Promise.reject() },
    listings: { claim: () => Promise.reject(new Error('claim lost')), run: () => Promise.reject() },
    favorites: {
      claim: () => {
        favorites++;
        return Promise.resolve(null);
      },
      run: () => Promise.reject(),
    },
  });
  await assert.rejects(dispatch.claim('worker', 4, 'runner'), /claim lost/);
  assert.equal(favorites, 0);
});

test('empty queues and disabled handlers preserve sync fallback and reject unrelated work', async () => {
  const calls: string[] = [];
  const dispatch = createMarketplaceCloudWriteDispatch({
    messages: {
      claim: () => {
        calls.push('message');
        return Promise.resolve(null);
      },
      run: () => Promise.reject(),
    },
  });
  assert.equal(await dispatch.claim('worker', 4, 'runner'), null);
  await assert.rejects(dispatch.run(listingClaimFixture));
  assert.deepEqual(calls, ['message']);
});

test('listing jobs use the common dispatcher even with sync scheduling off and uncertain cleanup stops new claims', async () => {
  for (const uncertain of [false, true]) {
    let claims = 0,
      runs = 0;
    const losses: string[] = [];
    const binding = listingClaimFixture.scope.listingWrite!;
    const writes = createMarketplaceCloudWriteDispatch({
      listingWritesEnabled: true,
      messages: { claim: () => Promise.resolve(null), run: () => Promise.reject() },
      listings: {
        claim: (worker, epoch, runner) => {
          assert.equal(worker, binding.workerId);
          assert.equal(epoch, binding.workerEpoch);
          assert.equal(runner, binding.runnerId);
          claims++;
          return Promise.resolve(listingClaimFixture);
        },
        run: (claim) => {
          assert.equal(claim, listingClaimFixture);
          runs++;
          return uncertain
            ? Promise.reject(new Error('physical stop uncertain'))
            : Promise.resolve();
        },
      },
    });
    const dispatcher = new MarketplaceSyncDispatcher<MarketplaceCloudWriteClaim>({
      writes,
      workerId: binding.workerId,
      createRunnerId: () => binding.runnerId,
      maxJobsPerPoll: 1,
      includeScheduled: false,
      store: {
        acquireWorker: () =>
          Promise.resolve({
            workerId: binding.workerId,
            workerEpoch: binding.workerEpoch,
            expiresAt: new Date(Date.now() + 90_000).toISOString(),
          }),
        heartbeatWorker: () => Promise.resolve(true),
        releaseWorker: () => Promise.resolve(true),
        recover: () => Promise.resolve({ interruptedOperations: 0 }),
        claim: () => Promise.reject(new Error('must not claim another browser')),
      },
      run: () => Promise.reject(),
      onRuntimeLost: (reason) => {
        losses.push(reason);
      },
      timers: { setInterval: () => 0, clearInterval: () => undefined },
    });
    await dispatcher.initialize();
    dispatcher.start();
    await dispatcher.poll();
    assert.equal(dispatcher.scheduledEnabled, false);
    assert.equal(claims, 1);
    assert.equal(runs, 1);
    if (uncertain) {
      await dispatcher.poll();
      assert.equal(claims, 1);
      assert.deepEqual(losses, ['run_failed']);
    } else assert.deepEqual(losses, []);
    dispatcher.stop();
    await dispatcher.drain();
  }
});
test('listing dispatch requires explicit write activation without disabling other queues', async () => {
  for (const listingWritesEnabled of [undefined, false, true]) {
    let claims = 0,
      runs = 0,
      favorites = 0;
    const dispatch = createMarketplaceCloudWriteDispatch({
      listingWritesEnabled,
      messages: { claim: () => Promise.resolve(null), run: () => Promise.reject() },
      listings: {
        claim: () => {
          claims++;
          return Promise.resolve(listingClaimFixture);
        },
        run: () => {
          runs++;
          return Promise.resolve();
        },
      },
      favorites: {
        claim: () => {
          favorites++;
          return Promise.resolve(null);
        },
        run: () => Promise.reject(),
      },
    });
    assert.equal(
      await dispatch.claim('worker', 4, 'runner'),
      listingWritesEnabled ? listingClaimFixture : null,
    );
    if (listingWritesEnabled) await dispatch.run(listingClaimFixture);
    else await assert.rejects(dispatch.run(listingClaimFixture));
    assert.equal(claims, listingWritesEnabled ? 1 : 0);
    assert.equal(runs, listingWritesEnabled ? 1 : 0);
    assert.equal(favorites, listingWritesEnabled ? 0 : 1);
  }
});

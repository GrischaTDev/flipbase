import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  IpRoyalCloudIpMaintenance,
  startMarketplaceDispatchAfterCloudIpRefresh,
} from '../src/iproyal-cloud-ip-maintenance.ts';
import { MarketplaceSyncDispatcher } from '../src/marketplace-sync-dispatcher.ts';

function dispatchFixture(claim: () => Promise<null>) {
  const intervals: number[] = [];
  let heartbeats = 0;
  const dispatcher = new MarketplaceSyncDispatcher({
    now: () => 1000,
    includeScheduled: true,
    store: {
      acquireWorker: async (workerId) => ({
        workerId,
        workerEpoch: 1,
        expiresAt: new Date(91_000).toISOString(),
      }),
      heartbeatWorker: async () => {
        heartbeats++;
        return true;
      },
      releaseWorker: async () => true,
      recover: async () => ({ interruptedOperations: 0 }),
      claim,
    },
    run: async () => assert.fail('the fixture has no claimed operation'),
    onRuntimeLost: () => assert.fail('startup keeps its runtime permission'),
    timers: {
      setInterval: (_callback, milliseconds) => {
        intervals.push(milliseconds);
        return milliseconds;
      },
      clearInterval: (handle) => {
        const index = intervals.indexOf(Number(handle));
        if (index !== -1) intervals.splice(index, 1);
      },
    },
  });
  return { dispatcher, intervals, heartbeats: () => heartbeats };
}

test('waits for initial expiry refresh before starting the first scheduled claim after a worker restart', async () => {
  const calls: string[] = [];
  let release: () => void = () => assert.fail('the blocked refresh has not been initialized');
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const item = dispatchFixture(async () => {
    calls.push('claim');
    return null;
  });
  await item.dispatcher.initialize();
  item.dispatcher.startMonitoring();
  const service = new IpRoyalCloudIpMaintenance({
    refreshInventory: async () => {
      assert.equal(await item.dispatcher.heartbeat(), true);
      calls.push('inventory');
      await blocked;
      calls.push('refreshed');
    },
    report: () => assert.fail('startup inventory refresh succeeds'),
  });
  const starting = startMarketplaceDispatchAfterCloudIpRefresh(service, item.dispatcher);
  assert.deepEqual(item.intervals, [20_000]);
  assert.equal(item.dispatcher.scheduledEnabled, false);
  assert.equal(await item.dispatcher.heartbeat(), true);
  assert.ok(item.heartbeats() > 0);
  release();
  await starting;
  assert.equal(item.dispatcher.scheduledEnabled, true);
  assert.deepEqual(item.intervals, [20_000, 15_000]);
  await item.dispatcher.poll();
  assert.deepEqual(calls, ['inventory', 'refreshed', 'claim']);
  await startMarketplaceDispatchAfterCloudIpRefresh(service, item.dispatcher);
  assert.deepEqual(item.intervals, [20_000, 15_000]);
});

test('a shutdown during the initial inventory refresh never restarts dispatch or claims new work', async () => {
  const item = dispatchFixture(async () => assert.fail('shutdown must not claim a new operation'));
  await item.dispatcher.initialize();
  item.dispatcher.startMonitoring();
  let release: () => void = () => assert.fail('the blocked refresh has not been initialized');
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let refreshed = false;
  const service = new IpRoyalCloudIpMaintenance({
    refreshInventory: async () => {
      await blocked;
      refreshed = true;
    },
    report: () => assert.fail('the pending inventory refresh succeeds'),
  });
  const starting = startMarketplaceDispatchAfterCloudIpRefresh(service, item.dispatcher);
  assert.deepEqual(item.intervals, [20_000]);
  assert.equal(refreshed, false);
  item.dispatcher.stop();
  await item.dispatcher.drain();
  assert.deepEqual(item.intervals, []);
  release();
  await starting;
  assert.equal(refreshed, true);
  assert.equal(item.dispatcher.ready, false);
  assert.equal(item.dispatcher.scheduledEnabled, false);
  assert.deepEqual(item.intervals, []);
  await item.dispatcher.poll();
  await startMarketplaceDispatchAfterCloudIpRefresh(service, item.dispatcher);
  assert.deepEqual(item.intervals, []);
});

test('reports an unavailable startup refresh before dispatch without substituting an unverified expiry', async () => {
  const calls: string[] = [];
  const item = dispatchFixture(async () => {
    calls.push('claim');
    return null;
  });
  await item.dispatcher.initialize();
  item.dispatcher.startMonitoring();
  const service = new IpRoyalCloudIpMaintenance({
    refreshInventory: async () => {
      assert.equal(await item.dispatcher.heartbeat(), true);
      calls.push('inventory');
      throw new Error('private provider response');
    },
    report: (event) => calls.push(event.event),
  });
  await startMarketplaceDispatchAfterCloudIpRefresh(service, item.dispatcher);
  await item.dispatcher.poll();
  assert.deepEqual(calls, ['inventory', 'cloud_ip_inventory_unavailable', 'claim']);
  assert.deepEqual(item.intervals, [20_000, 15_000]);
});

test('refreshes purchased IP expiry without payment or automatic renewal', async () => {
  let refreshes = 0;
  const service = new IpRoyalCloudIpMaintenance({
    refreshInventory: async () => {
      refreshes++;
    },
    report: () => assert.fail('a successful inventory refresh needs no warning'),
  });
  await service.reconcile();
  assert.equal(refreshes, 1);
});

test('refreshes expiry before renewal and preserves the ten-minute interval', async () => {
  let now = 1000;
  const calls: string[] = [];
  const reports: unknown[] = [];
  const service = new IpRoyalCloudIpMaintenance({
    now: () => now,
    refreshInventory: async () => {
      calls.push('inventory');
    },
    reconcileRenewal: async () => {
      calls.push('renewal');
      return { enabled: 0, disabled: 0, failed: 0 };
    },
    report: (event) => reports.push(event),
  });
  await service.reconcile();
  assert.deepEqual(calls, ['inventory', 'renewal']);
  now += 599_999;
  await service.reconcile();
  assert.equal(calls.length, 2);
  now++;
  await service.reconcile();
  assert.deepEqual(calls, ['inventory', 'renewal', 'inventory', 'renewal']);
  assert.deepEqual(reports, []);
});

test('coalesces overlapping inventory refreshes even when a slow check spans the interval', async () => {
  let now = 1000;
  let refreshes = 0;
  let release: () => void = () => assert.fail('the blocked refresh has not been initialized');
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new IpRoyalCloudIpMaintenance({
    now: () => now,
    refreshInventory: async () => {
      refreshes++;
      await blocked;
    },
    report: () => assert.fail('a successful refresh needs no warning'),
  });
  const first = service.reconcile();
  now += 700_000;
  const second = service.reconcile();
  assert.equal(first, second);
  assert.equal(refreshes, 1);
  release();
  await Promise.all([first, second]);
  await service.reconcile();
  assert.equal(refreshes, 2);
});

test('reports inventory failure safely, still reconciles renewal and retries at the next interval', async () => {
  let now = 1000;
  let unavailable = true;
  const calls: string[] = [];
  const reports: unknown[] = [];
  const service = new IpRoyalCloudIpMaintenance({
    now: () => now,
    refreshInventory: async () => {
      calls.push('inventory');
      if (unavailable) throw new Error('private provider response and credentials');
    },
    reconcileRenewal: async () => {
      calls.push('renewal');
      return { enabled: 1, disabled: 0, failed: 0 };
    },
    report: (event) => reports.push(event),
  });
  await service.reconcile();
  assert.deepEqual(calls, ['inventory', 'renewal']);
  assert.deepEqual(reports, [
    { event: 'cloud_ip_inventory_unavailable' },
    { event: 'cloud_ip_renewal_reconciled', enabled: 1, disabled: 0, failed: 0 },
  ]);
  unavailable = false;
  now += 600_000;
  await service.reconcile();
  assert.deepEqual(calls, ['inventory', 'renewal', 'inventory', 'renewal']);
});

test('reports renewal failure separately after successfully refreshing inventory', async () => {
  const reports: unknown[] = [];
  let refreshed = false;
  const service = new IpRoyalCloudIpMaintenance({
    refreshInventory: async () => {
      refreshed = true;
    },
    reconcileRenewal: async () => {
      assert.equal(refreshed, true);
      throw new Error('private payment response');
    },
    report: (event) => reports.push(event),
  });
  await service.reconcile();
  assert.equal(refreshed, true);
  assert.deepEqual(reports, [{ event: 'cloud_ip_renewal_unavailable' }]);
});

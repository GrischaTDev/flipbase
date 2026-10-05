import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MarketplaceCloudSetup } from '../src/marketplace-cloud-setup.ts';
import type { CloudSetupView } from '../src/marketplace-cloud-setup-contracts.d.ts';
import type { PrivateCloudSetup } from '../src/supabase-marketplace-cloud-setup-store.ts';

const scope = {
  workspaceId: '37100000-0000-4000-8000-000000000011',
  connectionId: '37100000-0000-4000-8000-000000000021',
  userId: '37100000-0000-4000-8000-000000000001',
  userAccessToken: 'user-token',
};
const setupId = '37100000-0000-4000-8000-000000000031';
const sessionId = '37100000-0000-4000-8000-000000000032';

function fixture(
  uncertainStop = false,
  lostCompleteReply = false,
  inventory?: { authorized?: boolean; fails?: boolean },
) {
  let view: CloudSetupView = {
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    setupId,
    sessionId,
    state: 'login',
  };
  const events: string[] = [];
  const recoveryRows: unknown[] = [];
  const privateView = (): PrivateCloudSetup => ({
    setup: view,
    networkId: 'iproyal-test-a',
    profileId: 'chromium_37100000-0000-4000-8000-000000000051',
    previousProfileId: null,
    expiresAt: '2099-01-01T00:00:00Z',
    ipExpiresAt: '2099-01-01T00:00:00Z',
  });
  const service = new MarketplaceCloudSetup({
    refreshInventory: inventory
      ? async () => {
          events.push('sync-inventory');
          if (inventory.fails) throw new Error('provider unavailable');
        }
      : undefined,
    store: {
      availability: async () => {
        if (inventory) events.push('authorize');
        return inventory?.authorized !== false;
      },
      begin: async () => {
        if (inventory) events.push('reserve');
        return { status: 'no_capacity' };
      },
      read: async () => view,
      readAuthorized: async () => privateView(),
      rows: async () => recoveryRows,
      cancel: async () => {
        if (view.state !== 'completed') view = { ...view, state: 'cleanup_pending' };
        return view;
      },
      step: async (_scope, _id, action) => {
        events.push(action);
        if (action === 'verify') view = { ...view, state: 'verified' };
        if (action === 'finalize') view = { ...view, state: 'finalizing' };
        if (action === 'complete') {
          view = { ...view, state: 'completed', sessionId: null };
          if (lostCompleteReply) throw new Error('lost ACK');
        }
        if (action === 'cleanup') view = { ...view, state: 'cancelled', sessionId: null };
        if (action === 'recover' && view.state !== 'completed')
          view = { ...view, state: 'cleanup_pending' };
        if (action === 'release') view = { ...view, state: 'cleanup_pending' };
        return privateView();
      },
    },
    profiles: {
      prepareCloudSetup: async () => {
        events.push('prepare');
      },
      cleanupCloudSetup: async () => {
        events.push('archive');
        if (uncertainStop) throw new Error('stop uncertain');
      },
    },
    broker: {
      open: async () => {
        events.push('open');
        return sessionId;
      },
      run: async (sessionScope, _id, operation) => {
        assert.equal(sessionScope.cloudSetup?.setupId, setupId);
        return operation({
          version: () => 'fixture',
          identify: async () => {
            events.push('verify-identity');
            return { id: '123', username: 'seller' };
          },
        });
      },
      close: async () => {
        events.push('stop-browser');
        if (uncertainStop) throw new Error('uncertain');
        view = { ...view, sessionId: null };
      },
    },
  });
  return {
    service,
    events,
    recoveryRows,
    setView: (update: Partial<CloudSetupView>) => {
      view = { ...view, ...update };
    },
    view: () => view,
  };
}

test('both new accounts and local upgrades refresh authorized inventory before atomic reservation', async () => {
  for (const request of [
    { workspaceId: scope.workspaceId, displayName: 'Testkonto', requestId: setupId },
    { workspaceId: scope.workspaceId, connectionId: scope.connectionId, requestId: setupId },
  ]) {
    const item = fixture(false, false, {});
    assert.deepEqual(await item.service.begin(request, scope.userId, scope.userAccessToken), {
      status: 'no_capacity',
    });
    assert.deepEqual(item.events, ['authorize', 'sync-inventory', 'reserve']);
  }
});

test('unauthorized requests cannot read provider inventory and provider failures cannot reserve stale IPs', async () => {
  const request = {
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    requestId: setupId,
  };
  const denied = fixture(false, false, { authorized: false });
  await assert.rejects(denied.service.begin(request, scope.userId, scope.userAccessToken));
  assert.deepEqual(denied.events, ['authorize']);
  const unavailable = fixture(false, false, { fails: true });
  await assert.rejects(unavailable.service.begin(request, scope.userId, scope.userAccessToken));
  assert.deepEqual(unavailable.events, ['authorize', 'sync-inventory']);
});

test('completion verifies identity, finalizes, stops browser and only then commits', async () => {
  const fixtureState = fixture();
  const completed = await fixtureState.service.complete(scope, setupId);
  assert.equal(completed.state, 'completed');
  assert.deepEqual(fixtureState.events, [
    'verify-identity',
    'verify',
    'finalize',
    'stop-browser',
    'complete',
  ]);
  await fixtureState.service.complete(scope, setupId);
  assert.equal(fixtureState.events.filter((event) => event === 'complete').length, 1);
  await fixtureState.service.cancel(scope, setupId);
  assert.equal(fixtureState.events.includes('archive'), false);
});
test('uncertain stop retains finalization and never releases IP', async () => {
  const fixtureState = fixture(true);
  await assert.rejects(fixtureState.service.complete(scope, setupId));
  assert.equal(fixtureState.view().state, 'finalizing');
  assert.equal(fixtureState.events.includes('complete'), false);
  assert.equal(fixtureState.events.includes('cleanup'), false);
});
test('lost completion reply reconciles committed state without cancelling', async () => {
  const fixtureState = fixture(false, true);
  assert.equal((await fixtureState.service.complete(scope, setupId)).state, 'completed');
  assert.equal((await fixtureState.service.cancel(scope, setupId)).state, 'completed');
  assert.equal(fixtureState.events.includes('cleanup'), false);
});
test('no capacity never starts a browser and cancellation stops before freeing IP', async () => {
  const fixtureState = fixture();
  assert.deepEqual(
    await fixtureState.service.begin(
      { workspaceId: scope.workspaceId, connectionId: scope.connectionId, requestId: setupId },
      scope.userId,
      scope.userAccessToken,
    ),
    { status: 'no_capacity' },
  );
  assert.deepEqual(fixtureState.events, []);
  assert.equal((await fixtureState.service.cancel(scope, setupId)).state, 'cancelled');
  assert.deepEqual(fixtureState.events, ['stop-browser', 'recover', 'archive', 'cleanup']);
});

test('expired interrupted setup cannot free an IP after uncertain physical stop', async () => {
  const fixtureState = fixture(true);
  fixtureState.recoveryRows.push({
    public_id: setupId,
    workspace_id: scope.workspaceId,
    connection_id: scope.connectionId,
    requested_by: scope.userId,
    state: 'login',
    expires_at: '2020-01-01T00:00:00Z',
    marketplace_connections: { execution_mode: 'local' },
  });
  await assert.rejects(fixtureState.service.recover());
  assert.equal(fixtureState.view().state, 'cleanup_pending');
  assert.equal(fixtureState.events.includes('cleanup'), false);
});
test('recovery keeps a completed cloud IP and releases only a confirmed local account', async () => {
  const fixtureState = fixture();
  fixtureState.setView({ state: 'completed', sessionId: null });
  const row = {
    public_id: setupId,
    workspace_id: scope.workspaceId,
    connection_id: scope.connectionId,
    requested_by: scope.userId,
    state: 'completed',
    expires_at: '2020-01-01T00:00:00Z',
    marketplace_connections: { execution_mode: 'cloud' },
  };
  fixtureState.recoveryRows.push(row);
  await fixtureState.service.recover(true);
  assert.deepEqual(fixtureState.events, []);
  row.marketplace_connections.execution_mode = 'local';
  await fixtureState.service.recover();
  assert.deepEqual(fixtureState.events, ['recover', 'release', 'recover', 'archive', 'cleanup']);
});

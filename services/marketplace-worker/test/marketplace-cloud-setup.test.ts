import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { MarketplaceCloudSetup } from '../src/marketplace-cloud-setup.ts';
import type { CloudSetupView } from '../src/marketplace-cloud-setup-contracts.d.ts';
import type { PrivateCloudSetup } from '../src/supabase-marketplace-cloud-setup-store.ts';
import type { AccountActionClaim } from '../src/supabase-marketplace-account-action-store.ts';

test('a slow post-purchase registration stays pending and reserves one IP for the same authorized request', async () => {
  const events: string[] = [];
  const request = {
    workspaceId: '37100000-0000-4000-8000-000000000011',
    displayName: 'Cloud',
    requestId: '37100000-0000-4000-8000-000000000031',
  };
  let purchased = false;
  let finishRegistration: () => void = () => undefined;
  const registration = new Promise<void>((resolve) => {
    finishRegistration = resolve;
  });
  const item = fixture();
  const service = new MarketplaceCloudSetup({
    refreshInventory: async () => {
      events.push('refresh');
      if (purchased) await registration;
    },
    reconcilePurchases: async (received, userId) => {
      assert.deepEqual(received, request);
      assert.equal(userId, scope.userId);
      events.push('reconcile');
    },
    purchaseCompleted: async () => {
      events.push('purchase-complete');
    },
    purchaseIp: async (received, userId, token) => {
      assert.deepEqual(received, request);
      assert.equal(userId, scope.userId);
      assert.equal(token, scope.userAccessToken);
      events.push('purchase');
      purchased = true;
      return 'available';
    },
    store: {
      availability: async () => {
        events.push('authorize');
        return true;
      },
      begin: async () => {
        events.push('reserve');
        return purchased ? { status: 'ready', setup: item.view() } : { status: 'no_capacity' };
      },
      read: async () => item.view(),
      presence: async () => item.view(),
      readAuthorized: async () => {
        throw new Error('unused');
      },
      cancel: async () => item.view(),
      step: async () => {
        throw new Error('unused');
      },
      rows: async () => [],
    },
    profiles: {
      prepareCloudSetup: async () => {
        throw new Error('unused');
      },
      cleanupCloudSetup: async () => {
        throw new Error('unused');
      },
    },
    broker: {
      open: async () => {
        throw new Error('no browser during purchase');
      },
      run: async () => {
        throw new Error('unused');
      },
      close: async () => {
        throw new Error('unused');
      },
    },
  });
  assert.deepEqual(await service.begin(request, scope.userId, scope.userAccessToken), {
    status: 'purchase_pending',
  });
  const next = service.begin(request, scope.userId, scope.userAccessToken);
  finishRegistration();
  assert.equal((await next).status, 'ready');
  assert.deepEqual(events, [
    'authorize',
    'refresh',
    'reconcile',
    'reserve',
    'purchase',
    'refresh',
    'authorize',
    'reserve',
    'purchase-complete',
  ]);
});

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
  inventory?: { authorized?: boolean; fails?: boolean; wait?: Promise<void> },
  lostStartReply = false,
) {
  let view: CloudSetupView = {
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    setupId,
    sessionId,
    state: 'login',
    startState: 'running',
    waitReason: null,
    version: 1,
    startActionId: null,
  };
  const events: string[] = [];
  let savedStartState: 'queued' | 'succeeded' | 'failed' | 'outcome_unknown' = 'queued';
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
    actions: {
      enqueue: async (_scope, requestId, kind, payload) => {
        assert.equal(requestId, payload.dialogId);
        assert.equal(kind, 'cloud_setup_open');
        events.push('enqueue');
        view = {
          ...view,
          startState: 'queued',
          sessionId: null,
          version: view.version + 1,
          startActionId: requestId,
        };
        return { action: { id: requestId } };
      },
      finish: async (_scope, state) => {
        events.push('finish:' + state);
        savedStartState = state;
        if (state === 'succeeded' && lostStartReply) throw new Error('Commit-ACK verloren');
      },
      read: async () => {
        events.push('read-start-receipt');
        return {
          action: {
            id: dialogId,
            workspaceId: scope.workspaceId,
            connectionId: scope.connectionId,
            state: savedStartState,
            result: { id: sessionId },
          },
        };
      },
    },
    refreshInventory: inventory
      ? async () => {
          events.push('sync-inventory');
          await inventory.wait;
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
      presence: async (_scope, _setupId, _dialogId, connected) => {
        events.push(connected ? 'presence-on' : 'presence-off');
        return view;
      },
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
      handoffCloudSetup: async (_scope, id, transferredSetupId, token) => {
        assert.equal(transferredSetupId, setupId);
        assert.equal(token, scope.userAccessToken);
        events.push('handoff');
        view = { ...view, sessionId: id, startState: 'running', version: view.version + 1 };
      },
      discardUnstartedAction: async () => {
        events.push('discard-unstarted');
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

const dialogId = '37100000-0000-4000-8000-000000000071';
function setupClaim(): AccountActionClaim {
  return {
    kind: 'account_action',
    actionId: dialogId,
    actionKind: 'cloud_setup_open',
    payload: { setupId, dialogId },
    target: { accountId: '123', entryId: null, externalId: null, entryKind: null, body: null },
    scope: {
      ...scope,
      userAccessToken: '',
      accountAction: {
        setupId,
        actionId: dialogId,
        claimToken: '37100000-0000-4000-8000-000000000072',
        workerId: '37100000-0000-4000-8000-000000000073',
        workerEpoch: 1,
        runnerId: '37100000-0000-4000-8000-000000000074',
        sessionId,
        expiresAt: '2099-01-01T00:00:00Z',
        absoluteExpiresAt: '2099-01-01T00:00:00Z',
      },
    },
  };
}

async function connectedDialog(item: ReturnType<typeof fixture>) {
  const server = createServer((_request, response) => {
    void item.service
      .connectPresence(scope, setupId, dialogId, response)
      .catch(() => response.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const abort = new AbortController();
  const response = await fetch('http://127.0.0.1:' + address.port, { signal: abort.signal });
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: setup_changed/);
  return async () => {
    abort.abort();
    await reader.cancel().catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    for (let attempts = 0; attempts < 100 && !item.events.includes('presence-off'); attempts++)
      await delay(5);
    assert.ok(item.events.includes('presence-off'));
    await delay(0);
  };
}

test('setup is never enqueued without a connected dialog', async () => {
  const item = fixture();
  await assert.rejects(item.service.requestOpen(scope, setupId, dialogId), /erneut/);
  assert.deepEqual(item.events, []);
});

test('closing a waiting dialog prevents browser launch even after its queued start was claimed', async () => {
  const item = fixture();
  item.setView({ sessionId: null, startState: 'idle' });
  const disconnect = await connectedDialog(item);
  try {
    assert.equal((await item.service.requestOpen(scope, setupId, dialogId)).startState, 'queued');
    assert.ok(!item.events.includes('open'));
  } finally {
    await disconnect();
  }
  await item.service.runQueuedSetup(setupClaim());
  assert.ok(!item.events.includes('open'));
  assert.deepEqual(item.events.slice(-2), ['discard-unstarted', 'finish:failed']);
});

test('queued setup hands its existing browser to the live dialog and stops it on disconnect', async () => {
  const item = fixture();
  item.setView({ sessionId: null, startState: 'idle' });
  const disconnect = await connectedDialog(item);
  try {
    await item.service.requestOpen(scope, setupId, dialogId);
    await item.service.runQueuedSetup(setupClaim());
    assert.equal(item.view().sessionId, sessionId);
    assert.deepEqual(
      item.events.filter((event) => ['open', 'finish:succeeded', 'handoff'].includes(event)),
      ['open', 'handoff', 'finish:succeeded'],
    );
  } finally {
    await disconnect();
  }
  assert.ok(item.events.includes('stop-browser'));
});

test('lost setup-start acknowledgement reads the committed receipt without reopening or stopping the browser', async () => {
  const item = fixture(false, false, undefined, true);
  item.setView({ sessionId: null, startState: 'idle' });
  const disconnect = await connectedDialog(item);
  try {
    await item.service.requestOpen(scope, setupId, dialogId);
    await item.service.runQueuedSetup(setupClaim());
    assert.equal(item.events.filter((event) => event === 'open').length, 1);
    assert.ok(item.events.includes('read-start-receipt'));
    assert.ok(!item.events.includes('stop-browser'));
    assert.ok(!item.events.includes('finish:failed'));
  } finally {
    await disconnect();
  }
});

test('keeps a slow IP preparation running and returns its result on the next poll without restarting it', async () => {
  let finishInventory: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    finishInventory = resolve;
  });
  const item = fixture(false, false, { wait });
  const request = { workspaceId: scope.workspaceId, displayName: 'Cloud', requestId: setupId };
  const initial = await Promise.race([
    item.service.begin(request, scope.userId, scope.userAccessToken),
    new Promise((resolve) => setTimeout(() => resolve('response_timeout'), 1500)),
  ]);
  assert.deepEqual(initial, {
    status: 'purchase_pending',
  });
  const next = item.service.begin(request, scope.userId, scope.userAccessToken);
  finishInventory();
  assert.deepEqual(await next, { status: 'no_capacity' });
  assert.equal(item.events.filter((event) => event === 'sync-inventory').length, 1);
});

test('parallel polls share the same preparation and revoked access cannot retrieve its result', async () => {
  let finishInventory: () => void = () => undefined;
  const inventory = {
    authorized: true,
    wait: new Promise<void>((resolve) => {
      finishInventory = resolve;
    }),
  };
  const item = fixture(false, false, inventory);
  const request = { workspaceId: scope.workspaceId, displayName: 'Cloud', requestId: setupId };
  const first = item.service.begin(request, scope.userId, scope.userAccessToken);
  const second = item.service.begin(request, scope.userId, scope.userAccessToken);
  assert.deepEqual(await first, { status: 'purchase_pending' });
  assert.deepEqual(await second, { status: 'purchase_pending' });
  inventory.authorized = false;
  await assert.rejects(item.service.begin(request, scope.userId, scope.userAccessToken));
  finishInventory();
  inventory.authorized = true;
  assert.deepEqual(await item.service.begin(request, scope.userId, scope.userAccessToken), {
    status: 'no_capacity',
  });
  assert.equal(item.events.filter((event) => event === 'sync-inventory').length, 1);
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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CloudSetupBlockedError,
  SupabaseMarketplaceCloudSetupStore,
} from '../src/supabase-marketplace-cloud-setup-store.ts';

const scope = {
  workspaceId: '37100000-0000-4000-8000-000000000011',
  connectionId: '37100000-0000-4000-8000-000000000021',
  userId: '37100000-0000-4000-8000-000000000001',
  userAccessToken: 'user-token',
};
const setupId = '37100000-0000-4000-8000-000000000031';
const view = {
  workspaceId: scope.workspaceId,
  connectionId: scope.connectionId,
  setupId,
  state: 'reserved',
  sessionId: null,
  startState: 'idle',
  waitReason: null,
  version: 0,
  startActionId: null,
};
const internal = {
  setup: view,
  networkId: 'iproyal-test-a',
  profileId: null,
  previousProfileId: null,
  expiresAt: '2099-01-01T00:00:00Z',
  ipExpiresAt: '2099-02-01T00:00:00Z',
};
const options = {
  url: 'https://example.test',
  publishableKey: 'public',
  serviceRoleKey: 'server',
  runtime: { workerId: '37100000-0000-4000-8000-000000000041', workerEpoch: 1 },
};

test('cloud availability uses the separate server permission for operators', async () => {
  const store = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async (url, request) => {
      assert.equal(new URL(String(url)).pathname, '/rest/v1/rpc/marketplace_can_manage_cloud');
      assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer user-token');
      assert.deepEqual(JSON.parse(String(request?.body)), { p_workspace_id: scope.workspaceId });
      return Response.json(false);
    },
  });
  assert.equal(await store.availability(scope.workspaceId, scope.userAccessToken), false);
});

test('private setup is read only after user authorization and bound to current worker', async () => {
  const calls: string[] = [];
  const store = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async (url, request) => {
      const name = new URL(String(url)).pathname.split('/').at(-1) ?? '';
      calls.push(name);
      if (name === 'marketplace_cloud_setup_read') {
        assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer user-token');
        return Response.json(view);
      }
      assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer server');
      const body = JSON.parse(String(request?.body));
      assert.equal(body.p_worker_epoch, 1);
      assert.equal(body.p_user_id, scope.userId);
      assert.equal(body.p_action, 'claim');
      return Response.json(internal);
    },
  });
  assert.equal((await store.readAuthorized(scope, setupId)).networkId, 'iproyal-test-a');
  assert.deepEqual(calls, ['marketplace_cloud_setup_read', 'marketplace_cloud_setup_update']);
});

test('queued setup resolves its network using its bound action without a persisted user token', async () => {
  const events: string[] = [];
  const actionScope = {
    ...scope,
    userAccessToken: '',
    accountAction: {
      setupId,
      actionId: '37100000-0000-4000-8000-000000000071',
      claimToken: '37100000-0000-4000-8000-000000000072',
      workerId: options.runtime.workerId,
      workerEpoch: 1,
      runnerId: '37100000-0000-4000-8000-000000000073',
      sessionId: '37100000-0000-4000-8000-000000000074',
      expiresAt: '2099-01-01T00:00:00Z',
      absoluteExpiresAt: '2099-01-01T00:00:00Z',
    },
  };
  const store = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async (url, request) => {
      assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer server');
      const name = new URL(String(url)).pathname.split('/').at(-1)!;
      events.push(name);
      if (name === 'marketplace_account_action_check')
        return Response.json({
          active: true,
          sessionId: actionScope.accountAction.sessionId,
          expiresAt: actionScope.accountAction.expiresAt,
          absoluteExpiresAt: actionScope.accountAction.absoluteExpiresAt,
          target: {
            accountId: '123',
            externalId: null,
            entryId: null,
            entryKind: null,
            body: null,
          },
        });
      assert.equal(name, 'marketplace_cloud_setup_update');
      assert.equal(JSON.parse(String(request?.body)).p_user_id, scope.userId);
      return Response.json({
        ...internal,
        setup: { ...view, state: 'login' },
        profileId: 'chromium_37100000-0000-4000-8000-000000000051',
      });
    },
  });
  assert.deepEqual(await store.assertNetwork(actionScope), {
    profileId: 'chromium_37100000-0000-4000-8000-000000000051',
    networkId: internal.networkId,
  });
  assert.deepEqual(events, ['marketplace_account_action_check', 'marketplace_cloud_setup_update']);
});

for (const response of [
  { ...view, connectionId: '37100000-0000-4000-8000-000000000022' },
  { ...view, networkId: 'private' },
]) {
  test('foreign or private public response prevents the service-role request', async () => {
    let calls = 0;
    const store = new SupabaseMarketplaceCloudSetupStore({
      ...options,
      fetch: async () => {
        calls++;
        return Response.json(response);
      },
    });
    await assert.rejects(store.readAuthorized(scope, setupId));
    assert.equal(calls, 1);
  });
}

test('direct or unknown network references cannot authorize a cloud setup', async () => {
  const store = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async (url) =>
      Response.json(String(url).endsWith('_read') ? view : { ...internal, networkId: 'direct' }),
  });
  await assert.rejects(store.readAuthorized(scope, setupId));
});

test('database lock refusal becomes a blocked switch without exposing the database text', async () => {
  const request = {
    workspaceId: scope.workspaceId,
    connectionId: scope.connectionId,
    requestId: setupId,
  };
  const blocked = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async () =>
      Response.json({ code: '55P03', message: 'private database text' }, { status: 500 }),
  });
  await assert.rejects(blocked.begin(request, 'user-token'), (failure: unknown) => {
    assert.ok(failure instanceof CloudSetupBlockedError);
    assert.ok(!failure.message.includes('private'));
    return true;
  });
  const denied = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async () => Response.json({ code: '42501', message: 'denied' }, { status: 403 }),
  });
  await assert.rejects(
    denied.begin(request, 'user-token'),
    (failure: unknown) => !(failure instanceof CloudSetupBlockedError),
  );
});

test('expired cloud IP refuses browser access with a safe actionable error', async () => {
  const store = new SupabaseMarketplaceCloudSetupStore({
    ...options,
    fetch: async () =>
      Response.json([
        {
          state: 'completed',
          provider_profile_id: 'chromium_37100000-0000-4000-8000-000000000051',
          marketplace_cloud_ips: {
            network_id: 'iproyal-private-network',
            enabled: true,
            country_code: 'DE',
            is_dedicated_isp: true,
            verified_at: '2026-10-01T00:00:00Z',
            expires_at: '2026-01-01T00:00:00Z',
          },
        },
      ]),
  });
  await assert.rejects(store.assertNetwork(scope), {
    message: 'Die Cloud-Verbindung dieses Kontos ist nicht verfügbar.',
  });
});

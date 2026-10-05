import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { MarketplaceBrowserHttpApi } from '../src/marketplace-browser-http-api.ts';
import type { MarketplaceCloudSetup } from '../src/marketplace-cloud-setup.ts';

const workspaceId = '37100000-0000-4000-8000-000000000011';
const connectionId = '37100000-0000-4000-8000-000000000021';
const userId = '37100000-0000-4000-8000-000000000001';
const setupId = '37100000-0000-4000-8000-000000000031';
const sessionId = '37100000-0000-4000-8000-000000000032';
type SetupService = Pick<
  MarketplaceCloudSetup,
  'availability' | 'begin' | 'read' | 'open' | 'authorize' | 'verify' | 'complete' | 'cancel'
>;
function setupService(overrides: Partial<SetupService>): SetupService {
  const unexpected = async (): Promise<never> => {
    throw new Error('Unexpected setup operation');
  };
  return {
    availability: unexpected,
    begin: unexpected,
    read: unexpected,
    open: unexpected,
    authorize: unexpected,
    verify: unexpected,
    complete: unexpected,
    cancel: unexpected,
    ...overrides,
  };
}

for (const technicalFailure of [false, true]) {
  test(`capacity result is neutral and technical check failure is explicit: ${technicalFailure}`, async () => {
    let starts = 0;
    const server = new MarketplaceBrowserHttpApi({
      users: { userId: async () => userId },
      broker: {
        open: async () => {
          starts++;
          return sessionId;
        },
        close: async () => undefined,
        run: async () => {
          throw new Error('must not run');
        },
      },
      cloudSetups: setupService({
        begin: async () => {
          if (technicalFailure) throw new Error('private DB error');
          return { status: 'no_capacity' };
        },
      }),
    }).createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/marketplace-browser/cloud-setups/begin`,
        {
          method: 'POST',
          headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
          body: JSON.stringify({ workspaceId, displayName: 'Pilot', requestId: setupId }),
        },
      );
      assert.equal(response.status, technicalFailure ? 503 : 200);
      const result = await response.json();
      if (technicalFailure) {
        assert.equal(result.code, 'cloud_ip_check_failed');
        assert.ok(!JSON.stringify(result).includes('private DB'));
      } else assert.deepEqual(result, { status: 'no_capacity' });
      assert.equal(starts, 0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((failure) => (failure ? reject(failure) : resolve())),
      );
    }
  });
}

test('setup identity stages verification without invoking normal account writer', async () => {
  let normalConfirmations = 0;
  let staged = 0;
  let inputs = 0;
  const setupView = { workspaceId, connectionId, setupId, state: 'login' as const, sessionId };
  const server = new MarketplaceBrowserHttpApi({
    users: { userId: async () => userId },
    broker: {
      open: async () => sessionId,
      close: async () => undefined,
      run: async (scope, id, operation) => {
        assert.equal(scope.cloudSetup?.setupId, setupId);
        assert.equal(id, sessionId);
        return operation({
          version: () => 'fixture',
          identify: async () => ({ id: '123', username: 'seller' }),
          click: async () => {
            inputs++;
          },
        });
      },
    },
    accounts: {
      confirm: async () => {
        normalConfirmations++;
      },
    },
    cloudSetups: setupService({
      authorize: async (scope) => ({ ...scope, cloudSetup: { setupId } }),
      read: async () => setupView,
      verify: async () => {
        staged++;
      },
    }),
  }).createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/marketplace-browser/cloud-setups/${setupId}/identify`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, connectionId }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).externalAccountId, '123');
    assert.equal(staged, 1);
    assert.equal(normalConfirmations, 0);
    const input = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/marketplace-browser/cloud-setups/${setupId}/input`,
      {
        method: 'POST',
        headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          connectionId,
          input: { kind: 'click', x: 0.5, y: 0.5 },
        }),
      },
    );
    assert.equal(input.status, 403);
    assert.equal(inputs, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((failure) => (failure ? reject(failure) : resolve())),
    );
  }
});

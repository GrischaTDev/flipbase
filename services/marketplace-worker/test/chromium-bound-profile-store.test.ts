import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChromiumBoundProfileStore } from '../src/chromium-bound-profile-store.ts';
import {
  MarketplaceBrowserSessionBroker,
  type BrowserLease,
} from '../src/marketplace-browser-session-broker.ts';

const profileId = 'chromium_11111111-1111-4111-8111-111111111111';
const lease: BrowserLease = {
  id: 'session',
  active: true,
  expiresAt: Date.now() + 60_000,
  scope: {
    workspaceId: 'workspace-a',
    connectionId: 'connection-a',
    userId: 'user',
    userAccessToken: 'fixture',
  },
};

test('a reserved write cannot start a profile assigned to another connection', async () => {
  const writeLease: BrowserLease = {
    ...lease,
    scope: {
      ...lease.scope,
      userAccessToken: '',
      messageWrite: {
        messageId: 'message',
        claimToken: 'claim',
        workerId: 'worker',
        workerEpoch: 4,
        runnerId: 'runner',
        sessionId: 'session',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
    },
  };
  let starts = 0;
  const broker = new MarketplaceBrowserSessionBroker({
    leases: {
      acquire: async () => writeLease,
      assertActive: async () => true,
      release: async () => undefined,
    },
    profiles: new ChromiumBoundProfileStore({
      profiles: { resolve: async () => profileId },
      registry: {
        resolve: async () => ({
          profileId,
          workspaceId: 'workspace-b',
          connectionId: 'connection-b',
          networkId: 'iproyal-test-a',
        }),
      },
      assertNetwork: async () => ({ profileId, networkId: 'iproyal-test-a' }),
    }),
    recovery: { recover: async () => undefined },
    browsers: {
      open: async () => {
        starts++;
        throw new Error('Must not start');
      },
      stop: async () => undefined,
    },
  });
  await assert.rejects(broker.open(writeLease.scope), /Browserstart fehlgeschlagen/);
  assert.equal(starts, 0);
});

test('reserved network mismatch fails before a browser can open', async () => {
  const profiles = new ChromiumBoundProfileStore({
    profiles: { resolve: async () => profileId },
    registry: {
      resolve: async () => ({
        profileId,
        workspaceId: lease.scope.workspaceId,
        connectionId: lease.scope.connectionId,
        networkId: 'direct',
      }),
    },
    assertNetwork: async () => ({ profileId, networkId: 'iproyal-test-a' }),
  });
  await assert.rejects(profiles.resolve(lease));
});

test('a legacy Chromium profile without a reserved IP cannot start a scheduled browser', async () => {
  let starts = 0;
  let releases = 0;
  const broker = new MarketplaceBrowserSessionBroker({
    leases: {
      acquire: async () => lease,
      assertActive: async () => true,
      release: async () => {
        releases++;
      },
    },
    profiles: new ChromiumBoundProfileStore({
      profiles: { resolve: async () => profileId },
      registry: {
        resolve: async () => {
          throw new Error('must not reach the private profile');
        },
      },
      assertNetwork: async () => null,
    }),
    browsers: {
      open: async () => {
        starts++;
        throw new Error('must not start');
      },
      stop: async () => undefined,
    },
    recovery: { recover: async () => undefined },
  });
  await assert.rejects(broker.open(lease.scope), /Browserstart fehlgeschlagen/);
  assert.equal(starts, 0);
  assert.equal(releases, 1);
});

test('scheduled sessions cannot open a Chromium profile bound to another account', async () => {
  let starts = 0;
  let releases = 0;
  const broker = new MarketplaceBrowserSessionBroker({
    leases: {
      acquire: async () => lease,
      assertActive: async () => true,
      release: async () => {
        releases++;
      },
    },
    profiles: new ChromiumBoundProfileStore({
      profiles: { resolve: async () => profileId },
      registry: {
        resolve: async () => ({
          profileId,
          workspaceId: 'workspace-b',
          connectionId: 'connection-b',
        }),
      },
    }),
    browsers: {
      open: async () => {
        starts++;
        throw new Error('must not start');
      },
      stop: async () => undefined,
    },
    recovery: { recover: async () => undefined },
  });
  await assert.rejects(broker.open(lease.scope), /Browserstart fehlgeschlagen/);
  assert.equal(starts, 0);
  assert.equal(releases, 1);
});

test('bound Chromium ids and unchanged legacy ids retain their session reference', async () => {
  const profiles = new ChromiumBoundProfileStore({
    profiles: { resolve: async () => profileId },
    registry: {
      resolve: async () => ({
        profileId,
        workspaceId: 'workspace-a',
        connectionId: 'connection-a',
      }),
    },
  });
  assert.equal(await profiles.resolve(lease), profileId);
  const legacy = new ChromiumBoundProfileStore({
    profiles: { resolve: async () => 'legacy-profile' },
    registry: {
      resolve: async () => {
        throw new Error('legacy must not use Chromium registry');
      },
    },
  });
  assert.equal(await legacy.resolve(lease), 'legacy-profile');
});

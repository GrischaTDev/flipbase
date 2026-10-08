import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MarketplaceBrowserSessionEndedError,
  MarketplaceBrowserSessionBroker,
  type BrowserLease,
  type BrowserSessionScope,
} from '../src/marketplace-browser-session-broker.ts';
import { CloudBrowserStopUncertainError } from '../src/gologin-cloud-browser.ts';

type BrokerOptions = ConstructorParameters<typeof MarketplaceBrowserSessionBroker>[0];

function createTestBroker(
  options: Omit<BrokerOptions, 'recovery'> & { recovery?: BrokerOptions['recovery'] },
): MarketplaceBrowserSessionBroker {
  return new MarketplaceBrowserSessionBroker({
    ...options,
    recovery: options.recovery ?? { recover: async () => undefined },
  });
}

const scopeA: BrowserSessionScope = {
  workspaceId: 'workspace-a',
  connectionId: 'account-a',
  userId: 'user-a',
  userAccessToken: 'test-token-a',
};
const scopeB = { ...scopeA, connectionId: 'account-b' };

test('message claims cannot be borrowed by another claim or an interactive login', async () => {
  const { broker } = setup();
  const writeScope = {
    ...scopeA,
    userAccessToken: '',
    messageWrite: {
      messageId: 'message-a',
      claimToken: 'claim-a',
      workerId: 'worker-a',
      workerEpoch: 1,
      runnerId: 'runner-a',
      sessionId: 'lease-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
  const id = await broker.open(writeScope);
  await assert.rejects(
    broker.run(scopeA, id, async () => undefined),
    /Sitzungszugriff/,
  );
  await assert.rejects(
    broker.run(
      { ...writeScope, messageWrite: { ...writeScope.messageWrite, claimToken: 'other-claim' } },
      id,
      async () => undefined,
    ),
    /Sitzungszugriff/,
  );
  await assert.rejects(
    broker.run(
      { ...writeScope, messageWrite: { ...writeScope.messageWrite, workerEpoch: 2 } },
      id,
      async () => undefined,
    ),
    /Sitzungszugriff/,
  );
  await broker.close(writeScope, id);
});

test('a write claim cannot coexist with a read or setup authorization', async () => {
  const { broker } = setup();
  const mixedScope = {
    ...scopeA,
    cloudSetup: { setupId: 'setup-a' },
    messageWrite: {
      messageId: 'message-a',
      claimToken: 'claim-a',
      workerId: 'worker-a',
      workerEpoch: 1,
      runnerId: 'runner-a',
      sessionId: 'lease-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
  await assert.rejects(broker.open(mixedScope), /Sitzungszugriff/);
});

test('setup session cannot be reused through normal or another setup scope', async () => {
  const { broker } = setup();
  const setupScope = { ...scopeA, cloudSetup: { setupId: 'setup-a' } };
  const id = await broker.open(setupScope);
  await assert.rejects(
    broker.run(scopeA, id, async () => undefined),
    /Sitzungszugriff/,
  );
  await assert.rejects(
    broker.run({ ...scopeA, cloudSetup: { setupId: 'setup-b' } }, id, async () => undefined),
    /Sitzungszugriff/,
  );
  await broker.close(setupScope, id);
});

function setup() {
  const leases = new Map<string, BrowserLease>();
  const stopped: string[] = [];
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => {
        if (
          [...leases.values()].some(
            (lease) => lease.scope.connectionId === scope.connectionId && lease.active,
          )
        ) {
          throw new Error('Konto wird bereits bedient');
        }
        const lease = {
          id: `lease-${leases.size + 1}`,
          scope: { ...scope },
          expiresAt: Date.now() + 60_000,
          active: true,
        };
        leases.set(lease.id, lease);
        return lease;
      },
      assertActive: async (lease) => Boolean(leases.get(lease.id)?.active),
      release: async (lease) => {
        lease.active = false;
      },
    },
    profiles: { resolve: async (lease) => `provider-${lease.scope.connectionId}` },
    browsers: {
      open: async (profileId) => ({
        close: async () => {
          stopped.push(profileId);
        },
        run: async (operation) => operation({ version: () => profileId }),
      }),
      stop: async (profileId) => {
        stopped.push(profileId);
      },
    },
  });
  return { broker, leases, stopped };
}

test('binds access to workspace, account, and operator', async () => {
  const { broker, leases, stopped } = setup();
  const id = await broker.open(scopeA);
  await assert.rejects(
    broker.run(scopeB, id, async (browser) => browser.version()),
    /Sitzungszugriff verweigert/,
  );
  await assert.rejects(
    broker.run({ ...scopeA, workspaceId: 'workspace-b' }, id, async (browser) => browser.version()),
    /Sitzungszugriff verweigert/,
  );
  await assert.rejects(
    broker.run({ ...scopeA, userId: 'user-b' }, id, async (browser) => browser.version()),
    /Sitzungszugriff verweigert/,
  );
  assert.equal(
    await broker.run({ ...scopeA, userAccessToken: 'renewed-token' }, id, async (browser) =>
      browser.version(),
    ),
    'provider-account-a',
  );
  assert.equal(leases.get(id)?.scope.userAccessToken, 'renewed-token');
  assert.equal(
    await broker.run(scopeA, id, async (browser) => browser.version()),
    'provider-account-a',
  );
  assert.deepEqual(stopped, []);
});

test('interactive access cannot operate a background read session of the same account', async () => {
  const { broker } = setup();
  const readScope = {
    ...scopeA,
    userAccessToken: '',
    syncRead: {
      operationId: 'operation-a',
      runnerId: 'runner-a',
      workerEpoch: 1,
      sessionId: 'lease-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
  };
  const id = await broker.open(readScope);
  await assert.rejects(
    broker.run(scopeA, id, async (browser) => browser.version()),
    /Sitzungszugriff verweigert/,
  );
  await assert.rejects(
    broker.run(
      { ...readScope, syncRead: { ...readScope.syncRead, workerEpoch: 2 } },
      id,
      async (browser) => browser.version(),
    ),
    /Sitzungszugriff verweigert/,
  );
  await broker.close(readScope, id);
});

test('a worker that lost its runtime cannot stop a profile reused by its successor', async () => {
  let permitted = true;
  let stopped = 0;
  const broker = createTestBroker({
    authorizeRuntime: async () => permitted,
    leases: {
      acquire: async (scope) => ({
        id: 'lease-a',
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => true,
      release: async () => undefined,
    },
    profiles: { resolve: async () => 'profile-a' },
    browsers: {
      open: async () => ({
        close: async () => {
          stopped++;
        },
        run: async (op) => op({ version: () => '' }),
      }),
      stop: async () => {
        stopped++;
      },
    },
  });
  await broker.open(scopeA);
  permitted = false;
  await assert.rejects(broker.shutdown(), /Browser-Stopp fehlgeschlagen/);
  assert.equal(stopped, 0);
});

test('recovers before serving and stops every active profile on shutdown', async () => {
  const { broker, leases, stopped } = setup();
  await broker.ready();
  const first = await broker.open(scopeA);
  const second = await broker.open(scopeB);
  await broker.shutdown();
  assert.deepEqual(stopped, ['provider-account-a', 'provider-account-b']);
  assert.equal(leases.get(first)?.active, false);
  assert.equal(leases.get(second)?.active, false);
  await assert.rejects(broker.run(scopeA, first, async (browser) => browser.version()));
});

test('does not start a new browser before restart cleanup succeeds', async () => {
  let recoveries = 0;
  let acquisitions = 0;
  const broker = createTestBroker({
    recovery: {
      recover: async () => {
        recoveries += 1;
        if (recoveries === 1) throw new Error('private provider error');
      },
    },
    leases: {
      acquire: async (scope) => {
        acquisitions += 1;
        return { id: 'lease-a', scope, expiresAt: Date.now() + 60_000, active: true };
      },
      assertActive: async () => true,
      release: async () => undefined,
    },
    profiles: { resolve: async () => 'profile-a' },
    browsers: {
      open: async () => ({
        close: async () => undefined,
        run: async (operation) => operation({ version: () => 'test' }),
      }),
      stop: async () => undefined,
    },
  });
  await assert.rejects(broker.open(scopeA), /Browser-Bereinigung fehlgeschlagen/);
  assert.equal(acquisitions, 0);
  await broker.open(scopeA);
  assert.equal(recoveries, 2);
  assert.equal(acquisitions, 1);
});

test('expires access and explicitly stops its provider profile', async () => {
  const { broker, leases, stopped } = setup();
  const id = await broker.open(scopeA);
  leases.get(id)!.expiresAt = Date.now() - 1;
  await assert.rejects(
    broker.run(scopeA, id, async (browser) => browser.version()),
    MarketplaceBrowserSessionEndedError,
  );
  assert.deepEqual(stopped, ['provider-account-a']);
  assert.equal(leases.get(id)!.active, false);
});

test('rechecks the lease before every operation and stops after revocation', async () => {
  const { broker, leases, stopped } = setup();
  const id = await broker.open(scopeA);
  leases.get(id)!.active = false;
  await assert.rejects(
    broker.run(scopeA, id, async (browser) => browser.version()),
    /Sitzung abgelaufen/,
  );
  assert.deepEqual(stopped, ['provider-account-a']);
});

test('stops and releases on browser interruption', async () => {
  const { broker, leases, stopped } = setup();
  const id = await broker.open(scopeA);
  await assert.rejects(
    broker.run(scopeA, id, async () => {
      throw new Error('private CDP URL');
    }),
    MarketplaceBrowserSessionEndedError,
  );
  assert.deepEqual(stopped, ['provider-account-a']);
  assert.equal(leases.get(id)!.active, false);
  await assert.rejects(
    broker.run(scopeA, id, async (browser) => browser.version()),
    /Sitzungszugriff verweigert/,
  );
});

test('releases a lease if the provider fails to start', async () => {
  const { broker, leases } = setup();
  const broken = createTestBroker({
    leases: {
      acquire: async (scope) => {
        const lease = { id: 'failed', scope, expiresAt: Date.now() + 60_000, active: true };
        leases.set(lease.id, lease);
        return lease;
      },
      assertActive: async () => true,
      release: async (lease) => {
        lease.active = false;
      },
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => {
        throw new Error('private token');
      },
      stop: async () => undefined,
    },
  });
  await assert.rejects(broken.open(scopeA), /Browserstart fehlgeschlagen/);
  assert.equal(leases.get('failed')!.active, false);
  void broker;
});

test('keeps the lease and retries cleanup when provider stop fails', async () => {
  let stops = 0;
  let active = true;
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({
        id: 'lease',
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => active,
      release: async () => {
        active = false;
      },
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => ({
        run: async (operation) => operation({ version: () => 'browser' }),
        close: async () => {
          stops += 1;
          if (stops === 1) throw new Error('provider private response');
        },
      }),
      stop: async () => undefined,
    },
  });
  const id = await broker.open(scopeA);
  await assert.rejects(broker.close(scopeA, id), /Browser-Stopp fehlgeschlagen/);
  assert.equal(active, true);
  await assert.rejects(
    broker.run(scopeA, id, async (browser) => browser.version()),
    /Sitzung wird beendet/,
  );
  await broker.reconcile();
  assert.equal(stops, 2);
  assert.equal(active, false);
});

test('keeps the lease when provider startup cleanup is uncertain', async () => {
  let released = false;
  let stopped = false;
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({
        id: 'uncertain',
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => true,
      release: async () => {
        released = true;
      },
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => {
        throw new CloudBrowserStopUncertainError();
      },
      stop: async () => {
        stopped = true;
      },
    },
  });
  await assert.rejects(broker.open(scopeA), /Browserstart fehlgeschlagen/);
  assert.equal(released, false);
  await broker.reconcile();
  assert.equal(stopped, true);
  assert.equal(released, true);
});

test('does not start an already expired lease at the provider', async () => {
  let opened = false;
  let released = false;
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({ id: 'expired', scope, expiresAt: Date.now() - 1, active: true }),
      assertActive: async () => true,
      release: async () => {
        released = true;
      },
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => {
        opened = true;
        throw new Error('must not start');
      },
      stop: async () => undefined,
    },
  });
  await assert.rejects(broker.open(scopeA), /Browserstart fehlgeschlagen/);
  assert.equal(opened, false);
  assert.equal(released, true);
});

test('rejects a lease returned for a different workspace before provider access', async () => {
  let opened = false;
  const broker = createTestBroker({
    leases: {
      acquire: async () => ({
        id: 'wrong-scope',
        scope: { ...scopeA, workspaceId: 'workspace-b' },
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => true,
      release: async () => undefined,
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => {
        opened = true;
        throw new Error('must not open');
      },
      stop: async () => undefined,
    },
  });
  await assert.rejects(broker.open(scopeA), /Sitzungszugriff verweigert/);
  assert.equal(opened, false);
});

test('reconcile checks the second account even if the first provider stop fails', async () => {
  let active = true;
  let firstStopFails = true;
  const released: string[] = [];
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({
        id: scope.connectionId,
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => active,
      release: async (lease) => {
        released.push(lease.id);
      },
    },
    profiles: { resolve: async (lease) => lease.scope.connectionId },
    browsers: {
      open: async (profileId) => ({
        run: async (operation) => operation({ version: () => profileId }),
        close: async () => {
          if (profileId === 'account-a' && firstStopFails) {
            firstStopFails = false;
            throw new Error('private provider response');
          }
        },
      }),
      stop: async () => undefined,
    },
  });
  await broker.open(scopeA);
  await broker.open(scopeB);
  active = false;
  await assert.rejects(broker.reconcile(), /Browser-Stopp fehlgeschlagen/);
  assert.deepEqual(released, ['account-b']);
  await broker.reconcile();
  assert.deepEqual(released, ['account-b', 'account-a']);
});

test('blocks an operation when close begins during the lease check', async () => {
  let continueCheck!: (active: boolean) => void;
  let checks = 0;
  let operations = 0;
  const checkGate = new Promise<boolean>((resolve) => {
    continueCheck = resolve;
  });
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({
        id: 'lease',
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => (++checks === 3 ? checkGate : true),
      release: async () => undefined,
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => ({
        run: async (operation) => operation({ version: () => 'browser' }),
        close: async () => {
          throw new Error('stop failed');
        },
      }),
      stop: async () => undefined,
    },
  });
  const id = await broker.open(scopeA);
  const operation = broker.run(scopeA, id, async () => {
    operations += 1;
  });
  await assert.rejects(broker.close(scopeA, id), /Browser-Stopp fehlgeschlagen/);
  continueCheck(true);
  await assert.rejects(operation, /Sitzung wird beendet/);
  assert.equal(operations, 0);
});

test('parallel reconciliation never stops a profile twice after release', async () => {
  let continueCheck!: (active: boolean) => void;
  const checkGate = new Promise<boolean>((resolve) => {
    continueCheck = resolve;
  });
  let checks = 0;
  let stops = 0;
  let releases = 0;
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({
        id: 'uncertain',
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => (++checks === 2 ? checkGate : true),
      release: async () => {
        releases += 1;
      },
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => {
        throw new CloudBrowserStopUncertainError();
      },
      stop: async () => {
        stops += 1;
      },
    },
  });
  await assert.rejects(broker.open(scopeA), /Browserstart fehlgeschlagen/);
  const first = broker.reconcile();
  await Promise.resolve();
  await broker.reconcile();
  continueCheck(true);
  await first;
  assert.equal(stops, 1);
  assert.equal(releases, 1);
});

test('expires a lease that times out while authorization is pending', async () => {
  let continueCheck!: (active: boolean) => void;
  const checkGate = new Promise<boolean>((resolve) => {
    continueCheck = resolve;
  });
  let checks = 0;
  let lease!: BrowserLease;
  let stopped = false;
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => {
        lease = { id: 'lease', scope, expiresAt: Date.now() + 60_000, active: true };
        return lease;
      },
      assertActive: async () => (++checks === 3 ? checkGate : true),
      release: async () => undefined,
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => ({
        run: async (operation) => operation({ version: () => 'browser' }),
        close: async () => {
          stopped = true;
        },
      }),
      stop: async () => undefined,
    },
  });
  const id = await broker.open(scopeA);
  const operation = broker.run(scopeA, id, async (browser) => browser.version());
  lease.expiresAt = Date.now() - 1;
  continueCheck(true);
  await assert.rejects(operation, /Sitzung abgelaufen/);
  assert.equal(stopped, true);
});

test('retries lease release without allowing actions after provider stop', async () => {
  let releaseAttempts = 0;
  let stops = 0;
  const broker = createTestBroker({
    leases: {
      acquire: async (scope) => ({
        id: 'lease',
        scope,
        expiresAt: Date.now() + 60_000,
        active: true,
      }),
      assertActive: async () => true,
      release: async () => {
        releaseAttempts += 1;
        if (releaseAttempts === 1) throw new Error('database unavailable');
      },
    },
    profiles: { resolve: async () => 'profile' },
    browsers: {
      open: async () => ({
        run: async (operation) => operation({ version: () => 'browser' }),
        close: async () => {
          stops += 1;
        },
      }),
      stop: async () => undefined,
    },
  });
  const id = await broker.open(scopeA);
  await assert.rejects(broker.close(scopeA, id), /Browser-Stopp fehlgeschlagen/);
  await assert.rejects(
    broker.run(scopeA, id, async (browser) => browser.version()),
    /Sitzung wird beendet/,
  );
  await broker.reconcile();
  assert.equal(releaseAttempts, 2);
  assert.equal(stops, 2);
});

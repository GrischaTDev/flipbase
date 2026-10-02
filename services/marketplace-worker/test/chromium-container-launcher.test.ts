import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Browser, BrowserContext } from 'playwright';
import { ChromiumContainerLauncher } from '../src/chromium-container-launcher.ts';

const containerId = 'a'.repeat(64);
function fixture(
  exitCode = 0,
  existing = false,
  settings: {
    foreignProfile?: boolean;
    extraMount?: boolean;
    invalidNetwork?: boolean;
    missingAllocationRange?: boolean;
    firewallUnavailable?: boolean;
    removalUnconfirmed?: boolean;
    initiallyExited?: boolean;
    state?: Record<string, unknown>;
    startupFailure?: boolean;
  } = {},
) {
  const calls: { args: string[]; input?: string }[] = [];
  let removed = !existing;
  let running = !settings.initiallyExited;
  let failNextInspection = false;
  const browser = {
    contexts: () => [context],
    newBrowserCDPSession: async () => ({
      send: async () => {
        running = false;
      },
    }),
  } as unknown as Browser;
  const context = {
    close: async () => undefined,
    browser: () => browser,
  } as unknown as BrowserContext;
  const launcher = new ChromiumContainerLauncher({
    image: `ghcr.io/grischatdev/flipbase-chromium-session:sha-${'b'.repeat(40)}`,
    profileRoot: '/controller/profiles',
    hostProfileRoot: '/host/profiles',
    hostId: 'pilot-01',
    network: 'flipbase-browser',
    verifyFirewall: async () => {
      if (settings.firewallUnavailable) throw new Error('Firewall nicht geprüft');
    },
    connect: async () => {
      if (settings.startupFailure) throw new Error('Chromium startup failed');
      return browser;
    },
    execute: async (args, input) => {
      calls.push({ args, input });
      if (args[0] === 'network')
        return JSON.stringify([
          {
            Name: 'flipbase-browser',
            Driver: 'bridge',
            EnableIPv6: false,
            Options: { 'com.docker.network.bridge.name': 'br-flipbase' },
            Labels: {
              'de.flipbase.chromium.network-policy': settings.invalidNetwork ? 'foreign' : 'v1',
            },
            IPAM: {
              Config: [
                {
                  Subnet: '172.30.88.0/24',
                  Gateway: '172.30.88.1',
                  ...(settings.missingAllocationRange ? {} : { IPRange: '172.30.88.128/25' }),
                },
              ],
            },
          },
        ]);
      if (args[0] === 'create') {
        removed = false;
        running = true;
        return containerId;
      }
      if (args[0] === 'ps') return removed ? '' : containerId;
      if (args[0] === 'inspect') {
        if (failNextInspection) {
          failNextInspection = false;
          throw new Error('Docker nicht erreichbar');
        }
        return JSON.stringify([
          {
            Id: containerId,
            Config: {
              Labels: {
                'de.flipbase.chromium.role': 'session',
                'de.flipbase.chromium.host': 'pilot-01',
                'de.flipbase.chromium.profile': settings.foreignProfile
                  ? 'other-account'
                  : 'account-1',
              },
            },
            Mounts: [
              { Source: '/host/profiles/account-1', Destination: '/profile', RW: true },
              ...(settings.extraMount
                ? [
                    {
                      Source: '/var/run/docker.sock',
                      Destination: '/var/run/docker.sock',
                      RW: true,
                    },
                  ]
                : []),
            ],
            State: {
              Status: running ? 'running' : 'exited',
              Running: running,
              Dead: false,
              Restarting: false,
              Pid: running ? 100 : 0,
              OOMKilled: false,
              ExitCode: exitCode,
              ...settings.state,
            },
            NetworkSettings: { Networks: { 'flipbase-browser': { IPAddress: '172.30.88.128' } } },
          },
        ]);
      }
      if (args[0] === 'stop') {
        running = false;
        return containerId;
      }
      if (args[0] === 'exec' && settings.startupFailure) running = false;
      if (args[0] === 'rm') {
        removed = !settings.removalUnconfirmed;
        return containerId;
      }
      return '';
    },
  });
  return {
    launcher,
    calls,
    context,
    failInspection: () => {
      failNextInspection = true;
    },
  };
}

test('creates only a private constrained session and sends secrets through stdin', async () => {
  const { launcher, calls } = fixture();
  const context = await launcher.launch('/controller/profiles/account-1', {
    chromiumSandbox: true,
    proxy: {
      server: 'http://example.invalid:8080',
      username: 'private-user',
      password: 'private-password',
    },
  });
  const creation = calls.find((call) => call.args[0] === 'create');
  assert.ok(creation);
  assert.ok(creation.args.includes('--read-only'));
  assert.ok(creation.args.includes('--cap-drop=ALL'));
  assert.ok(creation.args.includes('--user=1000:1000'));
  assert.equal(
    creation.args.some(
      (argument) =>
        argument.includes('private-password') ||
        argument.includes('docker.sock') ||
        argument.startsWith('--publish'),
    ),
    false,
  );
  assert.ok(calls.some((call) => call.input?.includes('private-password')));
  await context.close();
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), []);
});

test('browser allocation must leave the controller address outside its dynamic pool', async () => {
  const { launcher, calls } = fixture(0, false, { missingAllocationRange: true });
  await assert.rejects(launcher.launch('/controller/profiles/account-1'), /Sitzungsnetz/);
  assert.equal(
    calls.some((call) => call.args[0] === 'create'),
    false,
  );
});

test('requires graceful exit and retains unresolved containers', async () => {
  const { launcher, calls } = fixture(137);
  const context = await launcher.launch('/controller/profiles/account-1', {
    chromiumSandbox: true,
  });
  await assert.rejects(() => context.close(), /Stop|stop|beendet/);
  assert.equal(
    calls.some((call) => call.args[0] === 'rm'),
    false,
  );
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), [1]);
});

test('rejects escaping profile paths and unsupported launch flags before Docker mutation', async () => {
  const { launcher, calls } = fixture();
  await assert.rejects(() => launcher.launch('/controller/profiles/../other', {}), /Profil/);
  await assert.rejects(
    () => launcher.launch('/controller/profiles/account-1', { args: ['--no-sandbox'] }),
    /option/,
  );
  assert.equal(
    calls.some((call) => call.args[0] === 'create'),
    false,
  );
});

test('recovers only matching labelled containers and confirms removal', async () => {
  const { launcher, calls } = fixture(0, true);
  await launcher.recover('account-1');
  assert.ok(calls.some((call) => call.args[0] === 'stop'));
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), []);
});

test('rejects missing current firewall and a foreign Docker network before creating a browser', async () => {
  for (const settings of [{ firewallUnavailable: true }, { invalidNetwork: true }]) {
    const { launcher, calls } = fixture(0, false, settings);
    await assert.rejects(() => launcher.launch('/controller/profiles/account-1', {}));
    assert.equal(
      calls.some((call) => call.args[0] === 'create'),
      false,
    );
  }
});

test('does not stop foreign profiles or sessions with additional mounts', async () => {
  for (const settings of [{ foreignProfile: true }, { extraMount: true }]) {
    const { launcher, calls } = fixture(0, true, settings);
    await assert.rejects(() => launcher.recover('account-1'));
    assert.equal(
      calls.some((call) => call.args[0] === 'stop' || call.args[0] === 'rm'),
      false,
    );
  }
});

test('a successful removal command alone does not release the profile', async () => {
  const { launcher } = fixture(0, true, { removalUnconfirmed: true });
  await assert.rejects(() => launcher.recover('account-1'));
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), [1]);
});

test('a failed close can be retried after Docker becomes inspectable', async () => {
  const { launcher, failInspection } = fixture();
  const context = await launcher.launch('/controller/profiles/account-1', {});
  failInspection();
  await assert.rejects(() => context.close());
  await context.close();
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), []);
});

test('accepts production launch options but keeps the container environment fixed', async () => {
  const { launcher, calls } = fixture();
  const context = await launcher.launch('/controller/profiles/account-1', {
    headless: false,
    chromiumSandbox: true,
    acceptDownloads: false,
    timeout: 60_000,
    args: ['--disable-dev-shm-usage'],
    locale: 'de-DE',
    viewport: { width: 1280, height: 900 },
    env: {
      PATH: '/private-controller/path',
      HOME: '/private-controller/home',
      LANG: 'de_DE.UTF-8',
      TZ: 'Europe/Berlin',
      DISPLAY: ':99',
      SYSTEMROOT: 'C:\\Windows',
    },
  });
  assert.ok(context.browser());
  const creation = calls.find((call) => call.args[0] === 'create');
  assert.ok(creation);
  assert.equal(
    creation.args.some((argument) => argument.includes('/private-controller')),
    false,
  );
  assert.equal(
    calls.some((call) => call.input?.includes('/private-controller')),
    false,
  );
  await context.close();
});

test('recovers a confirmed clean startup failure and allows the same profile to reopen', async () => {
  const { launcher, calls } = fixture(78, true, { initiallyExited: true });
  await launcher.recover('account-1');
  assert.equal(
    calls.some((call) => call.args[0] === 'stop'),
    false,
  );
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), []);
  assert.ok(await launcher.launch('/controller/profiles/account-1'));
});

test('keeps unknown failures and unproven startup exits quarantined', async () => {
  for (const [exitCode, state] of [
    [1, {}],
    [137, {}],
    [78, { Status: 'dead' }],
    [78, { Status: 'created' }],
    [78, { Status: null }],
    [78, { Running: null }],
    [78, { Running: true }],
    [78, { Dead: true }],
    [78, { Dead: null }],
    [78, { Restarting: true }],
    [78, { Restarting: null }],
    [78, { Pid: 100 }],
    [78, { Pid: null }],
    [78, { OOMKilled: true }],
    [78, { OOMKilled: null }],
    [78, { ExitCode: '78' }],
  ] as [number, Record<string, unknown>][]) {
    const { launcher, calls } = fixture(exitCode, true, { initiallyExited: true, state });
    await assert.rejects(() => launcher.recover('account-1'));
    assert.equal(
      calls.some((call) => call.args[0] === 'rm'),
      false,
    );
    assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), [1]);
  }
});

test('does not release a clean startup failure until removal is confirmed', async () => {
  const { launcher } = fixture(78, true, {
    initiallyExited: true,
    removalUnconfirmed: true,
  });
  await assert.rejects(() => launcher.recover('account-1'));
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), [1]);
});

test('recognizes a confirmed startup failure before the connection deadline', async () => {
  const { launcher, calls } = fixture(78, false, { startupFailure: true });
  await assert.rejects(
    () => launcher.launch('/controller/profiles/account-1'),
    /Chromium-Containerstart fehlgeschlagen/,
  );
  assert.equal(
    calls.some((call) => call.args[0] === 'stop'),
    false,
  );
  assert.ok(calls.some((call) => call.args[0] === 'rm'));
  assert.deepEqual(await launcher.inspectProfileProcesses('/controller/profiles/account-1'), []);
});

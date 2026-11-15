import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  chromiumHostHandler,
  chromiumHostOperations,
  dispatchChromiumHostCommand,
  type ChromiumHostOperations,
} from '../src/chromium-host-broker.ts';
import { ChromiumDesktopControls } from '../src/chromium-desktop-controls.ts';
import { CloudBrowserStoppedUncleanlyError } from '../src/gologin-cloud-browser.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChromiumContainerLauncher } from '../src/chromium-container-launcher.ts';

const profileId = 'chromium_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture() {
  const calls: unknown[] = [];
  const desktop = new ChromiumDesktopControls({
    width: 1280,
    height: 900,
    authorize: async () => undefined,
    execute: async (argumentsList, input) => {
      calls.push([argumentsList, input]);
      return Buffer.from([255, 216, 255, 1]);
    },
  });
  const operations: ChromiumHostOperations = {
    launch: async (profile, settings) => {
      calls.push(['launch', profile, settings]);
      return 'http://172.30.88.128:9222';
    },
    recover: async (profile) => {
      calls.push(['recover', profile]);
    },
    inspect: async (profile) => {
      calls.push(['inspect', profile]);
      return [];
    },
    archive: async (profile) => {
      calls.push(['archive', profile]);
    },
    desktop: () => desktop,
  };
  return { operations, calls };
}

test('host serializes one profile while a waiting command cannot block another profile', async () => {
  const { operations } = fixture();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const secondProfile = 'chromium_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const order: string[] = [];
  operations.invoke = async (profile) => {
    order.push(profile);
    if (profile === profileId) {
      started();
      await gate;
    }
    return {};
  };
  operations.capacity = () => 2;
  const token = 'b'.repeat(64),
    handler = chromiumHostHandler(token, operations);
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = (profile: string) =>
    fetch(`http://127.0.0.1:${address.port}/command`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        action: 'invoke',
        profileId: profile,
        session: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        command: { action: 'poll' },
      }),
    });
  let first: Promise<Response> | undefined, same: Promise<Response> | undefined;
  try {
    first = request(profileId);
    await entered;
    same = request(profileId);
    const other = await request(secondProfile);
    assert.equal(other.status, 200);
    await other.body?.cancel();
    assert.deepEqual(order, [profileId, secondProfile]);
    const capacity = await fetch(`http://127.0.0.1:${address.port}/capacity`, {
      headers: { Authorization: 'Bearer ' + token },
    });
    assert.deepEqual(await capacity.json(), { capacity: 2 });
  } finally {
    release();
    for (const response of await Promise.all([first, same].filter((value) => value !== undefined)))
      await response.body?.cancel();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('starting browsers consume capacity before profile preparation yields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-host-capacity-'));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const launcher = {
    inspectProfileProcesses: async () => [],
    launch: async () => gate,
    recover: async () => undefined,
  } as unknown as ChromiumContainerLauncher;
  const operations = chromiumHostOperations(launcher, root, undefined, 1);
  const first = operations.launch(profileId, {});
  try {
    await assert.rejects(
      operations.launch('chromium_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {}),
      /Browserlimit/,
    );
    await assert.rejects(operations.launch(profileId, {}), /Browserlimit/);
  } finally {
    release();
    await first;
    await operations.recover(profileId);
    await rm(root, { recursive: true, force: true });
  }
});
test('Broker verweigert Docker-Argumente, Hostpfade, Containerkennungen und Parser-Aliase', async () => {
  const { operations, calls } = fixture();
  for (const input of [
    { profileId, action: 'exec', argumentsList: ['sh'] },
    { profileId, action: 'launch', settings: { executablePath: '/bin/sh' } },
    { profileId, action: 'launch', settings: { args: ['--no-sandbox'] } },
    { profileId, action: 'launch', settings: { headless: 'false' } },
    { profileId, action: 'launch', settings: { viewport: { width: 1, height: 900 } } },
    { profileId, action: 'recover', containerId: 'foreign' },
    { profileId: '../escape', action: 'inspect' },
    { profileId: 'chromium_../../var', action: 'archive' },
    { profileId, action: '__proto__' },
  ])
    await assert.rejects(dispatchChromiumHostCommand(input, operations));
  assert.deepEqual(calls, []);
});
test('Broker erhält normale Starts, Recovery, Archivierung und native Bedienung', async () => {
  const { operations, calls } = fixture();
  assert.deepEqual(
    await dispatchChromiumHostCommand(
      {
        profileId,
        action: 'launch',
        settings: {
          headless: false,
          chromiumSandbox: true,
          locale: 'de-DE',
          viewport: { width: 1280, height: 900 },
          args: ['--disable-dev-shm-usage'],
          timeout: 60_000,
        },
      },
      operations,
    ),
    { session: 'http://172.30.88.128:9222' },
  );
  await dispatchChromiumHostCommand({ profileId, action: 'click', x: 0.5, y: 0.5 }, operations);
  await dispatchChromiumHostCommand(
    { profileId, action: 'type', text: 'private password' },
    operations,
  );
  await dispatchChromiumHostCommand({ profileId, action: 'recover' }, operations);
  await dispatchChromiumHostCommand({ profileId, action: 'archive' }, operations);
  assert.ok(JSON.stringify(calls).includes('mousemove'));
  assert.deepEqual(calls.at(-1), ['archive', profileId]);
});

test('Broker bestätigt ein physisches Ende mit Profilwarnung, aber niemals einen unklaren Stopp', async () => {
  const { operations } = fixture();
  operations.recover = async () => {
    throw new CloudBrowserStoppedUncleanlyError();
  };
  assert.deepEqual(
    await dispatchChromiumHostCommand({ profileId, action: 'recover' }, operations),
    { stopped: true, clean: false },
  );
  operations.recover = async () => {
    throw new Error('private unconfirmed stop');
  };
  await assert.rejects(dispatchChromiumHostCommand({ profileId, action: 'recover' }, operations));
});
test('Broker kann über die private API keine beliebigen Desktopbefehle ausführen', async () => {
  const { operations, calls } = fixture();
  for (const request of [
    { action: 'press', key: 'ctrl+alt+Delete' },
    { action: 'click', x: -1, y: 1 },
    { action: 'type', text: 'a\nb' },
    {
      action: 'drag',
      points: [
        { x: 0, y: 0, elapsedMs: 0 },
        { x: 1, y: 1, elapsedMs: 999999 },
      ],
    },
  ])
    await assert.rejects(dispatchChromiumHostCommand({ profileId, ...request }, operations));
  assert.deepEqual(calls, []);
});
test('HTTP-Broker authentifiziert vor dem Auftrag und bestätigt unsichere Stopps nicht', async () => {
  const { operations, calls } = fixture();
  const token = 'a'.repeat(64);
  const handler = chromiumHostHandler(token, operations);
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/command`;
    const body = JSON.stringify({ profileId, action: 'inspect' });
    const rejected = await fetch(url, { method: 'POST', body });
    assert.equal(rejected.status, 401);
    await rejected.body?.cancel();
    assert.deepEqual(calls, []);
    const headers = { Authorization: `Bearer ${token}` };
    const accepted = await fetch(url, { method: 'POST', headers, body });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { processes: [] });
    operations.recover = async () => {
      throw new Error('unsicher');
    };
    const uncertain = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profileId, action: 'recover' }),
    });
    assert.equal(uncertain.status, 409);
    await uncertain.body?.cancel();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

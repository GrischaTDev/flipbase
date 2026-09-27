import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import {
  MarketplaceBrowserHttpApi,
  SupabaseBrowserUserVerifier,
} from '../src/marketplace-browser-http-api.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import {
  MarketplaceBrowserSessionEndedError,
  type BrowserSessionScope,
} from '../src/marketplace-browser-session-broker.ts';

const workspaceA = '25600000-0000-4000-8000-000000000011';
const workspaceB = '25600000-0000-4000-8000-000000000012';
const accountA = '25600000-0000-4000-8000-000000000021';
const accountB = '25600000-0000-4000-8000-000000000022';
const sessionId = '25600000-0000-4000-8000-000000000031';

async function setup(
  frame = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
  captureGate?: Promise<void>,
  readOnly = false,
  runError?: Error,
  prepare?: (scope: BrowserSessionScope) => Promise<void>,
) {
  const inputs: string[] = [];
  let owner: BrowserSessionScope | undefined;
  let runs = 0;
  const browser: BrowserInfo = {
    version: () => 'synthetic browser',
    capture: async () => {
      await captureGate;
      return frame;
    },
    click: async (x, y) => {
      inputs.push(`click:${x}:${y}`);
    },
    type: async (value) => {
      inputs.push(`type:${value}`);
    },
    press: async (key) => {
      inputs.push(`press:${key}`);
    },
  };
  const broker = {
    open: async (scope: BrowserSessionScope) => {
      owner = scope;
      return sessionId;
    },
    run: async <T>(
      scope: BrowserSessionScope,
      id: string,
      operation: (value: BrowserInfo) => Promise<T>,
    ) => {
      if (
        id !== sessionId ||
        !owner ||
        scope.workspaceId !== owner.workspaceId ||
        scope.connectionId !== owner.connectionId ||
        scope.userId !== owner.userId
      )
        throw new Error('Sitzungszugriff verweigert');
      runs += 1;
      if (runError) throw runError;
      return operation(browser);
    },
    close: async (scope: BrowserSessionScope, id: string) => {
      if (
        id !== sessionId ||
        scope.userId !== owner?.userId ||
        scope.connectionId !== owner.connectionId
      )
        throw new Error('Sitzungszugriff verweigert');
      owner = undefined;
    },
  };
  const api = new MarketplaceBrowserHttpApi({
    broker,
    profiles: prepare ? { prepare } : undefined,
    readOnly,
    users: {
      userId: async (token) => {
        if (token === 'token-a' || token === 'token-a-renewed')
          return '25600000-0000-4000-8000-000000000001';
        if (token === 'token-b') return '25600000-0000-4000-8000-000000000002';
        throw new Error('invalid');
      },
    },
  });
  const server = api.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  const request = (path: string, body: unknown, token = 'token-a') =>
    fetch(`${url}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const close = async () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  return { request, close, url, inputs, runs: () => runs };
}

test('reports availability at the same path used by the Angular test page', async () => {
  const api = await setup();
  try {
    const response = await fetch(`${api.url}/marketplace-browser/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, readOnly: false });
  } finally {
    await api.close();
  }
});

test('prepares the bound browser profile before opening and hides provider errors', async () => {
  const prepared: string[] = [];
  const api = await setup(undefined, undefined, false, undefined, async (scope) => {
    prepared.push(`${scope.userId}:${scope.workspaceId}:${scope.connectionId}`);
  });
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    assert.equal((await api.request('/marketplace-browser/sessions', scope)).status, 201);
    assert.deepEqual(prepared, [`25600000-0000-4000-8000-000000000001:${workspaceA}:${accountA}`]);
  } finally {
    await api.close();
  }
  const failed = await setup(undefined, undefined, false, undefined, async () => {
    throw new Error('provider-token-must-stay-private');
  });
  try {
    const response = await failed.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 409);
    assert.equal((await response.text()).includes('provider-token-must-stay-private'), false);
  } finally {
    await failed.close();
  }
});

test('read-only mode refuses all browser input before accessing the session', async () => {
  const api = await setup(undefined, undefined, true);
  try {
    const response = await fetch(`${api.url}/marketplace-browser/healthz`);
    assert.deepEqual(await response.json(), { ok: true, readOnly: true });
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const input = await api.request(`/marketplace-browser/sessions/${sessionId}/input`, {
      ...scope,
      input: { kind: 'click', x: 0.5, y: 0.5 },
    });
    assert.equal(input.status, 403);
    assert.deepEqual(api.inputs, []);
    assert.equal(api.runs(), 0);
  } finally {
    await api.close();
  }
});

test('reports only confirmed session endings as gone for the bound account', async () => {
  const api = await setup(undefined, undefined, true, new MarketplaceBrowserSessionEndedError());
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/frame`;
    assert.equal((await api.request(path, scope)).status, 410);
    assert.equal((await api.request(path, { ...scope, connectionId: accountB })).status, 409);
  } finally {
    await api.close();
  }
});

test('returns only a bounded image and accepts individual inputs for the bound account', async () => {
  const api = await setup();
  try {
    const started = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(started.status, 201);
    const result: unknown = await started.json();
    assert.deepEqual(result, { id: sessionId });
    assert.equal(started.headers.get('Cache-Control'), 'no-store');
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    const frame = await api.request(`${path}/frame`, scope, 'token-a-renewed');
    assert.equal(frame.status, 200);
    assert.equal(frame.headers.get('Content-Type'), 'image/jpeg');
    assert.deepEqual(
      new Uint8Array(await frame.arrayBuffer()),
      Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    );
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'click', x: 0.25, y: 0.75 } }))
        .status,
      200,
    );
    assert.equal(
      (
        await api.request(`${path}/input`, {
          ...scope,
          input: { kind: 'type', value: 'synthetic text' },
        })
      ).status,
      200,
    );
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'press', key: 'Tab' } }))
        .status,
      200,
    );
    assert.deepEqual(api.inputs, ['click:0.25:0.75', 'type:synthetic text', 'press:Tab']);
    assert.equal((await api.request(`${path}/close`, scope)).status, 204);
  } finally {
    await api.close();
  }
});

test('rejects missing auth, another operator, workspace and account before browser access', async () => {
  const api = await setup();
  try {
    const path = `/marketplace-browser/sessions/${sessionId}/frame`;
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    assert.equal(
      (await api.request('/marketplace-browser/sessions', scope, 'bad-token')).status,
      401,
    );
    assert.equal((await api.request('/marketplace-browser/sessions', scope)).status, 201);
    assert.equal((await api.request(path, scope, 'token-b')).status, 409);
    assert.equal(
      (await api.request(path, { workspaceId: workspaceB, connectionId: accountA })).status,
      409,
    );
    assert.equal(
      (await api.request(path, { workspaceId: workspaceA, connectionId: accountB })).status,
      409,
    );
    assert.equal(api.runs(), 0);
  } finally {
    await api.close();
  }
});

test('rejects oversized frames and malformed input without exposing internal errors', async () => {
  const api = await setup(Uint8Array.from([0xff, 0xd8, ...new Array<number>(512 * 1024).fill(0)]));
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const frame = await api.request(`${path}/frame`, scope);
    assert.equal(frame.status, 502);
    assert.equal((await frame.text()).includes('synthetic browser'), false);
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'click', x: 1.1, y: 0.5 } }))
        .status,
      400,
    );
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'press', key: 'Control+L' } }))
        .status,
      400,
    );
    assert.deepEqual(api.inputs, []);
  } finally {
    await api.close();
  }
});

test('verifies the bearer token with Supabase Auth without returning its response body', async () => {
  const verifier = new SupabaseBrowserUserVerifier(
    'https://example.test',
    'public-test-key',
    async (_input, init) => {
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer user-test-token');
      return Response.json({ id: '25600000-0000-4000-8000-000000000001' });
    },
  );
  assert.equal(await verifier.userId('user-test-token'), '25600000-0000-4000-8000-000000000001');
});

test('rejects oversized requests before opening a browser session', async () => {
  const api = await setup();
  try {
    const response = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
      padding: 'x'.repeat(4096),
    });
    assert.equal(response.status, 413);
    assert.equal(api.runs(), 0);
  } finally {
    await api.close();
  }
});

test('allows only one operation at a time for an authenticated session', async () => {
  let releaseCapture!: () => void;
  const captureGate = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  const api = await setup(undefined, captureGate);
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const first = api.request(`${path}/frame`, scope);
    for (let attempt = 0; attempt < 20 && api.runs() === 0; attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(api.runs(), 1);
    assert.equal(
      (await api.request(`${path}/input`, { ...scope, input: { kind: 'press', key: 'Tab' } }))
        .status,
      429,
    );
    assert.deepEqual(api.inputs, []);
    releaseCapture();
    assert.equal((await first).status, 200);
  } finally {
    releaseCapture();
    await api.close();
  }
});

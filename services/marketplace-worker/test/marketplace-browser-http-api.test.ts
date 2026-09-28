import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import {
  MarketplaceBrowserHttpApi,
  SupabaseBrowserUserVerifier,
} from '../src/marketplace-browser-http-api.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import { GoLoginApiLimitError, GoLoginProfileLimitError } from '../src/gologin-api-limit.ts';
import {
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
} from '../src/vinted-browser-reader.ts';
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
  identity?: { id: string; username: string } | null,
  confirm?: (scope: BrowserSessionScope, id: string) => Promise<void>,
  loginGate?: Promise<void>,
  remove?: (scope: BrowserSessionScope, stop: () => Promise<void>) => Promise<void>,
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
    identify: async () => identity ?? null,
    login: async (credentials, authorize) => {
      await loginGate;
      await authorize();
      inputs.push(`login:${credentials.username}`);
      return 'submitted';
    },
    verify: async (_code, authorize) => {
      await authorize();
      inputs.push('verification-submitted');
      return 'submitted';
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
    reconcile: async () => undefined,
  };
  const api = new MarketplaceBrowserHttpApi({
    broker,
    profiles:
      prepare || remove ? { prepare: prepare ?? (async () => undefined), remove } : undefined,
    accounts: confirm ? { confirm: async (scope, id) => confirm(scope, id) } : undefined,
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
    assert.deepEqual(await response.json(), { ok: true, readOnly: false, apiVersion: 2 });
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

test('returns only a fixed code when the provider API limit is reached', async () => {
  const api = await setup(undefined, undefined, false, undefined, async () => {
    throw new GoLoginApiLimitError();
  });
  try {
    const response = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: 'gologin_api_limit_reached',
      error: 'GoLogin-API-Limit erreicht',
    });
  } finally {
    await api.close();
  }
});

test('returns only a fixed code when the GoLogin profile quota is full', async () => {
  const api = await setup(undefined, undefined, false, undefined, async () => {
    throw new GoLoginProfileLimitError();
  });
  try {
    const response = await api.request('/marketplace-browser/sessions', {
      workspaceId: workspaceA,
      connectionId: accountA,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: 'gologin_profile_limit_reached' });
  } finally {
    await api.close();
  }
});

test('read-only mode refuses all browser input before accessing the session', async () => {
  const api = await setup(undefined, undefined, true);
  try {
    const response = await fetch(`${api.url}/marketplace-browser/healthz`);
    assert.deepEqual(await response.json(), { ok: true, readOnly: true, apiVersion: 2 });
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

test('confirms only the active account and returns a bounded identity', async () => {
  const confirmed: string[] = [];
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    { id: '12345', username: 'my-vinted' },
    async (scope, id) => {
      confirmed.push(`${scope.workspaceId}:${scope.connectionId}:${scope.userId}:${id}`);
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/identify`;
    assert.equal((await api.request(path, { ...scope, connectionId: accountB })).status, 409);
    assert.equal((await api.request(path, { ...scope, workspaceId: workspaceB })).status, 409);
    assert.equal((await api.request(path, scope, 'token-b')).status, 409);
    assert.deepEqual(confirmed, []);
    const response = await api.request(path, scope);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      workspaceId: workspaceA,
      connectionId: accountA,
      externalAccountId: '12345',
      username: 'my-vinted',
    });
    assert.deepEqual(confirmed, [
      `${workspaceA}:${accountA}:25600000-0000-4000-8000-000000000001:${sessionId}`,
    ]);
  } finally {
    await api.close();
  }
});

test('does not confirm absent identity, read-only mode or interrupted session', async () => {
  for (const [readOnly, error, expected] of [
    [false, undefined, 422],
    [true, undefined, 403],
    [false, new MarketplaceBrowserSessionEndedError(), 410],
  ] as const) {
    let confirmations = 0;
    const api = await setup(undefined, undefined, readOnly, error, undefined, null, async () => {
      confirmations++;
    });
    try {
      const scope = { workspaceId: workspaceA, connectionId: accountA };
      await api.request('/marketplace-browser/sessions', scope);
      assert.equal(
        (await api.request(`/marketplace-browser/sessions/${sessionId}/identify`, scope)).status,
        expected,
      );
      assert.equal(confirmations, 0);
    } finally {
      await api.close();
    }
  }
});

test('reports a visible Vinted login form without exposing browser content or confirming the account', async () => {
  let confirmations = 0;
  const api = await setup(
    undefined,
    undefined,
    false,
    new VintedLoginPendingError(),
    undefined,
    null,
    async () => {
      confirmations++;
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const response = await api.request(
      `/marketplace-browser/sessions/${sessionId}/identify`,
      scope,
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { code: 'vinted_login_pending' });
    assert.equal(confirmations, 0);
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

test('binds one login submission to its user, workspace and account without returning secrets', async () => {
  const api = await setup();
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/login`;
    const credentials = { username: 'synthetic-user', password: 'synthetic-password' };
    const response = await api.request(path, { ...scope, credentials });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'submitted' });
    assert.deepEqual(api.inputs, ['login:synthetic-user']);
    for (const other of [
      { ...scope, workspaceId: workspaceB },
      { ...scope, connectionId: accountB },
    ])
      assert.equal((await api.request(path, { ...other, credentials })).status, 409);
    assert.equal((await api.request(path, { ...scope, credentials }, 'token-b')).status, 409);
    assert.equal((await api.request(path, { ...scope, credentials }, 'expired')).status, 401);
    assert.equal(api.inputs.length, 1);
    assert.equal(
      (await api.request(path, { ...scope, credentials: { ...credentials, password: '' } })).status,
      400,
    );
    assert.equal(
      (
        await api.request(path, {
          ...scope,
          credentials: { ...credentials, url: 'https://other.example' },
        })
      ).status,
      400,
    );
  } finally {
    await api.close();
  }
});

test('bindet die Codebestätigung an Nutzer, Workspace und Konto', async () => {
  const api = await setup();
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}/verify`;
    assert.equal((await api.request(path, { ...scope, code: '123456' }, 'expired')).status, 401);
    assert.equal(
      (await api.request(path, { ...scope, connectionId: accountB, code: '123456' })).status,
      409,
    );
    assert.equal(
      (await api.request(path, { ...scope, workspaceId: workspaceB, code: '123456' })).status,
      409,
    );
    assert.equal((await api.request(path, { ...scope, code: '123456' }, 'token-b')).status, 409);
    assert.deepEqual(api.inputs, []);
    const response = await api.request(path, { ...scope, code: '123456' });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'submitted' });
    assert.deepEqual(api.inputs, ['verification-submitted']);
    assert.equal((await api.request(path, { ...scope, code: 'abc' })).status, 400);
    assert.equal((await api.request(`${path.replace('/verify', '/close')}`, scope)).status, 204);
    assert.equal((await api.request(path, { ...scope, code: '123456' })).status, 409);
  } finally {
    await api.close();
  }
});

test('löscht Konten nur über den angemeldeten, kontogebundenen Workerpfad', async () => {
  const removed: string[] = [];
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    async (scope, stop) => {
      await stop();
      removed.push(`${scope.userId}:${scope.workspaceId}:${scope.connectionId}`);
    },
  );
  try {
    const path = '/marketplace-browser/connections/delete';
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    assert.equal((await api.request(path, scope, 'expired')).status, 401);
    assert.deepEqual(removed, []);
    assert.equal((await api.request(path, scope)).status, 204);
    assert.deepEqual(removed, [`25600000-0000-4000-8000-000000000001:${workspaceA}:${accountA}`]);
  } finally {
    await api.close();
  }
});

test('rejects login in read-only mode and for ended sessions', async () => {
  for (const readOnly of [true, false]) {
    const api = await setup(
      undefined,
      undefined,
      readOnly,
      new MarketplaceBrowserSessionEndedError(),
    );
    try {
      const scope = { workspaceId: workspaceA, connectionId: accountA };
      await api.request('/marketplace-browser/sessions', scope);
      const response = await api.request(`/marketplace-browser/sessions/${sessionId}/login`, {
        ...scope,
        credentials: { username: 'synthetic', password: 'synthetic' },
      });
      assert.equal(response.status, readOnly ? 403 : 410);
      assert.equal(api.inputs.length, 0);
    } finally {
      await api.close();
    }
  }
});

test('close interrupts an in-flight login before any later credential submission', async () => {
  let resumeLogin!: () => void;
  const gate = new Promise<void>((resolve) => {
    resumeLogin = resolve;
  });
  const api = await setup(
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    gate,
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const path = `/marketplace-browser/sessions/${sessionId}`;
    const pending = api.request(`${path}/login`, {
      ...scope,
      credentials: { username: 'synthetic', password: 'synthetic' },
    });
    for (let attempt = 0; attempt < 50 && api.runs() === 0; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(api.runs(), 1);
    try {
      assert.equal((await api.request(`${path}/close`, scope)).status, 204);
    } finally {
      resumeLogin();
    }
    await pending;
    assert.deepEqual(api.inputs, []);
  } finally {
    resumeLogin();
    await api.close();
  }
});

test('returns a safe rejection code only after the scoped broker check', async () => {
  const { VintedLoginRejectedError } = await import('../src/vinted-browser-reader.ts');
  const api = await setup(
    undefined,
    undefined,
    false,
    new VintedLoginRejectedError(),
    undefined,
    undefined,
    async () => {
      throw new Error('must not confirm');
    },
  );
  try {
    const scope = { workspaceId: workspaceA, connectionId: accountA };
    await api.request('/marketplace-browser/sessions', scope);
    const response = await api.request(
      `/marketplace-browser/sessions/${sessionId}/identify`,
      scope,
    );
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      code: 'vinted_login_rejected',
      error: 'Vinted hat die Zugangsdaten abgelehnt',
    });
    const other = await api.request(`/marketplace-browser/sessions/${sessionId}/identify`, {
      ...scope,
      workspaceId: workspaceB,
    });
    assert.equal(other.status, 409);
    assert.equal(JSON.stringify(await other.json()).includes('vinted_login_rejected'), false);
  } finally {
    await api.close();
  }
});

test('keeps the real broker lease alive while login is rejected or still on the form', async () => {
  const { MarketplaceBrowserSessionBroker } =
    await import('../src/marketplace-browser-session-broker.ts');
  for (const [loginError, expectedCode] of [
    [new VintedLoginRejectedError(), 'vinted_login_rejected'],
    [new VintedLoginPendingError(), 'vinted_login_pending'],
    [new VintedVerificationRequiredError(), 'vinted_verification_required'],
  ] as const) {
    let active = true;
    let stopped = false;
    const broker = new MarketplaceBrowserSessionBroker({
      recovery: { recover: async () => undefined },
      leases: {
        acquire: async (scope) => ({
          id: sessionId,
          scope,
          expiresAt: Date.now() + 60_000,
          active: true,
        }),
        assertActive: async () => active,
        release: async () => {
          active = false;
        },
      },
      profiles: { resolve: async () => 'synthetic-profile' },
      browsers: {
        open: async () => ({
          close: async () => {
            stopped = true;
          },
          run: async (operation) =>
            operation({
              version: () => 'synthetic',
              identify: async () => {
                throw loginError;
              },
              capture: async () => Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
            }),
        }),
        stop: async () => {
          stopped = true;
        },
      },
    });
    const api = new MarketplaceBrowserHttpApi({
      broker,
      users: { userId: async () => '25600000-0000-4000-8000-000000000001' },
      accounts: { confirm: async () => assert.fail('must not confirm a rejected login') },
    });
    const server = api.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const post = (path: string) =>
      fetch(`http://127.0.0.1:${address.port}/marketplace-browser/sessions${path}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspaceA, connectionId: accountA }),
      });
    try {
      assert.equal((await post('')).status, 201);
      const identified = await post(`/${sessionId}/identify`);
      assert.equal(identified.status, 422);
      assert.equal((await identified.json()).code, expectedCode);
      assert.equal(active, true);
      assert.equal(stopped, false);
      assert.equal((await post(`/${sessionId}/frame`)).status, 200);
    } finally {
      await broker.shutdown();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

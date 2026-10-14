// deno-lint-ignore-file require-await
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPushSettingsHandler } from './handler.ts';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('unverified auth and unknown payload fields never reach database', async () => {
  let executions = 0;
  const handler = createPushSettingsHandler({
    origins: [],
    publicKey: 'B'.repeat(87),
    keyId: 'v1',
    enabled: true,
    async authenticate() {
      return { userId: id, sessionId: id };
    },
    async execute() {
      executions++;
    },
  });
  for (const body of [
    { action: 'settings', installationId: id, userId: id },
    { action: 'test', deviceId: id, workspaceId: id, extra: true },
  ])
    assert.equal(
      (
        await handler(
          new Request('https://example.test', {
            method: 'POST',
            headers: { authorization: 'Bearer checked' },
            body: JSON.stringify(body),
          }),
        )
      ).status,
      400,
    );
  assert.equal(executions, 0);
  assert.equal(
    (await handler(new Request('https://example.test', { method: 'POST', body: '{}' }))).status,
    401,
  );
});
test('settings returns server key rotation and current binding without secrets', async () => {
  const handler = createPushSettingsHandler({
    origins: [],
    publicKey: 'public',
    keyId: 'v2',
    enabled: false,
    async authenticate() {
      return { userId: id, sessionId: id };
    },
    async execute(userId, sessionId) {
      assert.equal(userId, id);
      assert.equal(sessionId, id);
      return {
        binding: { deviceId: id, active: false, keyId: 'v1' },
        preferences: [],
        allowedCategories: [],
      };
    },
  });
  const response = await handler(
    new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: 'Bearer checked' },
      body: JSON.stringify({ action: 'settings', installationId: id }),
    }),
  );
  assert.deepEqual(await response.json(), {
    binding: { deviceId: id, active: false, keyId: 'v1' },
    preferences: [],
    allowedCategories: [],
    publicKey: 'public',
    keyId: 'v2',
    enabled: false,
  });
});

test('database authorization and throttling retain their HTTP status', async () => {
  const { PushSettingsError } = await import('./handler.ts');
  for (const status of [403, 429, 503]) {
    const handler = createPushSettingsHandler({
      origins: [],
      publicKey: 'B'.repeat(87),
      keyId: 'v1',
      enabled: true,
      allowAll: true,
      async authenticate() {
        return { userId: id, sessionId: id };
      },
      async execute() {
        throw new PushSettingsError(status, 'denied');
      },
    });
    const response = await handler(
      new Request('https://example.test', {
        method: 'POST',
        headers: { authorization: 'Bearer checked' },
        body: JSON.stringify({ action: 'test', deviceId: id, workspaceId: id }),
      }),
    );
    assert.equal(response.status, status);
  }
});
test('pilot settings stay disabled and activation/test are blocked for other users', async () => {
  let executions = 0;
  const handler = createPushSettingsHandler({
    origins: [],
    publicKey: 'B'.repeat(87),
    keyId: 'v1',
    enabled: true,
    allowAll: false,
    pilotUsers: [],
    pilotDevices: [],
    authenticate: async () => ({ userId: id, sessionId: id }),
    execute: async () => {
      executions++;
      return { binding: null };
    },
  });
  const call = (body: Record<string, unknown>) =>
    handler(
      new Request('https://example.test', {
        method: 'POST',
        headers: { authorization: 'Bearer checked' },
        body: JSON.stringify(body),
      }),
    );
  assert.equal(
    (await (await call({ action: 'settings', installationId: id })).json()).enabled,
    false,
  );
  assert.equal((await call({ action: 'test', deviceId: id, workspaceId: id })).status, 409);
  assert.equal(executions, 1);
});

test('pilot device admission needs server-confirmed ownership; revoke stays available', async () => {
  for (const ownsDevice of [false, true]) {
    const handler = createPushSettingsHandler({
      origins: [],
      publicKey: 'B'.repeat(87),
      keyId: 'v1',
      enabled: true,
      pilotDevices: [id],
      authenticate: async () => ({ userId: id, sessionId: id }),
      ownsDevice: async () => ownsDevice,
      execute: async () => ({ binding: { deviceId: id } }),
    });
    const call = (body: Record<string, unknown>) =>
      handler(
        new Request('https://example.test', {
          method: 'POST',
          headers: { authorization: 'Bearer checked' },
          body: JSON.stringify(body),
        }),
      );
    assert.equal(
      (await (await call({ action: 'settings', installationId: id })).json()).enabled,
      ownsDevice,
    );
    assert.equal(
      (await call({ action: 'test', deviceId: id, workspaceId: id })).status,
      ownsDevice ? 200 : 409,
    );
    assert.equal((await call({ action: 'revoke', deviceId: id })).status, 200);
  }
});
test('pilot user can activate only with complete public configuration', async () => {
  for (const publicKey of ['', 'B'.repeat(87)]) {
    const handler = createPushSettingsHandler({
      origins: [],
      publicKey,
      keyId: 'v1',
      enabled: true,
      pilotUsers: [id],
      authenticate: async () => ({ userId: id, sessionId: id }),
      execute: async () => ({ binding: null }),
    });
    const response = await handler(
      new Request('https://example.test', {
        method: 'POST',
        headers: { authorization: 'Bearer checked' },
        body: JSON.stringify({ action: 'settings', installationId: id }),
      }),
    );
    assert.equal((await response.json()).enabled, !!publicKey);
  }
});

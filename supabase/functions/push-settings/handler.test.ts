// deno-lint-ignore-file require-await
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPushSettingsHandler } from './handler.ts';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('unverified auth and unknown payload fields never reach database', async () => {
  let executions = 0;
  const handler = createPushSettingsHandler({
    origins: [],
    publicKey: 'key',
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
      publicKey: 'key',
      keyId: 'v1',
      enabled: true,
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

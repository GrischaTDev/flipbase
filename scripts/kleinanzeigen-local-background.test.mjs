import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const extensionId = 'a'.repeat(32);
const app = {
  id: extensionId,
  frameId: 0,
  url: 'https://app.flipbase.de/marketplaces/kleinanzeigen',
};
const prepare = {
  type: 'FLIPBASE_KLEINANZEIGEN_PREPARE_ACCOUNT',
  requestId: 'prepare-1',
  workspaceId: '49000000-0000-4000-8000-000000000011',
  apiUrl: 'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
  canPublish: false,
};
function fixture() {
  const stored = {};
  const listeners = [];
  let popup = null;
  let tabsCreated = 0;
  const requests = [];
  let sessionResult = null;
  let accountQuota = null;
  let accountIdentity = {
    externalAccountId: '123',
    displayName: 'Testkonto',
    accountType: 'private',
  };
  const chrome = {
    storage: {
      local: {
        setAccessLevel: async (v) => assert.equal(v.accessLevel, 'TRUSTED_CONTEXTS'),
        get: async (key) => ({ [key]: stored[key] }),
        set: async (value) => Object.assign(stored, value),
      },
    },
    runtime: {
      id: extensionId,
      getURL: (path) => 'chrome-extension://' + extensionId + '/' + path,
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
    tabs: {
      create: async ({ url }) => {
        tabsCreated++;
        return { id: 17, url, status: 'complete' };
      },
      get: async () => ({
        id: 17,
        url: 'https://www.kleinanzeigen.de/m-einstellungen.html',
        status: 'complete',
      }),
      reload: async () => {},
      sendMessage: async () => ({
        success: true,
        result: {
          identity: accountIdentity,
          quota: accountQuota,
        },
      }),
    },
    windows: {
      create: async (value) => {
        popup = value;
        return { id: 18 };
      },
      remove: async () => {},
      onRemoved: { addListener: () => {} },
    },
  };
  const context = vm.createContext({
    chrome,
    URL,
    crypto,
    TextEncoder,
    AbortSignal,
    setTimeout,
    clearTimeout,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(sessionResult), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  for (const file of ['kleinanzeigen-local-core.js', 'kleinanzeigen-local-background.js'])
    vm.runInContext(readFileSync('tools/flipbase-extension/' + file, 'utf8'), context);
  assert.equal(
    listeners.length,
    1,
    'Kleinanzeigen-Hintergrund muss einen eigenen Nachrichtenadapter registrieren',
  );
  const listener = listeners[0];
  const send = (message, sender = app) =>
    new Promise((resolve, reject) => {
      const asynchronous = listener(message, sender, resolve);
      if (asynchronous !== true) reject(Error('message rejected'));
    });
  return {
    stored,
    requests,
    set quota(value) {
      accountQuota = value;
    },
    set identity(value) {
      accountIdentity = value;
    },
    send,
    listener,
    get tabsCreated() {
      return tabsCreated;
    },
    set session(value) {
      sessionResult = value;
    },
    async approve() {
      for (let i = 0; !popup && i < 40; i++) await new Promise(setImmediate);
      assert.ok(popup, 'Bestätigungsfenster muss geöffnet werden');
      const nonce = new URL(popup.url).hash.slice(1);
      const sender = { id: extensionId, frameId: 0, url: popup.url };
      assert.equal(
        (await send({ type: 'KLEINANZEIGEN_PAIRING_CONFIRM', nonce, approved: true }, sender))
          .success,
        true,
      );
    },
  };
}
test('rejects foreign websites and iframes before opening any provider tab', () => {
  const f = fixture();
  for (const sender of [
    { ...app, url: 'https://evil.example' },
    { ...app, frameId: 1 },
    { ...app, id: 'b'.repeat(32) },
  ])
    assert.equal(
      f.listener(prepare, sender, () => assert.fail('no reply')),
      false,
    );
  assert.equal(f.tabsCreated, 0);
});
test('requires extension-owned consent and keeps the install secret out of app replies', async () => {
  const f = fixture();
  const pending = f.send(prepare);
  await f.approve();
  const result = await pending;
  assert.equal(result.success, true);
  const installation = f.stored.kleinanzeigen_local_installation;
  assert.equal(installation.phase, 'prepared');
  assert.equal(installation.secret.length, 64);
  assert.ok(!JSON.stringify(result).includes(installation.secret));
  assert.equal(f.stored.vinted_local_installation, undefined);
  assert.equal(
    f.listener({ type: 'KLEINANZEIGEN_PAIRING_READ', nonce: 'fake' }, app, () =>
      assert.fail('no popup details for app'),
    ),
    false,
  );
});
test('binds only after the scoped backend heartbeat and exposes only public status', async () => {
  const f = fixture();
  const pending = f.send(prepare);
  await f.approve();
  const proposed = (await pending).result;
  const binding = {
    workspaceId: prepare.workspaceId,
    connectionId: '12',
    externalAccountId: '123',
    displayName: 'Testkonto',
    accountType: 'private',
    status: 'needs_login',
    generation: 1,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    canPublish: false,
  };
  f.session = {
    workspaceId: binding.workspaceId,
    connectionId: '12',
    externalAccountId: '123',
    generation: 1,
    expiresAt: binding.expiresAt,
    canPublish: false,
  };
  const connected = await f.send({
    type: 'FLIPBASE_KLEINANZEIGEN_CONNECT',
    requestId: 'connect-1',
    nonce: proposed.nonce,
    binding,
  });
  assert.equal(connected.success, true);
  assert.equal(f.requests[0].url, prepare.apiUrl);
  assert.equal(f.requests[0].init.credentials, 'omit');
  assert.equal(f.requests[0].init.redirect, 'error');
  const status = await f.send({ type: 'FLIPBASE_KLEINANZEIGEN_STATUS', requestId: 'status-1' });
  assert.equal(status.result.connectionId, '12');
  assert.ok(!JSON.stringify(status).includes(f.stored.kleinanzeigen_local_installation.secret));
});

test('reads the official quota for the exact local scope without exposing installation credentials', async () => {
  const f = fixture();
  const workspaceId = prepare.workspaceId;
  const observedAt = new Date().toISOString();
  const binding = {
    workspaceId,
    connectionId: '12',
    externalAccountId: '123',
    generation: 1,
    accountType: 'private',
    canPublish: true,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  f.stored.kleinanzeigen_local_installation = {
    phase: 'connected',
    appOrigin: 'https://app.flipbase.de',
    apiUrl: prepare.apiUrl,
    secret: 'a'.repeat(64),
    binding,
  };
  f.quota = {
    externalAccountId: '123',
    accountType: 'private',
    used: 99,
    observedAt,
    source: 'account_settings',
  };
  f.session = {
    workspaceId,
    connectionId: '12',
    externalAccountId: '123',
    generation: 1,
    canPublish: true,
    expiresAt: binding.expiresAt,
    quota: { used: 99, observedAt, reserved: 0, allowed: true, reason: null },
  };
  const result = await f.send({
    type: 'FLIPBASE_KLEINANZEIGEN_QUOTA',
    requestId: 'quota-1',
    workspaceId,
    connectionId: '12',
    generation: 1,
  });
  assert.equal(result.success, true);
  assert.equal(result.result.quota.used, 99);
  assert.ok(!JSON.stringify(result).includes('a'.repeat(64)));
  const body = JSON.parse(f.requests.at(-1).init.body);
  assert.equal(body.action, 'quota_observation');
  assert.equal(body.jobId, null);
  assert.equal(body.quota.used, 99);
  f.identity = { externalAccountId: '124', displayName: 'Anderes Konto', accountType: 'private' };
  const count = f.requests.length;
  const mismatch = await f.send({
    type: 'FLIPBASE_KLEINANZEIGEN_QUOTA',
    requestId: 'quota-2',
    workspaceId,
    connectionId: '12',
    generation: 1,
  });
  assert.equal(mismatch.success, false);
  assert.equal(f.requests.length, count);
});

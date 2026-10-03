import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const core = require('../tools/flipbase-extension/vinted-local-core.js');
const appOrigin = 'https://app.flipbase.de';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const anotherId = '33333333-3333-4333-8333-333333333333';
const tokenHash = 'b'.repeat(64);
const secret = 'a'.repeat(64);
const identity = { id: '123', username: 'maike' };
const observedAt = '2026-10-04T10:00:00.000Z';
const expiresAt = '2026-10-05T10:00:00.000Z';
const profile = {
  user: { id: 123, login: 'maike', city: 'Berlin', about: 'Beschreibung', item_count: 1 },
};
const item = {
  id: 456,
  user_id: 123,
  title: 'Jacke',
  price: { amount: '12.00', currency_code: 'EUR' },
  view_count: 4,
  favourite_count: 2,
};
const scope = { workspaceId, connectionId };
const payload = {
  ...scope,
  externalAccountId: '123',
  apiUrl: 'https://api.flipbase.de/functions/v1/marketplace-local-extension',
  expiresAt,
  tokenHash,
};
const request = (action, body) => ({
  action,
  requestId: `request_${action}`,
  ...(body ? { payload: body } : {}),
});

function harness() {
  let saved;
  let currentIdentity = identity;
  let currentTime = Date.parse(observedAt);
  let revoked = false;
  const edgeCalls = [];
  const adapter = {
    now: () => currentTime,
    load: async () => structuredClone(saved),
    save: async (installation) => {
      saved = structuredClone(installation);
    },
    remove: async () => {
      saved = undefined;
    },
    randomSecret: () => secret,
    hash: async () => tokenHash,
    readIdentity: async () => ({ identity: currentIdentity, tabId: 12 }),
    readSnapshot: async () => ({
      tabId: 12,
      snapshot: core.parseSnapshot(currentIdentity, profile, [item], observedAt, true),
    }),
    edge: async (binding, auth, body) => {
      assert.equal(auth, secret);
      edgeCalls.push(body);
      if (revoked) throw new Error('widerrufen');
      return body.action === 'heartbeat'
        ? { ok: true, externalAccountId: '123', expiresAt }
        : { ok: true, counts: { profile: 1, publication: 1 }, observedAt };
    },
  };
  return {
    adapter,
    edgeCalls,
    runtime: core.createRuntime(adapter),
    get saved() {
      return saved;
    },
    setIdentity: (account) => {
      currentIdentity = account;
    },
    setTime: (time) => {
      currentTime = time;
    },
    revoke: () => {
      revoked = true;
    },
  };
}

test('Bridge schema accepts correlated requests and denies arbitrary hosts, URLs and payloads', () => {
  const valid = { type: 'FLIPBASE_VINTED_LOCAL_BIND', requestId: 'valid-request', payload };
  assert.equal(core.parseRequest(valid, appOrigin).action, 'BIND');
  for (const origin of [
    'https://evil.flipbase.de',
    'https://app.flipbase.de.evil.test',
    'http://app.flipbase.de',
    'null',
  ]) {
    assert.equal(core.parseRequest(valid, origin), null);
  }
  for (const apiUrl of [
    'https://evil.test/functions/v1/marketplace-local-extension',
    'https://api.flipbase.de/other',
    'https://api.flipbase.de/functions/v1/marketplace-local-extension?token=x',
    'http://127.0.0.1:54351/functions/v1/marketplace-local-extension',
  ]) {
    assert.equal(core.parseRequest({ ...valid, payload: { ...payload, apiUrl } }, appOrigin), null);
  }
  assert.equal(core.parseRequest({ ...valid, requestId: '<spoof>' }, appOrigin), null);
  assert.equal(core.parseRequest({ ...valid, payload: { ...payload, secret } }, appOrigin), null);
  assert.ok(
    core.parseRequest(
      {
        ...valid,
        payload: {
          ...payload,
          apiUrl: 'http://127.0.0.1:54351/functions/v1/marketplace-local-extension',
        },
      },
      'http://localhost:4200',
    ),
  );
});

test('Profile parser exports only selected data and rejects foreign or ambiguous publications', () => {
  const snapshot = core.parseSnapshot(
    identity,
    { user: { ...profile.user, access_token: 'private', email: 'private@example.com' } },
    [item],
    observedAt,
    true,
  );
  assert.equal(snapshot.entries[0].body.username, 'maike');
  assert.equal(snapshot.entries[1].body.price, 12);
  assert.equal(snapshot.entries[1].body.metrics.views, 4);
  assert.ok(!JSON.stringify(snapshot).includes('private'));
  assert.throws(
    () => core.parseSnapshot(identity, profile, [item, item], observedAt, true),
    /unvollständige/,
  );
  assert.throws(
    () => core.parseSnapshot(identity, profile, [{ ...item, user_id: 999 }], observedAt, true),
    /fremde/,
  );
  assert.throws(() => core.parseIdentity({ user: { id: 123, login: 'bad\nname' } }), /Anmeldung/);
});

test('Runtime snapshot conforms to the real backend parser for public profile and listing fields', async () => {
  const { parseLocalExtensionRequest } =
    await import('../supabase/functions/_shared/marketplace-local-extension-contracts.ts');
  const snapshot = core.parseSnapshot(
    identity,
    profile,
    [{ ...item, is_closed: false, is_reserved: true }],
    observedAt,
    true,
  );
  const parsed = parseLocalExtensionRequest({ action: 'import', ...scope, snapshot });
  assert.ok(parsed);
  assert.equal(parsed.snapshot.entries[0].body.observedAt, observedAt);
  assert.equal(parsed.snapshot.entries[1].body.isClosed, false);
  assert.equal(parsed.snapshot.entries[1].body.isReserved, true);
});

test('Read pipeline uses only current identity and wardrobe paths, with complete empty pagination', async () => {
  const calls = [];
  const snapshot = await core.readSnapshot(
    async (path) => {
      calls.push(path);
      return path === '/api/v2/users/current'
        ? profile
        : { items: [], pagination: { total_pages: 0 } };
    },
    '123',
    () => observedAt,
  );
  assert.equal(snapshot.publicationsComplete, true);
  assert.equal(snapshot.entries.length, 1);
  assert.deepEqual(calls, [
    '/api/v2/users/current',
    '/api/v2/users/current',
    '/api/v2/wardrobe/123/items?page=1&per_page=20',
    '/api/v2/users/current',
  ]);
});

test('Read pipeline stops on malformed page, changed owner or changed identity', async () => {
  await assert.rejects(
    () =>
      core.readSnapshot(
        async (path) => (path.includes('current') ? profile : { items: [], pagination: {} }),
        '123',
      ),
    /Seitenfolge/,
  );
  let identities = 0;
  await assert.rejects(
    () =>
      core.readSnapshot(
        async (path) =>
          path.includes('current')
            ? ++identities === 3
              ? { user: { id: 999, login: 'other' } }
              : profile
            : { items: [item], pagination: { total_pages: 1 } },
        '123',
      ),
    /gewechselt/,
  );
  await assert.rejects(
    () =>
      core.readSnapshot(
        async (path) =>
          path.includes('current')
            ? profile
            : { items: [{ ...item, user_id: 999 }], pagination: { total_pages: 1 } },
        '123',
      ),
    /fremde/,
  );
});

test('Read pipeline caps pagination and marks an explicitly partial result instead of deleting unseen data', async () => {
  const snapshot = await core.readSnapshot(
    async (path) => {
      if (path.includes('current')) return profile;
      const page = Number(new URL(`https://www.vinted.de${path}`).searchParams.get('page'));
      return { items: [{ ...item, id: 1000 + page }], pagination: { total_pages: 26 } };
    },
    '123',
    () => observedAt,
  );
  assert.equal(snapshot.publicationsComplete, false);
  assert.equal(snapshot.entries.length, 26);
});

test('Background recreation recovers its binding and never returns the secret to the website', async () => {
  const setup = harness();
  const prepared = await setup.runtime.run(request('PREPARE'), appOrigin);
  assert.deepEqual(prepared, { tokenHash, identity });
  const bound = await setup.runtime.run(request('BIND', payload), appOrigin);
  assert.deepEqual(bound, { ...scope, externalAccountId: '123', expiresAt });
  const restartedRuntime = core.createRuntime(setup.adapter);
  const synced = await restartedRuntime.run(request('SYNC', scope), appOrigin);
  assert.equal(synced.counts.publication, 1);
  assert.equal(synced.publicationsComplete, true);
  assert.ok(!JSON.stringify([prepared, bound, synced]).includes(secret));
  assert.equal(setup.saved.secret, secret);
  assert.equal(setup.saved.tabId, 12);
  assert.equal(setup.saved.leaseUntil, undefined);
  assert.deepEqual(
    setup.edgeCalls.map((call) => call.action),
    ['heartbeat', 'heartbeat', 'heartbeat', 'import'],
  );
});

test('Wrong workspace, expired binding and revoked heartbeat prevent import', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  await assert.rejects(
    () => setup.runtime.run(request('SYNC', { workspaceId: anotherId, connectionId }), appOrigin),
    /Arbeitsplatz/,
  );
  setup.setTime(Date.parse(expiresAt) + 1);
  await assert.rejects(() => setup.runtime.run(request('SYNC', scope), appOrigin), /abgelaufen/);
  setup.setTime(Date.parse(observedAt));
  setup.revoke();
  await assert.rejects(() => setup.runtime.run(request('SYNC', scope), appOrigin), /widerrufen/);
  assert.ok(!setup.edgeCalls.some((call) => call.action === 'import'));
});

test('Active binding is preserved during prepare, rejects other accounts and disconnect deletes credentials', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  await assert.rejects(
    () => setup.runtime.run(request('BIND', { ...payload, connectionId: anotherId }), appOrigin),
    /bereits/,
  );
  await setup.runtime.run(request('PREPARE'), appOrigin);
  assert.equal(setup.saved.binding.connectionId, connectionId);
  setup.setIdentity({ id: '999', username: 'other' });
  await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin), /anderes/);
  await assert.rejects(() => setup.runtime.run(request('SYNC', scope), appOrigin), /gewechselt/);
  await assert.rejects(
    () =>
      setup.runtime.run(request('DISCONNECT', { workspaceId: anotherId, connectionId }), appOrigin),
    /Browserprofil/,
  );
  assert.deepEqual(await setup.runtime.run(request('DISCONNECT', scope), appOrigin), {
    disconnected: true,
  });
  assert.equal(setup.saved, undefined);
});

test('Concurrent requests and persisted lease after a terminated background do not overlap reads', async () => {
  const setup = harness();
  await setup.adapter.save({ leaseUntil: Date.parse(observedAt) + 30_000 });
  await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin), /noch ausgeführt/);
  assert.equal(setup.saved.leaseUntil, Date.parse(observedAt) + 30_000);
  setup.setTime(Date.parse(observedAt) + 31_000);
  let finish;
  setup.adapter.readIdentity = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = setup.runtime.run(request('PREPARE'), appOrigin);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin), /läuft bereits/);
  finish({ identity, tabId: 12 });
  await pending;
});

test('A failed bind preserves a retryable pending scope and disconnect removes its secret', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  setup.adapter.edge = async () => {
    throw new Error('Netzwerkfehler');
  };
  await assert.rejects(
    () => setup.runtime.run(request('BIND', payload), appOrigin),
    /Netzwerkfehler/,
  );
  assert.equal(setup.saved.binding, undefined);
  assert.equal(setup.saved.pendingScope.connectionId, connectionId);
  await assert.rejects(
    () => setup.runtime.run(request('BIND', { ...payload, connectionId: anotherId }), appOrigin),
    /bereits/,
  );
  await assert.rejects(
    () => setup.runtime.run(request('DISCONNECT', scope), 'http://localhost:4200'),
    /Browserprofil/,
  );
  assert.deepEqual(await setup.runtime.run(request('DISCONNECT', scope), appOrigin), {
    disconnected: true,
  });
  assert.equal(setup.saved, undefined);
});

test('A definitively deleted or revoked binding can prepare a fresh installation for a new connection', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  setup.adapter.edge = async () => {
    throw new core.LocalBindingInvalidError();
  };
  const freshSecret = 'c'.repeat(64);
  const freshHash = 'd'.repeat(64);
  setup.adapter.randomSecret = () => freshSecret;
  setup.adapter.hash = async () => freshHash;
  const prepared = await setup.runtime.run(request('PREPARE'), appOrigin);
  assert.equal(prepared.tokenHash, freshHash);
  assert.equal(setup.saved.secret, freshSecret);
  assert.equal(setup.saved.binding, undefined);
  assert.equal(setup.saved.pendingScope, undefined);
  setup.adapter.edge = async (binding, authorization) => {
    assert.equal(authorization, freshSecret);
    return { ok: true, externalAccountId: '123', expiresAt };
  };
  const newPayload = { ...payload, connectionId: anotherId, tokenHash: freshHash };
  const bound = await setup.runtime.run(request('BIND', newPayload), appOrigin);
  assert.equal(bound.connectionId, anotherId);
  assert.ok(!JSON.stringify([prepared, bound]).includes(freshSecret));
});

test('Prepare preserves the existing secret and binding after transient or ambiguous server failure', async () => {
  for (const failure of ['network', 'timeout', '503', 'malformed']) {
    const setup = harness();
    await setup.runtime.run(request('PREPARE'), appOrigin);
    await setup.runtime.run(request('BIND', payload), appOrigin);
    setup.adapter.edge = async () => {
      if (failure === 'malformed') return { ok: true, externalAccountId: '999', expiresAt };
      throw new Error(failure);
    };
    await assert.rejects(() => setup.runtime.run(request('PREPARE'), appOrigin));
    assert.equal(setup.saved.secret, secret);
    assert.equal(setup.saved.tokenHash, tokenHash);
    assert.equal(setup.saved.binding.connectionId, connectionId);
  }
});

test('Definitive invalidation erases the stale secret even when the next manual login is pending', async () => {
  const setup = harness();
  await setup.runtime.run(request('PREPARE'), appOrigin);
  await setup.runtime.run(request('BIND', payload), appOrigin);
  setup.adapter.edge = async () => {
    throw new core.LocalBindingInvalidError();
  };
  setup.adapter.readIdentity = async () => {
    throw new Error('Anmeldung erforderlich');
  };
  await assert.rejects(
    () => setup.runtime.run(request('PREPARE'), appOrigin),
    /Anmeldung erforderlich/,
  );
  assert.equal(setup.saved.secret, undefined);
  assert.equal(setup.saved.tokenHash, undefined);
  assert.equal(setup.saved.binding, undefined);
  assert.equal(setup.saved.identity, undefined);
});

test('CAPTCHA, SMS, login and block states are distinct and never ready', () => {
  const states = [
    [{ text: 'Deine Sitzung wurde blockiert' }, 'session_blocked'],
    [{ hasChallenge: true }, 'interaction_required'],
    [{ pathname: '/member/login/2fa' }, 'verification_required'],
    [{ hasPassword: true }, 'login_required'],
  ];
  for (const [page, state] of states) {
    assert.equal(core.detectPageState(page), state);
    assert.throws(() => core.assertPageReady(state));
  }
  assert.equal(core.detectPageState({ text: 'Meine Garderobe' }), 'ready');
});

test('Website bridge checks source and origin, preserves request correlation and ignores replay', () => {
  const listeners = new Map();
  const sent = [];
  const replies = [];
  const fakeWindow = {
    location: { origin: appOrigin },
    postMessage: (reply, origin) => replies.push({ reply, origin }),
    dispatchEvent() {},
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  fakeWindow.top = fakeWindow;
  const context = vm.createContext({
    window: fakeWindow,
    globalThis: { FlipbaseVintedLocal: core },
    document: { documentElement: { dataset: {} }, readyState: 'complete' },
    CustomEvent: class {},
    setInterval() {},
    chrome: {
      runtime: {
        sendMessage: (message, callback) => {
          sent.push(message);
          callback({ success: true, result: { tokenHash, identity } });
        },
      },
    },
  });
  vm.runInContext(
    readFileSync(
      new URL('../tools/flipbase-extension/flipbase-bridge.js', import.meta.url),
      'utf8',
    ),
    context,
  );
  const message = { type: 'FLIPBASE_VINTED_LOCAL_PREPARE', requestId: 'prepare-1' };
  const dispatch = listeners.get('message');
  dispatch({ source: {}, origin: appOrigin, data: message });
  dispatch({ source: fakeWindow, origin: 'https://evil.test', data: message });
  assert.equal(sent.length, 0);
  dispatch({ source: fakeWindow, origin: appOrigin, data: message });
  dispatch({ source: fakeWindow, origin: appOrigin, data: message });
  assert.equal(sent.length, 1);
  assert.equal(replies.at(-1).reply.requestId, 'prepare-1');
  assert.equal(replies.at(-1).origin, appOrigin);
  assert.ok(!JSON.stringify(replies).includes(secret));
});

test('Content script renders a reserved tab and only GETs identity with no cookies exported', async () => {
  const dom = new JSDOM('<!doctype html><body><main>Garderobe</main></body>', {
    url: 'https://www.vinted.de/',
  });
  dom.window.Range.prototype.getClientRects = () => [];
  let listener;
  const calls = [];
  const chrome = {
    runtime: {
      id: 'extension',
      onMessage: {
        addListener: (callback) => {
          listener = callback;
        },
      },
      sendMessage: (message) => calls.push(message),
    },
  };
  dom.window.FlipbaseVintedLocal = core;
  dom.window.chrome = chrome;
  dom.window.AbortSignal = AbortSignal;
  dom.window.fetch = async (path, options) => {
    calls.push({ path, options });
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'include');
    return {
      status: 200,
      ok: true,
      url: 'https://www.vinted.de/api/v2/users/current',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => profile,
    };
  };
  dom.window.eval = undefined;
  const context = vm.createContext({
    globalThis: dom.window,
    window: dom.window,
    location: dom.window.location,
    document: dom.window.document,
    chrome,
    URL,
    AbortSignal,
    fetch: dom.window.fetch,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    Date,
    Error,
    Number,
  });
  vm.runInContext(
    readFileSync(
      new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
      'utf8',
    ),
    context,
  );
  const response = await new Promise((resolve) =>
    listener({ type: 'VINTED_LOCAL_IDENTITY', timeoutMs: 1000 }, { id: 'extension' }, resolve),
  );
  assert.equal(response.success, true);
  assert.equal(response.result.identity.id, '123');
  assert.equal(
    dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.busy,
    'false',
  );
  dom.window.document.querySelector('button').click();
  assert.equal(calls.at(-1).type, 'VINTED_LOCAL_OPEN_USER_TAB');
  dom.window.close();
});

test('Manifest narrows application and provider access without changing Kleinanzeigen autofill scripts', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../tools/flipbase-extension/manifest.json', import.meta.url), 'utf8'),
  );
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));
  assert.ok(!manifest.content_scripts.some((script) => script.matches.includes('<all_urls>')));
  assert.ok(
    manifest.content_scripts.some(
      (script) =>
        script.js.includes('kleinanzeigen-autofill.js') && script.js.includes('autofill-core.js'),
    ),
  );
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
});

test('Content script ignores transparent and off-screen CAPTCHA frames and pauses for a visible challenge', async () => {
  const cases = [
    {
      markup: '<iframe style="opacity:0" src="https://captcha-delivery.com/captcha/"></iframe>',
      rectangle: { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 },
      expectedReady: true,
    },
    {
      markup:
        '<div style="opacity:0"><iframe src="https://captcha-delivery.com/captcha/"></iframe></div>',
      rectangle: { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 },
      expectedReady: true,
    },
    {
      markup: '<iframe src="https://captcha-delivery.com/captcha/"></iframe>',
      rectangle: { left: -400, top: 20, right: -200, bottom: 120, width: 200, height: 100 },
      expectedReady: true,
    },
    {
      markup: '<iframe src="https://captcha-delivery.com/captcha/"></iframe>',
      rectangle: { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 },
      expectedReady: false,
    },
  ];
  for (const fixture of cases) {
    const dom = new JSDOM(`<!doctype html><body>${fixture.markup}</body>`, {
      url: 'https://www.vinted.de/',
    });
    dom.window.Range.prototype.getClientRects = () => [];
    dom.window.document.querySelector('iframe').getBoundingClientRect = () => fixture.rectangle;
    let listener;
    let reads = 0;
    const chrome = {
      runtime: {
        id: 'extension',
        onMessage: {
          addListener: (callback) => {
            listener = callback;
          },
        },
      },
    };
    const context = vm.createContext({
      globalThis: { FlipbaseVintedLocal: core },
      window: dom.window,
      location: dom.window.location,
      document: dom.window.document,
      chrome,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      Date,
      Number,
      Error,
      URL,
      AbortSignal,
      fetch: async () => {
        reads++;
        return {
          status: 200,
          ok: true,
          url: 'https://www.vinted.de/api/v2/users/current',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => profile,
        };
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
        'utf8',
      ),
      context,
    );
    const response = await new Promise((resolve) =>
      listener({ type: 'VINTED_LOCAL_IDENTITY' }, { id: 'extension' }, resolve),
    );
    assert.equal(response.success, fixture.expectedReady);
    assert.equal(reads, fixture.expectedReady ? 1 : 0);
    assert.equal(
      dom.window.document.querySelector('#flipbase-vinted-work-tab').dataset.busy,
      'false',
    );
    if (!fixture.expectedReady) assert.match(response.error, /manuelle Prüfung/);
    dom.window.close();
  }
});

test('Content script reads rendered messages without script translations, hidden text or its own overlay', async () => {
  const rectangle = { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 };
  const cases = [
    {
      markup:
        '<main>Vinted</main><script>{"sms":"Bestätigungscode","blocked":"Deine Sitzung wurde blockiert"}</script><style>/* Bestätigungscode */</style><noscript>Bestätigungscode</noscript><template><p>Bestätigungscode</p></template>',
      expectedReady: true,
    },
    {
      markup: '<main>Vinted<div style="display:none"><p>Bestätigungscode</p></div></main>',
      expectedReady: true,
    },
    {
      markup: '<main>Vinted<div style="opacity:0"><p>Bestätigungscode</p></div></main>',
      expectedReady: true,
    },
    { markup: '<main><p>Gib Deinen Bestätigungscode ein</p></main>', expectedReady: false },
  ];
  for (const fixture of cases) {
    const dom = new JSDOM(`<!doctype html><body>${fixture.markup}</body>`, {
      url: 'https://www.vinted.de/',
    });
    // Chromiums innerText-Verhalten bei Skripten und sichtbare Textgeometrie nachbilden.
    for (const script of dom.window.document.querySelectorAll('script')) {
      Object.defineProperty(script, 'innerText', { value: script.textContent });
    }
    for (const element of dom.window.document.querySelectorAll('*')) {
      element.getBoundingClientRect = () => rectangle;
    }
    dom.window.Range.prototype.getClientRects = () => [rectangle];
    let listener;
    let reads = 0;
    const chrome = {
      runtime: {
        id: 'extension',
        onMessage: { addListener: (callback) => (listener = callback) },
      },
    };
    const context = vm.createContext({
      globalThis: { FlipbaseVintedLocal: core },
      window: dom.window,
      location: dom.window.location,
      document: dom.window.document,
      chrome,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      Date,
      Number,
      Error,
      URL,
      AbortSignal,
      fetch: async () => {
        reads++;
        return {
          status: 200,
          ok: true,
          url: 'https://www.vinted.de/api/v2/users/current',
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => profile,
        };
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-content.js', import.meta.url),
        'utf8',
      ),
      context,
    );
    const readIdentity = () =>
      new Promise((resolve) =>
        listener({ type: 'VINTED_LOCAL_IDENTITY' }, { id: 'extension' }, resolve),
      );
    const response = await readIdentity();
    assert.equal(response.success, fixture.expectedReady);
    assert.equal(reads, fixture.expectedReady ? 1 : 0);
    if (!fixture.expectedReady) assert.match(response.error, /Bestätigungscode/);
    if (fixture.expectedReady) {
      dom.window.document.querySelector('#flipbase-vinted-work-tab p').textContent =
        'Bestätigungscode';
      assert.equal((await readIdentity()).success, true);
      assert.equal(reads, 2);
    }
    dom.window.close();
  }
});

test('Chrome background adapter recovers the reserved tab and refuses non-application senders', async () => {
  let stored = {};
  let nextTabId = 10;
  let edgeStatus = 200;
  const tabs = new Map();
  const edgeCalls = [];
  const sender = {
    id: 'extension',
    frameId: 0,
    url: `${appOrigin}/marketplaces/vinted`,
    origin: appOrigin,
    tab: { id: 4, incognito: false },
  };
  const validExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  function startBackground() {
    const listeners = [];
    const local = {
      setAccessLevel: async (options) => assert.equal(options.accessLevel, 'TRUSTED_CONTEXTS'),
      get: async (key) => ({ [key]: structuredClone(stored[key]) }),
      set: async (input) => {
        stored = { ...stored, ...structuredClone(input) };
      },
      remove: async (key) => {
        delete stored[key];
      },
    };
    const chrome = {
      storage: { local },
      runtime: {
        id: 'extension',
        onMessage: { addListener: (listener) => listeners.push(listener) },
      },
      tabs: {
        create: async ({ url }) => {
          const tab = { id: nextTabId++, url, status: 'complete', incognito: false };
          tabs.set(tab.id, tab);
          return tab;
        },
        get: async (tabId) => {
          if (!tabs.has(tabId)) throw new Error('closed');
          return tabs.get(tabId);
        },
        update: async () => {},
        sendMessage: async (tabId, message) => {
          assert.ok(tabs.has(tabId));
          assert.ok(message.timeoutMs > 0 && message.timeoutMs <= 35000);
          return {
            success: true,
            result:
              message.type === 'VINTED_LOCAL_IDENTITY'
                ? { identity }
                : {
                    snapshot: core.parseSnapshot(
                      identity,
                      profile,
                      [item],
                      new Date().toISOString(),
                      true,
                    ),
                  },
          };
        },
      },
    };
    const context = vm.createContext({
      chrome,
      globalThis: { FlipbaseVintedLocal: core },
      crypto: webcrypto,
      TextEncoder,
      URL,
      Date,
      Number,
      Error,
      JSON,
      Uint8Array,
      AbortSignal,
      setTimeout,
      clearTimeout,
      fetch: async (url, options) => {
        assert.equal(url, payload.apiUrl);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        const auth = options.headers.Authorization;
        assert.match(auth, /^Bearer [0-9a-f]{64}$/);
        const body = JSON.parse(options.body);
        edgeCalls.push(body);
        return {
          status: edgeStatus,
          ok: edgeStatus === 200,
          json: async () =>
            body.action === 'heartbeat'
              ? { ok: true, externalAccountId: '123', expiresAt: validExpires }
              : {
                  ok: true,
                  counts: { profile: 1, publication: 1 },
                  observedAt: body.snapshot.observedAt,
                },
        };
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../tools/flipbase-extension/vinted-local-background.js', import.meta.url),
        'utf8',
      ),
      context,
    );
    const listener = listeners[0];
    return {
      listener,
      call: (message, from = sender) => new Promise((resolve) => listener(message, from, resolve)),
    };
  }
  const background = startBackground();
  const prepare = { type: 'FLIPBASE_VINTED_LOCAL_PREPARE', requestId: 'prepare-tab' };
  assert.equal(
    background.listener(prepare, { ...sender, origin: 'https://evil.test' }, () => {}),
    false,
  );
  assert.equal(
    background.listener(prepare, { ...sender, frameId: 1 }, () => {}),
    false,
  );
  const prepared = await background.call(prepare);
  assert.equal(prepared.success, true);
  assert.equal(tabs.size, 1);
  const boundPayload = {
    ...payload,
    expiresAt: validExpires,
    tokenHash: prepared.result.tokenHash,
  };
  const bound = await background.call({
    type: 'FLIPBASE_VINTED_LOCAL_BIND',
    requestId: 'bind-tab',
    payload: boundPayload,
  });
  assert.equal(bound.success, true);
  const restarted = startBackground();
  const synced = await restarted.call({
    type: 'FLIPBASE_VINTED_LOCAL_SYNC',
    requestId: 'sync-tab',
    payload: scope,
  });
  assert.equal(synced.success, true);
  assert.equal(tabs.size, 1);
  const installationSecret = stored[core.storageKey].secret;
  assert.ok(!JSON.stringify([prepared, bound, synced]).includes(installationSecret));
  assert.equal(edgeCalls.at(-1).action, 'import');
  const reservedTabId = stored[core.storageKey].tabId;
  tabs.delete(reservedTabId);
  assert.equal((await restarted.call({ ...prepare, requestId: 'prepare-reopen' })).success, true);
  assert.equal(tabs.size, 1);
  assert.notEqual(stored[core.storageKey].tabId, reservedTabId);
  edgeStatus = 503;
  assert.equal((await restarted.call({ ...prepare, requestId: 'prepare-offline' })).success, false);
  assert.equal(stored[core.storageKey].secret, installationSecret);
  edgeStatus = 401;
  const freshPrepare = await restarted.call({ ...prepare, requestId: 'prepare-deleted' });
  assert.equal(freshPrepare.success, true);
  assert.notEqual(freshPrepare.result.tokenHash, prepared.result.tokenHash);
  assert.equal(stored[core.storageKey].binding, undefined);
  edgeStatus = 200;
  const freshScope = { workspaceId, connectionId: anotherId };
  const freshBind = await restarted.call({
    type: 'FLIPBASE_VINTED_LOCAL_BIND',
    requestId: 'bind-new',
    payload: { ...boundPayload, ...freshScope, tokenHash: freshPrepare.result.tokenHash },
  });
  assert.equal(freshBind.success, true);
  assert.equal(freshBind.result.connectionId, anotherId);
  assert.equal(
    (
      await restarted.call({
        type: 'FLIPBASE_VINTED_LOCAL_DISCONNECT',
        requestId: 'disconnect-tab',
        payload: freshScope,
      })
    ).success,
    true,
  );
  assert.equal(stored[core.storageKey], undefined);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const extensionId = 'a'.repeat(32);
const workspaceId = '49000000-0000-4000-8000-000000000011';
const binding = {
  workspaceId,
  connectionId: '12',
  externalAccountId: '123',
  displayName: 'Testkonto',
  accountType: 'private',
  status: 'needs_login',
  generation: 1,
  canPublish: false,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
const scope = { workspaceId, connectionId: '12', generation: 1, runId: '42' };
const identity = { externalAccountId: '123', displayName: 'Testkonto', accountType: 'private' };
const sync = { type: 'FLIPBASE_KLEINANZEIGEN_SYNC', requestId: 'sync-1', ...scope };
const sender = {
  id: extensionId,
  frameId: 0,
  url: 'https://app.flipbase.de/marketplaces/kleinanzeigen',
};
function fixture(options = {}) {
  const stored = options.stored ?? {
    kleinanzeigen_local_installation: {
      phase: 'connected',
      binding,
      identity,
      appOrigin: 'https://app.flipbase.de',
      apiUrl: 'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
      secret: 'a'.repeat(64),
    },
  };
  const calls = [];
  const tabs = new Map();
  let nextTab = 17;
  let pageNumber = 1;
  let listener;
  let alarmListener;
  let scheduledAlarm;
  let pageReads = 0;
  let listingReloads = 0;
  let providerVersion = 1;
  let visibleVersion = 1;
  let failFinish = !!options.failFinish;
  const chrome = {
    alarms: {
      get: async () => scheduledAlarm,
      create: async (name, schedule) => {
        scheduledAlarm = { name, ...schedule };
      },
      onAlarm: {
        addListener: (fn) => {
          alarmListener = fn;
        },
      },
    },
    storage: {
      local: {
        setAccessLevel: async () => {},
        get: async (key) => ({ [key]: structuredClone(stored[key]) }),
        set: async (value) => Object.assign(stored, structuredClone(value)),
      },
    },
    runtime: {
      id: extensionId,
      getURL: (path) => 'chrome-extension://' + extensionId + '/' + path,
      onMessage: {
        addListener: (fn) => {
          listener = fn;
        },
      },
    },
    windows: { onRemoved: { addListener: () => {} } },
    tabs: {
      create: async ({ url }) => {
        const tab = { id: nextTab++, url, status: 'complete' };
        tabs.set(tab.id, tab);
        return tab;
      },
      get: async (id) => {
        if (!tabs.has(id)) throw Error('closed');
        return tabs.get(id);
      },
      reload: async (id) => {
        if (tabs.get(id).url.includes('m-meine-anzeigen')) {
          pageNumber = 1;
          listingReloads++;
          visibleVersion = providerVersion;
        }
      },
      sendMessage: async (_id, message) => {
        if (message.type === 'KLEINANZEIGEN_READ_ACCOUNT')
          return {
            success: true,
            result: {
              identity: options.foreignIdentity
                ? { ...identity, externalAccountId: '999' }
                : identity,
              quota: {
                externalAccountId: '123',
                accountType: 'private',
                source: 'account_settings',
                used: 8,
                observedAt: new Date().toISOString(),
              },
            },
          };
        if (message.type === 'KLEINANZEIGEN_ADVANCE_PAGE') {
          pageNumber++;
          return { success: true, result: { moving: true } };
        }
        if (message.type === 'KLEINANZEIGEN_READ_PAGE') {
          pageReads++;
          if (options.noPageRead) assert.fail('no provider page reread after lost finish');
          return {
            success: true,
            result: {
              identity,
              items: [
                {
                  externalId: options.duplicate ? '101' : String(100 + pageNumber),
                  title: 'Anzeige ' + pageNumber + ' Version ' + visibleVersion,
                  url:
                    'https://www.kleinanzeigen.de/s-anzeige/test/' +
                    (options.duplicate ? '101' : String(100 + pageNumber)) +
                    '-160-1',
                  publishedAt: null,
                  publishedOn: options.publishedOn ?? null,
                  state: 'active',
                },
              ],
              pageCursor: 'page:' + pageNumber,
              nextCursor: options.multi && pageNumber === 1 ? 'page:2' : null,
              complete: !(options.multi && pageNumber === 1),
            },
          };
        }
        throw Error('unexpected content action');
      },
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
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      let reply;
      if (body.action === 'maintain')
        reply = {
          session: {
            workspaceId,
            connectionId: '12',
            generation: 1,
            externalAccountId: options.foreignSession ? '999' : '123',
            canPublish: false,
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          },
          run: options.fresh ? null : { ...scope, state: 'queued' },
        };
      else if (body.action === 'heartbeat')
        reply = {
          workspaceId,
          connectionId: '12',
          generation: 1,
          externalAccountId: '123',
          canPublish: false,
          expiresAt: binding.expiresAt,
        };
      else if (body.action === 'sync_claim')
        reply = {
          ...scope,
          runId: body.runId,
          claimToken: 'c'.repeat(64),
          externalAccountId: '123',
          nextCursor: 'page:1',
        };
      else if (body.action === 'sync_page')
        reply = {
          ...scope,
          runId: body.runId,
          acceptedCursor: body.pageCursor,
          nextCursor: body.nextCursor,
          complete: body.nextCursor === null,
        };
      else if (body.action === 'sync_finish') {
        if (failFinish) {
          failFinish = false;
          throw Error('network lost');
        }
        reply = {
          ...scope,
          runId: body.runId,
          state: 'confirmed',
          observedAt: new Date().toISOString(),
          itemCount: options.multi ? 2 : 1,
        };
      } else if (body.action === 'sync_fail')
        reply = { ...scope, runId: body.runId, state: 'failed', errorCode: body.errorCode };
      else throw Error('unexpected rpc');
      return new Response(JSON.stringify(reply), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  for (const file of [
    'kleinanzeigen-local-core.js',
    'kleinanzeigen-local-sync.js',
    'kleinanzeigen-local-background.js',
  ])
    vm.runInContext(readFileSync('tools/flipbase-extension/' + file, 'utf8'), context);
  return {
    alarm: async () => {
      alarmListener({ name: 'flipbase-kleinanzeigen-maintenance' });
      // Der normale Status wartet auf denselben Wartungslauf, ohne einen zweiten zu starten.
      await new Promise((resolve) =>
        listener({ type: 'FLIPBASE_KLEINANZEIGEN_STATUS', requestId: 'status' }, sender, resolve),
      );
    },
    get scheduledAlarm() {
      return scheduledAlarm;
    },
    changeProvider: () => {
      providerVersion++;
    },
    get listingReloads() {
      return listingReloads;
    },
    stored,
    calls,
    tabs,
    get pageReads() {
      return pageReads;
    },
    send: (message) =>
      new Promise((resolve, reject) => {
        if (listener(message, sender, resolve) !== true) reject(Error('message rejected'));
      }),
  };
}
test('uses the confirmed local publication day only for the exact account and keeps the provider day', async () => {
  for (const publishedOn of [null, '2026-10-30']) {
    const f = fixture({ publishedOn });
    const key = JSON.stringify(['https://app.flipbase.de', workspaceId, '12', '123', '101']);
    f.stored.kleinanzeigen_publication_days = {
      [key]: '2026-11-02',
      [JSON.stringify(['https://app.flipbase.de', workspaceId, '12', 'other', '102'])]:
        '2026-11-01',
    };
    assert.equal((await f.send(sync)).success, true);
    const page = f.calls.find((call) => call.action === 'sync_page');
    assert.equal(page.items[0].publishedOn, publishedOn ?? '2026-11-02');
  }
});

test('renews the same installation and synchronizes automatically without pairing or a visible tab', async () => {
  const f = fixture();
  await f.alarm();
  assert.equal(f.scheduledAlarm.periodInMinutes, 15);
  assert.equal(f.calls[0].action, 'maintain');
  assert.ok(
    Date.parse(f.stored.kleinanzeigen_local_installation.binding.expiresAt) >
      Date.now() + 29 * 86400000,
  );
  assert.equal(f.stored.kleinanzeigen_local_installation.binding.generation, 1);
  assert.equal(f.calls.filter((call) => call.action === 'sync_finish').length, 1);
  assert.equal(f.pageReads, 1);
});

test('renews a fresh connection without reading listings again', async () => {
  const f = fixture({ fresh: true });
  await f.alarm();
  assert.deepEqual(
    f.calls.map((call) => call.action),
    ['maintain'],
  );
  assert.equal(f.pageReads, 0);
});

for (const options of [{ foreignIdentity: true }, { foreignSession: true }])
  test(
    'stops automatic maintenance for a changed identity: ' + JSON.stringify(options),
    async () => {
      const f = fixture(options);
      await f.alarm();
      assert.equal(f.pageReads, 0);
      assert.equal(
        f.calls.some((call) => call.action === 'sync_claim'),
        false,
      );
      assert.equal(
        f.stored.kleinanzeigen_maintenance_status.errorCode,
        options.foreignIdentity ? 'account_changed' : 'access_revoked',
      );
    },
  );
test('runs the bound full snapshot through actual background adapters and returns no local secrets', async () => {
  const f = fixture();
  const response = await f.send(sync);
  assert.equal(response.success, true);
  assert.equal(response.result.state, 'confirmed');
  assert.equal(f.calls.at(-1).action, 'sync_finish');
  assert.equal(f.calls.at(-1).quota.used, 8);
  assert.ok(!JSON.stringify(response).includes('a'.repeat(64)));
  assert.ok(!JSON.stringify(response).includes('c'.repeat(64)));
  assert.equal(f.stored.vinted_local_installation, undefined);
  assert.equal(f.tabs.size, 1);
  assert.ok([...f.tabs.values()].every((tab) => !tab.url.includes('m-einstellungen')));
});
test('a multi-page read uses the observed navigation and imports each page only once', async () => {
  const f = fixture({ multi: true });
  const response = await f.send(sync);
  assert.equal(response.success, true);
  assert.deepEqual(
    f.calls.filter((body) => body.action === 'sync_page').map((body) => body.pageCursor),
    ['page:1', 'page:2'],
  );
});
test('another account or generation cannot use this browser installation', async () => {
  for (const change of [
    { connectionId: '13' },
    { generation: 2 },
    { workspaceId: '49000000-0000-4000-8000-000000000012' },
  ]) {
    const f = fixture();
    const response = await f.send({ ...sync, ...change });
    assert.equal(response.success, false);
    assert.equal(f.calls.length, 0);
    assert.equal(f.tabs.size, 0);
  }
});
test('a duplicate page entry fails the run without confirming any partial snapshot', async () => {
  const f = fixture({ multi: true, duplicate: true });
  const response = await f.send(sync);
  assert.equal(response.success, false);
  assert.equal(
    f.calls.some((body) => body.action === 'sync_finish'),
    false,
  );
  assert.equal(f.calls.at(-1).action, 'sync_fail');
});
test('a fresh background worker resumes a lost finish using its persistent checkpoint', async () => {
  const first = fixture({ failFinish: true });
  assert.equal((await first.send(sync)).success, false);
  assert.equal(first.stored.kleinanzeigen_sync_progress.phase, 'finishing');
  const next = fixture({ stored: first.stored, noPageRead: true });
  assert.equal((await next.send({ ...sync, requestId: 'sync-2' })).success, true);
  assert.equal(
    next.calls.some((body) => body.action === 'sync_claim' || body.action === 'sync_page'),
    false,
  );
});

test('a distinct new single-page sync reloads the provider tab and sees changed listings', async () => {
  const f = fixture();
  assert.equal((await f.send(sync)).success, true);
  f.changeProvider();
  assert.equal((await f.send({ ...sync, runId: '43', requestId: 'sync-next' })).success, true);
  assert.equal(f.listingReloads, 2);
  assert.equal(
    f.calls.filter((body) => body.action === 'sync_page').at(-1).items[0].title,
    'Anzeige 1 Version 2',
  );
});

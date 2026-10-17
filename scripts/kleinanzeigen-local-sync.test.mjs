import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context = vm.createContext({ Date, Error, JSON, Set, Number });
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-local-sync.js', 'utf8'),
  context,
);
const runtime = context.FlipbaseKleinanzeigenSync;
const scope = {
  workspaceId: '49000000-0000-4000-8000-000000000011',
  connectionId: '12',
  generation: 1,
  runId: '42',
};
const identity = { externalAccountId: '123', displayName: 'Testkonto', accountType: 'private' };
const publication = {
  externalId: '101',
  title: 'Anzeige',
  url: 'https://www.kleinanzeigen.de/s-anzeige/test/101-160-1',
  publishedAt: null,
  state: 'active',
};
function fixture() {
  let progress = null;
  const calls = [];
  let currentIdentity = identity;
  let interrupted = false;
  let failFinish = false;
  const pages = new Map([
    [
      'page:1',
      { identity, items: [publication], pageCursor: 'page:1', nextCursor: null, complete: true },
    ],
  ]);
  const adapter = {
    now: () => Date.now(),
    loadProgress: async () => progress,
    saveProgress: async (value) => {
      progress = structuredClone(value);
    },
    readAccount: async () => ({ identity: currentIdentity, quota: null }),
    readPage: async (cursor) => {
      if (interrupted) throw Object.assign(new Error('interrupted'), { code: 'interrupted' });
      return pages.get(cursor);
    },
    rpc: async (body) => {
      calls.push(structuredClone(body));
      if (body.action === 'heartbeat')
        return {
          ...scope,
          externalAccountId: '123',
          canPublish: false,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        };
      if (body.action === 'sync_claim')
        return {
          ...scope,
          claimToken: 'c'.repeat(64),
          externalAccountId: '123',
          nextCursor: 'page:1',
        };
      if (body.action === 'sync_page')
        return {
          ...scope,
          acceptedCursor: body.pageCursor,
          nextCursor: body.nextCursor,
          complete: body.nextCursor === null,
        };
      if (body.action === 'sync_finish') {
        if (failFinish) {
          failFinish = false;
          throw Error('network lost');
        }
        return { ...scope, state: 'confirmed', observedAt: '2026-10-16T06:00:00Z', itemCount: 1 };
      }
      if (body.action === 'sync_fail')
        return { ...scope, state: 'failed', errorCode: body.errorCode };
      throw Error('unexpected');
    },
  };
  return {
    adapter,
    calls,
    pages,
    installation: {
      phase: 'connected',
      binding: {
        ...scope,
        externalAccountId: '123',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    },
    get progress() {
      return progress;
    },
    set progress(value) {
      progress = value;
    },
    set identity(value) {
      currentIdentity = value;
    },
    set interrupted(value) {
      interrupted = value;
    },
    set failFinish(value) {
      failFinish = value;
    },
  };
}
test('reads and confirms a bound account without exposing claim tokens or provider credentials', async () => {
  const f = fixture();
  const result = await runtime.run(f.installation, '42', f.adapter);
  assert.equal(result.state, 'confirmed');
  assert.equal(result.itemCount, 1);
  assert.equal(f.calls.filter((call) => call.action === 'sync_page').length, 1);
  assert.equal(f.calls.at(-1).action, 'sync_finish');
  assert.ok(!JSON.stringify(result).includes('c'.repeat(64)));
});
test('a partial multi-page read fails its run and never finishes a partial snapshot', async () => {
  const f = fixture();
  f.pages.set('page:1', {
    identity,
    items: [publication],
    pageCursor: 'page:1',
    nextCursor: 'page:2',
    complete: false,
  });
  f.pages.set('page:2', null);
  await assert.rejects(runtime.run(f.installation, '42', f.adapter));
  assert.equal(
    f.calls.some((call) => call.action === 'sync_finish'),
    false,
  );
  assert.equal(f.calls.at(-1).action, 'sync_fail');
});
test('account changes and repeated provider IDs stop before importing another page', async () => {
  for (const page of [
    {
      identity: { ...identity, externalAccountId: '124' },
      items: [],
      pageCursor: 'page:2',
      nextCursor: null,
      complete: true,
    },
    { identity, items: [publication], pageCursor: 'page:2', nextCursor: null, complete: true },
  ]) {
    const f = fixture();
    f.pages.set('page:1', {
      identity,
      items: [publication],
      pageCursor: 'page:1',
      nextCursor: 'page:2',
      complete: false,
    });
    f.pages.set('page:2', page);
    await assert.rejects(runtime.run(f.installation, '42', f.adapter));
    assert.equal(f.calls.filter((call) => call.action === 'sync_page').length, 1);
    assert.equal(
      f.calls.some((call) => call.action === 'sync_finish'),
      false,
    );
  }
});
test('unknown pagination does not become a confirmed empty account', async () => {
  for (const page of [
    { identity, items: [], pageCursor: 'page:1', nextCursor: 'page:1', complete: false },
    { identity, items: [], pageCursor: 'page:1', nextCursor: null, complete: false },
    null,
  ]) {
    const f = fixture();
    f.pages.set('page:1', page);
    await assert.rejects(runtime.run(f.installation, '42', f.adapter));
    assert.equal(
      f.calls.some((call) => call.action === 'sync_finish'),
      false,
    );
  }
});
test('the final settings read checks identity again before committing the snapshot', async () => {
  const f = fixture();
  let reads = 0;
  f.adapter.readAccount = async () => ({
    identity: ++reads === 1 ? identity : { ...identity, externalAccountId: '124' },
    quota: null,
  });
  await assert.rejects(runtime.run(f.installation, '42', f.adapter));
  assert.equal(
    f.calls.some((call) => call.action === 'sync_finish'),
    false,
  );
});
test('after a lost finish reply a worker restart resends finish without claiming or reading again', async () => {
  const f = fixture();
  f.failFinish = true;
  await assert.rejects(runtime.run(f.installation, '42', f.adapter));
  assert.equal(f.progress.phase, 'finishing');
  f.calls.length = 0;
  f.adapter.readPage = async () => assert.fail('no second provider import');
  const result = await runtime.run(f.installation, '42', f.adapter);
  assert.equal(result.state, 'confirmed');
  assert.equal(
    f.calls.some((call) => call.action === 'sync_claim' || call.action === 'sync_page'),
    false,
  );
  assert.equal(f.calls.filter((call) => call.action === 'sync_finish').length, 1);
});
test('an acknowledged page is retained before sending so a restart can replay its exact contents', async () => {
  const f = fixture();
  const original = f.adapter.rpc;
  let lost = true;
  f.adapter.rpc = async (body) => {
    if (body.action === 'sync_page' && lost) {
      lost = false;
      throw Error('network lost');
    }
    return original(body);
  };
  await assert.rejects(runtime.run(f.installation, '42', f.adapter));
  assert.equal(f.progress.phase, 'reading');
  assert.equal(f.progress.pendingPage.items[0].externalId, '101');
  f.adapter.readPage = async () => assert.fail('use persisted page');
  const result = await runtime.run(f.installation, '42', f.adapter);
  assert.equal(result.state, 'confirmed');
});
test('expired local bindings cannot initiate a new read', async () => {
  const f = fixture();
  f.installation.binding.expiresAt = '2020-01-01T00:00:00Z';
  await assert.rejects(runtime.run(f.installation, '42', f.adapter));
  assert.equal(f.calls.length, 0);
});

test('resume refreshes an old quota observation without reimporting provider pages', async () => {
  const f = fixture();
  f.progress = {
    ...scope,
    externalAccountId: '123',
    claimToken: 'c'.repeat(64),
    phase: 'finishing',
    seenIds: ['101'],
    quota: {
      externalAccountId: '123',
      accountType: 'private',
      source: 'account_settings',
      used: 8,
      observedAt: '2020-01-01T00:00:00Z',
    },
  };
  const quota = {
    externalAccountId: '123',
    accountType: 'private',
    source: 'account_settings',
    used: 9,
    observedAt: new Date().toISOString(),
  };
  f.adapter.readAccount = async () => ({ identity, quota });
  await runtime.run(f.installation, '42', f.adapter);
  assert.equal(
    f.calls.find((call) => call.action === 'sync_finish').quota.observedAt,
    quota.observedAt,
  );
});
test('cached success replies never expose extra persisted fields', async () => {
  const f = fixture();
  f.progress = {
    ...scope,
    externalAccountId: '123',
    phase: 'confirmed',
    result: {
      ...scope,
      state: 'confirmed',
      observedAt: '2026-10-16T06:00:00Z',
      itemCount: 1,
      secret: 'never-return',
    },
  };
  const result = await runtime.run(f.installation, '42', f.adapter);
  assert.equal(JSON.stringify(result).includes('never-return'), false);
});

test('preserves verified listing display fields in the stored sync page', async () => {
  const f = fixture();
  f.pages.get('page:1').items = [
    {
      ...publication,
      priceCents: 1500,
      currency: 'EUR',
      imageUrl: 'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/test?rule=$_2.JPG',
      publishedOn: '2026-08-21',
    },
  ];
  await runtime.run(f.installation, '42', f.adapter);
  const item = f.calls.find((call) => call.action === 'sync_page').items[0];
  assert.equal(item.priceCents, 1500);
  assert.equal(item.currency, 'EUR');
  assert.equal(item.publishedOn, '2026-08-21');
  assert.equal(
    item.imageUrl,
    'https://img.kleinanzeigen.de/api/v1/prod-ads/images/aa/test?rule=$_2.JPG',
  );
});

test('invalid display fields stop before any page import', async () => {
  for (const change of [
    { priceCents: -1, currency: 'EUR' },
    { priceCents: 1.5, currency: 'EUR' },
    { imageUrl: 'https://foreign.example/a.jpg' },
    { publishedOn: '2026-02-31' },
  ]) {
    const f = fixture();
    f.pages.get('page:1').items = [{ ...publication, ...change }];
    await assert.rejects(runtime.run(f.installation, '42', f.adapter));
    assert.equal(
      f.calls.some((call) => call.action === 'sync_page'),
      false,
    );
  }
});

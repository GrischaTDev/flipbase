import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({ URL, setInterval, clearInterval });
for (const file of [
  'kleinanzeigen-publication-policy',
  'kleinanzeigen-listing-runtime',
  'kleinanzeigen-publication-jobs',
])
  vm.runInContext(readFileSync('tools/flipbase-extension/' + file + '.js', 'utf8'), context);
const scope = {
  workspaceId: '51000000-0000-4000-8000-000000000011',
  connectionId: '9',
  generation: 2,
};
const request = { ...scope, jobId: '12', mode: 'publish' };
const installation = {
  phase: 'connected',
  secret: 'a'.repeat(64),
  appOrigin: 'https://app.flipbase.de',
  binding: {
    ...scope,
    externalAccountId: '88',
    accountType: 'private',
    canPublish: true,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  },
};
function fixture() {
  let stored = null;
  let serverState = 'claimed';
  const calls = [];
  const job = {
    id: '12',
    workspaceId: scope.workspaceId,
    connectionId: '9',
    grantGeneration: 2,
    draftId: '51000000-0000-4000-8000-000000000041',
    draftRevision: 4,
    state: 'claimed',
    version: 1,
    claimToken: 'b'.repeat(64),
    immutableSnapshot: {
      externalAccountId: '88',
      content: { title: 'Jacke', categoryId: '153/160/shirts', schemaRevision: 'c'.repeat(64) },
      images: [],
    },
  };
  const adapter = {
    now: () => Date.now(),
    secret: () => 'b'.repeat(64),
    uuid: () => crypto.randomUUID(),
    loadInstallation: async () => installation,
    loadProgress: async () => stored,
    saveProgress: async (value) => {
      stored = JSON.parse(JSON.stringify(value));
      calls.push('save:' + value.phase);
    },
    quota: async () => ({
      externalAccountId: '88',
      generation: 2,
      canPublish: true,
      quota: {
        used: 99,
        reserved: 0,
        allowed: true,
        reason: null,
        observedAt: new Date().toISOString(),
      },
    }),
    rpc: async (_installation, body) => {
      calls.push(body.action);
      if (body.action === 'job_claim') {
        assert.equal(stored.claimToken, body.claimToken);
        return { ...job, state: serverState, claimToken: body.claimToken };
      }
      if (body.action === 'job_check')
        return {
          active: true,
          generation: 2,
          version: 1,
          leaseUntil: new Date(Date.now() + 120000).toISOString(),
        };
      if (body.action === 'job_begin') {
        serverState = 'writing';
        return { authorized: true, job: { ...job, state: 'writing', version: 2 } };
      }
      if (body.action === 'job_finish') {
        serverState = body.result.outcome === 'confirmed' ? 'confirmed' : body.result.outcome;
        return { ...job, state: serverState };
      }
      throw Error('unexpected');
    },
    readIdentity: async () => ({ externalAccountId: '88', accountType: 'private' }),
    openForm: async () => ({
      tabId: 17,
      minimumDocumentTime: Date.now(),
      schemaRevision: 'c'.repeat(64),
      schema: {},
    }),
    readBaseline: async () => ['77'],
    step: async (_progress, action) => {
      calls.push(action);
      return action === 'prepare'
        ? { valid: true }
        : action === 'verify'
          ? { complete: true }
          : action === 'fee'
            ? { state: 'free', observedAt: new Date().toISOString() }
            : { clicked: true };
    },
    photo: async () => {
      throw Error('none');
    },
    readResult: async () => ({
      outcome: 'confirmed',
      externalAccountId: '88',
      externalId: '999',
      providerState: 'active',
      verifiedAt: new Date().toISOString(),
      url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2',
    }),
  };
  return {
    adapter,
    calls,
    get stored() {
      return stored;
    },
    set stored(value) {
      stored = value;
    },
    set state(value) {
      serverState = value;
    },
  };
}
test('saves the client claim token before RPC and keeps public acknowledgement separate from publication', async () => {
  const f = fixture();
  const result = await context.FlipbaseKleinanzeigenPublicationJobs.create(f.adapter).run(
    request,
    installation.appOrigin,
  );
  assert.equal(f.calls.indexOf('save:claiming') < f.calls.indexOf('job_claim'), true);
  assert.equal(f.calls.filter((value) => value === 'submit').length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ...scope, jobId: '12', handled: true });
  assert.ok(!JSON.stringify(result).includes(installation.secret));
});
test('a lost begin reply resumes by reading only, including in a fresh worker instance', async () => {
  const f = fixture();
  const rpc = f.adapter.rpc;
  let lost = true;
  f.adapter.rpc = async (...args) => {
    const result = await rpc(...args);
    if (args[1].action === 'job_begin' && lost) throw Error('network');
    return result;
  };
  await context.FlipbaseKleinanzeigenPublicationJobs.create(f.adapter).run(
    request,
    installation.appOrigin,
  );
  lost = false;
  f.state = 'outcome_unknown';
  await context.FlipbaseKleinanzeigenPublicationJobs.create(f.adapter).run(
    { ...request, mode: 'reconcile' },
    installation.appOrigin,
  );
  assert.equal(f.calls.filter((value) => value === 'submit').length, 0);
  assert.equal(f.calls.filter((value) => value === 'prepare').length, 1);
});
test('reconcile never claims a new queued publication without its original local attempt', async () => {
  const f = fixture();
  await assert.rejects(() =>
    context.FlipbaseKleinanzeigenPublicationJobs.create(f.adapter).run(
      { ...request, mode: 'reconcile' },
      installation.appOrigin,
    ),
  );
  assert.equal(f.calls.length, 0);
});
test('a schema change stops the claimed job before filling and begin', async () => {
  const f = fixture();
  f.adapter.openForm = async () => ({
    tabId: 17,
    minimumDocumentTime: Date.now(),
    schemaRevision: 'd'.repeat(64),
    schema: {},
  });
  await context.FlipbaseKleinanzeigenPublicationJobs.create(f.adapter).run(
    request,
    installation.appOrigin,
  );
  assert.ok(!f.calls.includes('prepare'));
  assert.ok(!f.calls.includes('job_begin'));
  assert.ok(f.calls.includes('job_finish'));
});

test('overlapping lease timer and publication checks share one authorization request', async () => {
  let tick;
  const isolated = vm.createContext({
    URL,
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {},
  });
  for (const name of [
    'kleinanzeigen-publication-policy',
    'kleinanzeigen-listing-runtime',
    'kleinanzeigen-publication-jobs',
  ])
    vm.runInContext(readFileSync('tools/flipbase-extension/' + name + '.js', 'utf8'), isolated);
  const f = fixture();
  const original = f.adapter.rpc;
  let release;
  let observed;
  const waiting = new Promise((resolve) => {
    observed = resolve;
  });
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let active = 0;
  let maximum = 0;
  let first = true;
  f.adapter.rpc = async (...args) => {
    if (args[1].action !== 'job_check') return original(...args);
    active++;
    maximum = Math.max(maximum, active);
    if (first) {
      first = false;
      observed();
      await blocked;
    }
    try {
      return await original(...args);
    } finally {
      active--;
    }
  };
  const running = isolated.FlipbaseKleinanzeigenPublicationJobs.create(f.adapter).run(
    request,
    installation.appOrigin,
  );
  await waiting;
  tick();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await running;
  assert.equal(maximum, 1);
  assert.equal(f.calls.filter((value) => value === 'submit').length, 1);
});

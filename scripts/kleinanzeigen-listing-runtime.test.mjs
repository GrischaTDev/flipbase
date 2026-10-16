import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context = vm.createContext({ URL });
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-publication-policy.js', 'utf8'),
  context,
);
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-listing-runtime.js', 'utf8'),
  context,
);
const runtime = context.FlipbaseKleinanzeigenListing;
const now = Date.parse('2026-10-16T06:00:30Z');
const job = {
  id: '1',
  externalAccountId: '123',
  state: 'claimed',
  claimToken: 'claim',
  grantGeneration: 1,
  draftRevision: 1,
};
function fixture() {
  const calls = [];
  let saved = null;
  const adapter = {
    now: () => now,
    loadProgress: async () => saved,
    saveProgress: async (value) => {
      calls.push('save:' + value.phase);
      saved = value;
    },
    readIdentity: async () => ({ externalAccountId: '123', accountType: 'private' }),
    checkGrant: async () => ({ active: true, generation: 1 }),
    loadCurrentSchema: async () => ({ valid: true, revision: 'v1' }),
    fill: async () => ({ valid: true }),
    verifyUploads: async () => ({ complete: true }),
    detectFee: async () => ({
      externalAccountId: '123',
      accountType: 'private',
      categoryGroup: 'consumer_goods',
      quota: {
        externalAccountId: '123',
        accountType: 'private',
        used: 99,
        source: 'account_settings',
        observedAt: '2026-10-16T06:00:00Z',
      },
      fee: { state: 'free', observedAt: '2026-10-16T06:00:29Z' },
      reserved: 0,
    }),
    begin: async () => {
      calls.push('begin');
      return { authorized: true };
    },
    submitOnce: async () => {
      calls.push('submit');
    },
    readResult: async () => ({
      outcome: 'confirmed',
      externalId: '999',
      url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2',
      externalAccountId: '123',
      providerState: 'active',
      verifiedAt: '2026-10-16T06:00:30Z',
    }),
    finish: async (value) => {
      calls.push('finish:' + value.outcome);
    },
  };
  return {
    adapter,
    calls,
    get saved() {
      return saved;
    },
    set saved(value) {
      saved = value;
    },
  };
}
test('persists begin and local writing marker before exactly one submit', async () => {
  const f = fixture();
  const result = await runtime.run(job, f.adapter);
  assert.equal(result.outcome, 'confirmed');
  assert.deepEqual(f.calls.slice(0, 3), ['begin', 'save:writing', 'submit']);
  assert.equal(f.calls.filter((c) => c === 'submit').length, 1);
});
for (const state of ['paid', 'unknown'])
  test('never clicks with ' + state + ' fee state', async () => {
    const f = fixture();
    const detect = f.adapter.detectFee;
    f.adapter.detectFee = async () => ({
      ...(await detect()),
      fee: { state, observedAt: '2026-10-16T06:00:29Z' },
    });
    assert.equal((await runtime.run(job, f.adapter)).outcome, 'needs_user_action');
    assert.ok(!f.calls.includes('begin'));
    assert.ok(!f.calls.includes('submit'));
  });
for (const step of ['readIdentity', 'checkGrant', 'loadCurrentSchema', 'fill', 'verifyUploads'])
  test('invalid ' + step + ' cannot reach submit', async () => {
    const f = fixture();
    f.adapter[step] = async () => ({});
    assert.equal((await runtime.run(job, f.adapter)).outcome, 'needs_user_action');
    assert.ok(!f.calls.includes('submit'));
  });
test('rechecks identity after filling before the durable begin', async () => {
  const f = fixture();
  let reads = 0;
  f.adapter.readIdentity = async () => ({
    externalAccountId: ++reads === 1 ? '123' : '124',
    accountType: 'private',
  });
  await runtime.run(job, f.adapter);
  assert.ok(!f.calls.includes('begin'));
  assert.ok(!f.calls.includes('submit'));
});
test('losing local persistence after begin cannot cause a click', async () => {
  const f = fixture();
  f.adapter.saveProgress = async () => {
    throw Error('disk');
  };
  assert.equal((await runtime.run(job, f.adapter)).outcome, 'outcome_unknown');
  assert.ok(!f.calls.includes('submit'));
});
test('writing after restart only reconciles and never submits', async () => {
  const f = fixture();
  f.saved = { jobId: '1', phase: 'writing' };
  assert.equal((await runtime.run({ ...job, state: 'writing' }, f.adapter)).outcome, 'confirmed');
  assert.ok(!f.calls.includes('begin'));
  assert.ok(!f.calls.includes('submit'));
});
test('unrelated progress does not authorize reconciliation of another job', async () => {
  const f = fixture();
  f.saved = { jobId: '2', phase: 'writing' };
  assert.equal((await runtime.run(job, f.adapter)).outcome, 'needs_user_action');
  assert.ok(!f.calls.includes('submit'));
});
test('lost finish response resends the same result without publishing again', async () => {
  const f = fixture();
  let fail = true;
  f.adapter.finish = async () => {
    if (fail) throw Error('network');
  };
  await runtime.run(job, f.adapter);
  fail = false;
  await runtime.run({ ...job, state: 'writing' }, f.adapter);
  assert.equal(f.calls.filter((c) => c === 'submit').length, 1);
});
test('processing is not presented as confirmed online', async () => {
  const f = fixture();
  f.adapter.readResult = async () => ({
    outcome: 'processing',
    externalId: '999',
    url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2',
    externalAccountId: '123',
    providerState: 'processing',
    verifiedAt: '2026-10-16T06:00:30Z',
  });
  assert.equal((await runtime.run(job, f.adapter)).outcome, 'processing');
});
for (const patch of [
  { externalId: null },
  { externalAccountId: '124' },
  { providerState: 'processing' },
  { verifiedAt: null },
])
  test('incomplete success proof stays unknown: ' + JSON.stringify(patch), async () => {
    const f = fixture();
    const read = f.adapter.readResult;
    f.adapter.readResult = async () => ({ ...(await read()), ...patch });
    assert.equal((await runtime.run(job, f.adapter)).outcome, 'outcome_unknown');
  });

test('requires a matching concrete target URL and preserves it for durable finish', async () => {
  const f = fixture();
  let finished;
  f.adapter.finish = async (value) => {
    finished = value;
  };
  const result = await runtime.run(job, f.adapter);
  assert.equal(result.url, 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2');
  assert.equal(finished.url, result.url);
  const g = fixture();
  const read = g.adapter.readResult;
  g.adapter.readResult = async () => ({
    ...(await read()),
    url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/998-1-2',
  });
  assert.equal((await runtime.run(job, g.adapter)).outcome, 'outcome_unknown');
});
test('persists an invalid prepared form as a stopped job instead of silently requeuing it', async () => {
  const f = fixture();
  f.adapter.fill = async () => ({ valid: false });
  await runtime.run(job, f.adapter);
  assert.ok(f.calls.includes('finish:needs_user_action'));
  assert.ok(!f.calls.includes('submit'));
});

test('a stored processing or unknown result is read again rather than replayed forever', async () => {
  for (const outcome of ['processing', 'outcome_unknown']) {
    const f = fixture();
    f.saved = {
      jobId: '1',
      phase: 'result',
      result:
        outcome === 'processing'
          ? {
              outcome,
              externalId: '999',
              externalAccountId: '123',
              providerState: 'processing',
              verifiedAt: '2026-10-16T06:00:30Z',
              url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/999-1-2',
            }
          : { outcome, errorCode: 'publication_unconfirmed' },
    };
    const result = await runtime.run({ ...job, state: 'outcome_unknown' }, f.adapter);
    assert.equal(result.outcome, 'confirmed');
    assert.ok(!f.calls.includes('submit'));
  }
});

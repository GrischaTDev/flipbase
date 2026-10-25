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
// Neu einstellen: Der Verlust eines Klickergebnisses darf weder Löschung noch Veröffentlichung wiederholen.
function relistingFixture() {
  const calls = [];
  let saved = { externalId: '12', phase: 'secured', snapshot: { title: 'Jacke' } };
  return {
    calls,
    get saved() {
      return saved;
    },
    set saved(value) {
      saved = value;
    },
    adapter: {
      load: async () => saved,
      save: async (value) => {
        calls.push('save:' + value.phase);
        saved = value;
      },
      check: async () => calls.push('check'),
      prepare: async () => {
        calls.push('prepare');
        return { complete: true };
      },
      verify: async () => ({ complete: true }),
      costs: async () => ({ allowed: true }),
      sourceUnchanged: async () => true,
      remove: async () => {
        calls.push('remove');
        return { confirmed: true };
      },
      sourceAbsent: async () => true,
      submit: async () => calls.push('submit'),
      result: async () => ({ outcome: 'confirmed', externalId: '99' }),
    },
  };
}
test('erneutes Inserieren sichert Lösch- und Schreibzustand jeweils vor dem Klick', async () => {
  const runtime = context.FlipbaseKleinanzeigenRelisting;
  assert.equal(typeof runtime?.run, 'function');
  const f = relistingFixture();
  assert.equal((await runtime.run(f.adapter)).outcome, 'confirmed');
  assert.ok(f.calls.indexOf('prepare') < f.calls.indexOf('remove'));
  assert.ok(f.calls.indexOf('save:deleting') < f.calls.indexOf('remove'));
  assert.ok(f.calls.indexOf('save:submitting') < f.calls.indexOf('submit'));
  assert.equal(f.saved.phase, 'confirmed');
});
for (const phase of ['deleting', 'submitting', 'outcome_unknown'])
  test(
    'setzt nach Abbruch in ' + phase + ' keinen zweiten Lösch- oder Schreibklick ab',
    async () => {
      const runtime = context.FlipbaseKleinanzeigenRelisting;
      assert.equal(typeof runtime?.run, 'function');
      const f = relistingFixture();
      f.saved = { ...f.saved, phase };
      await runtime.run(f.adapter);
      assert.ok(!f.calls.includes('remove'));
      assert.ok(!f.calls.includes('submit'));
    },
  );
for (const check of ['prepare', 'verify', 'costs', 'sourceUnchanged'])
  test('behält die alte Anzeige bei fehlgeschlagener Prüfung ' + check, async () => {
    const runtime = context.FlipbaseKleinanzeigenRelisting;
    assert.equal(typeof runtime?.run, 'function');
    const f = relistingFixture();
    f.adapter[check] = async () => false;
    assert.equal((await runtime.run(f.adapter)).outcome, 'needs_user_action');
    assert.ok(!f.calls.includes('remove'));
    assert.ok(!f.calls.includes('submit'));
  });
test('verlorene Löschantwort erhält gesicherte Fassung und verhindert die neue Anzeige', async () => {
  const runtime = context.FlipbaseKleinanzeigenRelisting;
  assert.equal(typeof runtime?.run, 'function');
  const f = relistingFixture();
  f.adapter.remove = async () => {
    f.calls.push('remove');
    throw new Error('lost');
  };
  await runtime.run(f.adapter);
  await runtime.run(f.adapter);
  assert.equal(f.calls.filter((value) => value === 'remove').length, 1);
  assert.ok(!f.calls.includes('submit'));
});

test('prüft die Neufassung unmittelbar vor der Löschgrenze erneut', async () => {
  const f = relistingFixture();
  let valid = true;
  f.adapter.verify = async () => ({ complete: valid });
  f.adapter.sourceUnchanged = async () => {
    valid = false;
    return true;
  };
  assert.equal(
    (await context.FlipbaseKleinanzeigenRelisting.run(f.adapter)).errorCode,
    'images_incomplete',
  );
  assert.ok(!f.calls.includes('remove'));
});
test('baut nach bestätigter Löschung einen verlorenen Zieltab aus der Sicherung neu auf', async () => {
  const f = relistingFixture();
  f.saved = { ...f.saved, phase: 'deleted' };
  assert.equal((await context.FlipbaseKleinanzeigenRelisting.run(f.adapter)).outcome, 'confirmed');
  assert.ok(f.calls.includes('prepare'));
  assert.ok(f.calls.includes('submit'));
  assert.ok(!f.calls.includes('remove'));
});
context.crypto = crypto;
context.setTimeout = setTimeout;
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-relisting-jobs.js', 'utf8'),
  context,
);
function relistingJobsFixture() {
  const calls = [];
  const records = new Map();
  let removed = false;
  let title = 'Jacke';
  let costsAllowed = true;
  const binding = {
    workspaceId: '49000000-0000-4000-8000-000000000011',
    connectionId: '9',
    generation: 2,
    externalAccountId: '88',
    canPublish: true,
    accountType: 'private',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  const request = {
    workspaceId: binding.workspaceId,
    connectionId: '9',
    generation: 2,
    externalId: '12',
    categoryPaths: { 'Mode & Beauty > Herrenbekleidung > Shirts': '153/160/shirts' },
  };
  const snapshot = () => ({
    externalId: '12',
    categoryLabel: 'Mode & Beauty > Herrenbekleidung > Shirts',
    shippingMethods: [],
    imageUrls: [],
    content: {
      title,
      description: 'Original',
      priceCents: 1200,
      priceType: 'NEGOTIABLE',
      shippingType: 'pickup',
      postalCode: '12345',
      categoryFields: {},
    },
  });
  const adapter = {
    load: async (key) => records.get(key) ?? null,
    all: async () => [...records.values()],
    save: async (value) => {
      calls.push('save:' + value.phase);
      records.set(value.key, structuredClone(value));
    },
    installation: async () => ({
      phase: 'connected',
      appOrigin: 'https://app.flipbase.de',
      binding,
    }),
    check: async () => ({ ...binding }),
    identity: async () => ({ externalAccountId: '88' }),
    source: async () => ({ snapshot: snapshot(), tabId: 1, minimumDocumentTime: Date.now() }),
    photo: async () => {
      calls.push('photo');
      throw Error('images_incomplete');
    },
    baseline: async () => (removed ? [] : ['12']),
    target: async () => ({
      tabId: 2,
      minimumDocumentTime: Date.now(),
      result: {
        schemaRevision: 'c'.repeat(64),
        schema: {
          categoryPath: '153/160/shirts',
          categoryLabel: 'Mode & Beauty > Herrenbekleidung > Shirts',
          fields: [],
          shipping: { groups: [] },
        },
      },
    }),
    step: async (_progress, action) => {
      calls.push(action);
      if (action === 'prepare') return { valid: true };
      if (action === 'verify') return { complete: true };
      if (action === 'fee') return { state: 'free', observedAt: new Date().toISOString() };
      return { clicked: true };
    },
    quota: async () => ({
      quota: { used: 8, reserved: 0, allowed: costsAllowed, observedAt: new Date().toISOString() },
    }),
    remove: async () => {
      calls.push('remove');
      removed = true;
      return { confirmed: true };
    },
    result: async () => ({
      outcome: 'confirmed',
      externalId: '99',
      url: 'https://www.kleinanzeigen.de/s-anzeige/jacke/99-1-2',
    }),
    show: async () => {},
  };
  return {
    adapter,
    calls,
    records,
    request,
    binding,
    changeTitle: (value) => (title = value),
    costs: (value) => (costsAllowed = value),
  };
}
test('erneutes Inserieren sichert die vollständige Fassung vor der ersten Löschung und bestätigt neue Kennung', async () => {
  const f = relistingJobsFixture();
  const runtime = context.FlipbaseKleinanzeigenRelistingJobs.create(f.adapter);
  const result = await runtime.run(f.request, 'https://app.flipbase.de');
  assert.equal(result.outcome, 'confirmed');
  assert.equal(result.externalId, '12');
  assert.equal(result.newExternalId, '99');
  assert.ok(f.calls.indexOf('save:secured') < f.calls.indexOf('remove'));
  assert.equal(f.calls.filter((value) => value === 'submit').length, 1);
  await runtime.run(f.request, 'https://app.flipbase.de');
  assert.equal(f.calls.filter((value) => value === 'submit').length, 1);
});
test('eine fehlgeschlagene Sicherung erhält die Altanzeige unverändert', async () => {
  const f = relistingJobsFixture();
  f.adapter.save = async () => {
    throw Error('disk_full');
  };
  await assert.rejects(
    context.FlipbaseKleinanzeigenRelistingJobs.create(f.adapter).run(
      f.request,
      'https://app.flipbase.de',
    ),
    /disk_full/u,
  );
  assert.ok(!f.calls.includes('remove'));
});
test('nach Gebührenstopp kann eine korrigierte Altanzeige mit erneuerter Freigabe neu gesichert werden', async () => {
  const f = relistingJobsFixture();
  const runtime = context.FlipbaseKleinanzeigenRelistingJobs.create(f.adapter);
  f.costs(false);
  assert.equal(
    (await runtime.run(f.request, 'https://app.flipbase.de')).errorCode,
    'fees_or_quota',
  );
  f.costs(true);
  f.changeTitle('Korrigierte Jacke');
  f.binding.generation = 3;
  f.request.generation = 3;
  assert.equal((await runtime.run(f.request, 'https://app.flipbase.de')).outcome, 'confirmed');
  assert.equal([...f.records.values()][0].snapshot.content.title, 'Korrigierte Jacke');
});
test('offene Sicherungen sind kontogebunden lesbar und verschwinden nach bestätigtem Abschluss', async () => {
  const f = relistingJobsFixture();
  const runtime = context.FlipbaseKleinanzeigenRelistingJobs.create(f.adapter);
  f.costs(false);
  await runtime.run(f.request, 'https://app.flipbase.de');
  assert.equal((await runtime.list(f.request, 'https://app.flipbase.de')).length, 1);
  await assert.rejects(
    runtime.list({ ...f.request, connectionId: '10' }, 'https://app.flipbase.de'),
    /access_revoked/u,
  );
  f.costs(true);
  await runtime.run(f.request, 'https://app.flipbase.de');
  assert.equal((await runtime.list(f.request, 'https://app.flipbase.de')).length, 0);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const context = vm.createContext({ URL });
vm.runInContext(
  readFileSync('tools/flipbase-extension/kleinanzeigen-local-core.js', 'utf8'),
  context,
);
const core = context.FlipbaseKleinanzeigenLocal;
const origin = 'https://app.flipbase.de';
const workspaceId = '49000000-0000-4000-8000-000000000011';
const prepare = {
  type: 'FLIPBASE_KLEINANZEIGEN_PREPARE_ACCOUNT',
  requestId: 'request-1',
  workspaceId,
  apiUrl: 'https://api.flipbase.de/functions/v1/kleinanzeigen-local-extension',
  canPublish: false,
};
const identity = { externalAccountId: '123', displayName: 'Testkonto', accountType: 'private' };
const binding = {
  workspaceId,
  connectionId: '12',
  ...identity,
  status: 'needs_login',
  generation: 1,
  expiresAt: '2026-10-17T06:00:00Z',
  canPublish: false,
};
function fixture() {
  let value = null;
  const writes = [];
  const adapter = {
    load: async () => value,
    save: async (v) => {
      value = v;
      writes.push(v);
    },
    readIdentity: async () => identity,
    confirm: async () => true,
    secret: () => 'ab'.repeat(32),
    uuid: () => '49000000-0000-4000-8000-000000000031',
    hash: async () => 'cd'.repeat(32),
    now: () => Date.parse('2026-10-16T06:00:00Z'),
    session: async () => ({
      workspaceId,
      connectionId: '12',
      externalAccountId: '123',
      generation: 1,
      expiresAt: binding.expiresAt,
      canPublish: false,
    }),
  };
  return {
    adapter,
    writes,
    get value() {
      return value;
    },
  };
}
test('accepts only the exact first-party origin and fixed extension endpoint', () => {
  assert.equal(core.parseRequest(prepare, origin)?.action, 'PREPARE_ACCOUNT');
  for (const bad of [
    'https://evil.example',
    'https://app.flipbase.de.evil.example',
    'https://api.flipbase.de',
  ])
    assert.equal(core.parseRequest(prepare, bad), null);
  assert.equal(
    core.parseRequest(
      { ...prepare, apiUrl: 'https://evil.example/functions/v1/kleinanzeigen-local-extension' },
      origin,
    ),
    null,
  );
  assert.equal(core.parseRequest({ ...prepare, extra: 'script' }, origin), null);
});
test('prepare keeps the raw secret private and exposes only a matching binding proposal', async () => {
  const f = fixture();
  const result = await core.createAccountRuntime(f.adapter).prepare(prepare, origin);
  assert.equal(result.externalAccountId, '123');
  assert.equal(result.tokenHash, 'cd'.repeat(32));
  assert.ok(!JSON.stringify(result).includes('ab'.repeat(32)));
  assert.equal(f.value.secret, 'ab'.repeat(32));
});
test('declined extension consent stores no installation', async () => {
  const f = fixture();
  f.adapter.confirm = async () => false;
  await assert.rejects(() => core.createAccountRuntime(f.adapter).prepare(prepare, origin));
  assert.equal(f.value, null);
});
test('a changed browser account cannot complete a prepared binding', async () => {
  const f = fixture();
  const runtime = core.createAccountRuntime(f.adapter);
  const result = await runtime.prepare(prepare, origin);
  f.adapter.readIdentity = async () => ({ ...identity, externalAccountId: '124' });
  await assert.rejects(() => runtime.connect({ nonce: result.nonce, binding }, origin));
  assert.equal(f.value.phase, 'prepared');
});
test('connect verifies backend scope before activating and status never exposes secrets', async () => {
  const f = fixture();
  const runtime = core.createAccountRuntime(f.adapter);
  const proposed = await runtime.prepare(prepare, origin);
  await runtime.connect({ nonce: proposed.nonce, binding }, origin);
  assert.equal(f.value.phase, 'connected');
  const status = await runtime.status();
  assert.equal(status.connectionId, '12');
  assert.ok(!JSON.stringify(status).includes('ab'.repeat(32)));
  assert.ok(!('tokenHash' in status));
});
test('backend scope mismatch and broader publish permission cannot activate a binding', async () => {
  for (const changed of [
    { ...binding, workspaceId: '49000000-0000-4000-8000-000000000012' },
    { ...binding, canPublish: true },
  ]) {
    const f = fixture();
    const runtime = core.createAccountRuntime(f.adapter);
    const proposed = await runtime.prepare(prepare, origin);
    await assert.rejects(() =>
      runtime.connect({ nonce: proposed.nonce, binding: changed }, origin),
    );
    assert.equal(f.value.phase, 'prepared');
  }
});
test('disconnect cannot clear another workspace binding', async () => {
  const f = fixture();
  const runtime = core.createAccountRuntime(f.adapter);
  const proposed = await runtime.prepare(prepare, origin);
  await runtime.connect({ nonce: proposed.nonce, binding }, origin);
  await assert.rejects(() =>
    runtime.disconnect({ workspaceId: '49000000-0000-4000-8000-000000000012', connectionId: '12' }),
  );
  assert.equal(f.value.phase, 'connected');
  await runtime.disconnect({ workspaceId, connectionId: '12' });
  assert.equal(f.value, null);
});

test('unprefixed messages are never treated as Kleinanzeigen commands', () =>
  assert.equal(core.parseRequest({ type: 'STATUS', requestId: 'request-1' }, origin), null));
test('an expired binding can be renewed instead of trapping an unavailable installation', async () => {
  const f = fixture();
  const runtime = core.createAccountRuntime(f.adapter);
  const proposed = await runtime.prepare(prepare, origin);
  await runtime.connect({ nonce: proposed.nonce, binding }, origin);
  f.adapter.now = () => Date.parse('2026-10-18T06:00:00Z');
  assert.equal(await runtime.status(), null);
  assert.equal((await runtime.prepare(prepare, origin)).externalAccountId, '123');
});

test('quota and publication requests carry only exact scope and an explicit resume mode', () => {
  const common = { requestId: 'job-1', workspaceId, connectionId: '12', generation: 1 };
  const quota = { ...common, type: 'FLIPBASE_KLEINANZEIGEN_QUOTA' };
  assert.equal(core.parseRequest(quota, origin)?.action, 'QUOTA');
  const publish = {
    ...common,
    type: 'FLIPBASE_KLEINANZEIGEN_PUBLISH_JOB',
    jobId: '42',
    mode: 'publish',
  };
  assert.equal(core.parseRequest(publish, origin)?.action, 'PUBLISH_JOB');
  assert.equal(core.parseRequest({ ...publish, mode: 'reconcile' }, origin)?.mode, 'reconcile');
  for (const invalid of [
    { ...publish, mode: 'retry' },
    { ...publish, secret: 'private' },
    { ...publish, jobId: '9223372036854775808' },
    { ...publish, generation: 0 },
    { ...quota, jobId: '42' },
  ])
    assert.equal(core.parseRequest(invalid, origin), null);
});

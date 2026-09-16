import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findReusableChecks } from './reuse-pr-checks.mjs';

test('nur erfolgreiche PR-Prüfungen desselben Merge-Inhalts ersetzen erneute Tests', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'flipbase-ci-reuse-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-b', 'master');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('commit', '--allow-empty', '-m', 'base');
  const beforeSha = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'feature');
  await writeFile(join(cwd, 'app.txt'), 'tested content');
  git('add', '.');
  git('commit', '-m', 'feature');
  const prHead = git('rev-parse', 'HEAD');
  git('checkout', 'master');
  git('merge', '--no-ff', 'feature', '-m', 'merge');
  const headSha = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const run = {
    id: 42,
    event: 'pull_request',
    conclusion: 'success',
    status: 'completed',
    head_sha: prHead,
    path: '.github/workflows/ci.yml',
    head_repository: { full_name: 'owner/repo' },
  };
  const artifact = { name: `verified-tree-v2-${tree}-111`, expired: false };
  const options = {
    cwd,
    eventName: 'push',
    repository: 'owner/repo',
    headSha,
    beforeSha,
    changes: { application_tests: true, supabase: true, sniper: false },
  };
  function apiFor(candidate = run, receipt = artifact) {
    return async (path) => {
      if (path.includes('/workflows/ci.yml/runs?')) {
        assert.ok(path.includes(`head_sha=${prHead}`));
        return { workflow_runs: [candidate] };
      }
      assert.equal(path, 'repos/owner/repo/actions/runs/42/artifacts?per_page=100');
      return { artifacts: [receipt] };
    };
  }
  assert.equal(await findReusableChecks({ ...options, api: apiFor() }), 42);

  for (const [label, overrides] of [
    ['anderer Inhalt', { name: `verified-tree-v2-${'0'.repeat(40)}-111` }],
    ['Datenbank nicht geprüft', { name: `verified-tree-v2-${tree}-100` }],
    ['altes Nachweisformat', { name: `verified-tree-v1-${tree}-111` }],
    ['Anwendung nicht geprüft', { name: `verified-tree-v2-${tree}-011` }],
    ['Nachweis abgelaufen', { expired: true }],
  ]) {
    await t.test(label, async () => {
      assert.equal(
        await findReusableChecks({ ...options, api: apiFor(run, { ...artifact, ...overrides }) }),
        null,
      );
    });
  }
  for (const overrides of [
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { event: 'push' },
    { head_sha: beforeSha },
    { path: '.github/workflows/other.yml' },
    { head_repository: { full_name: 'fork/repo' } },
  ]) {
    assert.equal(
      await findReusableChecks({ ...options, api: apiFor({ ...run, ...overrides }) }),
      null,
    );
  }
  const botOnly = { application_tests: false, supabase: false, sniper: true };
  const botReceipt = { name: `verified-tree-v2-${tree}-001`, expired: false };
  assert.equal(
    await findReusableChecks({ ...options, changes: botOnly, api: apiFor(run, botReceipt) }),
    42,
  );
  assert.equal(
    await findReusableChecks({
      ...options,
      changes: { ...botOnly, application_tests: true },
      api: apiFor(run, botReceipt),
    }),
    null,
  );
  const noApi = async () => assert.fail('Keine API-Abfrage ohne passenden Merge');
  for (const changes of [
    {},
    { application: true, supabase: true, sniper: true },
    { application_tests: 'false', supabase: false, sniper: true },
  ]) {
    let called = false;
    const api = async () => {
      called = true;
      return { workflow_runs: [run] };
    };
    assert.equal(await findReusableChecks({ ...options, changes, api }), null);
    assert.equal(called, false, 'Ungültiger Prüfumfang darf keine API-Abfrage auslösen');
  }

  await t.test('CLI schreibt den tatsächlichen Bot-Prüfumfang in den V2-Nachweis', async () => {
    const output = join(cwd, 'github-output.txt');
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./reuse-pr-checks.mjs', import.meta.url))],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_SHA: headSha,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: '',
          APPLICATION_CHANGED: 'true',
          APPLICATION_TESTS_CHANGED: 'false',
          SUPABASE_CHANGED: 'false',
          SNIPER_CHANGED: 'true',
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(output, 'utf8'),
      `tests_reused=false\nreceipt_name=verified-tree-v2-${tree}-001\n`,
    );
  });
  assert.equal(
    await findReusableChecks({ ...options, eventName: 'pull_request', api: noApi }),
    null,
  );
  assert.equal(await findReusableChecks({ ...options, headSha: prHead, api: noApi }), null);
  assert.equal(await findReusableChecks({ ...options, beforeSha: prHead, api: noApi }), null);
  assert.equal(
    await findReusableChecks({
      ...options,
      api: async () => {
        throw new Error('API offline');
      },
    }),
    null,
  );
});

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));

async function runFixture(failSql) {
  const temporary = await mkdtemp(join(tmpdir(), 'label-runner-test-'));
  try {
    const bin = join(temporary, 'bin');
    await mkdir(bin);
    const log = join(temporary, 'docker.jsonl');
    await writeFile(
      join(bin, 'docker'),
      `#!${process.execPath}\n
const fs = require('node:fs');
const args = process.argv.slice(2);
let calls = [];
try { calls = fs.readFileSync(process.env.LABEL_TEST_LOG, 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse); } catch {}
fs.appendFileSync(process.env.LABEL_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'run') console.log('test-container');
else if (args.includes('pg_isready')) process.exit(0);
else if (args.includes('postgres') && args.includes('--version')) console.log('postgres (PostgreSQL) 17.11');
else if (args.includes('psql')) {
  const probe = calls.find((entry) => entry.includes('pg_isready'));
  const finalServer = probe && probe.includes('--host') && probe.includes('127.0.0.1');
  if (!finalServer || process.env.LABEL_TEST_FAIL_SQL === '1') {
    console.error('FATAL: the database system is shutting down'); process.exit(2);
  }
  console.error('NOTICE:  PASS: simulated runner assertion');
}
`,
      { mode: 0o700 },
    );
    const result = spawnSync(process.execPath, [join(root, 'run-brand-label-database-tests.mjs')], {
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        LABEL_TEST_LOG: log,
        LABEL_TEST_FAIL_SQL: failSql ? '1' : '0',
      },
    });
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    return { result, calls };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test('wartet auf den finalen TCP-Server statt auf den temporären Unix-Socket', async () => {
  const { result, calls } = await runFixture(false);
  assert.equal(result.status, 0, result.stderr);
  const start = calls.find((call) => call[0] === 'run');
  assert.ok(start.includes('--network') && start.includes('none'));
  assert.ok(!start.includes('-p') && !start.includes('--publish') && !start.includes('-v'));
  const name = start[start.indexOf('--name') + 1];
  assert.match(name, /^flipbase-label-test-[0-9a-f-]+$/);
  assert.deepEqual(calls.at(-1), ['rm', '--force', name]);
});

test('meldet einen SQL-Fehler und entfernt ausschließlich den eigenen Testcontainer', async () => {
  const { result, calls } = await runFixture(true);
  assert.equal(result.status, 1);
  const start = calls.find((call) => call[0] === 'run');
  const name = start[start.indexOf('--name') + 1];
  assert.deepEqual(calls.at(-1), ['rm', '--force', name]);
  assert.equal(calls.filter((call) => call.includes('psql')).length, 1);
  assert.doesNotMatch(result.stdout, /SQL assertions passed:/);
});

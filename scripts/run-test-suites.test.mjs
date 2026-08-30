import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as runner from './run-test-suites.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fake-test-suite.mjs', import.meta.url));
const processTreeFixture = fileURLToPath(
  new URL('./fixtures/process-tree-suite.mjs', import.meta.url),
);
const fakeNpmCli = fileURLToPath(new URL('./fixtures/fake-npm-cli.mjs', import.meta.url));
const runnerScript = fileURLToPath(new URL('./run-test-suites.mjs', import.meta.url));

function capture(stream) {
  let output = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
  });
  return () => output;
}

function suite(label, delay = 350, exitCode = 0) {
  return {
    label,
    command: process.execPath,
    args: [fixture, label, String(delay), String(exitCode)],
  };
}

test('führt unabhängige Testgruppen parallel aus und beschriftet ihre Ausgaben', async () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const readStdout = capture(stdout);
  const readStderr = capture(stderr);
  const startedAt = performance.now();

  const exitCode = await runner.runSuites([suite('node'), suite('dom'), suite('angular')], {
    stdout,
    stderr,
  });

  assert.equal(exitCode, 0);
  assert.ok(performance.now() - startedAt < 900, 'die drei 350-ms-Gruppen liefen seriell');
  assert.match(readStdout(), /\[node\] node-out/);
  assert.match(readStdout(), /\[dom\] dom-done/);
  assert.match(readStdout(), /\[angular\] angular-done/);
  assert.match(readStderr(), /\[node\] node-err/);
});

test('wartet auf alle Gruppen und liefert bei einem Fehler einen Fehlercode', async () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const readStdout = capture(stdout);

  const exitCode = await runner.runSuites(
    [suite('node', 20), suite('dom', 150, 7), suite('angular', 300)],
    { stdout, stderr },
  );

  assert.equal(exitCode, 1);
  assert.match(readStdout(), /\[angular\] angular-done/);
});

test('startet npm ohne npm_execpath über die JavaScript-CLI von Node', async () => {
  assert.equal(typeof runner.resolveNpmCliPath, 'function');
  const npmCliPath = await runner.resolveNpmCliPath({
    env: { ...process.env, npm_execpath: '' },
    execPath: process.execPath,
  });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const readStdout = capture(stdout);

  const exitCode = await runner.runSuites(
    [{ label: 'npm', command: process.execPath, args: [npmCliPath, '--version'] }],
    { stdout, stderr },
  );

  assert.equal(exitCode, 0);
  assert.match(readStdout(), /\[npm\] \d+\.\d+\.\d+/);
});

test('beendet bei einem Timeout den vollständigen Prozessbaum', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flipbase-runner-timeout-'));
  const heartbeatPath = join(temporaryDirectory, 'heartbeat.txt');
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const readStderr = capture(stderr);
  const startedAt = performance.now();

  try {
    const exitCode = await runner.runSuites(
      [
        {
          label: 'timeout',
          command: process.execPath,
          args: [processTreeFixture, heartbeatPath, '1500'],
        },
      ],
      { stdout, stderr, timeoutMs: 100, terminationGraceMs: 50 },
    );

    assert.equal(exitCode, 1);
    assert.ok(performance.now() - startedAt < 1000, 'Timeout wurde nicht rechtzeitig wirksam');
    assert.match(readStderr(), /Zeitlimit von 100 ms/);
    const heartbeatAfterExit = await readFile(heartbeatPath, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeatAfterExit);
  } finally {
    await unlink(heartbeatPath).catch(() => undefined);
    await rmdir(temporaryDirectory).catch(() => undefined);
  }
});

test('reicht ein Abbruchsignal an den vollständigen Prozessbaum weiter', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flipbase-runner-signal-'));
  const heartbeatPath = join(temporaryDirectory, 'heartbeat.txt');
  const signalSource = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  try {
    const result = runner.runSuites(
      [
        {
          label: 'signal',
          command: process.execPath,
          args: [processTreeFixture, heartbeatPath, '800'],
        },
      ],
      { stdout, stderr, signalSource, terminationGraceMs: 50 },
    );
    setTimeout(() => signalSource.emit('SIGTERM'), 100);

    assert.equal(await result, 143);
    const heartbeatAfterExit = await readFile(heartbeatPath, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeatAfterExit);
  } finally {
    await unlink(heartbeatPath).catch(() => undefined);
    await rmdir(temporaryDirectory).catch(() => undefined);
  }
});

test('lehnt zusätzliche Argumente mit einer verständlichen Alternative ab', async () => {
  const child = spawn(process.execPath, [runnerScript, '--changed-files'], {
    env: { ...process.env, npm_execpath: fakeNpmCli },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const readStdout = capture(child.stdout);
  const readStderr = capture(child.stderr);
  const exitCode = await new Promise((resolve) => child.once('close', resolve));

  assert.equal(exitCode, 2);
  assert.equal(readStdout(), '');
  assert.match(readStderr(), /Zusätzliche Argumente/);
  assert.match(readStderr(), /npm run test:(node|dom|angular) --/);
});

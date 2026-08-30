import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runSuites } from './run-test-suites.mjs';

const fixture = fileURLToPath(new URL('./fixtures/fake-test-suite.mjs', import.meta.url));

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

  const exitCode = await runSuites([suite('node'), suite('dom'), suite('angular')], {
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

  const exitCode = await runSuites(
    [suite('node', 20), suite('dom', 150, 7), suite('angular', 300)],
    { stdout, stderr },
  );

  assert.equal(exitCode, 1);
  assert.match(readStdout(), /\[angular\] angular-done/);
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
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
const parallelBarrierFixture = fileURLToPath(
  new URL('./fixtures/parallel-barrier-suite.mjs', import.meta.url),
);
const fakeNpmCli = fileURLToPath(new URL('./fixtures/fake-npm-cli.mjs', import.meta.url));
const signalHarness = fileURLToPath(
  new URL('./fixtures/runner-signal-harness.mjs', import.meta.url),
);
const hangingHelper = fileURLToPath(new URL('./fixtures/hanging-helper.mjs', import.meta.url));
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

function waitForMatch(stream, pattern, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Bereitschaftsmuster nicht empfangen: ${pattern}`));
    }, timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      if (pattern.test(output)) {
        cleanup();
        resolve(output);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      stream.off('data', onData);
    };
    stream.on('data', onData);
  });
}

async function waitForFileChange(path, previousContent, timeoutMs = 750) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const content = await readFile(path, 'utf8');
    if (content !== previousContent) return content;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Heartbeat wurde innerhalb von ${timeoutMs} ms nicht fortgeführt.`);
}

test('führt unabhängige Testgruppen parallel aus und beschriftet ihre Ausgaben', async () => {
  const barrierDirectory = await mkdtemp(join(tmpdir(), 'flipbase-runner-barrier-'));
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const readStdout = capture(stdout);
  const readStderr = capture(stderr);

  try {
    const suites = ['node', 'dom', 'angular'].map((label) => ({
      label,
      command: process.execPath,
      args: [parallelBarrierFixture, barrierDirectory, label, '3'],
    }));
    const exitCode = await runner.runSuites(suites, { stdout, stderr });

    assert.equal(exitCode, 0);
    assert.deepEqual((await readdir(barrierDirectory)).sort(), [
      'angular.ready',
      'dom.ready',
      'node.ready',
    ]);
    assert.match(readStdout(), /\[node\] node-barrier-complete/);
    assert.match(readStdout(), /\[dom\] dom-barrier-complete/);
    assert.match(readStdout(), /\[angular\] angular-barrier-complete/);
    assert.equal(readStderr(), '');
  } finally {
    for (const entry of await readdir(barrierDirectory).catch(() => [])) {
      await unlink(join(barrierDirectory, entry)).catch(() => undefined);
    }
    await rmdir(barrierDirectory).catch(() => undefined);
  }
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
  const ready = waitForMatch(stdout, /tree-ready/);

  try {
    const result = runner.runSuites(
      [
        {
          label: 'timeout',
          command: process.execPath,
          args: [processTreeFixture, heartbeatPath, '5000'],
        },
      ],
      { stdout, stderr, timeoutMs: 2000, terminationGraceMs: 50 },
    );
    await ready;
    const exitCode = await result;

    assert.equal(exitCode, 1);
    assert.match(readStderr(), /Zeitlimit von 2000 ms/);
    if (process.platform === 'win32') {
      assert.doesNotMatch(readStderr(), /erzwungene Prozessbaum-Beendigung/);
    } else {
      assert.match(readStderr(), /erzwungene Prozessbaum-Beendigung/);
    }
    const heartbeatAfterExit = await readFile(heartbeatPath, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeatAfterExit);
  } finally {
    await unlink(heartbeatPath).catch(() => undefined);
    await rmdir(temporaryDirectory).catch(() => undefined);
  }
});

for (const [signal, expectedExitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  test(
    `reicht ${signal} weiter und erzwingt danach das Ende des ignorierenden Enkels`,
    { skip: process.platform === 'win32' },
    async () => {
      const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flipbase-runner-signal-'));
      const heartbeatPath = join(temporaryDirectory, 'heartbeat.txt');
      const signalSource = new EventEmitter();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const readStderr = capture(stderr);
      const ready = waitForMatch(stdout, /tree-ready/);
      const parentExited = waitForMatch(stdout, /\[signal\] beendet/);

      try {
        const result = runner.runSuites(
          [
            {
              label: 'signal',
              command: process.execPath,
              args: [processTreeFixture, heartbeatPath, '5000'],
            },
          ],
          { stdout, stderr, signalSource, terminationGraceMs: 1000 },
        );
        await ready;
        signalSource.emit(signal);
        await parentExited;
        const heartbeatAfterParentExit = await readFile(heartbeatPath, 'utf8');
        await waitForFileChange(heartbeatPath, heartbeatAfterParentExit);

        assert.equal(await result, expectedExitCode);
        assert.match(readStderr(), /erzwungene Prozessbaum-Beendigung/);
        const heartbeatAfterForce = await readFile(heartbeatPath, 'utf8');
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeatAfterForce);
      } finally {
        await unlink(heartbeatPath).catch(() => undefined);
        await rmdir(temporaryDirectory).catch(() => undefined);
      }
    },
  );
}

test(
  'hält als Standalone-Prozess die Force-Stufe bis zum Ende am Leben',
  { skip: process.platform === 'win32' },
  async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'flipbase-runner-harness-'));
    const heartbeatPath = join(temporaryDirectory, 'heartbeat.txt');
    const child = spawn(process.execPath, [signalHarness, heartbeatPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const readStderr = capture(child.stderr);

    try {
      const exitCode = await new Promise((resolve) => child.once('close', resolve));
      assert.equal(exitCode, 143);
      assert.match(readStderr(), /erzwungene Prozessbaum-Beendigung/);
      const heartbeatAfterForce = await readFile(heartbeatPath, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeatAfterForce);
    } finally {
      await unlink(heartbeatPath).catch(() => undefined);
      await rmdir(temporaryDirectory).catch(() => undefined);
    }
  },
);

test('verwendet unter Windows genau einen sofortigen harten Root-Baum-Abbruch', async () => {
  const signalSource = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const ready = waitForMatch(stdout, /windows-out/);
  const commandCalls = [];
  const commandRunner = async (command, args, options) => {
    commandCalls.push({ command, args, options });
    const processId = Number(args[args.indexOf('/pid') + 1]);
    process.kill(processId, 'SIGKILL');
    return { code: 0, stdout: '', timedOut: false };
  };

  const result = runner.runSuites([suite('windows', 5000)], {
    stdout,
    stderr,
    signalSource,
    platform: 'win32',
    commandRunner,
    helperTimeoutMs: 50,
    terminationGraceMs: 25,
  });
  await ready;
  signalSource.emit('SIGTERM');

  assert.equal(await result, 143);
  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0].command, 'taskkill.exe');
  assert.deepEqual(commandCalls[0].args.slice(0, 1), ['/pid']);
  assert.deepEqual(commandCalls[0].args.slice(2), ['/t', '/f']);
  assert.deepEqual(commandCalls[0].options, { timeoutMs: 50 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(commandCalls.length, 1);
});

test('beendet einen hängenden Hilfsprozess nach seinem eigenen Timeout', async () => {
  assert.equal(typeof runner.runCommandWithTimeout, 'function');
  const result = await runner.runCommandWithTimeout(process.execPath, [hangingHelper], {
    timeoutMs: 75,
  });

  assert.equal(result.code, 1);
  assert.equal(result.timedOut, true);
});

test('schließt bei einem fehlgeschlagenen Windows-Helfer offene Suite-Pipes', async () => {
  const signalSource = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const suiteStdout = new PassThrough();
  const suiteStderr = new PassThrough();
  const fakeChild = new EventEmitter();
  Object.assign(fakeChild, {
    pid: 4242,
    exitCode: null,
    signalCode: null,
    stdout: suiteStdout,
    stderr: suiteStderr,
    kill: () => true,
  });
  const result = runner.runSuites(
    [{ label: 'windows-helper-error', command: process.execPath, args: [] }],
    {
      stdout,
      stderr,
      signalSource,
      platform: 'win32',
      spawnProcess: () => fakeChild,
      commandRunner: async () => ({ code: 1, stdout: '', timedOut: true }),
      helperTimeoutMs: 50,
    },
  );

  signalSource.emit('SIGTERM');

  let deadline;
  const exitCode = await Promise.race([
    result,
    new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error('Runner blieb wegen offener Suite-Pipes hängen.')),
        500,
      );
    }),
  ]).finally(() => clearTimeout(deadline));
  assert.equal(exitCode, 143);
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

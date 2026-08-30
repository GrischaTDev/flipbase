import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveStressSeeds, runNodeStress } from './run-node-stress.mjs';

test('leitet genau 20 reproduzierbare Seeds aus der expliziten Basis ab', () => {
  assert.deepEqual(
    deriveStressSeeds({ baseSeed: 700 }),
    [
      700, 701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 714, 715, 716, 717, 718,
      719,
    ],
  );
  assert.deepEqual(
    deriveStressSeeds({ runId: '123456', runAttempt: '2' }),
    deriveStressSeeds({ runId: '123456', runAttempt: '2' }),
  );
  assert.notDeepEqual(
    deriveStressSeeds({ runId: '123456', runAttempt: '2' }),
    deriveStressSeeds({ runId: '123456', runAttempt: '3' }),
  );
});

test('startet Node-Tests genau 20-mal ohne Shellverkettung und protokolliert jeden Seed', () => {
  const calls = [];
  const messages = [];
  const exitCode = runNodeStress({
    seeds: deriveStressSeeds({ baseSeed: 900 }),
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
    log: (message) => messages.push(message),
  });

  assert.equal(exitCode, 0);
  assert.equal(calls.length, 20);
  assert.equal(messages.filter((message) => message.includes('seed=')).length, 20);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.command, process.execPath);
    assert.equal(call.options.shell, false);
    assert.deepEqual(call.args.slice(1, 4), ['run', '--project=node', '--sequence.shuffle']);
    assert.equal(call.args[4], `--sequence.seed=${900 + index}`);
  }
});

test('bricht beim ersten Fehler mit dessen Exitcode und reproduzierbarem Seed ab', () => {
  const calls = [];
  const errors = [];
  const exitCode = runNodeStress({
    seeds: deriveStressSeeds({ baseSeed: 42 }),
    spawnSyncImpl(_command, args) {
      calls.push(args);
      return { status: calls.length === 3 ? 7 : 0 };
    },
    log: () => {},
    logError: (message) => errors.push(message),
  });

  assert.equal(exitCode, 7);
  assert.equal(calls.length, 3);
  assert.match(errors.join('\n'), /seed=44/);
});

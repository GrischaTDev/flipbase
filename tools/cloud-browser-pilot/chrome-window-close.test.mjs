import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeChromeWindows } from './chrome-window-close.mjs';

test('closes every Chrome window across both observed class formats', async () => {
  const calls = [];
  await closeChromeWindows(async (_command, argumentsList) => {
    calls.push(argumentsList);
    return {
      stdout:
        '0x001 0 google-chrome host First\n0x002 0 google-chrome.Google-chrome host Second\n0x003 0 other.App host Third\n',
    };
  });
  assert.deepEqual(calls, [['-lx'], ['-ic', '0x001'], ['-ic', '0x002']]);
});

test('rejects malformed window IDs without interpreting titles as commands', async () => {
  const calls = [];
  await closeChromeWindows(async (_command, argumentsList) => {
    calls.push(argumentsList);
    return {
      stdout: 'malformed 0 google-chrome host Title\n0x003 0 other.App host google-chrome\n',
    };
  });
  assert.deepEqual(calls, [['-lx']]);
});

test('closes a Chrome window registered after the first stop request', async () => {
  const calls = [];
  let isRunning = true;
  await closeChromeWindows(
    async (_command, argumentsList) => {
      calls.push(argumentsList);
      if (argumentsList[0] === '-ic') isRunning = false;
      return { stdout: calls.length === 1 ? '' : '0x001 0 google-chrome host First\n' };
    },
    () => isRunning,
  );
  assert.deepEqual(calls, [['-lx'], ['-lx'], ['-ic', '0x001']]);
});

test('retries a temporarily unavailable window manager until Chrome stops', async () => {
  let attempts = 0;
  let isRunning = true;
  await closeChromeWindows(
    async (_command, argumentsList) => {
      if (argumentsList[0] === '-lx' && attempts++ === 0)
        throw new Error('Window manager starting');
      if (argumentsList[0] === '-ic') isRunning = false;
      return { stdout: '0x001 0 google-chrome host First\n' };
    },
    () => isRunning,
  );
  assert.equal(attempts, 2);
});

test('keeps an unconfirmed stop as an error after the bounded deadline', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: 0 });
  await assert.rejects(
    closeChromeWindows(
      async () => {
        context.mock.timers.tick(8_000);
        return { stdout: '' };
      },
      () => true,
    ),
    /Chrome-Stopp unbestätigt/,
  );
});

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

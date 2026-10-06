import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChromiumDesktopControls } from '../src/chromium-desktop-controls.ts';

function fixture(failure?: 'access' | 'gesture') {
  const calls: { argumentsList: string[]; input?: string }[] = [];
  let authorizations = 0;
  const controls = new ChromiumDesktopControls({
    width: 1280,
    height: 900,
    authorize: async () => {
      authorizations++;
      if (failure === 'access') throw new Error('access revoked');
    },
    execute: async (argumentsList, input) => {
      calls.push({ argumentsList, input });
      if (failure === 'gesture' && argumentsList.includes('mousedown'))
        throw new Error('private runtime failure');
      return argumentsList[0] === 'import' ? Buffer.from([255, 216, 255, 217]) : Buffer.alloc(0);
    },
  });
  return { controls, calls, authorizations: () => authorizations };
}

test('captures the whole desktop after checking its active account session', async () => {
  const { controls, calls, authorizations } = fixture();
  assert.deepEqual(await controls.capture(), Buffer.from([255, 216, 255, 217]));
  assert.equal(authorizations(), 1);
  assert.ok(calls[0]?.argumentsList.includes('root'));
});

test('maps image coordinates to native display coordinates, including the last pixel', async () => {
  const { controls, calls } = fixture();
  await controls.click(0.5, 0.5);
  await controls.click(1, 1);
  assert.deepEqual(calls[0]?.argumentsList, [
    'xdotool',
    'mousemove',
    '--sync',
    '640',
    '450',
    'click',
    '1',
  ]);
  assert.deepEqual(calls[1]?.argumentsList, [
    'xdotool',
    'mousemove',
    '--sync',
    '1279',
    '899',
    'click',
    '1',
  ]);
});

test('sends text through stdin and permits only the explicit supported keys', async () => {
  const { controls, calls } = fixture();
  await controls.type('fixture-private-password');
  await controls.press('Enter');
  await controls.press('Backspace');
  assert.equal(calls[0]?.input, 'fixture-private-password');
  assert.equal(
    calls[0]?.argumentsList.some((argument) => argument.includes('fixture-private-password')),
    false,
  );
  assert.ok(calls[0]?.argumentsList.includes('--file'));
  assert.deepEqual(calls[1]?.argumentsList, ['xdotool', 'key', '--clearmodifiers', 'Return']);
  assert.deepEqual(calls[2]?.argumentsList, ['xdotool', 'key', '--clearmodifiers', 'BackSpace']);
});

test('replays only the supplied gesture and releases the native mouse on failure', async () => {
  const { controls, calls } = fixture('gesture');
  await assert.rejects(
    controls.drag([
      { x: 0.1, y: 0.2, elapsedMs: 0 },
      { x: 0.8, y: 0.2, elapsedMs: 100 },
    ]),
    /Browserbedienung/,
  );
  assert.ok(calls[0]?.argumentsList.includes('sleep'));
  assert.deepEqual(calls.at(-1)?.argumentsList, ['xdotool', 'mouseup', '1']);
});

test('rejects invalid input before executing an operating system command', async () => {
  const { controls, calls } = fixture();
  await assert.rejects(controls.click(Number.NaN, 0.2));
  await assert.rejects(controls.type('text\nReturn'));
  await assert.rejects(controls.press('__proto__' as 'Enter'));
  await assert.rejects(
    controls.drag([
      { x: 0.1, y: 0.2, elapsedMs: 100 },
      { x: 0.8, y: 0.2, elapsedMs: 50 },
    ]),
  );
  assert.equal(calls.length, 0);
});

test('revoked access prevents both capture and typing', async () => {
  const { controls, calls } = fixture('access');
  await assert.rejects(controls.capture());
  await assert.rejects(controls.type('fixture-private-password'));
  assert.equal(calls.length, 0);
});

test('rejects invalid display dimensions before creating desktop controls', () => {
  assert.throws(
    () =>
      new ChromiumDesktopControls({
        width: Number.NaN,
        height: 900,
        authorize: async () => undefined,
        execute: async () => Buffer.alloc(0),
      }),
    /Browseranzeige/,
  );
});

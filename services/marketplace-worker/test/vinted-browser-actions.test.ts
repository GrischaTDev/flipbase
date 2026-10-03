import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { replayBrowserDrag } from '../src/vinted-browser-actions.ts';

function dragPage(failure?: 'down' | 'move') {
  const events: { name: string; elapsedMs: number }[] = [];
  let startedAt = performance.now();
  let moves = 0;
  const page = {
    viewportSize: () => ({ width: 1000, height: 500 }),
    mouse: {
      move: async (x: number, y: number) => {
        events.push({ name: `move:${x}:${y}`, elapsedMs: performance.now() - startedAt });
        moves++;
        if (moves > 1 && failure === 'move') throw new Error('Synthetic move failure');
      },
      down: async () => {
        startedAt = performance.now();
        events.push({ name: 'down', elapsedMs: 0 });
        if (failure === 'down') throw new Error('Synthetic down failure');
      },
      up: async () => {
        events.push({ name: 'up', elapsedMs: performance.now() - startedAt });
      },
    },
  } as unknown as Page;
  return { page, events };
}

test('replays only supplied mouse positions at their recorded relative times', async () => {
  const { page, events } = dragPage();
  await replayBrowserDrag(page, [
    { x: 0.1, y: 0.2, elapsedMs: 0 },
    { x: 0.5, y: 0.3, elapsedMs: 40 },
    { x: 0.8, y: 0.4, elapsedMs: 120 },
  ]);
  assert.deepEqual(
    events.map((event) => event.name),
    ['move:100:100', 'down', 'move:500:150', 'move:800:200', 'up'],
  );
  assert.ok((events.at(2)?.elapsedMs ?? 0) >= 35);
  assert.ok((events.at(3)?.elapsedMs ?? 0) >= 115);
});

test('releases the mouse and preserves a replay failure', async () => {
  for (const failure of ['down', 'move'] as const) {
    const { page, events } = dragPage(failure);
    await assert.rejects(
      replayBrowserDrag(page, [
        { x: 0.1, y: 0.2, elapsedMs: 0 },
        { x: 0.5, y: 0.2, elapsedMs: 1 },
      ]),
      new RegExp(`Synthetic ${failure} failure`),
    );
    assert.equal(events.at(-1)?.name, 'up');
    assert.equal(events.filter((event) => event.name === 'up').length, 1);
  }
});

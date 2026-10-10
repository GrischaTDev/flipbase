import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { replayBrowserDrag, vintedBrowserActions } from '../src/vinted-browser-actions.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';

test('reading new category choices requires one context and authority before reserving a page', async () => {
  let pages = 0;
  const context = {
    pages: () => [],
    newPage: () => {
      pages++;
      throw new Error('page reserved');
    },
  };
  const actions = vintedBrowserActions({
    version: () => 'fixture',
    close: () => Promise.resolve(),
    contexts: () => [context],
  } as unknown as import('../src/gologin-cloud-browser.ts').BrowserConnection);
  await assert.rejects(
    actions.readListingCategory!('123', 1223, [5], () => Promise.reject(new Error('revoked'))),
    /revoked/,
  );
  assert.equal(pages, 0);
  const ambiguous = vintedBrowserActions({
    version: () => 'fixture',
    close: () => Promise.resolve(),
    contexts: () => [context, context],
  } as unknown as import('../src/gologin-cloud-browser.ts').BrowserConnection);
  await assert.rejects(
    ambiguous.readListingCategory!('123', 1223, [5], () => Promise.resolve()),
    /Exklusiv/,
  );
  assert.equal(pages, 0);
  await assert.rejects(
    actions.readListingCategory!('123', 1223, [5], () => Promise.resolve()),
    /page reserved/,
  );
  assert.equal(pages, 1);
});

test('manual desktop controls do not use Playwright page input or screenshot', async () => {
  const calls: string[] = [];
  const connection = {
    version: () => 'fixture',
    close: async () => undefined,
    contexts: () => {
      throw new Error('Playwright page controls must not be used');
    },
  };
  const actions = vintedBrowserActions(connection, {
    capture: async () => {
      calls.push('capture');
      return new Uint8Array([1]);
    },
    click: async () => {
      calls.push('click');
    },
    drag: async () => {
      calls.push('drag');
    },
    type: async () => {
      calls.push('type');
    },
    press: async () => {
      calls.push('press');
    },
  });
  await actions.capture?.();
  await actions.click?.(0.5, 0.5);
  await actions.drag?.([
    { x: 0, y: 0, elapsedMs: 0 },
    { x: 1, y: 1, elapsedMs: 100 },
  ]);
  await actions.type?.('fixture');
  await actions.press?.('Enter');
  assert.deepEqual(calls, ['capture', 'click', 'drag', 'type', 'press']);
});

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

test('listing publication requires exactly one reserved browser context and current authority', async () => {
  const context = {
    pages: () => [],
    newPage: () => {
      throw new Error('must not open');
    },
  };
  for (const contexts of [[], [context, context]]) {
    const actions = vintedBrowserActions({
      version: () => 'fixture',
      close: () => Promise.resolve(),
      contexts: () => contexts,
    } as unknown as Parameters<typeof vintedBrowserActions>[0]);
    await assert.rejects(
      actions.submitListing!(
        '123',
        'publish',
        listingClaimFixture.snapshot,
        () => Promise.resolve(),
        () => Promise.resolve(),
        () => Promise.reject(),
        [5],
      ),
    );
  }
  const actions = vintedBrowserActions({
    version: () => 'fixture',
    close: () => Promise.resolve(),
    contexts: () => [context],
  } as unknown as Parameters<typeof vintedBrowserActions>[0]);
  await assert.rejects(
    actions.submitListing!(
      '123',
      'publish',
      listingClaimFixture.snapshot,
      () => Promise.resolve(),
      () => Promise.reject(new Error('revoked')),
      () => Promise.reject(),
      [5],
    ),
    /revoked/,
  );
  assert.deepEqual(
    await actions.submitListing!(
      '123',
      'vinted_draft',
      listingClaimFixture.snapshot,
      () => Promise.reject(),
      () => Promise.reject(),
      () => Promise.reject(),
      [5],
    ),
    { outcome: 'failed', errorCode: 'unsupported' },
  );
});

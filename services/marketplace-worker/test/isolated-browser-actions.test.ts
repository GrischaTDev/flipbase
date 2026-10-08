import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserSessionCommands } from '../src/browser-session-commands.ts';
import {
  executeBrowserAction,
  isolatedBrowserActions,
  validateBrowserResult,
} from '../src/isolated-browser-actions.ts';
import type { VintedAccountImport } from '../src/vinted-account-import.ts';
import { VintedInteractionRequiredError } from '../src/vinted-browser-reader.ts';

test('isolated import preserves central authorizations and progress without a nested RPC', async () => {
  let authorizations = 0;
  const stages: string[] = [];
  const snapshot: VintedAccountImport = {
    identity: { id: '12', username: 'fixture' },
    observedAt: '2026-10-08T00:00:00Z',
    entries: [],
    areas: {
      profile: { status: 'complete' },
      publications: { status: 'complete' },
      conversations: { status: 'complete' },
      messages: { status: 'complete' },
      sales: { status: 'complete' },
      feedback: { status: 'complete' },
    },
  };
  const runtime = new BrowserSessionCommands({
    version: () => '',
    importAccount: async (authorize, onStage) => {
      await authorize();
      await onStage?.('profile');
      await authorize();
      return snapshot;
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  assert.deepEqual(
    await browser.importAccount?.(
      async () => {
        authorizations++;
      },
      async (stage) => {
        stages.push(stage);
      },
    ),
    snapshot,
  );
  assert.ok(authorizations >= 5);
  assert.deepEqual(stages, ['profile']);
  // Dieselbe Sitzung verarbeitet einen weiteren Auftrag ohne Browserstart.
  assert.deepEqual(await browser.importAccount?.(async () => undefined), snapshot);
});

test('revoked central authorization prevents the write and cancels the pending action', async () => {
  let writes = 0;
  let checks = 0;
  const runtime = new BrowserSessionCommands({
    version: () => '',
    updateProfileAbout: async (_id, _about, authorize) => {
      await authorize();
      writes++;
      return 'confirmed';
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  await assert.rejects(
    browser.updateProfileAbout?.('12', 'fixture', async () => {
      if (++checks === 3) throw new Error('revoked');
    }) ?? Promise.reject(),
    /revoked/,
  );
  assert.equal(writes, 0);
});

test('fixed browser actions reject scripts, URLs, extra arguments and unknown fields', async () => {
  for (const input of [
    { name: 'evaluate', arguments: ['process.env'] },
    { name: 'identify', arguments: [], script: 'process.env' },
    { name: 'readProfileAbout', arguments: ['https://other.invalid'] },
    { name: 'type', arguments: ['fixture', 'extra'] },
  ])
    await assert.rejects(
      executeBrowserAction(
        { version: () => '' },
        input,
        async () => undefined,
        async () => undefined,
      ),
    );
});

test('foreign write targets and malformed import entries never cross the result boundary', () => {
  assert.throws(() =>
    validateBrowserResult('identify', { id: '12', username: 'fixture', workspaceId: 'other' }),
  );
  assert.throws(() =>
    validateBrowserResult('importAccount', {
      identity: { id: '12', username: 'fixture' },
      entries: [],
      workspaceId: 'other',
    }),
  );
  assert.throws(() => validateBrowserResult('updateListing', 'anything'));
  assert.throws(() => validateBrowserResult('updateListing', ['confirmed']));
  assert.throws(() => validateBrowserResult('capture', '*'.repeat(1024)));
});

test('malformed diagnostics from a compromised interpreter are rejected before persistence or logging', () => {
  const snapshot = {
    identity: { id: '12', username: 'fixture' },
    observedAt: new Date().toISOString(),
    entries: [],
    areas: Object.fromEntries(
      ['profile', 'publications', 'conversations', 'messages', 'sales', 'feedback'].map((area) => [
        area,
        { status: 'complete' },
      ]),
    ),
  };
  assert.deepEqual(
    validateBrowserResult('importAccount', {
      ...snapshot,
      browserReadFailures: ['navigation'],
      rejectedSaleIds: ['13'],
      sourceRequestCount: 2,
    }),
    {
      ...snapshot,
      browserReadFailures: ['navigation'],
      rejectedSaleIds: ['13'],
      sourceRequestCount: 2,
    },
  );
  for (const diagnostics of [
    { browserReadFailures: {} },
    { browserReadFailures: ['private-text'] },
    { rejectedSaleIds: ['other/workspace'] },
    { sourceRequestCount: -1 },
    { areas: { ...snapshot.areas, messages: { status: ['complete'] } } },
    { areas: { ...snapshot.areas, messages: { status: 'partial', retryAfter: {} } } },
  ])
    assert.throws(() => validateBrowserResult('importAccount', { ...snapshot, ...diagnostics }));
});

test('public challenge errors survive the isolated transport without private messages', async () => {
  const runtime = new BrowserSessionCommands({
    version: () => '',
    identify: async () => {
      throw new VintedInteractionRequiredError();
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  await assert.rejects(browser.identify?.() ?? Promise.reject(), VintedInteractionRequiredError);
});

test('stolen or stale task IDs and out-of-order acknowledgments are rejected', async () => {
  const runtime = new BrowserSessionCommands({ version: () => '', identify: async () => null });
  const started = (await runtime.request({
    action: 'start',
    operation: { name: 'identify', arguments: [] },
  })) as { id: string };
  await assert.rejects(runtime.request({ action: 'poll', id: 'other-task', sequence: 0 }));
  await assert.rejects(runtime.request({ action: 'poll', id: started.id, sequence: 99 }));
  await runtime.request({ action: 'cancel', id: started.id });
});

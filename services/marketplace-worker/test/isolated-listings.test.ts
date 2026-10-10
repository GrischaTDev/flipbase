import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserSessionCommands } from '../src/browser-session-commands.ts';
import { isolatedBrowserActions } from '../src/isolated-browser-actions.ts';
import type { BrowserInfo } from '../src/gologin-cloud-browser.ts';
import { listingClaimFixture } from './fixtures/marketplace-listing-claim.ts';

const proof = {
  outcome: 'confirmed' as const,
  action: 'publish' as const,
  externalId: '456',
  externalAccountId: '123',
  providerState: 'active' as const,
  verifiedAt: '2026-10-10T12:00:00.000Z',
};

test('isolated listing transport transfers originals beyond the message limit and waits for central Begin', async () => {
  const bytes = new Uint8Array(9 * 1024 * 1024 + 13).fill(31);
  const snapshot = {
    ...listingClaimFixture.snapshot,
    images: [{ ...listingClaimFixture.snapshot.images[0]!, byteSize: bytes.length }],
  };
  const calls: string[] = [];
  let revoked = false,
    packets = 0;
  const native: BrowserInfo = {
    version: () => 'fixture',
    submitListing: async (account, action, received, beforeWrite, authorize, loadPhoto, path) => {
      assert.equal(account, '123');
      assert.equal(action, 'publish');
      assert.deepEqual(received, snapshot);
      assert.deepEqual(path, [5]);
      await authorize();
      const photo = await loadPhoto(received.images[0]!.id);
      assert.deepEqual(photo.bytes, bytes);
      calls.push('photo');
      await beforeWrite();
      calls.push('write');
      revoked = true;
      return proof;
    },
  };
  const commands = new BrowserSessionCommands(native);
  const browser = isolatedBrowserActions({
    request: async (request) => {
      const wire = JSON.stringify(request);
      assert.ok(Buffer.byteLength(wire) < 2 * 1024 * 1024);
      assert.equal(wire.includes('service_role'), false);
      if (request.payload) {
        packets++;
        assert.equal(JSON.stringify(request.payload).includes('storagePath'), false);
      }
      return JSON.parse(JSON.stringify(await commands.request(JSON.parse(wire)))) as unknown;
    },
  });
  const result = await browser.submitListing!(
    '123',
    'publish',
    snapshot,
    () => {
      calls.push('begin');
      return Promise.resolve();
    },
    () => (revoked ? Promise.reject(new Error('revoked')) : Promise.resolve()),
    (id) => {
      calls.push('load');
      return Promise.resolve({ id, fileName: 'jacke.jpg', mimeType: 'image/jpeg', bytes });
    },
    [5],
  );
  assert.deepEqual(result, proof);
  assert.deepEqual(calls, ['load', 'photo', 'begin', 'write']);
  assert.equal(packets, 10);
});

test('lost or repeated Begin acknowledgment never grants another isolated listing write', async () => {
  for (const duplicate of [false, true]) {
    let begins = 0,
      writes = 0;
    const commands = new BrowserSessionCommands({
      version: () => 'fixture',
      submitListing: async (_account, _action, _snapshot, beforeWrite) => {
        await beforeWrite();
        if (duplicate) await beforeWrite();
        writes++;
        return proof;
      },
    });
    const browser = isolatedBrowserActions({ request: (input) => commands.request(input) });
    await assert.rejects(
      browser.submitListing!(
        '123',
        'publish',
        listingClaimFixture.snapshot,
        () => {
          begins++;
          return duplicate ? Promise.resolve() : Promise.reject(new Error('ACK fehlt'));
        },
        () => Promise.resolve(),
        () => Promise.reject(new Error('not used')),
        [5],
      ),
    );
    assert.equal(begins, 1);
    assert.equal(writes, 0);
  }
});

test('isolated result and original-photo events remain bound to the claimed action and account', async () => {
  for (const wrongAccount of [false, true]) {
    let loads = 0;
    const commands = new BrowserSessionCommands({
      version: () => 'fixture',
      submitListing: async (_account, _action, _snapshot, _beforeWrite, _authorize, loadPhoto) => {
        if (!wrongAccount) await loadPhoto('999');
        return { ...proof, externalAccountId: '999' };
      },
    });
    const browser = isolatedBrowserActions({ request: (input) => commands.request(input) });
    await assert.rejects(
      browser.submitListing!(
        '123',
        'publish',
        listingClaimFixture.snapshot,
        () => Promise.resolve(),
        () => Promise.resolve(),
        () => {
          loads++;
          return Promise.reject(new Error('not used'));
        },
        [5],
      ),
    );
    assert.equal(loads, 0);
  }
});

test('photo payloads cannot acknowledge ordinary authority pauses and proof without Begin is rejected', async () => {
  const commands = new BrowserSessionCommands({
    version: () => 'fixture',
    submitListing: () => Promise.resolve(proof),
  });
  const start = (await commands.request({
    action: 'start',
    operation: {
      name: 'submitListing',
      arguments: ['123', 'publish', listingClaimFixture.snapshot, [5]],
    },
  })) as { id: string };
  const event = (await commands.request({ action: 'poll', id: start.id, sequence: 0 })) as {
    sequence: number;
  };
  await assert.rejects(
    commands.request({
      action: 'poll',
      id: start.id,
      sequence: event.sequence,
      payload: { data: 'AA==' },
    }),
    /Originalfotoantwort/,
  );
  await commands.request({ action: 'cancel', id: start.id });
  const separate = new BrowserSessionCommands({
    version: () => 'fixture',
    submitListing: () => Promise.resolve(proof),
  });
  const browser = isolatedBrowserActions({ request: (input) => separate.request(input) });
  await assert.rejects(
    browser.submitListing!(
      '123',
      'publish',
      listingClaimFixture.snapshot,
      () => Promise.resolve(),
      () => Promise.resolve(),
      () => Promise.reject(),
      [5],
    ),
    /nicht gebunden/,
  );
});

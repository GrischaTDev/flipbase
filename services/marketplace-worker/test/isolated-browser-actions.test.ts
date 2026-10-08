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

test('isolated terminal write proof survives a subsequent revocation without granting another action', async () => {
  for (const name of ['sendMessage', 'sendFavoriteMessage', 'sendFavoriteOffer'] as const) {
    let authorizations = 0;
    let starts = 0;
    const proof =
      name === 'sendFavoriteOffer'
        ? { outcome: 'sent', externalOfferId: '22' }
        : {
            outcome: 'sent',
            externalMessageId: '11',
            ...(name === 'sendFavoriteMessage' ? { conversationId: '777' } : {}),
          };
    const browser = isolatedBrowserActions({
      request: async (input) => {
        if (input.action === 'start') {
          starts++;
          return { id: '00000000-0000-0000-0000-000000000001' };
        }
        if (input.action === 'poll') return { kind: 'result', value: proof };
        return null;
      },
    });
    const authorize = async () => {
      if (++authorizations > 1) throw new Error('revoked');
    };
    if (name === 'sendMessage')
      assert.deepEqual(
        await browser.sendMessage?.(
          '123',
          { externalConversationId: '777', text: 'Hallo', attachment: null },
          authorize,
        ),
        proof,
      );
    else if (name === 'sendFavoriteMessage')
      assert.deepEqual(
        await browser.sendFavoriteMessage?.(
          '123',
          { recipientId: '456', itemId: '99', text: 'Danke' },
          authorize,
        ),
        proof,
      );
    else
      assert.deepEqual(
        await browser.sendFavoriteOffer?.(
          '123',
          {
            recipientId: '456',
            itemId: '99',
            text: 'Danke',
            conversationId: '777',
            transactionId: '888',
            externalMessageId: '11',
            offer: { type: 'amount', value: 5 },
          },
          authorize,
          async () => true,
        ),
        proof,
      );
    await assert.rejects(
      browser.sendMessage?.(
        '123',
        { externalConversationId: '777', text: 'Noch einmal', attachment: null },
        authorize,
      ) ?? Promise.reject(),
      /revoked/,
    );
    assert.equal(starts, 1);
  }
});

test('isolated terminal reads still require current authorization', async () => {
  let authorizations = 0;
  const browser = isolatedBrowserActions({
    request: async (input) =>
      input.action === 'start'
        ? { id: '00000000-0000-0000-0000-000000000001' }
        : { kind: 'result', value: [] },
  });
  await assert.rejects(
    browser.readFavoriteEvents?.('123', async () => {
      if (++authorizations > 1) throw new Error('revoked');
    }) ?? Promise.reject(),
    /revoked/,
  );
});

test('isolated inbox supports a manual reply and both favorite phases with central price approval', async () => {
  const message = { externalConversationId: '777', text: 'Hallo', attachment: null };
  const favorite = { recipientId: '456', itemId: '99', text: 'Danke!' };
  const offer = {
    ...favorite,
    conversationId: '777',
    transactionId: '888',
    externalMessageId: '11',
    offer: { type: 'amount' as const, value: 5 },
  };
  let priceChecks = 0;
  let offerWrites = 0;
  let authorizations = 0;
  const runtime = new BrowserSessionCommands({
    version: () => 'fixture',
    sendMessage: async (account, command, authorize) => {
      assert.equal(account, '123');
      assert.deepEqual(command, message);
      await authorize();
      return { outcome: 'sent', externalMessageId: '11' };
    },
    readFavoriteEvents: async (_account, authorize) => {
      await authorize();
      return [];
    },
    sendFavoriteMessage: async (account, command, authorize) => {
      assert.equal(account, '123');
      assert.deepEqual(command, favorite);
      await authorize();
      return {
        outcome: 'sent',
        externalMessageId: '11',
        conversationId: '777',
        transactionId: '888',
      };
    },
    sendFavoriteOffer: async (_account, command, authorize, confirmPrice) => {
      assert.deepEqual(command, offer);
      await authorize();
      if (!(await confirmPrice(4000, 3500)))
        return { outcome: 'skipped', errorCode: 'price_unconfirmed' };
      offerWrites++;
      return { outcome: 'sent', externalOfferId: '22' };
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  const authorize = async () => {
    authorizations++;
  };
  assert.deepEqual(await browser.sendMessage?.('123', message, authorize), {
    outcome: 'sent',
    externalMessageId: '11',
  });
  assert.deepEqual(await browser.readFavoriteEvents?.('123', authorize), []);
  assert.deepEqual(await browser.sendFavoriteMessage?.('123', favorite, authorize), {
    outcome: 'sent',
    externalMessageId: '11',
    conversationId: '777',
    transactionId: '888',
  });
  assert.deepEqual(
    await browser.sendFavoriteOffer?.('123', offer, authorize, async (original, offered) => {
      assert.equal(original, 4000);
      assert.equal(offered, 3500);
      priceChecks++;
      return true;
    }),
    { outcome: 'sent', externalOfferId: '22' },
  );
  assert.equal(priceChecks, 1);
  assert.equal(offerWrites, 1);
  assert.ok(authorizations >= 12);
  await assert.rejects(
    browser.sendFavoriteOffer?.('123', offer, authorize, async () => false) ?? Promise.reject(),
  );
  assert.equal(offerWrites, 1);
});

test('isolated results reject success without message/offer evidence and retain a versioned inbox batch', () => {
  for (const name of ['sendMessage', 'sendFavoriteMessage', 'sendFavoriteOffer'] as const) {
    assert.throws(() => validateBrowserResult(name, { outcome: 'sent' }));
    assert.throws(() =>
      validateBrowserResult(name, {
        outcome: 'sent',
        externalMessageId: '11',
        externalOfferId: '22',
        script: 'unexpected',
      }),
    );
  }
  assert.deepEqual(validateBrowserResult('readFavoriteEvents', []), []);
});

test('isolated import preserves central authorizations, article cache and inbox events without a nested RPC', async () => {
  let authorizations = 0;
  const stages: string[] = [];
  const snapshot: VintedAccountImport = {
    identity: { id: '12', username: 'fixture' },
    observedAt: '2026-10-08T00:00:00Z',
    entries: [],
    inboxEvents: {
      version: 1,
      observedAt: '2026-10-08T00:00:00.000Z',
      complete: true,
      coveredConversationIds: ['777'],
      events: [
        {
          externalId: 'message:10',
          externalConversationId: '777',
          occurredAt: '2026-10-07T23:59:00.000Z',
          direction: 'inbound',
          source: 'conversation_snapshot',
        },
      ],
    },
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
    importAccount: async (authorize, onStage, previous) => {
      if (previous?.length) assert.equal(previous[0]?.itemTitle, 'Vintage Jacke');
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
      [
        {
          externalId: '777',
          sourceUpdatedAt: snapshot.observedAt,
          detailCheckedAt: snapshot.observedAt,
          text: null,
          occurredAt: null,
          itemId: '99',
          itemTitle: 'Vintage Jacke',
          itemImageUrl: null,
          itemPrice: 40,
          itemCurrency: 'EUR',
          transactionStatus: 'Offen',
        },
      ],
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

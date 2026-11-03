import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { vintedConversationSaleRead } from '../src/vinted-conversation-sale-read.ts';
import {
  readVintedAccountImport,
  type VintedConversationVersion,
} from '../src/vinted-account-import.ts';

const observedAt = '2026-11-03T12:00:00.000Z';
const previousSale = { transactionId: '71', sellerId: '123' };

test('a matching previously confirmed seller binding permits the shortened transaction read', () => {
  assert.deepEqual(
    vintedConversationSaleRead(
      { id: 51, transaction: { id: 71 } },
      '123',
      observedAt,
      previousSale,
    ),
    { transactionId: '71', canConfirmWithoutTransaction: false },
  );
});

test('a missing or changed transaction never refreshes an existing sale confirmation', () => {
  for (const transaction of [undefined, null, {}, { id: 72 }, { id: 72, seller_id: 123 }]) {
    assert.deepEqual(
      vintedConversationSaleRead({ id: 51, transaction }, '123', observedAt, previousSale),
      { transactionId: null, canConfirmWithoutTransaction: false },
    );
  }
});

test('current buyer or conflicting seller evidence overrides an older seller binding', () => {
  for (const transaction of [
    { id: 71, seller_id: 999 },
    { id: 71, seller: { id: 999 } },
    { id: 71, current_user_side: 'buyer' },
    { id: 71, user_side: 'buyer' },
    { id: 71, seller_id: 123, seller: { id: 999 } },
    { id: 71, seller_id: 123, user_side: 'buyer' },
    { id: 71, seller_id: 999, user_side: 'seller' },
    { id: 71, current_user_side: 'seller', user_side: 'buyer' },
  ]) {
    assert.deepEqual(
      vintedConversationSaleRead({ id: 51, transaction }, '123', observedAt, previousSale),
      { transactionId: null, canConfirmWithoutTransaction: false },
    );
  }
});

test('a cached seller from another account never permits an otherwise unbound transaction read', () => {
  assert.deepEqual(
    vintedConversationSaleRead({ id: 51, transaction: { id: 71 } }, '123', observedAt, {
      transactionId: '71',
      sellerId: '999',
    }),
    { transactionId: null, canConfirmWithoutTransaction: false },
  );
});

test('plain chats and positively identified buyer conversations need no own-sale transaction read', () => {
  for (const transaction of [undefined, null, { id: 71, seller_id: 999, user_side: 'buyer' }]) {
    assert.deepEqual(vintedConversationSaleRead({ id: 51, transaction }, '123', observedAt), {
      transactionId: null,
      canConfirmWithoutTransaction: true,
    });
  }
});

test('current own seller proofs permit a read without an older cached sale', () => {
  for (const transaction of [
    { id: 71, seller_id: 123 },
    { id: 71, seller: { id: 123 } },
    { id: 71, current_user_side: 'seller' },
    { id: 71, user_side: 'seller' },
  ]) {
    assert.deepEqual(vintedConversationSaleRead({ id: 51, transaction }, '123', observedAt), {
      transactionId: '71',
      canConfirmWithoutTransaction: false,
    });
  }
});

test('malformed identities and transaction references never permit a provider read', () => {
  for (const transaction of [
    { id: '71/other', seller_id: 123 },
    { id: 71, seller_id: 'not-an-account' },
    { id: 71, user_side: 'unknown' },
  ]) {
    assert.deepEqual(vintedConversationSaleRead({ id: 51, transaction }, '123', observedAt), {
      transactionId: null,
      canConfirmWithoutTransaction: false,
    });
  }
});

function importFixture(
  transaction: unknown,
  transactionFails = false,
  transactionChanges: Record<string, unknown> = {},
  afterConversationRead?: () => void,
  conversationChanges: Record<string, unknown> = {},
) {
  const paths: string[] = [];
  const sourceUpdatedAt = '2026-11-02T09:00:00.000Z';
  const previous = {
    externalId: '51',
    sourceUpdatedAt,
    detailCheckedAt: '2026-11-01T08:00:00.000Z',
    text: 'Letzter bestätigter Gesprächsstand',
    occurredAt: sourceUpdatedAt,
    saleTrackingVersion: 2 as const,
    saleTransactionId: '71',
    saleSellerId: '123',
  };
  const page = {
    url: () => 'https://www.vinted.de/',
    evaluate: async (_script: unknown, path: string) => {
      paths.push(path);
      if (path.includes('/users/current')) return { user: { id: 123, login: 'fixture' } };
      if (path.includes('/inbox'))
        return {
          conversations: [{ id: 51, unread: false, updated_at: sourceUpdatedAt }],
          pagination: { total_pages: 1 },
        };
      if (path === '/api/v2/conversations/51') {
        afterConversationRead?.();
        return { conversation: { id: 51, messages: [], transaction, ...conversationChanges } };
      }
      if (path === '/api/v2/transactions/71')
        return transactionFails
          ? { flipbaseRequestFailure: 'network' }
          : {
              transaction: {
                id: 71,
                seller_id: 123,
                status_title: 'Versendet',
                status_updated_at: observedAt,
                order: { id: 81 },
                ...transactionChanges,
              },
            };
      if (path.includes('/wardrobe/')) return { items: [], pagination: { total_pages: 1 } };
      if (path.includes('/feedbacks'))
        return { user_feedbacks: [], pagination: { total_pages: 1 } };
      assert.fail('unexpected fixture request');
    },
  } as unknown as Page;
  return { page, paths, previous };
}

test('a scheduled import refreshes a bound sale from shortened conversation data', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  const item = importFixture({ id: 71 });
  const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
    item.previous,
  ]);
  assert.equal(item.paths.filter((path) => path === '/api/v2/transactions/71').length, 1);
  assert.equal(
    snapshot.entries.find((entry) => entry.kind === 'sale')?.body['saleState'],
    'shipped',
  );
  assert.equal(
    snapshot.entries.find((entry) => entry.kind === 'conversation')?.body['saleTrackingVersion'],
    2,
  );
});

test('uncertain current sale relations do not inherit a fresh confirmation from the old inbox cache', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  for (const transaction of [undefined, { id: 72 }, { id: 71, seller_id: 999 }]) {
    const item = importFixture(transaction);
    const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
      item.previous,
    ]);
    const conversation = snapshot.entries.find((entry) => entry.kind === 'conversation');
    assert.equal(
      item.paths.some((path) => path.startsWith('/api/v2/transactions/')),
      false,
    );
    assert.equal(conversation?.body['detailCheckedAt'], observedAt);
    assert.equal(conversation?.body['saleTransactionId'], '71');
    assert.equal(conversation?.body['saleSellerId'], '123');
    assert.equal(conversation?.body['saleTrackingVersion'], undefined);
  }
});

test('a failed bound transaction read preserves its identity without confirming a fresh sale check', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  const item = importFixture({ id: 71 }, true);
  const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
    item.previous,
  ]);
  const conversation = snapshot.entries.find((entry) => entry.kind === 'conversation');
  assert.equal(item.paths.filter((path) => path === '/api/v2/transactions/71').length, 1);
  assert.equal(conversation?.body['saleTransactionId'], '71');
  assert.equal(conversation?.body['saleSellerId'], '123');
  assert.equal(conversation?.body['saleTrackingVersion'], undefined);
  assert.equal(snapshot.areas.sales.failure, 'network');
});

test('a transaction response with a different identity never refreshes the cached sale confirmation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  for (const changes of [
    { id: 72 },
    { seller_id: 999 },
    { seller: { id: 999 } },
    { current_user_side: 'buyer' },
    { user_side: 'buyer' },
  ]) {
    const item = importFixture({ id: 71 }, false, changes);
    const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
      item.previous,
    ]);
    const conversation = snapshot.entries.find((entry) => entry.kind === 'conversation');
    assert.equal(item.paths.filter((path) => path === '/api/v2/transactions/71').length, 1);
    assert.equal(conversation?.body['saleTransactionId'], '71');
    assert.equal(conversation?.body['saleSellerId'], '123');
    assert.equal(conversation?.body['saleTrackingVersion'], undefined);
    assert.equal(
      snapshot.entries.some((entry) => entry.kind === 'sale'),
      false,
    );
    assert.equal(snapshot.areas.sales.failure, 'invalid_response');
  }
});

test('opening a known-sale chat does not refresh its unchecked sale and the next bounded import checks it', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  const item = importFixture({ id: 71 });
  const opened = await readVintedAccountImport(
    item.page,
    async () => undefined,
    undefined,
    [item.previous],
    { externalId: '51', accountId: '123' },
  );
  const conversation = opened.entries.find((entry) => entry.kind === 'conversation');
  assert.equal(
    item.paths.some((path) => path.startsWith('/api/v2/transactions/')),
    false,
  );
  assert.equal(conversation?.body['detailCheckedAt'], observedAt);
  assert.equal(conversation?.body['saleTransactionId'], '71');
  assert.equal(conversation?.body['saleSellerId'], '123');
  assert.equal(conversation?.body['saleTrackingVersion'], undefined);
  item.paths.length = 0;
  const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
    { ...item.previous, detailCheckedAt: observedAt, saleTrackingVersion: undefined },
  ]);
  assert.equal(item.paths.filter((path) => path === '/api/v2/transactions/71').length, 1);
  assert.equal(
    snapshot.entries.find((entry) => entry.kind === 'sale')?.body['saleState'],
    'shipped',
  );
});

test('opening a newly sold chat invalidates the older no-sale confirmation before the next bounded import', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  const item = importFixture({ id: 71, seller_id: 123 }, false, {}, undefined, {
    messages: [
      {
        entity_type: 'status_message',
        event_group: 'sale',
        event_type: 'success',
        created_at_ts: observedAt,
        entity: { title: 'Verkauft!' },
      },
    ],
  });
  const previous = {
    ...item.previous,
    detailCheckedAt: observedAt,
    saleTransactionId: undefined,
    saleSellerId: undefined,
  };
  const opened = await readVintedAccountImport(
    item.page,
    async () => undefined,
    undefined,
    [previous],
    { externalId: '51', accountId: '123' },
  );
  const conversation = opened.entries.find((entry) => entry.kind === 'conversation');
  assert.ok(conversation);
  assert.equal(
    item.paths.some((path) => path.startsWith('/api/v2/transactions/')),
    false,
  );
  assert.equal(opened.entries.find((entry) => entry.kind === 'sale')?.externalId, '71');
  assert.equal(conversation.body['saleTransactionId'], '71');
  assert.equal(conversation.body['detailCheckedAt'], observedAt);
  assert.equal(conversation.body['saleTrackingVersion'], undefined);
  item.paths.length = 0;
  const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
    {
      ...conversation.body,
      externalId: conversation.externalId,
    } as unknown as VintedConversationVersion,
  ]);
  assert.equal(item.paths.filter((path) => path === '/api/v2/conversations/51').length, 1);
  assert.equal(item.paths.filter((path) => path === '/api/v2/transactions/71').length, 1);
  assert.equal(
    snapshot.entries.find((entry) => entry.kind === 'sale')?.body['saleState'],
    'shipped',
  );
});

test('opening a plain or buyer chat preserves its existing no-sale confirmation', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  for (const transaction of [undefined, { id: 71, seller_id: 999, user_side: 'buyer' }]) {
    const item = importFixture(transaction);
    const previous = {
      ...item.previous,
      detailCheckedAt: observedAt,
      saleTransactionId: undefined,
      saleSellerId: undefined,
    };
    const opened = await readVintedAccountImport(
      item.page,
      async () => undefined,
      undefined,
      [previous],
      { externalId: '51', accountId: '123' },
    );
    const conversation = opened.entries.find((entry) => entry.kind === 'conversation');
    assert.equal(conversation?.body['saleTrackingVersion'], 2);
    assert.equal(
      item.paths.some((path) => path.startsWith('/api/v2/transactions/')),
      false,
    );
    assert.equal(
      opened.entries.some((entry) => entry.kind === 'sale'),
      false,
    );
  }
});

test('an exhausted background detail budget skips the transaction without refreshing an older sale check', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  const item = importFixture({ id: 71 }, false, {}, () => t.mock.timers.tick(45_001));
  const snapshot = await readVintedAccountImport(item.page, async () => undefined, undefined, [
    item.previous,
  ]);
  const conversation = snapshot.entries.find((entry) => entry.kind === 'conversation');
  assert.equal(
    item.paths.some((path) => path.startsWith('/api/v2/transactions/')),
    false,
  );
  assert.equal(conversation?.body['saleTransactionId'], '71');
  assert.equal(conversation?.body['saleSellerId'], '123');
  assert.equal(conversation?.body['saleTrackingVersion'], undefined);
  assert.equal(snapshot.areas.sales.failure, undefined);
});

test('a transaction authorization that exhausts the detail budget prevents the subsequent provider read', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(observedAt) });
  let conversationReturned = false;
  let authorizationExhaustedBudget = false;
  const item = importFixture({ id: 71 }, false, {}, () => {
    conversationReturned = true;
  });
  const snapshot = await readVintedAccountImport(
    item.page,
    async () => {
      if (conversationReturned && !authorizationExhaustedBudget) {
        authorizationExhaustedBudget = true;
        t.mock.timers.tick(45_001);
      }
    },
    undefined,
    [item.previous],
  );
  const conversation = snapshot.entries.find((entry) => entry.kind === 'conversation');
  assert.equal(authorizationExhaustedBudget, true);
  assert.equal(
    item.paths.some((path) => path.startsWith('/api/v2/transactions/')),
    false,
  );
  assert.equal(conversation?.body['saleTransactionId'], '71');
  assert.equal(conversation?.body['saleSellerId'], '123');
  assert.equal(conversation?.body['saleTrackingVersion'], undefined);
  assert.equal(snapshot.areas.sales.failure, undefined);
});

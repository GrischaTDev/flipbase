import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEbayOrderImportHandler } from './order-import.ts';
import type { EbayOrderImportStore, StoredEbayOrderSnapshot } from './order-import.ts';
import type { StoredEbayConnection } from './handler.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import type { EbayOrderBooking, EbayOrderReview } from '../_shared/ebay-order-import-contracts.ts';
import { encryptTokens } from '../_shared/ebay-token-encryption.ts';
import { classifyEbayBookingError } from './order-booking-error.ts';
import {
  ebayOrderReviewHash,
  ebayOrderSourceKey,
  parseEbayOrderSource,
} from '../_shared/ebay-order-source.ts';

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const connectionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const snapshotId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const config: EbayConfig = {
  clientId: 'app',
  clientSecret: 'private-secret',
  ruName: 'runame',
  environment: 'production',
  encryptionKey: btoa('12345678901234567890123456789012'),
  appUrl: 'https://app.example.test',
  allowedOrigins: ['https://app.example.test'],
};
const connection: StoredEbayConnection = {
  id: connectionId,
  workspace_id: workspaceId,
  user_id: userId,
  environment: 'production',
  status: 'connected',
  username: 'seller',
  external_account_id: 'private-account',
  last_read_at: null,
  authorization_version: 1,
};
const money = (value: string) => ({ value, currency: 'EUR' });
const providerOrder = {
  orderId: 'order-1',
  creationDate: '2026-10-01T10:00:00Z',
  orderPaymentStatus: 'PAID',
  orderFulfillmentStatus: 'NOT_STARTED',
  cancelStatus: { cancelState: 'NONE_REQUESTED' },
  pricingSummary: { total: money('14.00'), deliveryCost: money('4.00') },
  lineItems: [
    {
      lineItemId: 'line-1',
      legacyItemId: '123',
      title: 'Artikel',
      quantity: 2,
      lineItemCost: money('10.00'),
      refunds: [],
    },
  ],
  buyer: { username: 'private-buyer' },
};
async function fixture() {
  const source = parseEbayOrderSource(providerOrder, new Date().toISOString());
  const reviewHash = await ebayOrderReviewHash(source);
  const snapshot: StoredEbayOrderSnapshot = {
    id: snapshotId,
    workspace_id: workspaceId,
    connection_id: connectionId,
    user_id: userId,
    authorization_version: 1,
    environment: 'production',
    external_account_id: 'private-account',
    source,
    review_hash: reviewHash,
    source_key: await ebayOrderSourceKey(
      config.encryptionKey,
      workspaceId,
      'production',
      'private-account',
      'order-1',
    ),
    expires_at: new Date(Date.now() + 300000).toISOString(),
    booking_ready: false,
  };
  const encryptedTokens = await encryptTokens(
    {
      accessToken: 'private-access',
      refreshToken: 'private-refresh',
      expiresAt: Date.now() + 100000,
      refreshExpiresAt: Date.now() + 1000000,
    },
    config.encryptionKey,
    connectionId,
  );
  let booking: EbayOrderBooking = { status: 'unrecorded', saleId: null };
  const staged: boolean[] = [];
  const methods: string[] = [];
  let books = 0;
  let finishes = 0;
  const store: EbayOrderImportStore = {
    authenticate: async (bearer) => (bearer === 'Bearer valid' ? userId : null),
    canConnect: async (_bearer, id) => id === workspaceId,
    status: async () => connection,
    begin: async () => connection,
    consume: async () => null,
    complete: async () => true,
    disconnect: async () => {},
    claim: async () => ({ connection, encryptedTokens }),
    finish: async () => {
      finishes++;
      return true;
    },
    importAvailable: async () => true,
    snapshot: async () => snapshot,
    getBooking: async () => booking,
    storeSnapshot: async (
      _connection,
      _operation,
      _key,
      hash,
      value,
      ready,
    ): Promise<EbayOrderReview> => {
      staged.push(ready);
      return {
        workspaceId,
        connectionId,
        snapshotId,
        reviewHash: hash,
        expiresAt: new Date(Date.now() + (ready ? 30000 : 300000)).toISOString(),
        source: value,
        assignments: [],
        booking,
      };
    },
    book: async (bearer, input) => {
      assert.equal(bearer, 'Bearer valid');
      assert.equal(input.workspaceId, workspaceId);
      books++;
      booking = { status: 'imported', saleId: snapshotId, alreadyRecorded: false };
      return booking;
    },
    markRecordedElsewhere: async () => ({ status: 'recorded_elsewhere', saleId: null }),
    clearRecordedElsewhere: async () => true,
  };
  const fetcher: typeof fetch = async (_input, init) => {
    methods.push(init && 'method' in init ? String(init.method) : 'GET');
    return Response.json(providerOrder);
  };
  const request = (action: string, extra: Record<string, unknown> = {}, bearer = 'Bearer valid') =>
    new Request('https://db.example.test/functions/v1/ebay-account', {
      method: 'POST',
      headers: { authorization: bearer, origin: config.appUrl },
      body: JSON.stringify({ action, workspaceId, connectionId, orderId: 'order-1', ...extra }),
    });
  const input = {
    snapshotId,
    reviewHash,
    assignments: [{ lineItemId: 'line-1', target: { catalogProductId: userId } }],
    costs: {
      platformFeeCents: 0,
      shippingCostCents: 400,
      shippingMode: 'seller_arranged',
      additionalCosts: [],
    },
  };
  return {
    store,
    snapshot,
    request,
    input,
    fetcher,
    staged,
    methods,
    counts: () => ({ books, finishes }),
  };
}

test('returns bounded definite booking rejections without internal database details', async () => {
  for (const [code, message, expected] of [
    [
      '22023',
      'Vorhandenen eBay-Verkauf bitte zuerst prüfen und manuell zuordnen',
      'legacy_sale_conflict',
    ],
    ['P0001', 'Nicht genügend verfügbarer Bestand', 'stock_unavailable'],
    ['22023', 'Dieser Artikel ist archiviert.', 'target_archived'],
  ]) {
    const f = await fixture();
    f.store.book = async () => {
      throw classifyEbayBookingError({ code, message });
    };
    const response = await createEbayOrderImportHandler(
      f.store,
      config,
      f.fetcher,
    )(f.request('order_book', f.input));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: expected });
    assert.equal(f.counts().books, 0);
  }
});

test('keeps unknown transport errors ambiguous and does not expose database text', async () => {
  const f = await fixture();
  f.store.book = async () => {
    throw classifyEbayBookingError({
      code: 'PGRST000',
      message: 'private connection or schema detail',
    });
  };
  const response = await createEbayOrderImportHandler(
    f.store,
    config,
    f.fetcher,
  )(f.request('order_book', f.input));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'request_failed' });
});

test('requires verified user for every import action', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  for (const action of [
    'order_review',
    'order_book',
    'order_status',
    'order_recorded_elsewhere',
    'order_clear_recorded_elsewhere',
  ]) {
    assert.equal((await handler(f.request(action, f.input, 'Bearer forged'))).status, 401);
    assert.equal(
      (await handler(f.request(action, { ...f.input, workspaceId: userId }))).status,
      403,
    );
  }
  assert.deepEqual(f.methods, []);
  assert.equal(f.counts().books, 0);
});
test('stages only a display snapshot for a review and never exposes tokens or account IDs', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  const response = await handler(f.request('order_review'));
  assert.equal(response.status, 200);
  const text = await response.text();
  for (const privateValue of [
    'private-account',
    'private-access',
    'private-refresh',
    'private-secret',
    'private-buyer',
    userId,
  ])
    assert.equal(text.includes(privateValue), false);
  assert.deepEqual(f.staged, [false]);
  assert.deepEqual(f.methods, ['GET']);
});
test('rechecks a review-only snapshot and stages a short-lived ready source before user booking', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal((await handler(f.request('order_book', f.input))).status, 200);
  assert.deepEqual(f.staged, [true]);
  assert.deepEqual(f.methods, ['GET']);
  assert.deepEqual(f.counts(), { books: 1, finishes: 1 });
});
test('rechecks changed source before booking', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, async () =>
    Response.json({ ...providerOrder, cancelStatus: { cancelState: 'CANCEL_REQUESTED' } }),
  );
  const response = await handler(f.request('order_book', f.input));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).status, 'review_changed');
  assert.deepEqual(f.staged, [false]);
  assert.equal(f.counts().books, 0);
});
test('resolves a committed response loss without another provider read, even after review expiry', async () => {
  const f = await fixture();
  let booked = false;
  const originalBook = f.store.book;
  f.store.book = async (...args) => {
    await originalBook(...args);
    booked = true;
    throw new Error('response lost');
  };
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal((await handler(f.request('order_book', f.input))).status, 503);
  assert.equal(booked, true);
  f.snapshot.expires_at = '2000-01-01T00:00:00Z';
  const response = await handler(f.request('order_book', f.input));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyRecorded, true);
  assert.deepEqual(f.methods, ['GET']);
  assert.equal(f.counts().books, 1);
});
test('foreign, expired or forged reviews cannot trigger provider reads or booking', async () => {
  for (const alteration of [
    { user_id: workspaceId },
    { connection_id: userId },
    { external_account_id: 'foreign' },
    { authorization_version: 2 },
    { source_key: 'f'.repeat(64) },
    { expires_at: '2000-01-01T00:00:00Z' },
  ]) {
    const f = await fixture();
    Object.assign(f.snapshot, alteration);
    const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
    assert.equal((await handler(f.request('order_book', f.input))).status, 409);
    assert.deepEqual(f.methods, []);
    assert.equal(f.counts().books, 0);
  }
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal(
    (await handler(f.request('order_book', { ...f.input, reviewHash: 'b'.repeat(64) }))).status,
    409,
  );
});
test('releases token lock after provider failure and does not book after connection change', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, async () =>
    Response.json({}, { status: 503 }),
  );
  assert.equal((await handler(f.request('order_book', f.input))).status, 502);
  assert.deepEqual(f.counts(), { books: 0, finishes: 1 });
  f.store.finish = async () => false;
  const changed = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal((await changed(f.request('order_book', f.input))).status, 409);
  assert.equal(f.counts().books, 0);
});
test('status does not read eBay; manual marker and its reversal require explicit confirmation', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal((await handler(f.request('order_status'))).status, 200);
  for (const action of ['order_recorded_elsewhere', 'order_clear_recorded_elsewhere'])
    assert.equal(
      (
        await handler(
          f.request(action, {
            snapshotId,
            reviewHash: f.input.reviewHash,
            reason: 'Manuell gebucht',
          }),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await handler(
        f.request('order_recorded_elsewhere', {
          snapshotId,
          reviewHash: f.input.reviewHash,
          reason: 'Manuell gebucht',
          confirmed: true,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await handler(f.request('order_clear_recorded_elsewhere', { confirmed: true }))).status,
    200,
  );
  assert.deepEqual(f.methods, []);
});
test('a concurrent manual marker prevents reporting a newly booked sale', async () => {
  const f = await fixture();
  f.store.book = async () => ({ status: 'recorded_elsewhere', saleId: null });
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal((await handler(f.request('order_book', f.input))).status, 409);
});
test('rejects oversized UTF-8 bodies, unsafe identifiers and unconfirmed costs', async () => {
  const f = await fixture();
  const handler = createEbayOrderImportHandler(f.store, config, f.fetcher);
  assert.equal((await handler(f.request('order_review', { note: '€'.repeat(23000) }))).status, 400);
  assert.equal(
    (await handler(f.request('order_review', { orderId: 'x'.repeat(257) }))).status,
    400,
  );
  assert.equal(
    (
      await handler(
        f.request('order_book', {
          ...f.input,
          costs: { ...f.input.costs, platformFeeCents: null },
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        f.request('order_book', {
          ...f.input,
          assignments: [...f.input.assignments, ...f.input.assignments],
        }),
      )
    ).status,
    400,
  );
  assert.deepEqual(f.methods, []);
});

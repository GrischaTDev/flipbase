import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EbaySaleReviewStore } from './ebay-sale-review.store';
import {
  EbayOrderImportApiService,
  EbayOrderImportRequestError,
} from '../../marketplaces/services/ebay-order-import-api.service';
import { SalesService } from '../../../core/services/sales.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { StockService } from '../../../core/services/stock.service';
import type { RecordSaleInput } from '../../../core/services/sales.service';
import type { EbayOrderReview } from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';

const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const review: EbayOrderReview = {
  ...scope,
  snapshotId: id,
  reviewHash: 'a'.repeat(64),
  expiresAt: '2099-10-01T10:06:00Z',
  source: {
    orderId: 'order-1',
    createdAt: '2026-09-30T22:30:00Z',
    lastModifiedAt: null,
    observedAt: '2026-10-01T10:01:00Z',
    paymentStatus: 'PAID',
    cancelStatus: 'NONE_REQUESTED',
    fulfillmentStatus: 'NOT_STARTED',
    currency: 'EUR',
    totalCents: 1400,
    shippingRevenueCents: 400,
    blockers: [],
    lines: [
      {
        lineItemId: 'line-1',
        listingId: '123',
        variationId: null,
        sku: null,
        title: 'Artikel',
        quantity: 3,
        goodsCents: 1000,
        hasRefund: false,
        variationAspects: [],
      },
    ],
  },
  assignments: [{ lineItemId: 'line-1', target: { catalogProductId: id } }],
  booking: { status: 'unrecorded', saleId: null },
};
const input: RecordSaleInput = {
  platform: 'ebay',
  saleDate: '2026-10-01',
  externalOrderId: 'order-1',
  shippingRevenue: 4,
  platformFee: 0,
  shippingCost: 4,
  shippingMode: 'seller_arranged',
  additionalCosts: [],
  lines: [
    { catalogProductId: id, titleSnapshot: 'Artikel', quantity: 2, unitSalePrice: 3.33 },
    { catalogProductId: id, titleSnapshot: 'Artikel', quantity: 1, unitSalePrice: 3.34 },
  ],
};
describe('eBay-Bestellprüfung', () => {
  let store: EbaySaleReviewStore;
  let api: {
    prepareOrder: ReturnType<typeof vi.fn>;
    bookOrder: ReturnType<typeof vi.fn>;
    loadOrderStatus: ReturnType<typeof vi.fn>;
    markRecordedElsewhere: ReturnType<typeof vi.fn>;
    clearRecordedElsewhere: ReturnType<typeof vi.fn>;
  };
  let refresh: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    api = {
      prepareOrder: vi.fn(async () => review),
      bookOrder: vi.fn(async () => ({ status: 'imported', saleId: id, alreadyRecorded: false })),
      loadOrderStatus: vi.fn(async () => ({ status: 'unrecorded', saleId: null })),
      markRecordedElsewhere: vi.fn(async () => ({ status: 'recorded_elsewhere', saleId: null })),
      clearRecordedElsewhere: vi.fn(async () => undefined),
    };
    refresh = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        EbaySaleReviewStore,
        { provide: EbayOrderImportApiService, useValue: api },
        { provide: SalesService, useValue: { refreshAfterExternalSale: refresh } },
        { provide: InventoryService, useValue: { items: signal([]) } },
        {
          provide: StockService,
          useValue: {
            positions: signal([
              { catalog_product_id: id, title: 'Artikel', available_quantity: 5 },
            ]),
          },
        },
      ],
    });
    store = TestBed.inject(EbaySaleReviewStore);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('loads full source after route reload and splits cents deterministically', async () => {
    await store.load(scope, 'order-1');
    expect(api.prepareOrder).toHaveBeenCalledWith(scope, 'order-1');
    expect(store.draft()?.saleDate).toBe('2026-10-01');
    expect(
      store.draft()?.lines.map((line) => [line.sourceLineId, line.quantity, line.unitSalePrice]),
    ).toEqual([
      ['line-1', 2, 3.33],
      ['line-1', 1, 3.34],
    ]);
  });
  it('submits one assignment per source line and explicit exact costs', async () => {
    await store.load(scope, 'order-1');
    expect(await store.submit(input)).toEqual({ status: 'saved' });
    expect(api.bookOrder).toHaveBeenCalledWith({
      ...scope,
      orderId: 'order-1',
      snapshotId: id,
      reviewHash: review.reviewHash,
      assignments: review.assignments,
      costs: {
        platformFeeCents: 0,
        shippingCostCents: 400,
        shippingMode: 'seller_arranged',
        additionalCosts: [],
      },
    });
    expect(refresh).toHaveBeenCalledWith(scope.workspaceId);
    expect(await store.submit(input)).toEqual({ status: 'saved' });
    expect(api.bookOrder).toHaveBeenCalledOnce();
  });
  it('preserves costs after changed review by keeping the form external and returning a new revision', async () => {
    await store.load(scope, 'order-1');
    const old = store.draft()?.revision;
    const changed = {
      ...review,
      snapshotId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      reviewHash: 'b'.repeat(64),
      source: { ...review.source, totalCents: 1500, shippingRevenueCents: 500 },
    };
    api.bookOrder.mockResolvedValueOnce({ status: 'review_changed', review: changed });
    expect(await store.submit(input)).toEqual({ status: 'review_changed' });
    expect(store.draft()?.revision).not.toBe(old);
    expect(store.reviewChanged()).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });
  it('resolves unknown outcome before retry without another booking', async () => {
    await store.load(scope, 'order-1');
    api.bookOrder.mockRejectedValueOnce(new EbayOrderImportRequestError('Antwort fehlt', true));
    expect(await store.submit(input)).toEqual({ status: 'outcome_unknown' });
    expect(await store.submit(input)).toEqual({ status: 'outcome_unknown' });
    expect(api.bookOrder).toHaveBeenCalledOnce();
    api.loadOrderStatus.mockResolvedValueOnce({
      status: 'imported',
      saleId: id,
      alreadyRecorded: true,
    });
    await store.resolveOutcome();
    expect(store.booking().status).toBe('imported');
    expect(store.outcomeUnknown()).toBe(false);
    expect(api.bookOrder).toHaveBeenCalledOnce();
    expect(api.prepareOrder).toHaveBeenCalledOnce();
  });
  it('obtains a fresh review after confirmed unrecorded status but never retries automatically', async () => {
    await store.load(scope, 'order-1');
    api.bookOrder.mockRejectedValueOnce(new Error('timeout'));
    await store.submit(input);
    api.prepareOrder.mockResolvedValueOnce({
      ...review,
      snapshotId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    await store.resolveOutcome();
    expect(store.outcomeUnknown()).toBe(false);
    expect(api.loadOrderStatus).toHaveBeenCalledOnce();
    expect(api.prepareOrder).toHaveBeenCalledTimes(2);
    expect(api.bookOrder).toHaveBeenCalledOnce();
  });
  it('does not rebook after post-commit refresh failure', async () => {
    await store.load(scope, 'order-1');
    refresh.mockRejectedValueOnce(new Error('offline'));
    expect(await store.submit(input)).toEqual({ status: 'saved' });
    expect(store.booking().status).toBe('imported');
    expect(store.error()).toContain('Ansicht');
    expect(await store.submit(input)).toEqual({ status: 'saved' });
    expect(api.bookOrder).toHaveBeenCalledOnce();
  });
  it('ignores stale workspace responses', async () => {
    let finish: (value: EbayOrderReview) => void = () => undefined;
    api.prepareOrder.mockImplementationOnce(
      () =>
        new Promise<EbayOrderReview>((resolve) => {
          finish = resolve;
        }),
    );
    const old = store.load(scope, 'order-1');
    const next = { ...review, workspaceId: 'workspace-b' };
    api.prepareOrder.mockResolvedValueOnce(next);
    await store.load({ ...scope, workspaceId: 'workspace-b' }, 'order-1');
    finish(review);
    await old;
    expect(store.review()?.workspaceId).toBe('workspace-b');
  });
  it('marks manual order without sale or stock mutation and reverses only the marker', async () => {
    await store.load(scope, 'order-1');
    await store.markRecordedElsewhere('Schon manuell erfasst');
    expect(api.markRecordedElsewhere).toHaveBeenCalledWith(review, 'Schon manuell erfasst', null);
    expect(store.booking().status).toBe('recorded_elsewhere');
    expect(api.bookOrder).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    await store.clearRecordedElsewhere();
    expect(api.clearRecordedElsewhere).toHaveBeenCalledWith(scope, 'order-1');
    expect(api.bookOrder).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it('rejects tampered source geometry, disagreeing split targets and missing confirmed costs before network booking', async () => {
    await store.load(scope, 'order-1');
    for (const changed of [
      { ...input, platformFee: undefined },
      { ...input, shippingCost: 0.001 },
      { ...input, saleDate: '2026-09-30' },
      { ...input, lines: [{ ...input.lines[0], quantity: 1 }, input.lines[1]] },
      {
        ...input,
        lines: [
          input.lines[0],
          { ...input.lines[1], catalogProductId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        ],
      },
    ]) {
      expect((await store.submit(changed)).status).toBe('rejected');
    }
    expect(api.bookOrder).not.toHaveBeenCalled();
  });
  it('reports definite provider rejection separately from changed or unknown orders', async () => {
    await store.load(scope, 'order-1');
    api.bookOrder.mockRejectedValueOnce(
      new EbayOrderImportRequestError('eBay ist nicht erreichbar'),
    );
    expect(await store.submit(input)).toEqual({
      status: 'rejected',
      message: 'eBay ist nicht erreichbar',
    });
    expect(store.outcomeUnknown()).toBe(false);
    expect(store.reviewChanged()).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  parseEbayArticleMapping,
  parseEbayOrderBooking,
  parseEbayOrderReview,
  parseEbayOrderBookResponse,
} from './ebay-order-import-response';
import { parseEbayListing, parseEbayOrder, parseEbayStatus } from './ebay-response';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scope = { workspaceId: 'workspace-a', connectionId: 'connection-a' };
const source = {
  orderId: 'order-1',
  createdAt: '2026-10-01T10:00:00Z',
  lastModifiedAt: null,
  observedAt: '2026-10-01T10:01:00Z',
  paymentStatus: 'PAID',
  cancelStatus: 'NONE_REQUESTED',
  fulfillmentStatus: 'NOT_STARTED',
  currency: 'EUR',
  totalCents: 1000,
  shippingRevenueCents: 0,
  blockers: [],
  lines: [
    {
      lineItemId: 'line-1',
      listingId: '123',
      variationId: '456',
      sku: null,
      title: 'Artikel',
      quantity: 2,
      goodsCents: 1000,
      hasRefund: false,
      variationAspects: [{ name: 'Größe', value: 'M' }],
    },
  ],
};
const review = {
  ...scope,
  snapshotId: id,
  reviewHash: 'a'.repeat(64),
  expiresAt: '2026-10-01T10:06:00Z',
  source,
  assignments: [{ lineItemId: 'line-1', target: { catalogProductId: id } }],
  booking: { status: 'unrecorded', saleId: null },
};
describe('eBay-Übernahmeantworten', () => {
  it('bindet Prüfstände an erwarteten Workspace, Verbindung und Bestellung', () => {
    expect(parseEbayOrderReview(review, scope, 'order-1')).toEqual(review);
    for (const change of [
      { workspaceId: 'other' },
      { connectionId: 'other' },
      { source: { ...source, orderId: 'other' } },
      { reviewHash: 'bad' },
      { snapshotId: 'bad' },
      { expiresAt: 'bad' },
    ])
      expect(() => parseEbayOrderReview({ ...review, ...change }, scope, 'order-1')).toThrow();
  });
  it('erhält Nullwerte und gesperrte Quellen, entfernt private Zusatzdaten', () => {
    const parsed = parseEbayOrderReview(
      {
        ...review,
        privateToken: 'secret',
        source: {
          ...source,
          totalCents: null,
          blockers: ['invalid_amounts'],
          buyer: 'private',
          lines: [{ ...source.lines[0], quantity: null, goodsCents: null }],
        },
      },
      scope,
      'order-1',
    );
    expect(parsed.source.totalCents).toBeNull();
    expect(parsed.source.lines[0].quantity).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('private');
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });
  it('weist fehlerhafte Centbeträge, Positionen und Zuordnungen zurück', () => {
    for (const change of [
      { totalCents: 1.5 },
      { shippingRevenueCents: -1 },
      { lines: [...source.lines, ...source.lines] },
      { lines: [{ ...source.lines[0], quantity: 0 }] },
    ])
      expect(() =>
        parseEbayOrderReview({ ...review, source: { ...source, ...change } }, scope, 'order-1'),
      ).toThrow();
    expect(() =>
      parseEbayOrderReview(
        { ...review, assignments: [...review.assignments, ...review.assignments] },
        scope,
        'order-1',
      ),
    ).toThrow();
    expect(() =>
      parseEbayOrderReview(
        { ...review, assignments: [{ lineItemId: 'foreign', target: { catalogProductId: id } }] },
        scope,
        'order-1',
      ),
    ).toThrow();
  });
  it('unterscheidet gebucht, manuell erfasst und ungeprüft', () => {
    expect(
      parseEbayOrderBooking({ status: 'imported', saleId: id, alreadyRecorded: true }).status,
    ).toBe('imported');
    expect(parseEbayOrderBooking({ status: 'recorded_elsewhere', saleId: null }).status).toBe(
      'recorded_elsewhere',
    );
    expect(() =>
      parseEbayOrderBooking({ status: 'imported', saleId: null, alreadyRecorded: true }),
    ).toThrow();
    expect(() => parseEbayOrderBooking({ status: 'unrecorded', saleId: id })).toThrow();
    expect(() => parseEbayOrderBooking({ status: 'imported', saleId: id })).toThrow();
  });
  it('liest die erneute Prüfung als eigenes Ergebnis', () => {
    expect(
      parseEbayOrderBookResponse({ status: 'review_changed', review }, scope, 'order-1'),
    ).toEqual({ status: 'review_changed', review });
    expect(() =>
      parseEbayOrderBookResponse({ status: 'recorded_elsewhere', saleId: null }, scope, 'order-1'),
    ).toThrow();
  });
  it('erlaubt nur genau einen konkreten Zielartikel pro Zuordnung', () => {
    const mapping = { id, listingId: '123', variationId: '456', target: { catalogProductId: id } };
    expect(parseEbayArticleMapping(mapping)).toEqual(mapping);
    expect(() =>
      parseEbayArticleMapping({
        ...mapping,
        target: { catalogProductId: id, inventoryItemId: id },
      }),
    ).toThrow();
    expect(() =>
      parseEbayArticleMapping({ ...mapping, target: { catalogProductId: 'bad' } }),
    ).toThrow();
  });
  it('fehlende Importfähigkeit und alte Quellantwort bleiben ausgeschaltet', () => {
    expect(
      parseEbayStatus({ configured: true, connection: null }, scope.workspaceId).importAvailable,
    ).toBe(false);
    expect(
      parseEbayStatus(
        { configured: true, connection: null, importAvailable: true },
        scope.workspaceId,
      ).importAvailable,
    ).toBe(true);
    const order = parseEbayOrder({
      id: 'order-1',
      createdAt: source.createdAt,
      paymentStatus: 'PAID',
      fulfillmentStatus: 'NOT_STARTED',
      cancelStatus: null,
      total: 10,
      currency: 'EUR',
      items: [],
    });
    expect(order.importSource).toBeNull();
  });
  it('erhält Varianten ohne stabile Kennung und prüft Quelle gegen die Listenbestellung', () => {
    const listing = parseEbayListing({
      id: '123',
      title: 'Artikel',
      price: 10,
      currency: 'EUR',
      quantity: 2,
      listingType: 'FixedPriceItem',
      url: null,
      hasVariations: true,
      variants: [{ id: null, sku: null, quantity: 2, aspects: [{ name: 'Größe', value: 'M' }] }],
    });
    expect(listing.variants?.[0].id).toBeNull();
    expect(listing.hasVariations).toBe(true);
    const order = {
      id: 'order-1',
      createdAt: source.createdAt,
      paymentStatus: 'PAID',
      fulfillmentStatus: 'NOT_STARTED',
      cancelStatus: null,
      total: 10,
      currency: 'EUR',
      items: [],
      importSource: source,
    };
    expect(parseEbayOrder(order).importSource).toEqual(source);
    expect(() =>
      parseEbayOrder({ ...order, importSource: { ...source, orderId: 'other' } }),
    ).toThrow();
  });
});

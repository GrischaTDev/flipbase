import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '../../../core/models/flipbase.models';
import {
  LISTING_LIMITS,
  canPrepareListing,
  listingStatusLabel,
  validateListingContent,
} from './listing.rules';

const item = (
  status: InventoryItem['status'],
  archivedAt: string | null = null,
): InventoryItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  title: 'Bosch Akkuschrauber',
  condition: 'very_good',
  status,
  allocated_purchase_cost: 20,
  archived_at: archivedAt,
});

describe('listing rules', () => {
  it.each(['received', 'needs_review', 'researched', 'ready', 'listed', 'returned'] as const)(
    'allows %s inventory items',
    (status) => expect(canPrepareListing(item(status))).toEqual({ allowed: true }),
  );

  it.each(['reserved', 'sold', 'defective', 'archived'] as const)(
    'rejects %s inventory items with a user-facing reason',
    (status) => expect(canPrepareListing(item(status))).toMatchObject({ allowed: false }),
  );

  it('rejects archived metadata independently of the status', () => {
    expect(canPrepareListing(item('ready', '2026-09-20T00:00:00Z'))).toMatchObject({
      allowed: false,
    });
  });

  it('allows catalog products with available quantity', () => {
    expect(
      canPrepareListing({
        targetKind: 'catalog_product',
        availableQuantity: 5,
      }),
    ).toEqual({ allowed: true });
  });

  it('rejects catalog products with zero or negative available quantity', () => {
    expect(
      canPrepareListing({
        targetKind: 'catalog_product',
        availableQuantity: 0,
      }),
    ).toEqual({
      allowed: false,
      reason: 'Kein verfügbarer Bestand für dieses Produkt vorhanden.',
    });
  });

  it('accepts exact Kleinanzeigen boundaries', () => {
    expect(
      validateListingContent({
        title: 'x'.repeat(LISTING_LIMITS.title),
        description: 'x'.repeat(LISTING_LIMITS.description),
        price: LISTING_LIMITS.price,
        priceType: 'FIXED',
        shippingType: 'shipping',
        shippingPrice: 0,
        postalCode: '12345',
      }),
    ).toEqual([]);
  });

  it('rejects values one unit beyond every boundary', () => {
    const errors = validateListingContent({
      title: 'x'.repeat(LISTING_LIMITS.title + 1),
      description: 'x'.repeat(LISTING_LIMITS.description + 1),
      price: LISTING_LIMITS.price + 0.01,
      priceType: 'FIXED',
      shippingType: 'shipping',
      shippingPrice: -0.01,
      postalCode: '123456',
    });

    expect(errors.map((error) => error.field)).toEqual([
      'title',
      'description',
      'price',
      'shippingPrice',
      'postalCode',
    ]);
  });

  it('uses the agreed German status labels', () => {
    expect((['prepared', 'online', 'ended'] as const).map(listingStatusLabel)).toEqual([
      'Vorbereitet',
      'Online',
      'Beendet',
    ]);
  });
});

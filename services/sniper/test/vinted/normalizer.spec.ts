import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import type { VintedItem } from '../../src/vinted/schema.js';
import { VintedCatalogSchema } from '../../src/vinted/schema.js';
import { normalizeVintedItem } from '../../src/vinted/normalizer.js';

const parsed = VintedCatalogSchema.parse(fixture);
const firstItem = parsed.items[0]!;

describe('normalizeVintedItem', () => {
  it('uses the total price including buyer protection', () => {
    const item = {
      ...firstItem,
      price: { amount: '45.0', currency_code: 'EUR' },
      total_item_price: { amount: '47.95', currency_code: 'EUR' },
    };

    const listing = normalizeVintedItem(item);

    expect(listing.price.amount).toBe(47.95);
    expect(listing.price.currency).toBe('EUR');
  });

  it('never carries a seller field into the listing', () => {
    // Simulate a scenario where the schema includes a user field. The normalizer
    // must drop it even if present in the input, preserving privacy.
    const itemWithSeller = {
      ...firstItem,
      user: {
        id: 4711,
        login: 'seller_0',
        profile_url: 'https://www.vinted.de/member/4711-seller-0',
        photo: { url: 'https://images.example/avatar.jpg' },
      },
    } as VintedItem;

    const listing = normalizeVintedItem(itemWithSeller);
    const serialised = JSON.stringify(listing);

    expect(serialised).not.toContain('seller_0');
    expect(serialised).not.toContain('profile_url');
    // Die Kennung und das Profilfoto gehoeren zu den vier Feldern, die die
    // Projektregel ausdruecklich nennt. Ohne diese beiden Zusicherungen bliebe
    // etwa `imageUrl: item.user?.photo?.url ?? item.photo?.url` unentdeckt.
    expect(serialised).not.toContain('4711');
    expect(serialised).not.toContain('avatar.jpg');
    expect(Object.keys(listing)).not.toContain('user');
  });

  it('turns the photo timestamp into an ISO string', () => {
    const item = {
      ...firstItem,
      photo: { url: 'https://images.example/1.jpg', high_resolution: { timestamp: 1788077565 } },
    };

    const listing = normalizeVintedItem(item);

    expect(listing.photoUploadedAt).toBe('2026-08-30T08:12:45.000Z');
    expect(listing.imageUrl).toBe('https://images.example/1.jpg');
  });

  it('falls back to null for every optional field', () => {
    const item = {
      ...firstItem,
      brand_title: null,
      size_title: null,
      status: null,
      photo: null,
    };

    const listing = normalizeVintedItem(item);

    expect(listing.brand).toBeNull();
    expect(listing.size).toBeNull();
    expect(listing.condition).toBeNull();
    expect(listing.photoUploadedAt).toBeNull();
    expect(listing.imageUrl).toBeNull();
  });

  it('keeps the external id as a string', () => {
    const listing = normalizeVintedItem({ ...firstItem, id: 9825064708 });

    expect(listing.externalId).toBe('9825064708');
  });
});

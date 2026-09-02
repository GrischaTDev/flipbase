import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/vinted-catalog.json' with { type: 'json' };
import type { VintedItem } from '../../src/vinted/schema.js';
import { VintedCatalogSchema } from '../../src/vinted/schema.js';
import { normalizeVintedItem } from '../../src/vinted/normalizer.js';

const parsed = VintedCatalogSchema.parse(fixture);
const firstItem = parsed.items[0]!;

describe('normalizeVintedItem', () => {
  it('keeps item price and total price apart', () => {
    const item = {
      ...firstItem,
      price: { amount: '45.0', currency_code: 'EUR' },
      total_item_price: { amount: '47.95', currency_code: 'EUR' },
    };

    const listing = normalizeVintedItem(item);

    expect(listing.itemPrice.amount).toBe(45);
    expect(listing.totalPrice.amount).toBe(47.95);
    expect(listing.totalPrice.currency).toBe('EUR');
  });

  it('falls back to the total price when the item price is missing', () => {
    const { price: _dropped, ...withoutPrice } = firstItem;
    const item = {
      ...withoutPrice,
      total_item_price: { amount: '47.95', currency_code: 'EUR' },
    } as VintedItem;

    const listing = normalizeVintedItem(item);

    // Lieber beide gleich als eine erfundene Aufteilung: Der Kaeuferschutz ist
    // kein fester Satz, er laesst sich nicht zurueckrechnen.
    expect(listing.itemPrice.amount).toBe(47.95);
    expect(listing.totalPrice.amount).toBe(47.95);
  });

  it('carries the seller name and avatar, but nothing that identifies further', () => {
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

    expect(listing.seller.name).toBe('seller_0');
    expect(listing.seller.avatarUrl).toBe('https://images.example/avatar.jpg');

    // Der Riegel bleibt, nur enger: Kennung und Profiladresse identifizieren
    // eine Person, ohne bei der Kaufentscheidung zu helfen. Ohne diese beiden
    // Zusicherungen wuerde ein spaeteres `...item.user` unbemerkt durchrutschen.
    expect(serialised).not.toContain('profile_url');
    expect(serialised).not.toContain('4711');
  });

  it('leaves the detail-only seller fields empty', () => {
    // Bewertung und Bewertungszahl stehen nicht im Katalog. Sie hier zu raten
    // waere schlimmer als sie leer zu lassen - Etappe 2 laedt sie fuer Treffer
    // nach.
    const listing = normalizeVintedItem(firstItem);

    expect(listing.seller.rating).toBeNull();
    expect(listing.seller.reviewCount).toBeNull();
    expect(listing.description).toBeNull();
    expect(listing.countryCode).toBeNull();
    expect(listing.itemUpdatedAt).toBeNull();
  });

  it('collects every photo and puts the main one first', () => {
    const item = {
      ...firstItem,
      photos: [
        { url: 'https://images.example/second.jpg', is_main: false },
        { url: 'https://images.example/main.jpg', is_main: true },
        { url: 'https://images.example/third.jpg', is_main: false },
      ],
    } as VintedItem;

    const listing = normalizeVintedItem(item);

    expect(listing.imageUrls).toEqual([
      'https://images.example/main.jpg',
      'https://images.example/second.jpg',
      'https://images.example/third.jpg',
    ]);
  });

  it('marks an invisible item as hidden and defaults to visible', () => {
    const hidden = normalizeVintedItem({ ...firstItem, is_visible: false } as VintedItem);
    const { is_visible: _unset, ...withoutFlag } = firstItem;

    expect(hidden.isHidden).toBe(true);
    // Ein fehlendes Feld darf nicht jeden Fund als unkaufbar ausweisen.
    expect(normalizeVintedItem(withoutFlag as VintedItem).isHidden).toBe(false);
  });

  it('turns the photo timestamp into an ISO string', () => {
    const { photos: _ignored, ...withoutPhotos } = firstItem;
    const item = {
      ...withoutPhotos,
      photo: { url: 'https://images.example/1.jpg', high_resolution: { timestamp: 1788077565 } },
    } as VintedItem;

    const listing = normalizeVintedItem(item);

    expect(listing.photoUploadedAt).toBe('2026-08-30T08:12:45.000Z');
    // Aeltere Antworten liefern nur das einzelne photo-Feld statt photos[].
    expect(listing.imageUrls).toEqual(['https://images.example/1.jpg']);
  });

  it('falls back to null for every optional field', () => {
    const item = {
      ...firstItem,
      brand_title: null,
      size_title: null,
      status: null,
      photo: null,
      photos: null,
      user: null,
    } as VintedItem;

    const listing = normalizeVintedItem(item);

    expect(listing.brand).toBeNull();
    expect(listing.size).toBeNull();
    expect(listing.condition).toBeNull();
    expect(listing.photoUploadedAt).toBeNull();
    expect(listing.imageUrls).toEqual([]);
    expect(listing.seller.name).toBeNull();
    expect(listing.seller.avatarUrl).toBeNull();
  });

  it('keeps the external id as a string', () => {
    const listing = normalizeVintedItem({ ...firstItem, id: 9825064708 });

    expect(listing.externalId).toBe('9825064708');
  });
});

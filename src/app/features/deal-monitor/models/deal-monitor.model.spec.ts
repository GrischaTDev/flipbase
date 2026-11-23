import { describe, expect, it } from 'vitest';
import {
  FeedItem,
  availableLiveSizes,
  effectiveFeedPriceBounds,
  feedSizeFromVintedTitle,
  feedSizeLabels,
  feedSizeValues,
  filterLiveFeedItems,
} from './deal-monitor.model';

describe('Feed-Größen', () => {
  it.each([
    ['M / 38 / 10', 'm'],
    ['xs / 34 / 6', 'xs'],
    ['S', 's'],
    ['L / 40 / 12', 'l'],
    ['XL', 'xl'],
    ['XXL / 44 / 16', 'xxl'],
    ['2XL', 'xxl'],
    ['XXXL', '3xl'],
    ['3XL', '3xl'],
    ['4XL / 50', '3xl'],
    ['XXXXL', '3xl'],
    ['3XL+', '3xl'],
  ])('bildet „%s“ auf %s ab', (title, size) => {
    expect(feedSizeFromVintedTitle(title)).toBe(size);
  });

  it.each(['42', 'One size', 'XXS', '', '0XL'])('ignoriert die unbekannte Größe „%s“', (title) => {
    expect(feedSizeFromVintedTitle(title)).toBeNull();
  });

  it('wandelt zwischen Werten und Beschriftungen um', () => {
    expect(feedSizeLabels(['m', '3xl'])).toBe('M · 3XL+');
    expect(feedSizeValues('M · 3XL+')).toEqual(['m', '3xl']);
  });
});

describe('Live-Filter im Feed', () => {
  const makeItem = (overrides: Partial<FeedItem>): FeedItem => ({
    id: 'item-1',
    title: 'Ralph Lauren Hemd',
    url: 'https://www.vinted.de/items/1',
    image_urls: [],
    item_price: 25,
    total_price: 27,
    currency: 'EUR',
    brand: 'Ralph Lauren',
    size: 'L / 40',
    condition: 'Sehr gut',
    is_hidden: false,
    first_seen_at: '2026-11-23T22:00:00Z',
    catalog_id: null,
    category_path: null,
    ...overrides,
  });

  it('filtert live nach Suchwort, Größe und Preis und respektiert Feed-Grenzen', () => {
    const feed = { price_from: 15, price_to: 40, sizes: ['m', 'l'] };
    const items = [
      makeItem({ id: '1', title: 'Ralph Lauren Hemd', item_price: 12, size: 'L' }),
      makeItem({ id: '2', title: 'Ralph Lauren Hemd', item_price: 25, size: 'L / 40' }),
      makeItem({ id: '3', title: 'Ralph Lauren Jacke', item_price: 35, size: 'M' }),
      makeItem({ id: '4', title: 'Ralph Lauren Hemd', item_price: 45, size: 'L' }),
    ];

    expect(effectiveFeedPriceBounds(feed)).toEqual({ min: 15, max: 40 });
    expect(availableLiveSizes(feed).map(({ value }) => value)).toEqual(['m', 'l']);

    // Live-Grenzen unter 15 € bzw. über 40 € dürfen die Feed-Grenzen nicht aufweichen.
    const filtered = filterLiveFeedItems(items, feed, {
      query: 'hemd',
      sizes: ['l'],
      minPrice: 5,
      maxPrice: 100,
    });
    expect(filtered.map(({ id }) => id)).toEqual(['2']);
  });
});

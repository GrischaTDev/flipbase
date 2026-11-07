import { describe, expect, it } from 'vitest';
import {
  MAX_ARTICLE_PRICE_COMPARISONS,
  summarizeArticlePrices,
  type ArticlePriceComparison,
} from '../../src/domain/article-price-statistics.js';

const asOf = '2026-11-07T12:00:00.000Z';
const comparison = (
  id: string,
  price: number,
  overrides: Partial<ArticlePriceComparison> = {},
): ArticlePriceComparison => ({
  id,
  url: `https://www.vinted.de/items/${id}-jacket`,
  title: 'Carhartt Prentis Liner',
  brand: 'Carhartt',
  size: 'L',
  condition: 'Sehr gut',
  price,
  currency: 'EUR',
  match: 'model',
  availability: 'active',
  observedAt: asOf,
  publishedEarliest: '2026-11-01T00:00:00.000Z',
  publishedLatest: '2026-11-02T00:00:00.000Z',
  ...overrides,
});

describe('article asking price statistics', () => {
  it.each([100, 1000, 2000])(
    'aggregates all %i synthetic offers instead of selecting a few examples',
    (count) => {
      const entries = Array.from({ length: count }, (_, index) =>
        comparison(String(index + 1), index + 1),
      );
      const result = summarizeArticlePrices(entries, { asOf });
      expect(result.category.observedOffers).toEqual({
        count,
        minimum: 1,
        lowerQuartile: Math.round((1 + (count - 1) * 0.25) * 100) / 100,
        median: (count + 1) / 2,
        upperQuartile: Math.round((1 + (count - 1) * 0.75) * 100) / 100,
        maximum: count,
      });
      expect(result.model.publishedInWindow).toEqual(result.category.observedOffers);
      expect(result.includedItemCount).toBe(count);
      expect(result.basis).toBe('asking');
      expect(result.quantileMethod).toBe('linear_interpolation');
    },
  );

  it('keeps the category population and the model subset visible independently', () => {
    const entries = [
      comparison('1', 60),
      comparison('2', 80),
      comparison('3', 20, { match: 'category', size: 'S' }),
      comparison('4', 100, { match: 'category', condition: 'Gut' }),
      comparison('5', 999, { match: 'different' }),
    ];
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result.category.observedOffers).toMatchObject({
      count: 4,
      minimum: 20,
      median: 70,
      maximum: 100,
    });
    expect(result.model.observedOffers).toMatchObject({
      count: 2,
      minimum: 60,
      median: 70,
      maximum: 80,
    });
    expect(result).toMatchObject({
      inputCount: 5,
      includedItemCount: 4,
      modelItemCount: 2,
      categoryOnlyItemCount: 2,
    });
    expect(result.excluded.different).toBe(1);
  });

  it('uses the newest observation per provider item and ignores URL variants without mutating input', () => {
    const entries = [
      comparison('1', 10, { observedAt: '2026-11-07T10:00:00.000Z' }),
      comparison('1', 20, { observedAt: '2026-11-07T11:00:00.000Z' }),
      comparison('1', 20, {
        observedAt: '2026-11-07T11:00:00.000Z',
        url: 'https://www.vinted.fr/items/1-other-slug',
      }),
    ];
    const before = structuredClone(entries);
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result).toEqual(summarizeArticlePrices([...entries].reverse(), { asOf }));
    expect(result).toMatchObject({ uniqueItemCount: 1, duplicateCount: 2, includedItemCount: 1 });
    expect(result.model.observedOffers).toMatchObject({ minimum: 20, maximum: 20, count: 1 });
    expect(entries).toEqual(before);
  });

  it('does not revive an older price when the newest observation has an invalid amount', () => {
    const result = summarizeArticlePrices(
      [
        comparison('1', 10, { observedAt: '2026-11-07T11:00:00.000Z' }),
        comparison('1', Number.NaN),
      ],
      { asOf },
    );
    expect(result.model.observedOffers).toBeNull();
    expect(result.excluded.invalid).toBe(1);
    expect(result.duplicateCount).toBe(1);
  });

  it('excludes contradictory equal-time duplicates deterministically and accepts a later clear observation', () => {
    const entries = [comparison('1', 10), comparison('1', 20)];
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result).toEqual(summarizeArticlePrices([...entries].reverse(), { asOf }));
    expect(result.excluded.conflictingDuplicates).toBe(1);
    expect(result.category.observedOffers).toBeNull();
    const later = summarizeArticlePrices(
      [...entries, comparison('1', 30, { observedAt: '2026-11-07T12:01:00.000Z' })],
      { asOf: '2026-11-07T12:01:00.000Z' },
    );
    expect(later.excluded.conflictingDuplicates).toBe(0);
    expect(later.category.observedOffers?.median).toBe(30);
  });

  it('keeps undated, ambiguous and older publications separate from the confirmed window', () => {
    const entries = [
      comparison('1', 10, {
        publishedEarliest: '2026-10-08T12:00:00.000Z',
        publishedLatest: '2026-10-08T12:00:00.000Z',
      }),
      comparison('2', 20, {
        publishedEarliest: '2026-10-07T00:00:00.000Z',
        publishedLatest: '2026-10-08T11:59:59.999Z',
      }),
      comparison('3', 30, {
        publishedEarliest: '2026-10-07T00:00:00.000Z',
        publishedLatest: '2026-10-09T00:00:00.000Z',
      }),
      comparison('4', 40, { publishedEarliest: null, publishedLatest: null }),
    ];
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result.category.observedOffers?.count).toBe(4);
    expect(result.category.publishedInWindow).toMatchObject({ count: 1, median: 10 });
    expect(result.category.publishedBeforeWindow).toMatchObject({ count: 1, median: 20 });
    expect(result.category.publicationUnknown).toMatchObject({ count: 2, median: 35 });
  });

  it('does not turn observation time, invalid dates or future publication into proof of listing age', () => {
    const entries = [
      comparison('1', 10, { publishedEarliest: undefined, publishedLatest: undefined }),
      comparison('2', 20, {
        publishedEarliest: '2026-02-30T12:00:00Z',
        publishedLatest: '2026-03-01T12:00:00Z',
      }),
      comparison('3', 30, {
        publishedEarliest: '2026-11-06T12:00:00Z',
        publishedLatest: '2026-11-08T12:00:00Z',
      }),
      comparison('4', 40, {
        publishedEarliest: '2026-11-06T12:00:00Z',
        publishedLatest: '2026-11-05T12:00:00Z',
      }),
      comparison('5', 50, { publicationCheckedAt: '2026-11-08T12:00:00Z' }),
      comparison('6', 60, {
        observedAt: '2026-11-01T12:00:00Z',
        publishedEarliest: '2026-11-02T12:00:00Z',
        publishedLatest: '2026-11-02T12:00:00Z',
        publicationCheckedAt: asOf,
      }),
    ];
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result.model.publishedInWindow).toBeNull();
    expect(result.model.publicationUnknown?.count).toBe(6);
  });

  it('retains absolute publication evidence across 35, 42 and 83 minute collection jobs', () => {
    const observed = [
      '2026-11-07T10:37:00.000Z',
      '2026-11-07T11:18:00.000Z',
      '2026-11-07T11:25:00.000Z',
    ];
    const entries = observed.map((observedAt, index) =>
      comparison(String(index), 20 + index, { observedAt, publicationCheckedAt: observedAt }),
    );
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result.model.publishedInWindow?.count).toBe(3);
    expect(result.model.publicationUnknown).toBeNull();
    expect(result.observations).toEqual({ earliest: observed[0], latest: observed[2] });
  });

  it('allows later source verification while preserving the earlier price observation', () => {
    const result = summarizeArticlePrices(
      [
        comparison('1', 20, {
          observedAt: '2026-11-07T11:00:00.000Z',
          publicationCheckedAt: '2026-11-07T11:40:00.000Z',
          publishedEarliest: '2026-11-06T11:40:00.000Z',
          publishedLatest: '2026-11-07T11:40:00.000Z',
        }),
      ],
      { asOf },
    );
    expect(result.model.publishedInWindow?.count).toBe(1);
    expect(result.observations?.latest).toBe('2026-11-07T11:00:00.000Z');
  });

  it('uses the selected 20 or 30 day window without discarding currently observed older prices', () => {
    const entries = [
      comparison('1', 30, {
        publishedEarliest: '2026-10-13T12:00:00.000Z',
        publishedLatest: '2026-10-13T12:00:00.000Z',
      }),
    ];
    const twenty = summarizeArticlePrices(entries, { asOf, windowDays: 20 });
    const thirty = summarizeArticlePrices(entries, { asOf, windowDays: 30 });
    expect(twenty.model.publishedInWindow).toBeNull();
    expect(twenty.model.publishedBeforeWindow?.count).toBe(1);
    expect(thirty.model.publishedInWindow?.count).toBe(1);
    expect(twenty.model.observedOffers).toEqual(thirty.model.observedOffers);
  });

  it('keeps extreme asking prices in count, minimum and maximum without pretending they are sales', () => {
    const result = summarizeArticlePrices(
      [10, 11, 12, 13, 10000].map((price, index) => comparison(String(index), price)),
      { asOf },
    );
    expect(result.model.observedOffers).toEqual({
      count: 5,
      minimum: 10,
      lowerQuartile: 11,
      median: 12,
      upperQuartile: 13,
      maximum: 10000,
    });
    expect(result.excluded).toEqual({
      invalid: 0,
      conflictingDuplicates: 0,
      unavailable: 0,
      different: 0,
    });
    expect(result.basis).toBe('asking');
  });

  it('rejects invalid prices and foreign currencies and excludes explicitly unavailable offers', () => {
    const entries = [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 0.001, Number.MAX_VALUE].map(
      (price, index) => comparison(String(index), price),
    );
    entries.push(
      comparison('usd', 10, { currency: 'USD' }),
      comparison('closed', 20, { availability: 'unavailable' }),
      comparison('unknown', 30, { availability: undefined }),
    );
    const result = summarizeArticlePrices(entries, { asOf });
    expect(result.excluded.invalid).toBe(7);
    expect(result.excluded.unavailable).toBe(1);
    expect(result.category.observedOffers?.count).toBe(1);
    expect(result.category.availabilityUnknownCount).toBe(1);
  });

  it('rejects future or invalid observation timestamps and does not fabricate empty statistics', () => {
    const result = summarizeArticlePrices(
      [
        comparison('1', 10, { observedAt: '2026-11-07T12:00:00.001Z' }),
        comparison('2', 20, { observedAt: '2026-02-30T12:00:00.000Z' }),
        comparison('3', 30, { observedAt: '2026-11-07' }),
      ],
      { asOf },
    );
    expect(result.excluded.invalid).toBe(3);
    expect(result.category.observedOffers).toBeNull();
    expect(result.observations).toBeNull();
    expect(summarizeArticlePrices([], { asOf }).model.publishedInWindow).toBeNull();
  });

  it('fails explicitly for an invalid analysis date or more than 2000 input observations', () => {
    expect(() => summarizeArticlePrices([], { asOf: '2026-02-30T12:00:00Z' })).toThrow(
      'Invalid analysis window',
    );
    const tooMany = Array.from({ length: MAX_ARTICLE_PRICE_COMPARISONS + 1 }, (_, index) =>
      comparison(String(index), 20),
    );
    expect(() => summarizeArticlePrices(tooMany, { asOf })).toThrow(
      'Too many article price comparisons',
    );
  });
});

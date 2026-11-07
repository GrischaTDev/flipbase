import { describe, expect, it } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import {
  buildVintedComparisonCatalogUrl,
  comparisonItemUrl,
  parseVintedComparisonCatalogPage,
} from '../../src/vinted/comparison-catalog-page.js';

const item = (fields: Record<string, unknown> = {}) => ({
  id: '123',
  title: 'Carhartt fleece',
  url: '/items/123-carhartt-fleece',
  price: { amount: '1000000', currencyCode: 'EUR' },
  totalItemPrice: { amount: '1050000.70', currencyCode: 'EUR' },
  itemBox: { firstLine: 'Carhartt', secondLine: 'L · Sehr gut' },
  photos: [{ url: 'https://images.vinted.net/photo.webp' }],
  user: { id: 9, login: 'private' },
  ...fields,
});
const page = (
  products: unknown[],
  pagination: unknown = { current_page: 1, per_page: 96, total_pages: 10, total_entries: 960 },
) => {
  const state = { items: { items: products.map((productItem) => ({ productItem })), pagination } };
  return `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(state)}\n`])});</script>`;
};
const query: SniperQuery = {
  id: 'query',
  queryKey: 'query',
  marketplace: 'vinted',
  searchText: null,
  catalogId: 1858,
  brandId: null,
  priceTo: 50,
  priceFrom: 15,
  pollIntervalMs: 60_000,
  isSeeded: true,
  isActive: true,
  runState: 'ready',
  nextAttemptAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastErrorKind: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastPolledAt: null,
  lastStatus: 'ok',
  consecutiveFailures: 0,
  brandIds: [362, 5],
  titleKeywords: ['fleece', 'sherpa'],
  keywordMode: 'any',
  requestCursor: 3,
};

describe('Vinted comparison catalog', () => {
  it('keeps unrestricted item prices and pagination without storing pictures or profiles', () => {
    const result = parseVintedComparisonCatalogPage(page([item()]), 'https://www.vinted.de');
    expect(result).toEqual({
      items: [
        {
          externalId: '123',
          url: 'https://www.vinted.de/items/123-carhartt-fleece',
          title: 'Carhartt fleece',
          price: 1_000_000,
          currency: 'EUR',
          brand: 'Carhartt',
          size: 'L',
          condition: 'Sehr gut',
        },
      ],
      sourceItemCount: 1,
      pagination: { currentPage: 1, perPage: 96, totalPages: 10, totalEntries: 960 },
    });
    expect(JSON.stringify(result)).not.toMatch(/photos|private|1050000/);
  });

  it('deduplicates equal records and excludes conflicting duplicate prices', () => {
    expect(
      parseVintedComparisonCatalogPage(page([item(), item()]), 'https://www.vinted.de').items,
    ).toHaveLength(1);
    const result = parseVintedComparisonCatalogPage(
      page([item(), item({ price: { amount: '5', currencyCode: 'EUR' } }), item()]),
      'https://www.vinted.de',
    );
    expect(result.items).toEqual([]);
    expect(result.sourceItemCount).toBe(3);
  });

  it('does not invent item prices from totals and rejects invalid or foreign records', () => {
    const bad = [
      item({ price: null }),
      item({ price: { amount: '0', currencyCode: 'EUR' } }),
      item({ price: { amount: '2.999', currencyCode: 'EUR' } }),
      item({ price: { amount: '0x20', currencyCode: 'EUR' } }),
      item({ price: { amount: '100', currencyCode: 'USD' } }),
      item({ price: { amount: Infinity, currencyCode: 'EUR' } }),
      item({ url: 'https://evil.test/items/123-fleece' }),
      item({ url: '/items/456-fleece' }),
      item({ url: 'https://user@www.vinted.de/items/123-fleece' }),
    ];
    expect(parseVintedComparisonCatalogPage(page(bad), 'https://www.vinted.de').items).toEqual([]);
    expect(comparisonItemUrl('http://www.vinted.de/items/123', 'https://www.vinted.de')).toBeNull();
    expect(
      comparisonItemUrl('/items/123-fleece?track=secret#photo', 'https://www.vinted.de')?.href,
    ).toBe('https://www.vinted.de/items/123-fleece');
  });

  it('supports both pagination formats but does not fabricate missing metadata', () => {
    expect(
      parseVintedComparisonCatalogPage(
        page([], { currentPage: 2, perPage: 96, totalPages: 10 }),
        'https://www.vinted.de',
      ).pagination,
    ).toEqual({ currentPage: 2, perPage: 96, totalPages: 10, totalEntries: null });
    for (const pagination of [
      null,
      { current_page: 2, per_page: 96, total_pages: 1 },
      { current_page: 1, per_page: 999, total_pages: 10 },
    ])
      expect(
        parseVintedComparisonCatalogPage(page([], pagination), 'https://www.vinted.de').pagination,
      ).toBeNull();
  });

  it('builds the selected category/brand/term combination without either price boundary', () => {
    const url = buildVintedComparisonCatalogUrl(query, 'https://www.vinted.de', 10);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search_text: 'sherpa',
      order: 'newest_first',
      page: '10',
      per_page: '96',
      catalog_ids: '1858',
      brand_ids: '362',
    });
    for (const page of [0, 11, 1.5])
      expect(() => buildVintedComparisonCatalogUrl(query, 'https://www.vinted.de', page)).toThrow();
    expect(() => buildVintedComparisonCatalogUrl(query, 'https://evil.test', 1)).toThrow();
  });
});

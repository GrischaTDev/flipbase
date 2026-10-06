import { describe, expect, it } from 'vitest';
import { searchFilterRequest } from '../../src/domain/search-filter-request.js';
import type { SniperQuery } from '../../src/domain/query.js';

const query = {
  id: 'q',
  marketplace: 'vinted',
  searchText: null,
  catalogId: 79,
  brandId: null,
  brandIds: [53, 14],
  titleKeywords: ['vintage', 'trackpants'],
  keywordMode: 'any',
  requestCursor: 0,
} as SniperQuery;

describe('search filter request planning', () => {
  it('visits every brand and OR word exactly once per cycle and persists the ordinal', () => {
    const requests = Array.from({ length: 8 }, (_, requestCursor) =>
      searchFilterRequest({ ...query, requestCursor }),
    );
    expect(
      requests.map((request) => [
        request.brandId,
        request.searchText,
        request.index,
        request.count,
      ]),
    ).toEqual([
      [14, 'vintage', 0, 4],
      [14, 'trackpants', 1, 4],
      [53, 'vintage', 2, 4],
      [53, 'trackpants', 3, 4],
      [14, 'vintage', 0, 4],
      [14, 'trackpants', 1, 4],
      [53, 'vintage', 2, 4],
      [53, 'trackpants', 3, 4],
    ]);
    expect(requests.every((request) => request.catalogId === 79)).toBe(true);
  });
  it('uses one term for ALL matching without pretending the provider supports exact title rules', () => {
    expect(searchFilterRequest({ ...query, keywordMode: 'all' })).toMatchObject({
      count: 2,
      searchText: 'vintage',
    });
  });
  it('preserves a legacy upstream search constraint', () => {
    expect(searchFilterRequest({ ...query, searchText: 'Nike Air Max' })).toMatchObject({
      count: 2,
      searchText: 'Nike Air Max',
    });
  });
  it('accepts category-only and title-only searches', () => {
    expect(searchFilterRequest({ ...query, brandIds: [], titleKeywords: [] })).toMatchObject({
      brandId: null,
      searchText: null,
      catalogId: 79,
    });
    expect(searchFilterRequest({ ...query, brandIds: [], catalogId: null })).toMatchObject({
      brandId: null,
      searchText: 'vintage',
    });
  });
  it.each([
    { requestCursor: -1 },
    { requestCursor: 1.5 },
    { catalogId: -1 },
    { brandIds: [0] },
    { titleKeywords: ['***'] },
    { brandIds: [], titleKeywords: [], catalogId: null },
    { keywordMode: 'unknown' },
  ])('rejects invalid conditions before issuing a request: %j', (override) => {
    expect(() => searchFilterRequest({ ...query, ...override } as SniperQuery)).toThrow();
  });
});

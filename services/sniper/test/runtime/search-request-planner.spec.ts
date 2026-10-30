import { describe, expect, it } from 'vitest';
import { planSearchRequests } from '../../src/runtime/search-request-planner.js';
import { buildVintedCatalogUrl } from '../../src/vinted/collector.js';
import { searchFilter } from '../support/search-filter.js';

describe('shared search request planning', () => {
  it('isolates an invalid filter without discarding other due work', () => {
    const plans = planSearchRequests([
      searchFilter({ id: 'invalid', brandIds: [-1] }),
      searchFilter(),
    ]);
    expect(plans).toHaveLength(2);
    expect(plans[0]?.validationError).toBeInstanceOf(Error);
    expect(plans[1]?.consumers[0]?.id).toBe('filter-1');
  });
  it.each([5, 10, 20])('shares one raw request for %i independent title rules', (count) => {
    const queries = Array.from({ length: count }, (_, i) =>
      searchFilter({
        id: `filter-${i}`,
        titleKeywords: ['puffer', `term${i}`],
      }),
    );
    const plan = planSearchRequests(queries);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.consumers).toHaveLength(count);
    expect(plan[0]?.sourceQuery.titleKeywords).toEqual([]);
    expect(plan[0]?.sourceQuery.searchText).toBe('puffer');
    expect(buildVintedCatalogUrl(plan[0]!.sourceQuery, 'https://catalog.invalid').href).toBe(
      buildVintedCatalogUrl(queries[0]!, 'https://catalog.invalid').href,
    );
    expect(queries[0]?.titleKeywords).toEqual(['puffer', 'term0']);
  });
  it('does not widen category, brand, price or a legacy search text', () => {
    const queries = [
      searchFilter(),
      searchFilter({ id: 'category', catalogId: 2050 }),
      searchFilter({ id: 'brand', brandId: 14, brandIds: [14] }),
      searchFilter({ id: 'price', priceTo: 50 }),
      searchFilter({ id: 'legacy', searchText: 'Nike Puffer' }),
    ];
    expect(planSearchRequests(queries)).toHaveLength(5);
  });
  it('keeps distinct OR lanes while sharing an identical selected brand and term', () => {
    const base = searchFilter({
      brandId: null,
      brandIds: [14, 53],
      titleKeywords: ['puffer', 'pufferjacke', 'puffer jacke'],
      keywordMode: 'any',
    });
    const same = { ...base, id: 'same', requestCursor: 6 };
    const next = { ...base, id: 'next', requestCursor: 1 };
    const plan = planSearchRequests([base, same, next]);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.consumers.map((q) => q.id)).toEqual(['filter-1', 'same']);
    expect(plan[0]?.sourceQuery.brandIds).toEqual([14]);
    expect(plan[0]?.sourceQuery.searchText).toBe('puffer');
    expect(plan[1]?.sourceQuery.searchText).toBe('pufferjacke');
  });
  it('keeps revision and monotonic cursor snapshots and skips paused filters', () => {
    const active = searchFilter({ filterRevision: 7, requestCursor: 12 });
    const plan = planSearchRequests([active, searchFilter({ id: 'paused', isActive: false })]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.consumers[0]).toMatchObject({ filterRevision: 7, requestCursor: 12 });
  });
  it('retains old non-guarded queries as individual requests', () => {
    expect(
      planSearchRequests([
        searchFilter({ filterFormatVersion: 0 }),
        searchFilter({ id: 'other', filterFormatVersion: 0 }),
      ]),
    ).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { buildQueryKey } from '../../src/domain/query.js';

describe('buildQueryKey', () => {
  it('normalises case and surrounding whitespace', () => {
    expect(buildQueryKey({ searchText: '  Nike Air Max  ' })).toBe(
      buildQueryKey({ searchText: 'nike air max' }),
    );
  });

  it('collapses repeated whitespace', () => {
    expect(buildQueryKey({ searchText: 'nike   air\tmax' })).toBe(
      buildQueryKey({ searchText: 'nike air max' }),
    );
  });

  it('separates queries that differ in price ceiling', () => {
    expect(buildQueryKey({ searchText: 'nike', priceTo: 50 })).not.toBe(
      buildQueryKey({ searchText: 'nike', priceTo: 60 }),
    );
  });

  it('treats an absent option as different from a set one', () => {
    expect(buildQueryKey({ searchText: 'nike' })).not.toBe(
      buildQueryKey({ searchText: 'nike', catalogId: 2050 }),
    );
  });

  it('produces a stable, readable key', () => {
    expect(buildQueryKey({ searchText: 'Nike Air Max', priceTo: 50, catalogId: 2050 })).toBe(
      'vinted|search=nike air max|catalog=2050|brand=-|price_to=50',
    );
  });
});

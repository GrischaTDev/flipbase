import { describe, expect, it } from 'vitest';
import { QueryDraft, parseVintedSearchUrl, queryDraftError } from './sniper-query.model';

const draft: QueryDraft = {
  id: null,
  catalogId: 1049,
  brandId: null,
  searchText: '',
  priceFrom: null,
  priceTo: 50,
  intervalSeconds: 60,
  notes: '',
};
describe('Vinted search management', () => {
  it('imports category, brand and prices without a network request', () => {
    expect(
      parseVintedSearchUrl(
        'https://www.vinted.de/catalog?catalog_ids[]=1049&brand_ids[]=53&price_to=50&search_text=Air+Max',
      ),
    ).toEqual({
      catalogId: 1049,
      brandId: 53,
      priceTo: 50,
      priceFrom: null,
      searchText: 'Air Max',
    });
  });
  it.each([
    'https://evil.test/catalog?catalog_ids=1049',
    'https://www.vinted.de/catalog?brand_ids=1,2',
    'https://www.vinted.de/catalog?brand_ids[]=1&brand_ids[]=2',
    'https://www.vinted.de/catalog?status_ids[]=1',
    'https://www.vinted.de/catalog?currency=GBP',
    'https://www.vinted.de/catalog?price_to=NaN',
  ])('rejects unsupported filters instead of widening a search: %s', (value) => {
    expect(() => parseVintedSearchUrl(value)).toThrow();
  });
  it('accepts category-only queries and validates range and interval', () => {
    expect(queryDraftError(draft)).toBeNull();
    expect(queryDraftError({ ...draft, catalogId: null })).toContain('Kategorie');
    expect(queryDraftError({ ...draft, priceFrom: 51 })).toContain('Mindestpreis');
    expect(queryDraftError({ ...draft, intervalSeconds: 0 })).toContain('Takt');
    expect(queryDraftError({ ...draft, intervalSeconds: NaN })).toContain('Takt');
    expect(queryDraftError({ ...draft, brandId: 1.5 })).toContain('Markenkennung');
  });
});

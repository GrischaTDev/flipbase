import { describe, expect, it } from 'vitest';
import { queryDraftError } from './sniper-query.model';

const draft = {
  id: null, title: 'Herrenjacken', brandId: null, intervalSeconds: 20, notes: '',
  catalogId: 79, brands: [], titleKeywords: [], keywordMode: 'all' as const, revision: null,
};

describe('central search filter validation', () => {
  it('allows a category without a brand', () => {
    expect(queryDraftError(draft)).toBeNull();
  });
  it('allows explicit title terms without a category or a brand', () => {
    expect(queryDraftError({ ...draft, catalogId: null, titleKeywords: ['vintage'] })).toBeNull();
  });
  it('rejects an unrestricted catalogue request', () => {
    expect(queryDraftError({ ...draft, catalogId: null })).not.toBeNull();
  });
  it('rejects malformed category identifiers instead of broadening the search', () => {
    expect(queryDraftError({ ...draft, catalogId: -1 })).not.toBeNull();
  });
});

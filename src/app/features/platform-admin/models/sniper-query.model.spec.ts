import { describe, expect, it } from 'vitest';
import { QueryDraft, queryDraftError } from './sniper-query.model';

type ProposedQueryDraft = QueryDraft & { title: string };

const draft = (overrides: Partial<ProposedQueryDraft> = {}): ProposedQueryDraft =>
  ({
    id: null,
    title: 'Nike',
    brandId: 53,
    intervalSeconds: 20,
    notes: '',
    ...overrides,
  }) as ProposedQueryDraft;

describe('central Vinted brand filter validation', () => {
  it('accepts a named brand-only filter', () => {
    expect(queryDraftError(draft())).toBeNull();
  });

  it.each([
    ['', 'Filtername'],
    [' '.repeat(101), 'Filtername'],
  ])('rejects an invalid filter name', (title, message) => {
    expect(queryDraftError(draft({ title }))).toContain(message);
  });

  it.each([null, 0, -1, 1.5, 2147483648])('rejects an invalid Vinted brand id: %s', (brandId) => {
    expect(queryDraftError(draft({ brandId }))).toContain('Markenkennung');
  });

  it('rejects an overlong note and an invalid interval', () => {
    expect(queryDraftError(draft({ notes: 'x'.repeat(2001) }))).toContain('Notiz');
    expect(queryDraftError(draft({ intervalSeconds: 9 }))).toContain('Takt');
    expect(queryDraftError(draft({ intervalSeconds: 86401 }))).toContain('Takt');
  });
});

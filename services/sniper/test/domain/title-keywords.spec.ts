import { describe, expect, it } from 'vitest';
import {
  createTitleKeywordMatcher,
  normalizeTitleKeywords,
} from '../../src/domain/title-keywords.js';

describe('title keyword matching', () => {
  it.each(['VINTAGE Nike Jacke', 'Nike vintage-Jacke', 'Nike (Vintage)', 'Nike Ｖｉｎｔａｇｅ'])(
    'matches a complete normalized word in %s',
    (title) => {
      expect(createTitleKeywordMatcher(['vintage'], 'all')(title)).toBe(true);
    },
  );
  it.each(['Nike Vintagewear', 'Nike nonvintage', 'Nike Jacke'])(
    'rejects word fragments and absent terms in %s',
    (title) => {
      expect(createTitleKeywordMatcher(['vintage'], 'all')(title)).toBe(false);
    },
  );
  it('accepts a contiguous phrase but not separated words', () => {
    const matches = createTitleKeywordMatcher(['air max'], 'all');
    expect(matches('Nike Air-Max 90')).toBe(true);
    expect(matches('Nike Air Running Max')).toBe(false);
  });
  it('distinguishes ALL and ANY and treats punctuation literally', () => {
    expect(createTitleKeywordMatcher(['vintage', 'trackpants'], 'all')('Vintage Jacke')).toBe(
      false,
    );
    expect(createTitleKeywordMatcher(['vintage', 'trackpants'], 'any')('Vintage Jacke')).toBe(true);
    expect(createTitleKeywordMatcher(['a.b'], 'all')('aXb')).toBe(false);
  });
  it('normalizes, deduplicates and keeps composed characters intact', () => {
    expect(normalizeTitleKeywords([' VINTAGE ', 'vintage', 'Air–Max', 'Ärmel'])).toEqual([
      'vintage',
      'air max',
      'ärmel',
    ]);
  });
  it.each(
    [['***'], ['a'.repeat(81)], Array.from({ length: 11 }, (_, n) => `word${n}`)].map((words) => ({
      words,
    })),
  )('rejects invalid keywords: $words', ({ words }) => {
    expect(() => normalizeTitleKeywords(words)).toThrow();
  });
});

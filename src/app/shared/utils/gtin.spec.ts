import { canonicalGtin, isValidGtin, normalizeGtin } from './gtin';
import { describe, expect, it } from 'vitest';

describe('gtin utilities', () => {
  it('validates supported GTIN lengths and preserves leading zeroes', () => {
    expect(normalizeGtin(' 036000291452 ')).toBe('036000291452');
    expect(normalizeGtin('00012348')).toBe('00012348');
    expect(normalizeGtin('4006381333931')).toBe('4006381333931');
    expect(normalizeGtin('036000291453')).toBeNull();
    expect(normalizeGtin('03600029145x')).toBeNull();
  });

  it('canonicalizes valid values only', () => {
    expect(canonicalGtin('036000291452')).toBe('00036000291452');
    expect(canonicalGtin('')).toBeNull();
    expect(isValidGtin('036000291452')).toBe(true);
  });
});

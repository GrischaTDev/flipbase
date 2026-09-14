import { describe, expect, it } from 'vitest';
import { matchesSize } from './size-matcher';

describe('matchesSize', () => {
  it('returns true when no filter is provided', () => {
    expect(matchesSize('L', null)).toBe(true);
    expect(matchesSize(null, null)).toBe(true);
    expect(matchesSize('M', undefined)).toBe(true);
  });

  it('returns false when item has no size and filter is active', () => {
    expect(matchesSize(null, 'l')).toBe(false);
    expect(matchesSize(undefined, 'xl')).toBe(false);
    expect(matchesSize('', 'm')).toBe(false);
  });

  it('matches exact sizes case-insensitively', () => {
    expect(matchesSize('XL', 'xl')).toBe(true);
    expect(matchesSize('m', 'M')).toBe(true);
    expect(matchesSize('XXL', 'xxl')).toBe(true);
  });

  it('matches compound Vinted sizes for XXL and 2XL', () => {
    expect(matchesSize('XXL / 54', 'xxl')).toBe(true);
    expect(matchesSize('2XL', 'xxl')).toBe(true);
    expect(matchesSize('2XL / 52', 'xxl')).toBe(true);
    expect(matchesSize('54', 'xxl')).toBe(true);
    expect(matchesSize('XL', 'xxl')).toBe(false);
  });

  it('matches XL without falsely matching XXL', () => {
    expect(matchesSize('XL / 44', 'xl')).toBe(true);
    expect(matchesSize('XL', 'xl')).toBe(true);
    expect(matchesSize('XXL', 'xl')).toBe(false);
    expect(matchesSize('2XL', 'xl')).toBe(false);
  });

  it('matches L without falsely matching XL or XXL', () => {
    expect(matchesSize('L / 40', 'l')).toBe(true);
    expect(matchesSize('L / 42', 'l')).toBe(true);
    expect(matchesSize('L', 'l')).toBe(true);
    expect(matchesSize('XL', 'l')).toBe(false);
    expect(matchesSize('XXL', 'l')).toBe(false);
  });

  it('matches M without falsely matching other sizes', () => {
    expect(matchesSize('M / 38', 'm')).toBe(true);
    expect(matchesSize('M', 'm')).toBe(true);
    expect(matchesSize('L', 'm')).toBe(false);
    expect(matchesSize('S', 'm')).toBe(false);
  });

  it('matches S without falsely matching XS', () => {
    expect(matchesSize('S / 36', 's')).toBe(true);
    expect(matchesSize('S', 's')).toBe(true);
    expect(matchesSize('XS', 's')).toBe(false);
    expect(matchesSize('XS / 34', 's')).toBe(false);
  });

  it('matches XS', () => {
    expect(matchesSize('XS / 34', 'xs')).toBe(true);
    expect(matchesSize('XS', 'xs')).toBe(true);
    expect(matchesSize('34', 'xs')).toBe(true);
    expect(matchesSize('S', 'xs')).toBe(false);
  });

  it('matches 3XL+', () => {
    expect(matchesSize('3XL', '3xl')).toBe(true);
    expect(matchesSize('XXXL', '3xl')).toBe(true);
    expect(matchesSize('4XL', '3xl')).toBe(true);
    expect(matchesSize('XXL', '3xl')).toBe(false);
  });
});

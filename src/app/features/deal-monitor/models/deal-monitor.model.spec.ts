import { describe, expect, it } from 'vitest';
import { feedSizeFromVintedTitle, feedSizeLabels, feedSizeValues } from './deal-monitor.model';

describe('Feed-Größen', () => {
  it.each([
    ['M / 38 / 10', 'm'],
    ['xs / 34 / 6', 'xs'],
    ['S', 's'],
    ['L / 40 / 12', 'l'],
    ['XL', 'xl'],
    ['XXL / 44 / 16', 'xxl'],
    ['2XL', 'xxl'],
    ['XXXL', '3xl'],
    ['3XL', '3xl'],
    ['4XL / 50', '3xl'],
    ['XXXXL', '3xl'],
    ['3XL+', '3xl'],
  ])('bildet „%s“ auf %s ab', (title, size) => {
    expect(feedSizeFromVintedTitle(title)).toBe(size);
  });

  it.each(['42', 'One size', 'XXS', '', '0XL'])('ignoriert die unbekannte Größe „%s“', (title) => {
    expect(feedSizeFromVintedTitle(title)).toBeNull();
  });

  it('wandelt zwischen Werten und Beschriftungen um', () => {
    expect(feedSizeLabels(['m', '3xl'])).toBe('M · 3XL+');
    expect(feedSizeValues('M · 3XL+')).toEqual(['m', '3xl']);
  });
});

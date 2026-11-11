import { describe, expect, it } from 'vitest';
import {
  parseVintedPublicationDate,
  publicationWindowStatus,
} from '../../src/domain/publication-window.js';

const now = new Date('2026-11-07T12:00:00Z');
const start = new Date('2026-10-31T12:00:00Z');
const classify = (label: string | null) =>
  publicationWindowStatus(parseVintedPublicationDate(label, now), start, now);

describe('seven-day publication evidence', () => {
  it('includes recent source intervals but keeps rounded boundary overlap unknown', () => {
    for (const label of [
      '22 Min.',
      '2 h',
      'vor einer Stunde',
      '1 Tag',
      '5 Tage',
      '6 Tage',
      'heute',
      'gestern',
    ])
      expect(classify(label), label).toBe('within_window');
    for (const label of ['7 Tage', '8 Tage', '1 Woche', '2 Wochen'])
      expect(classify(label), label).toBe('unknown');
    for (const label of ['9 Tage', '3 Wochen', '2 Monate'])
      expect(classify(label), label).toBe('outside_window');
  });

  it('uses the fixed import window, even when detail verification finishes later', () => {
    const source = parseVintedPublicationDate(
      '2026-11-01T12:00:00Z',
      new Date('2026-11-08T12:00:00Z'),
    );
    expect(publicationWindowStatus(source, start, now)).toBe('within_window');
    const later = parseVintedPublicationDate(
      '2026-11-08T00:00:00Z',
      new Date('2026-11-08T12:00:00Z'),
    );
    expect(publicationWindowStatus(later, start, now)).toBe('unknown');
  });

  it('does not accept invalid dates, future publication or arbitrary date-like labels', () => {
    for (const label of [
      '2026-02-30',
      '2026-11-08T12:00:00Z',
      '2026-11-07T24:00:00Z',
      'in 2 Tagen',
      'letzte Woche indexiert',
      null,
    ]) {
      expect(parseVintedPublicationDate(label, now).earliest, label ?? 'null').toBeNull();
      expect(classify(label), label ?? 'null').toBe('unknown');
    }
    expect(classify('2026-10-31T12:00:00Z')).toBe('within_window');
    expect(classify('2026-10-31')).toBe('unknown');
  });
});

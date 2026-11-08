import { describe, expect, it } from 'vitest';
import { vintedSizeDisplayLabel } from './vinted-size-label';

describe('Anzeige alter kombinierter Größen', () => {
  it('zeigt die enthaltene Buchstabengröße wie Vinted', () => {
    expect(vintedSizeDisplayLabel('M / 38 / 10')).toBe('M');
    expect(vintedSizeDisplayLabel('XL / 42 / 14')).toBe('XL');
    expect(vintedSizeDisplayLabel('xs / 32 / 4')).toBe('XS');
  });

  it('lässt eindeutige und mehrdeutige Angaben unverändert', () => {
    expect(vintedSizeDisplayLabel('M')).toBe('M');
    expect(vintedSizeDisplayLabel('W32 | DE 48')).toBe('W32 | DE 48');
    expect(vintedSizeDisplayLabel('38 / 6')).toBe('38 / 6');
    expect(vintedSizeDisplayLabel('M / L')).toBe('M / L');
    expect(vintedSizeDisplayLabel(null)).toBeNull();
  });
});

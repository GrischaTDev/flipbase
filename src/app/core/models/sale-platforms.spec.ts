import { describe, expect, it } from 'vitest';
import { SALE_PLATFORM_OPTIONS } from '../config/sale-platform-options';
import { mergeSalePlatforms, validateSalePlatformName } from './sale-platforms';

describe('Verkaufsplattformen', () => {
  it('behält historische Großschreibungen ohne doppelte Anzeigenamen speicherbar', () => {
    const result = mergeSalePlatforms([], ['Vinted', 'VINTED']);
    expect(
      result.filter((entry) => ['vinted', 'Vinted', 'VINTED'].includes(entry.value)),
    ).toHaveLength(3);
    const names = result.map((entry) =>
      entry.label.normalize('NFKC').trim().toLocaleLowerCase('de-DE'),
    );
    expect(new Set(names).size).toBe(result.length);
  });
  it('erhält die gespeicherte Reihenfolge und ergänzt historische Kennungen ohne Umbenennung', () => {
    const result = mergeSalePlatforms([{ value: 'vinted', label: 'Vinted' }], ['Oza', 'other']);
    expect(result[0].value).toBe('vinted');
    expect(result).toContainEqual({ value: 'Oza', label: 'Oza' });
    expect(result).toContainEqual({ value: 'other', label: 'Andere' });
    expect(result.filter((entry) => entry.value === 'vinted')).toHaveLength(1);
    expect(result).toContainEqual({ value: 'stockx', label: 'StockX' });
  });

  it('weist leere Namen und normalisierte Dubletten zurück', () => {
    expect(validateSalePlatformName('  ', [])).toBeTruthy();
    expect(
      validateSalePlatformName(' Ｖｉｎｔｅｄ ', [{ value: 'vinted', label: 'Vinted' }]),
    ).toBeTruthy();
    expect(
      validateSalePlatformName('Vinted', [{ value: 'vinted', label: 'Vinted' }], 'vinted'),
    ).toBeNull();
  });

  it('enthält keine Gebührenwerbung in den Auswahltexten', () => {
    expect(SALE_PLATFORM_OPTIONS.find((entry) => entry.value === 'kleinanzeigen')?.label).toBe(
      'Kleinanzeigen',
    );
  });
});

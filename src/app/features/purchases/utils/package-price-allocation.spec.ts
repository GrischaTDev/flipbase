import { describe, expect, it } from 'vitest';
import { allocatePackagePrice } from './package-price-allocation';

describe('allocatePackagePrice', () => {
  it('verteilt unabhängig von den Mengen gleichmäßig je Position', () => {
    const result = allocatePackagePrice(100, ['a', 'b', 'c', 'd']);

    expect([...result.values()]).toEqual([25, 25, 25, 25]);
  });

  it('vergibt Rundungsreste stabil in Positionsreihenfolge', () => {
    const result = allocatePackagePrice(10, ['a', 'b', 'c']);

    expect([...result.values()]).toEqual([3.34, 3.33, 3.33]);
    expect([...result.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(10, 2);
  });

  it('verteilt auch einen Gesamtpreis von null centgenau', () => {
    expect([...allocatePackagePrice(0, ['a', 'b']).values()]).toEqual([0, 0]);
  });

  it.each([
    [-1, ['a']],
    [Number.NaN, ['a']],
    [10, []],
    [10, ['']],
    [10, ['a', 'a']],
  ] as const)('lehnt ungültige Eingaben ab', (total, lineIds) => {
    expect(() => allocatePackagePrice(total, lineIds)).toThrow();
  });
});

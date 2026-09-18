import { describe, expect, it } from 'vitest';
import { calculateExpenseTax } from './expense-money';

describe('calculateExpenseTax', () => {
  it('zerlegt 19 Prozent aus einem Bruttobetrag centgenau', () => {
    expect(calculateExpenseTax(29.9, 19)).toEqual({
      gross: 29.9,
      net: 25.13,
      tax: 4.77,
    });
  });

  it('zerlegt 7 Prozent aus einem Bruttobetrag centgenau', () => {
    expect(calculateExpenseTax(10.7, 7)).toEqual({
      gross: 10.7,
      net: 10,
      tax: 0.7,
    });
  });

  it('behandelt 0 Prozent als bekannten steuerfreien Betrag', () => {
    expect(calculateExpenseTax(50, 0)).toEqual({
      gross: 50,
      net: 50,
      tax: 0,
    });
  });

  it('erfindet ohne MwSt-Angabe weder Netto noch Steuer', () => {
    expect(calculateExpenseTax(50, null)).toEqual({
      gross: 50,
      net: null,
      tax: null,
    });
  });
});

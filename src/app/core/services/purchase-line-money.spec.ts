import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { toExactCents } from './purchase.service';

describe('toExactCents', () => {
  it('akzeptiert übliche, binär nicht exakt darstellbare Centbeträge', () => {
    expect(toExactCents(0.07)).toBe(7);
    expect(toExactCents(0.29)).toBe(29);
    expect(toExactCents(0.58)).toBe(58);
  });

  it('lehnt Beträge ab, die nicht auf volle Cent fallen', () => {
    expect(toExactCents(0.001)).toBeNull();
    expect(toExactCents(1.999)).toBeNull();
    expect(toExactCents(0.2900000001)).toBeNull();
  });
});

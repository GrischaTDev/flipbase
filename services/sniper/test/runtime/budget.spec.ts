import { describe, expect, it } from 'vitest';
import { RequestBudget } from '../../src/runtime/budget.js';

describe('RequestBudget', () => {
  it('allows exactly the configured number of requests per minute', () => {
    const now = 0;
    const budget = new RequestBudget(3, () => now);

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
  });

  it('frees a slot once its minute has passed', () => {
    let now = 0;
    const budget = new RequestBudget(2, () => now);

    budget.tryConsume();
    now = 30_000;
    budget.tryConsume();
    expect(budget.tryConsume()).toBe(false);

    now = 60_001;
    expect(budget.tryConsume()).toBe(true);
  });

  it('reports usage as a ratio', () => {
    const now = 0;
    const budget = new RequestBudget(4, () => now);

    budget.tryConsume();
    budget.tryConsume();

    expect(budget.usageRatio()).toBe(0.5);
  });

  it('expires an entry that is exactly WINDOW_MS old (inclusive boundary)', () => {
    let now = 0;
    const budget = new RequestBudget(1, () => now);

    expect(budget.tryConsume()).toBe(true);

    // Genau 60_000ms spaeter: cutoff = 0, gespeicherter Zeitstempel = 0.
    // Nur mit einer inklusiven Grenze (<=) gilt der Eintrag als abgelaufen.
    now = 60_000;
    expect(budget.tryConsume()).toBe(true);
  });

  it('drops usageRatio back to zero once the window has fully passed', () => {
    let now = 0;
    const budget = new RequestBudget(2, () => now);

    budget.tryConsume();
    budget.tryConsume();
    expect(budget.usageRatio()).toBe(1);

    now = 60_000;
    expect(budget.usageRatio()).toBe(0);
  });

  it('rejects a maxPerMinute that is zero or negative', () => {
    expect(() => new RequestBudget(0)).toThrow(RangeError);
    expect(() => new RequestBudget(0)).toThrow(/got 0/);
    expect(() => new RequestBudget(-5)).toThrow(RangeError);
  });

  it('rejects a maxPerMinute that is not an integer', () => {
    expect(() => new RequestBudget(2.5)).toThrow(RangeError);
    expect(() => new RequestBudget(2.5)).toThrow(/got 2\.5/);
  });

  it('rejects a maxPerMinute that is not finite', () => {
    expect(() => new RequestBudget(Infinity)).toThrow(RangeError);
    expect(() => new RequestBudget(NaN)).toThrow(RangeError);
  });

  it('releases both slots after a backward clock jump once the window passes, unlike a front-only prune', () => {
    let now = 60_000;
    const budget = new RequestBudget(2, () => now);

    expect(budget.tryConsume()).toBe(true); // timestamp 60_000 stored

    now = 0; // clock moves backwards (e.g. an NTP correction)
    expect(budget.tryConsume()).toBe(true); // timestamp 0 stored -> array holds [60_000, 0]

    // cutoff = 0: the second (smaller, later-pushed) entry is exactly expired,
    // but the first (larger, earlier-pushed) entry is still valid. A prune
    // that only inspects the front of the array stops immediately because
    // the front (60_000) is not expired, leaving the expired entry stuck
    // behind it and the slot lost.
    now = 60_000;
    expect(budget.tryConsume()).toBe(true);

    // cutoff = 60_000: now the remaining original entry is exactly expired too.
    now = 120_000;
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
  });
});

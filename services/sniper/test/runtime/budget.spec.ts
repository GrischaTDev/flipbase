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
});

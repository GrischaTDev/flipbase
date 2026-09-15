import { describe, expect, it } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import { isDue } from '../../src/store/query.store.js';

function query(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'q1',
    queryKey: 'vinted|search=test',
    marketplace: 'vinted',
    searchText: 'test',
    catalogId: null,
    brandId: null,
    priceTo: null,
    priceFrom: null,
    pollIntervalMs: 60_000,
    isSeeded: true,
    isActive: true,
    lastPolledAt: null,
    lastStatus: 'never_polled',
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe('isDue', () => {
  it('is due when never polled', () => {
    expect(isDue(query({ lastPolledAt: null }), new Date())).toBe(true);
  });

  it('is not due when interval has not elapsed', () => {
    const now = new Date(1_000_000);
    const lastPolled = new Date(1_000_000 - 30_000).toISOString();
    expect(isDue(query({ lastPolledAt: lastPolled, pollIntervalMs: 60_000 }), now)).toBe(false);
  });

  it('is due when normal interval has elapsed', () => {
    const now = new Date(1_000_000);
    const lastPolled = new Date(1_000_000 - 61_000).toISOString();
    expect(isDue(query({ lastPolledAt: lastPolled, pollIntervalMs: 60_000 }), now)).toBe(true);
  });

  it('applies exponential backoff on rate_limited status', () => {
    const now = new Date(1_000_000);
    // 1 failure -> 2 minutes backoff (120,000 ms)
    const polled1mAgo = new Date(1_000_000 - 65_000).toISOString();
    const polled2mAgo = new Date(1_000_000 - 125_000).toISOString();

    const q = query({
      lastPolledAt: polled1mAgo,
      pollIntervalMs: 30_000,
      lastStatus: 'rate_limited',
      consecutiveFailures: 1,
    });

    expect(isDue(q, now)).toBe(false);
    expect(isDue({ ...q, lastPolledAt: polled2mAgo }, now)).toBe(true);
  });

  it('applies exponential backoff on forbidden status', () => {
    const now = new Date(1_000_000);
    // 2 consecutive failures -> 4 minutes backoff (240,000 ms)
    const polled3mAgo = new Date(1_000_000 - 180_000).toISOString();
    const polled4mAgo = new Date(1_000_000 - 245_000).toISOString();

    const q = query({
      lastPolledAt: polled3mAgo,
      pollIntervalMs: 30_000,
      lastStatus: 'forbidden',
      consecutiveFailures: 2,
    });

    expect(isDue(q, now)).toBe(false);
    expect(isDue({ ...q, lastPolledAt: polled4mAgo }, now)).toBe(true);
  });

  it('caps exponential backoff at 10 minutes', () => {
    const now = new Date(2_000_000);
    const polled9mAgo = new Date(2_000_000 - 540_000).toISOString();
    const polled10mAgo = new Date(2_000_000 - 605_000).toISOString();

    const q = query({
      lastPolledAt: polled9mAgo,
      pollIntervalMs: 30_000,
      lastStatus: 'forbidden',
      consecutiveFailures: 10,
    });

    expect(isDue(q, now)).toBe(false);
    expect(isDue({ ...q, lastPolledAt: polled10mAgo }, now)).toBe(true);
  });
});

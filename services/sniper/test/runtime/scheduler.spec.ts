import { describe, expect, it, vi } from 'vitest';
import { QueryScheduler } from '../../src/runtime/scheduler.js';
import { RequestBudget } from '../../src/runtime/budget.js';
import { ForbiddenError, RateLimitedError } from '../../src/vinted/errors.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';
import type { SniperQuery } from '../../src/domain/query.js';

const NOW = new Date('2026-08-30T10:00:00.000Z');

function makeQuery(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'q1',
    queryKey: 'vinted|search=nike|catalog=-|brand=-|price_to=-',
    marketplace: 'vinted',
    searchText: 'nike',
    catalogId: null,
    brandId: null,
    priceTo: null,
    pollIntervalMs: 60000,
    isSeeded: true,
    isActive: true,
    lastPolledAt: null,
    lastStatus: 'never_polled',
    consecutiveFailures: 0,
    ...overrides,
  };
}

function makeListing(externalId: string): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId,
    title: 'Nike Air Max',
    url: `https://www.vinted.de/items/${externalId}`,
    imageUrl: null,
    price: { amount: 30, currency: 'EUR' },
    brand: 'Nike',
    size: '43',
    condition: 'Gut',
    photoUploadedAt: null,
  };
}

function build(query: SniperQuery, overrides: Record<string, unknown> = {}) {
  const queries = {
    dueQueries: vi.fn().mockResolvedValue([query]),
    markPolled: vi.fn().mockResolvedValue(undefined),
    markSeeded: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
  };
  const collector = { collect: vi.fn().mockResolvedValue([makeListing('a'), makeListing('b')]) };
  const listings = { saveNew: vi.fn().mockResolvedValue([makeListing('a')]) };
  const log = { info: vi.fn(), error: vi.fn() };
  const budget = new RequestBudget(10, () => NOW.getTime());

  const scheduler = new QueryScheduler({
    queries,
    collector,
    listings,
    budget,
    log,
    ...overrides,
  } as never);

  return { scheduler, queries, collector, listings, log };
}

describe('QueryScheduler', () => {
  it('stores listings and counts the new ones', async () => {
    const { scheduler, listings } = build(makeQuery());

    const report = await scheduler.runOnce(NOW);

    expect(listings.saveNew).toHaveBeenCalledTimes(1);
    expect(report.polled).toBe(1);
    expect(report.newListings).toBe(1);
  });

  it('reports nothing as new during the seeding run', async () => {
    const { scheduler, queries, listings } = build(makeQuery({ isSeeded: false }));

    const report = await scheduler.runOnce(NOW);

    expect(listings.saveNew).toHaveBeenCalledTimes(1);
    expect(report.newListings).toBe(0);
    expect(report.seeded).toBe(1);
    expect(queries.markSeeded).toHaveBeenCalledWith('q1');
  });

  it('skips a query when the budget is exhausted', async () => {
    // RequestBudget lehnt 0 als Kapazitaet ab (RangeError, siehe Task 8), also
    // wird das einzige Kontingent hier schon vor dem Lauf verbraucht.
    const budget = new RequestBudget(1, () => NOW.getTime());
    budget.tryConsume();
    const { scheduler, collector } = build(makeQuery(), { budget });

    const report = await scheduler.runOnce(NOW);

    expect(collector.collect).not.toHaveBeenCalled();
    expect(report.skippedForBudget).toBe(1);
  });

  it('records a rate limit without deactivating the query', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new RateLimitedError()) };
    const { scheduler, queries } = build(makeQuery(), { collector });

    const report = await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'rate_limited');
    expect(queries.deactivate).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
  });

  it('deactivates a query that was forbidden', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new ForbiddenError()) };
    const { scheduler, queries } = build(makeQuery(), { collector });

    await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'forbidden');
    expect(queries.deactivate).toHaveBeenCalledWith('q1');
  });

  it('deactivates a query after the third consecutive failure', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new Error('network down')) };
    const { scheduler, queries } = build(makeQuery({ consecutiveFailures: 2 }), { collector });

    await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'failed');
    expect(queries.deactivate).toHaveBeenCalledWith('q1');
  });

  it('does not mark anything as seen when the response was rejected', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new Error('schema violation')) };
    const { scheduler, listings } = build(makeQuery(), { collector });

    await scheduler.runOnce(NOW);

    expect(listings.saveNew).not.toHaveBeenCalled();
  });
});

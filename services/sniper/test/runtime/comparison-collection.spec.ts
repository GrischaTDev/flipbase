import { describe, expect, it, vi } from 'vitest';
import {
  ComparisonCollection,
  ComparisonRequestSlots,
} from '../../src/runtime/comparison-collection.js';
import { RequestBudgetUnavailableError } from '../../src/runtime/budget.js';
import type { ComparisonTask } from '../../src/store/comparison.store.js';
import type { OriginState } from '../../src/store/origin-state.store.js';
import { searchFilter } from '../support/search-filter.js';

const NOW = new Date('2026-11-07T15:00:00Z');
const TOKEN = 'bbb37f05-6919-4bed-aabe-6e6b8db7418f';

function detail(): ComparisonTask {
  return {
    id: 'detail:1',
    leaseToken: TOKEN,
    consecutiveFailures: 0,
    kind: 'detail',
    externalId: '1001',
    url: 'https://www.vinted.de/items/1001-carhartt-fleece',
  };
}

function catalog(page = 1): ComparisonTask {
  return {
    id: 'catalog:1',
    leaseToken: TOKEN,
    consecutiveFailures: 0,
    kind: 'catalog',
    query: searchFilter({
      priceFrom: 10,
      priceTo: 50,
      titleKeywords: ['fleece'],
      excludedTitleKeywords: ['defekt'],
    }),
    page,
    windowStart: '2026-10-31T15:00:00Z',
  };
}

function flight(value: unknown): string {
  return `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(value))}])</script>`;
}

function itemPage(sold = false): string {
  return flight([
    {
      id: '1001',
      title: 'Carhartt Fleece',
      photos: [],
      price: { amount: '70', currency_code: 'EUR' },
      can_buy: !sold,
      instant_buy: !sold,
      is_hidden: false,
      is_reserved: false,
      attributes: [{ code: 'upload_date', data: { value: '2 Tage' } }],
    },
    ...(sold ? [{ item_id: '1001', title: 'Verkauft', theme: 'SUCCESS' }] : []),
  ]);
}

function catalogPage(page = 1): string {
  return flight({
    items: {
      items: ['Carhartt Fleece', 'Carhartt Fleece defekt', 'Carhartt Jeans'].map(
        (title, index) => ({
          productItem: {
            id: String(1001 + index),
            title,
            url: `/items/${1001 + index}-artikel`,
            price: { amount: '2000', currencyCode: 'EUR' },
            itemBox: { firstLine: 'Carhartt', secondLine: 'L · Sehr gut' },
          },
        }),
      ),
      pagination: { current_page: page, per_page: 96, total_pages: 10, total_entries: 960 },
    },
  });
}

function setup(task: ComparisonTask | null = detail(), response = new Response(itemPage())) {
  const origin: OriginState = {
    origin: 'vinted',
    state: 'ready',
    blockedUntil: null,
    reason: null,
    probeInFlight: false,
    updatedAt: NOW.toISOString(),
  };
  const store = {
    claim: vi.fn().mockResolvedValue(task),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(true),
  };
  const originState = {
    getState: vi.fn().mockResolvedValue(origin),
    setCooldown: vi.fn().mockResolvedValue(undefined),
    setBlocked: vi.fn().mockResolvedValue(undefined),
    tryAcquireProbe: vi.fn().mockResolvedValue(true),
    releaseProbe: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
  const fetch = vi.fn().mockResolvedValue(response);
  const budget = { hasCapacity: vi.fn().mockReturnValue(true) };
  const onOriginPause = vi.fn();
  const log = { info: vi.fn(), error: vi.fn() };
  const collection = new ComparisonCollection({
    store,
    fetch,
    baseUrl: 'https://www.vinted.de',
    budget,
    originState,
    onOriginPause,
    log,
    now: () => NOW,
  });
  return { collection, store, originState, origin, fetch, budget, onOriginPause, log };
}

describe('ComparisonCollection', () => {
  it('collects one unpriced page and keeps expensive matching offers', async () => {
    const task = catalog(10);
    const fixture = setup(task, new Response(catalogPage(10)));
    const report = await fixture.collection.runOnce(NOW);
    expect(report).toEqual({ requested: true, processed: 1, failed: 0, stale: 0 });
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    const url = fixture.fetch.mock.calls[0]![0] as URL;
    expect(url.searchParams.get('page')).toBe('10');
    expect(url.searchParams.has('price_from')).toBe(false);
    expect(url.searchParams.has('price_to')).toBe(false);
    expect(fixture.store.complete).toHaveBeenCalledWith(
      task,
      expect.objectContaining({
        kind: 'catalog',
        observed_at: NOW.toISOString(),
        sourceItemCount: 3,
        items: [expect.objectContaining({ externalId: '1001', price: 2000 })],
      }),
    );
  });

  it.each([true, false])(
    'stores the explicit sold status (%s) without converting the price',
    async (sold) => {
      const fixture = setup(detail(), new Response(itemPage(sold)));
      await fixture.collection.runOnce(NOW);
      expect(fixture.store.complete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          item: expect.objectContaining({ status: sold ? 'sold' : 'active', price: 70 }),
        }),
      );
    },
  );

  it.each([404, 410])('excludes HTTP %s as unavailable, never sold', async (status) => {
    const fixture = setup(detail(), new Response('gone', { status }));
    await fixture.collection.runOnce(NOW);
    expect(fixture.store.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        item: expect.objectContaining({ status: 'unavailable', price: null }),
      }),
    );
    expect(fixture.store.fail).not.toHaveBeenCalled();
  });

  it('propagates an HTML challenge to the common origin pause', async () => {
    const fixture = setup(detail(), new Response('<title>Just a moment...</title>'));
    await fixture.collection.runOnce(NOW);
    expect(fixture.onOriginPause).toHaveBeenCalledOnce();
    expect(fixture.originState.setBlocked).toHaveBeenCalledWith(
      'vinted',
      'interaction_required',
      undefined,
    );
    expect(fixture.store.complete).not.toHaveBeenCalled();
    expect(fixture.store.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      'forbidden',
      expect.any(String),
    );
  });

  it('shares the Retry-After pause and never interprets throttling as a disappearance', async () => {
    const fixture = setup(
      detail(),
      new Response('', { status: 429, headers: { 'retry-after': '45' } }),
    );
    await fixture.collection.runOnce(NOW);
    expect(fixture.originState.setCooldown).toHaveBeenCalledWith(
      'vinted',
      new Date(NOW.getTime() + 45_000),
      'rate_limited',
    );
    expect(fixture.store.complete).not.toHaveBeenCalled();
  });

  it('does not retry a failed HTTP request within a task step', async () => {
    const fixture = setup(detail(), new Response('', { status: 503 }));
    await fixture.collection.runOnce(NOW);
    expect(fixture.fetch).toHaveBeenCalledOnce();
    expect(fixture.store.fail).toHaveBeenCalledOnce();
  });

  it.each(['cooldown', 'blocked'] as const)(
    'leaves %s recovery to the feed scheduler',
    async (state) => {
      const fixture = setup();
      fixture.originState.getState.mockResolvedValue({ ...fixture.origin, state });
      await fixture.collection.runOnce(NOW);
      expect(fixture.store.claim).not.toHaveBeenCalled();
      expect(fixture.fetch).not.toHaveBeenCalled();
      expect(fixture.originState.tryAcquireProbe).not.toHaveBeenCalled();
    },
  );

  it('does not reserve database work when the shared budget is exhausted', async () => {
    const fixture = setup();
    fixture.budget.hasCapacity.mockReturnValue(false);
    await fixture.collection.runOnce(NOW);
    expect(fixture.store.claim).not.toHaveBeenCalled();
  });

  it('releases a raced budget refusal without recording an outgoing request', async () => {
    const fixture = setup();
    fixture.fetch.mockRejectedValue(new RequestBudgetUnavailableError());
    const report = await fixture.collection.runOnce(NOW);
    expect(report.requested).toBe(false);
    expect(report.failed).toBe(0);
    expect(fixture.collection.error).toBeNull();
    expect(fixture.store.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      'request_deferred',
      expect.any(String),
    );
    expect(fixture.onOriginPause).not.toHaveBeenCalled();
  });

  it('refuses an unrelated item URL before any outgoing request', async () => {
    const task = detail();
    if (task.kind !== 'detail') throw new Error('fixture');
    const fixture = setup({ ...task, url: 'https://other.example/items/1001' });
    const report = await fixture.collection.runOnce(NOW);
    expect(report.requested).toBe(false);
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(fixture.store.complete).not.toHaveBeenCalled();
  });

  it('rejects a repeated wrong catalog page instead of moving the saved cursor', async () => {
    const fixture = setup(catalog(2), new Response(catalogPage(1)));
    await fixture.collection.runOnce(NOW);
    expect(fixture.store.complete).not.toHaveBeenCalled();
    expect(fixture.store.fail).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      'parser_error',
      expect.any(String),
    );
  });

  it('reports a rejected stale lease without claiming another task', async () => {
    const fixture = setup();
    fixture.store.complete.mockResolvedValue(false);
    const report = await fixture.collection.runOnce(NOW);
    expect(report).toEqual({ requested: true, processed: 0, failed: 0, stale: 1 });
    expect(fixture.store.claim).toHaveBeenCalledOnce();
  });

  it('limits background steps even when the feed is idle', async () => {
    const fixture = setup(null);
    await fixture.collection.runOnce(NOW);
    await fixture.collection.runOnce(new Date(NOW.getTime() + 14_999));
    expect(fixture.store.claim).toHaveBeenCalledOnce();
    await fixture.collection.runOnce(new Date(NOW.getTime() + 15_000));
    expect(fixture.store.claim).toHaveBeenCalledTimes(2);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
});

describe('ComparisonRequestSlots', () => {
  it('offers every fifth actual request to comparisons without counting empty turns', async () => {
    const slots = new ComparisonRequestSlots();
    for (let index = 0; index < 3; index++) slots.recordStart();
    expect(slots.isDue).toBe(false);
    slots.recordStart();
    expect(slots.isDue).toBe(true);
    await slots.run(async () => undefined);
    expect(slots.isDue).toBe(true);
    await slots.run(async () => slots.recordStart());
    expect(slots.isDue).toBe(false);
    for (let index = 0; index < 4; index++) slots.recordStart();
    expect(slots.isDue).toBe(true);
  });

  it('restores ordinary request accounting after a failed comparison turn', async () => {
    const slots = new ComparisonRequestSlots();
    await expect(
      slots.run(async () => {
        throw new Error('database failed');
      }),
    ).rejects.toThrow();
    for (let index = 0; index < 4; index++) slots.recordStart();
    expect(slots.isDue).toBe(true);
  });
});

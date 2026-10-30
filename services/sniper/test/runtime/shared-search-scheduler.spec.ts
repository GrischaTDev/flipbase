import { describe, expect, it, vi } from 'vitest';
import {
  QueryScheduler,
  type ListingStoreLike,
  type CollectorLike,
} from '../../src/runtime/scheduler.js';
import { RequestBudget } from '../../src/runtime/budget.js';
import { RateLimitedError } from '../../src/vinted/errors.js';
import { catalogListing, searchFilter } from '../support/search-filter.js';
import { createClient } from '@supabase/supabase-js';
import { ListingStore } from '../../src/store/listing.store.js';
import { VintedCollector } from '../../src/vinted/collector.js';
import { catalogPage } from '../vinted/support/catalog-page.js';

const NOW = new Date('2026-10-29T10:00:00Z');
const log = { info: vi.fn(), error: vi.fn() };

describe('bounded shared search scheduling', () => {
  it('reports an unknown window for an already seeded lane after losing its in-memory checkpoint', async () => {
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: {
        dueQueries: async () => [searchFilter({ seededRequests: [0] })],
        markSeeded: async () => undefined,
      },
      collector: { collect: vi.fn(), collectSource: async () => [catalogListing('known')] },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    expect(completeRun.mock.calls[0]?.[2]).toMatchObject({ coverage: 'unknown', source_pages: 1 });
  });
  it('reports coverage separately when only the slow consumer reaches the page limit', async () => {
    const fast = searchFilter({ id: 'fast' });
    const slow = searchFilter({ id: 'slow' });
    let due = [fast, slow];
    let round = 0;
    const page = (prefix: string) =>
      Array.from({ length: 96 }, (_, i) => catalogListing(`${prefix}-${i}`));
    const old = page('old');
    const recent = page('recent');
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(
      async (_query, options) => {
        const pages =
          round === 0
            ? [old]
            : round === 1
              ? [recent, old]
              : [recent, page('middle'), page('older'), old];
        return pages[(options?.page ?? 1) - 1] ?? [];
      },
    );
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => due, markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    round = 1;
    due = [fast];
    await scheduler.runOnce(NOW);
    round = 2;
    due = [fast, slow];
    const before = collectSource.mock.calls.length;
    await scheduler.runOnce(NOW);
    expect(collectSource.mock.calls.slice(before).map((call) => call[1]?.page)).toEqual([1, 2, 3]);
    expect(completeRun.mock.calls.at(-2)?.[2]).toMatchObject({
      coverage: 'caught_up',
      source_pages: 1,
    });
    expect(completeRun.mock.calls.at(-1)?.[2]).toMatchObject({
      coverage: 'limited',
      source_pages: 3,
    });
  });
  it('keeps a measured long source duration within the database contract instead of clipping it to four minutes', async () => {
    let clock = NOW.getTime();
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => [searchFilter()], markSeeded: async () => undefined },
      collector: {
        collect: vi.fn(),
        collectSource: async () => {
          clock += 300_000;
          return [];
        },
      },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => new Date(clock),
    });
    await scheduler.runOnce(NOW);
    expect(completeRun.mock.calls[0]?.[2]?.duration_ms).toBe(300_000);
  });
  it.each(['slower interval', 'failed storage'])(
    'catches up to each consumer’s own accepted window after %s',
    async (scenario) => {
      const a = searchFilter({ id: 'fast', titleKeywords: ['puffer', 'plain'] });
      const b = searchFilter({ id: 'slow', titleKeywords: ['puffer', 'needle'] });
      let due = [a, b];
      let round = 0;
      const old = Array.from({ length: 96 }, (_, i) => catalogListing(`old-${i}`, 'Puffer plain'));
      const middle = Array.from({ length: 96 }, (_, i) =>
        catalogListing(`middle-${i}`, i === 1 ? 'Puffer needle' : 'Puffer plain'),
      );
      const recent = Array.from({ length: 96 }, (_, i) =>
        catalogListing(`recent-${i}`, 'Puffer plain'),
      );
      const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(
        async (_query, options) => {
          const pages = round === 0 ? [old] : round === 1 ? [middle, old] : [recent, middle, old];
          return pages[(options?.page ?? 1) - 1] ?? [];
        },
      );
      const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(
        async (_listings, query) => {
          if (scenario === 'failed storage' && round === 1 && query.id === b.id)
            throw new Error('temporary storage failure');
          return { accepted: true, created: 0, seeded: false, hits: 0 };
        },
      );
      const scheduler = new QueryScheduler({
        queries: {
          dueQueries: async () => due,
          markSeeded: async () => undefined,
          recordFailure: async () => undefined,
        },
        collector: { collect: vi.fn(), collectSource },
        listings: { saveNew: vi.fn(), completeRun },
        budget: new RequestBudget(24),
        log,
        now: () => NOW,
      });
      await scheduler.runOnce(NOW);
      round = 1;
      due = scenario === 'failed storage' ? [a, b] : [a];
      await scheduler.runOnce(NOW);
      round = 2;
      due = [a];
      await scheduler.runOnce(NOW);
      round = 3;
      due = [a, b];
      const before = collectSource.mock.calls.length;
      await scheduler.runOnce(NOW);
      expect(collectSource.mock.calls.slice(before).map((call) => call[1]?.page)).toEqual([
        1, 2, 3,
      ]);
      const lastB = completeRun.mock.calls.filter((call) => call[1].id === b.id).at(-1);
      expect(lastB?.[0]).toEqual([catalogListing('middle-1', 'Puffer needle')]);
      expect(lastB?.[2]).toMatchObject({ coverage: 'caught_up', source_pages: 3 });
      const lastA = completeRun.mock.calls.filter((call) => call[1].id === a.id).at(-1);
      expect(lastA?.[0]).toHaveLength(96);
      expect(lastA?.[2]).toMatchObject({ coverage: 'caught_up', source_pages: 1 });
    },
  );
  it('starts a changed filter revision with its own initial source window', async () => {
    let query = searchFilter();
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: true,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => [query], markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource: async () => [catalogListing('same')] },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    query = { ...query, filterRevision: 2 };
    await scheduler.runOnce(NOW);
    expect(completeRun.mock.calls[1]?.[2]).toMatchObject({ coverage: 'initial' });
  });
  it('retains the last accepted source window when storing catch-up fails', async () => {
    let round = 0;
    const pages: number[] = [];
    const collectSource = async (_query: unknown, options?: { page?: number }) => {
      const page = options?.page ?? 1;
      pages.push(page);
      if (round === 0 || page === 3)
        return Array.from({ length: 96 }, (_, i) => catalogListing(`old-${i}`));
      return Array.from({ length: 96 }, (_, i) => catalogListing(`new-${page}-${i}`));
    };
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => {
      if (round === 1) throw new Error('storage unavailable');
      return { accepted: true, created: 0, seeded: false, hits: 0 };
    });
    const scheduler = new QueryScheduler({
      queries: {
        dueQueries: async () => [searchFilter()],
        markSeeded: async () => undefined,
        recordFailure: async () => undefined,
      },
      collector: { collect: vi.fn(), collectSource },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    round = 1;
    expect((await scheduler.runOnce(NOW)).failed).toBe(1);
    round = 2;
    await scheduler.runOnce(NOW);
    expect(pages).toEqual([1, 1, 2, 3, 1, 2, 3]);
    expect(completeRun.mock.calls[2]?.[0]).toHaveLength(288);
  });
  it.each(['Pufferjacken', 'Puffer Jacken', 'Puffer-Jacken', 'Pufferweste'])(
    'passes the explicit title variant %s through the actual collector and guarded storage',
    async (title) => {
      const bodies: { p_listings: unknown[] }[] = [];
      const client = createClient('https://unit.example.test', 'unit-service-role', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (_input, init) => {
            bodies.push(JSON.parse(String(init?.body)) as { p_listings: unknown[] });
            return Response.json({ accepted: true, created: 0, seeded: false, hits: 0 });
          },
        },
      });
      const query = searchFilter({
        titleKeywords: ['puffer', 'pufferjacke', 'puffer jacke', 'pufferjacken', 'puffer jacken'],
        keywordMode: 'any',
        excludedTitleKeywords: ['pufferweste'],
      });
      const collector = new VintedCollector(
        { baseUrl: 'https://catalog.invalid', userAgent: 'test' },
        async () => new Response(catalogPage().replaceAll('Nike Air Max', title)),
      );
      const scheduler = new QueryScheduler({
        queries: { dueQueries: async () => [query], markSeeded: async () => undefined },
        collector,
        listings: new ListingStore(client),
        budget: new RequestBudget(24),
        log,
        now: () => NOW,
      });
      expect(await scheduler.runOnce(NOW)).toMatchObject({ failed: 0, polled: 1 });
      expect(bodies[0]?.p_listings).toHaveLength(title === 'Pufferweste' ? 0 : 1);
      expect(query.keywordMode).toBe('any');
    },
  );
  it('connects the actual collector, title rules and guarded RPC for one shared response', async () => {
    const source = vi.fn(async () => new Response(catalogPage()));
    const rpcBodies: Record<string, unknown>[] = [];
    const client = createClient('https://unit.example.test', 'unit-service-role', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          expect(String(input)).toContain('/rpc/complete_sniper_search_filter_run');
          rpcBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Response.json({ accepted: true, created: 0, seeded: false, hits: 0 });
        },
      },
    });
    const filters = [
      searchFilter({ titleKeywords: ['Nike'], searchText: 'Nike' }),
      searchFilter({
        id: 'excluded',
        titleKeywords: ['Nike'],
        searchText: 'Nike',
        excludedTitleKeywords: ['Air Max'],
      }),
    ];
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => filters, markSeeded: async () => undefined },
      collector: new VintedCollector(
        { baseUrl: 'https://catalog.invalid', userAgent: 'test' },
        source,
      ),
      listings: new ListingStore(client),
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    expect(await scheduler.runOnce(NOW)).toMatchObject({ polled: 2, failed: 0 });
    expect(source).toHaveBeenCalledOnce();
    expect(rpcBodies.map((body) => body['p_query_id'])).toEqual(['filter-1', 'excluded']);
    expect(rpcBodies[0]?.['p_listings']).toHaveLength(1);
    expect(rpcBodies[1]?.['p_listings']).toEqual([]);
    expect(rpcBodies[0]).toMatchObject({
      p_revision: 1,
      p_cursor: 0,
      p_diagnostics: { shared_filter_count: 2, source_pages: 1 },
    });
  });
  it('finishes an already seeded lane before a newly seeded consumer of the same packet', async () => {
    const first = searchFilter({ id: 'new', seededRequests: [] });
    const second = searchFilter({ id: 'existing', seededRequests: [0] });
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => [first, second], markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource: async () => [catalogListing('1')] },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    expect(completeRun.mock.calls.map((call) => call[1].id)).toEqual(['existing', 'new']);
  });
  it('backs off a failed legacy write instead of starving the next fresh tick', async () => {
    const recordFailure = vi.fn();
    const scheduler = new QueryScheduler({
      queries: {
        dueQueries: async () => [searchFilter({ filterFormatVersion: 0 })],
        markSeeded: async () => undefined,
        recordFailure,
      },
      collector: { collect: async () => [catalogListing('1')], collectSource: vi.fn() },
      listings: {
        saveNew: async () => {
          throw new Error('database unavailable');
        },
      },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    expect(await scheduler.runOnce(NOW)).toMatchObject({ failed: 1, polled: 0 });
    expect(recordFailure).toHaveBeenCalledOnce();
  });
  it('does not accept a partial catch-up or start a third page after a provider refusal', async () => {
    let round = 0;
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(
      async (_query, options) => {
        if (round && options?.page === 2)
          throw new RateLimitedError('Synthetic rejection', { retryAfterSeconds: 120 });
        return Array.from({ length: 96 }, (_, i) => catalogListing(`${round}-${i}`));
      },
    );
    const recordFailure = vi.fn();
    const scheduler = new QueryScheduler({
      queries: {
        dueQueries: async () => [searchFilter()],
        markSeeded: async () => undefined,
        recordFailure,
      },
      collector: { collect: vi.fn(), collectSource },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    round++;
    expect(await scheduler.runOnce(NOW)).toMatchObject({ failed: 1, polled: 0 });
    expect(collectSource).toHaveBeenCalledTimes(3);
    expect(completeRun).toHaveBeenCalledTimes(1);
    await scheduler.runOnce(NOW);
    expect(collectSource).toHaveBeenCalledTimes(3);
    expect(recordFailure.mock.calls[0]?.slice(3)).toEqual([1, 0]);
  });
  it.each([5, 10, 20])(
    'uses one raw request for %i matching filters and keeps local title rules',
    async (count) => {
      const queries = Array.from({ length: count }, (_, i) =>
        searchFilter({
          id: `filter-${i}`,
          titleKeywords: ['puffer', `term${i}`],
        }),
      );
      const collect = vi.fn();
      const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(async () => [
        catalogListing('0', 'Puffer term0'),
        catalogListing('1', 'Puffer term1'),
      ]);
      const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
        accepted: true,
        created: 0,
        seeded: false,
        hits: 0,
      }));
      const scheduler = new QueryScheduler({
        queries: { dueQueries: async () => queries, markSeeded: async () => undefined },
        collector: { collect, collectSource },
        listings: { saveNew: vi.fn(), completeRun },
        budget: new RequestBudget(24),
        log,
        now: () => NOW,
      });
      const report = await scheduler.runOnce(NOW);
      expect(collectSource).toHaveBeenCalledTimes(1);
      expect(collect).not.toHaveBeenCalled();
      expect(report.polled).toBe(count);
      expect(completeRun).toHaveBeenCalledTimes(count);
      expect(completeRun.mock.calls[0]?.[0]).toEqual([catalogListing('0', 'Puffer term0')]);
      expect(completeRun.mock.calls[1]?.[0]).toEqual([catalogListing('1', 'Puffer term1')]);
      expect(completeRun.mock.calls[2]?.[0]).toEqual([]);
      expect(completeRun.mock.calls[0]?.[2]).toMatchObject({
        shared_filter_count: count,
        coverage: 'initial',
        source_pages: 1,
      });
    },
  );
  it('does not begin a frozen twenty-request round before loading new due work', async () => {
    let queries = Array.from({ length: 20 }, (_, i) =>
      searchFilter({ id: `old-${i}`, catalogId: 1000 + i }),
    );
    const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(async () => []);
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => queries, markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
      listings: {
        saveNew: vi.fn(),
        completeRun: async () => ({ accepted: true, created: 0, seeded: false, hits: 0 }),
      },
    });
    expect((await scheduler.runOnce(NOW)).polled).toBe(1);
    queries = [searchFilter({ id: 'new-priority', catalogId: 9999 }), ...queries.slice(1)];
    await scheduler.runOnce(NOW);
    expect(collectSource).toHaveBeenCalledTimes(2);
    expect(collectSource.mock.calls[1]?.[0].catalogId).toBe(9999);
  });
  it('starts the shared provider pause at the actual rejected response', async () => {
    let clock = NOW.getTime();
    const recordFailure = vi.fn();
    const scheduler = new QueryScheduler({
      queries: {
        dueQueries: async () => [searchFilter()],
        markSeeded: async () => undefined,
        recordFailure,
      },
      collector: {
        collect: vi.fn(),
        collectSource: async () => {
          clock += 20_000;
          throw new RateLimitedError('Synthetic rejection', { retryAfterSeconds: 120 });
        },
      },
      listings: { saveNew: vi.fn(), completeRun: vi.fn() },
      budget: new RequestBudget(24),
      log,
      now: () => new Date(clock),
    });
    const report = await scheduler.runOnce(NOW);
    expect(report.originPause?.until).toBe(new Date(NOW.getTime() + 140_000).toISOString());
    expect(recordFailure.mock.calls[0]?.[2]).toEqual(new Date(NOW.getTime() + 20_000));
  });
  it('does not count a discarded paused response as a discovery', async () => {
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: false,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => [searchFilter()], markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource: async () => [catalogListing('1')] },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    expect(await scheduler.runOnce(NOW)).toMatchObject({ polled: 1, newListings: 0, newHits: 0 });
  });
  it('catches up at most three pages and reports an unconfirmed window honestly', async () => {
    let round = 0;
    const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(
      async (_query, options) => {
        const page = options?.page ?? 1;
        return Array.from({ length: 96 }, (_, i) => catalogListing(`${round}-${page}-${i}`));
      },
    );
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => [searchFilter()], markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    round++;
    await scheduler.runOnce(NOW);
    expect(collectSource).toHaveBeenCalledTimes(4);
    expect(completeRun.mock.calls[1]?.[0]).toHaveLength(288);
    expect(completeRun.mock.calls[1]?.[2]).toMatchObject({ coverage: 'limited', source_pages: 3 });
  });
  it('stops bounded catch-up when the prior source page is reached', async () => {
    let round = 0;
    const first = Array.from({ length: 96 }, (_, i) => catalogListing(`known-${i}`));
    const collectSource = vi.fn<NonNullable<CollectorLike['collectSource']>>(
      async (_query, options) => {
        if (round === 0 || options?.page === 2) return first;
        return Array.from({ length: 96 }, (_, i) => catalogListing(`new-${i}`));
      },
    );
    const completeRun = vi.fn<NonNullable<ListingStoreLike['completeRun']>>(async () => ({
      accepted: true,
      created: 0,
      seeded: false,
      hits: 0,
    }));
    const scheduler = new QueryScheduler({
      queries: { dueQueries: async () => [searchFilter()], markSeeded: async () => undefined },
      collector: { collect: vi.fn(), collectSource },
      listings: { saveNew: vi.fn(), completeRun },
      budget: new RequestBudget(24),
      log,
      now: () => NOW,
    });
    await scheduler.runOnce(NOW);
    round++;
    await scheduler.runOnce(NOW);
    expect(collectSource).toHaveBeenCalledTimes(3);
    expect(completeRun.mock.calls[1]?.[2]).toMatchObject({
      coverage: 'caught_up',
      source_pages: 2,
    });
  });
});

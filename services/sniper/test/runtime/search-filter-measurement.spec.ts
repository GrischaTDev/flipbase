import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { SniperQuery } from '../../src/domain/query.js';
import { searchFilterRequest } from '../../src/domain/search-filter-request.js';
import { createHealthState } from '../../src/health.js';
import { isDue } from '../../src/store/query.store.js';
import { VintedCollector } from '../../src/vinted/collector.js';
import { RequestBudget } from '../../src/runtime/budget.js';
import { countingFetch } from '../../src/runtime/counting-fetch.js';
import { pacedVintedFetch } from '../../src/runtime/paced-vinted-fetch.js';
import { QueryScheduler } from '../../src/runtime/scheduler.js';

const EPOCH = Date.parse('2026-10-29T00:00:00Z');
const log = { info: vi.fn(), error: vi.fn() };
const measurements: Record<string, unknown>[] = [];

function query(index: number, combinations = false): SniperQuery {
  return {
    id: `filter-${index}`,
    queryKey: `filter-${index}`,
    marketplace: 'vinted',
    searchText: null,
    catalogId: 1000 + index,
    brandId: null,
    brandIds: combinations ? [14, 53] : [53],
    titleKeywords: combinations ? ['puffer', 'pufferjacke', 'puffer jacke'] : [],
    keywordMode: 'any',
    priceFrom: null,
    priceTo: null,
    pollIntervalMs: 20_000,
    isSeeded: true,
    isActive: true,
    runState: 'ready',
    nextAttemptAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastErrorKind: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    lastPolledAt: null,
    lastStatus: 'never_polled',
    consecutiveFailures: 0,
    filterRevision: 1,
    filterFormatVersion: 1,
    requestCursor: 0,
    seededRequests: [],
  };
}

function page(lane: string, newest: number, size: number, title = 'Puffer Jacke'): string {
  return JSON.stringify({
    items: {
      items: Array.from({ length: Math.min(size, newest) }, (_, i) => ({
        productItem: {
          id: `${lane}-${newest - i}`,
          title,
          url: `/items/${newest - i}`,
          totalItemPrice: { amount: '20', currencyCode: 'EUR' },
          itemBox: { firstLine: 'Nike', secondLine: 'M · Gut' },
        },
      })),
    },
  });
}

function percentile(values: number[], p: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]! : null;
}

async function measure(
  count: number,
  options: {
    combinations?: boolean;
    responseMs?: number;
    minimumIntervalMs?: number;
    pollIntervalMs?: number;
    requestsPerMinute?: number;
    tickIntervalMs?: number;
    empty?: boolean;
    durationMs?: number;
  } = {},
) {
  let clock = 0;
  const queries = Array.from({ length: count }, (_, i) => ({
    ...query(i, options.combinations),
    pollIntervalMs: options.pollIntervalMs ?? 20_000,
  }));
  const budget = new RequestBudget(options.requestsPerMinute ?? 30, () => clock);
  const health = createHealthState(
    () => budget.usageRatio(),
    () => clock,
  );
  const starts: number[] = [];
  const visits = new Map<string, number[]>();
  const latest = new Map<string, number>();
  const missed = { narrow: 0, broad: 0 };
  const returned = { narrow: 0, broad: 0 };
  const waits: number[] = [];
  const discoveryAges: number[] = [];
  const observedIds = new Set<string>();
  const reports: number[] = [];
  let maxProgressGap = 0;
  let lastProgress = 0;
  let backlogMax = 0;
  const wait = async (ms: number) => {
    clock += ms;
  };
  const fetch = pacedVintedFetch(
    countingFetch(
      async (input) => {
        const url = new URL(String(input));
        expect(url.origin).toBe('https://catalog.invalid');
        expect(url.searchParams.get('page')).toBe('1');
        const filter = Number(url.searchParams.get('catalog_ids')) - 1000;
        const current = queries[filter]!;
        const dueAt = current.lastPolledAt
          ? Date.parse(current.lastPolledAt) - EPOCH + current.pollIntervalMs
          : 0;
        waits.push(Math.max(0, clock - dueAt));
        const lane = [
          filter,
          url.searchParams.get('brand_ids'),
          url.searchParams.get('search_text'),
        ].join(':');
        const scope = filter % 2 === 0 ? 'narrow' : 'broad';
        const rate = scope === 'narrow' ? 1 : 20;
        const newest = 96 + Math.floor(clock / 1000) * rate;
        const prior = latest.get(lane);
        if (!options.empty && prior !== undefined)
          missed[scope] += Math.max(0, newest - prior - 96);
        latest.set(lane, newest);
        const times = visits.get(lane) ?? [];
        times.push(clock);
        visits.set(lane, times);
        starts.push(clock);
        await wait(options.responseMs ?? 200);
        maxProgressGap = Math.max(maxProgressGap, clock - lastProgress);
        lastProgress = clock;
        health.recordProgress();
        returned[scope] += options.empty ? 0 : 96;
        return new Response(
          page(
            lane,
            newest,
            options.empty ? 0 : 96,
            url.searchParams.get('search_text') ?? 'Puffer Jacke',
          ),
          {
            headers: { 'content-type': 'text/html' },
          },
        );
      },
      () => budget.record(),
    ),
    {
      minimumIntervalMs: options.minimumIntervalMs ?? 10_000,
      requestTimeoutMs: 20_000,
      now: () => clock,
      sleep: wait,
    },
  );
  const collector = new VintedCollector(
    { baseUrl: 'https://catalog.invalid', userAgent: 'local-measurement' },
    fetch,
    wait,
  );
  const scheduler = new QueryScheduler({
    now: () => new Date(EPOCH + clock),
    budget,
    log,
    collector: {
      collect: async (snapshot) => {
        const listings = await collector.collect(snapshot);
        // Quelle und Geburtszeit sind nur in dieser künstlichen Antwort bekannt.
        for (const listing of listings) {
          if (observedIds.has(listing.externalId)) continue;
          observedIds.add(listing.externalId);
          const id = Number(listing.externalId.split('-').at(-1));
          if (id > 96) {
            const rate = Number(snapshot.catalogId! - 1000) % 2 === 0 ? 1 : 20;
            discoveryAges.push(clock - Math.ceil((id - 96) / rate) * 1000);
          }
        }
        return listings;
      },
    },
    queries: {
      dueQueries: async (now) => {
        const due = queries
          .filter((q) => q.isActive && isDue(q, now))
          .sort((a, b) => (a.lastPolledAt ?? '').localeCompare(b.lastPolledAt ?? ''));
        backlogMax = Math.max(backlogMax, due.length);
        return structuredClone(due);
      },
      markSeeded: async () => undefined,
    },
    listings: {
      saveNew: async () => {
        throw new Error('Legacy ingestion must not run');
      },
      // Ersetzt nur die lokale Datenbank; kein Nachweis des SQL-Schutzvertrags.
      completeRun: async (listings, snapshot) => {
        const current = queries.find((q) => q.id === snapshot.id)!;
        current.requestCursor = (current.requestCursor ?? 0) + 1;
        current.lastPolledAt = new Date(EPOCH + clock).toISOString();
        return { accepted: true, created: listings.length, seeded: false, hits: 0 };
      },
    },
  });
  const totalLanes = queries.reduce((sum, q) => sum + searchFilterRequest(q).count, 0);
  let firstCoverageMs: number | null = null;
  let firstCycleMs = 0;
  let cycles = 0;
  let skippedForBudget = 0;
  while (clock < (options.durationMs ?? 1_800_000)) {
    const report = await scheduler.runOnce(new Date(EPOCH + clock));
    skippedForBudget += report.skippedForBudget;
    expect(report.failed).toBe(0);
    expect(health.isLive()).toBe(true);
    health.recordCycle(report, new Date(EPOCH + clock));
    reports.push(clock);
    cycles++;
    if (cycles === 1) firstCycleMs = clock;
    if (firstCoverageMs === null && visits.size === totalLanes) firstCoverageMs = clock;
    await wait(options.tickIntervalMs ?? 5000);
  }
  const gaps = [...visits.values()].flatMap((times) => times.slice(1).map((t, i) => t - times[i]!));
  const reportGaps = reports.slice(1).map((t, i) => t - reports[i]!);
  const result = {
    filters: count,
    lanes: totalLanes,
    options,
    simulatedMs: clock,
    cycles,
    requests: starts.length,
    skippedForBudget,
    firstCycleMs,
    firstCoverageMs,
    backlogMax,
    dueWaitP50Ms: percentile(waits, 0.5),
    dueWaitP95Ms: percentile(waits, 0.95),
    dueWaitMaxMs: Math.max(...waits),
    laneGapSamples: gaps.length,
    laneGapP50Ms: percentile(gaps, 0.5),
    laneGapP95Ms: percentile(gaps, 0.95),
    laneGapMaxMs: Math.max(0, ...gaps),
    reportGapMaxMs: Math.max(0, ...reportGaps),
    progressGapMaxMs: maxProgressGap,
    missedBetweenObservedPages: missed,
    returned,
    discoveryAgeP50Ms: percentile(discoveryAges, 0.5),
    discoveryAgeP95Ms: percentile(discoveryAges, 0.95),
    discoveryAgeSamples: discoveryAges.length,
  };
  measurements.push(result);
  return result;
}

afterAll(() => {
  if (process.env['SNIPER_MEASUREMENT_OUTPUT']) {
    writeFileSync(
      process.env['SNIPER_MEASUREMENT_OUTPUT'],
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          source: 'synthetic; no network; virtual clock',
          measurements,
        },
        null,
        2,
      ) + '\n',
    );
  }
});

describe('local search filter capacity measurement', () => {
  it.each([5, 10, 20])(
    'measures %i independent filters through the existing scheduler',
    async (count) => {
      const result = await measure(count);
      expect(result.lanes).toBe(count);
      expect(result.firstCycleMs).toBe((count - 1) * 10_000 + 200);
      expect(result.laneGapMaxMs).toBeGreaterThanOrEqual(count * 10_000);
      expect(result.missedBetweenObservedPages.broad).toBeGreaterThan(0);
      expect(result.progressGapMaxMs).toBeLessThan(300_000);
    },
  );
  it.each([5, 10, 20])(
    'measures %i filters with two brands and three alternative terms',
    async (count) => {
      const result = await measure(count, { combinations: true });
      expect(result.lanes).toBe(count * 6);
      expect(result.firstCoverageMs).not.toBeNull();
      expect(result.firstCoverageMs).toBeGreaterThan(count * 50_000);
    },
  );
  it('keeps a successful slow twenty-filter round live beyond five minutes', async () => {
    const result = await measure(20, { responseMs: 19_000 });
    expect(result.firstCycleMs).toBe(380_000);
    expect(result.progressGapMaxMs).toBeLessThan(300_000);
    expect(result.reportGapMaxMs).toBeGreaterThan(300_000);
  });
  it('paces empty responses without inventing discoveries', async () => {
    const result = await measure(10, { empty: true, durationMs: 300_000 });
    expect(result.returned).toEqual({ narrow: 0, broad: 0 });
    expect(result.discoveryAgeSamples).toBe(0);
    expect(result.firstCycleMs).toBe(90_200);
  });
  it.each([
    [5, 1000],
    [10, 1000],
    [20, 1000],
    [5, 2000],
    [10, 2000],
    [20, 2000],
    [20, 5000],
  ])(
    'compares %i filters at %i ms spacing under the unchanged minute budget',
    async (count, minimumIntervalMs) => {
      const result = await measure(count, { minimumIntervalMs });
      expect(result.firstCycleMs).toBe((count - 1) * minimumIntervalMs + 200);
      expect(result.requests).toBeLessThanOrEqual(Math.ceil(result.simulatedMs / 60_000) * 30);
      if (count === 20 && minimumIntervalMs === 1000)
        expect(result.skippedForBudget).toBeGreaterThan(0);
    },
  );
  it.each([1000, 2000])(
    'compares twenty combined filters at %i ms spacing',
    async (minimumIntervalMs) => {
      const result = await measure(20, { combinations: true, minimumIntervalMs });
      expect(result.lanes).toBe(120);
      expect(result.firstCoverageMs).toBeGreaterThanOrEqual(200_000);
      expect(result.requests).toBeLessThanOrEqual(Math.ceil(result.simulatedMs / 60_000) * 30);
    },
  );
  it.each([1000, 2000])(
    'compares shorter spacing with a synthetic 1600 ms response at %i ms',
    async (minimumIntervalMs) => {
      const result = await measure(20, { minimumIntervalMs, responseMs: 1600 });
      expect(result.laneGapP95Ms).toBeGreaterThan(40_000);
      expect(result.requests).toBeLessThanOrEqual(Math.ceil(result.simulatedMs / 60_000) * 30);
    },
  );
  it('measures a faster desired filter interval without changing the database minimum', async () => {
    const result = await measure(20, { minimumIntervalMs: 1000, pollIntervalMs: 1000 });
    expect(result.laneGapP95Ms).toBeGreaterThan(30_000);
    expect(result.skippedForBudget).toBeGreaterThan(0);
  });
  it.each([5, 10, 20])(
    'measures %i filters with raised internal budget and a 1600 ms response',
    async (count) => {
      const result = await measure(count, {
        minimumIntervalMs: 1000,
        pollIntervalMs: 1000,
        tickIntervalMs: 1000,
        requestsPerMinute: 120,
        responseMs: 1600,
      });
      expect(result.skippedForBudget).toBe(0);
      expect(result.requests).toBeGreaterThan(900);
      expect(result.laneGapP95Ms).toBe(count * 1600 + 1000);
    },
  );
  it('measures 120 request lanes with raised budget and a 1600 ms response', async () => {
    const result = await measure(20, {
      combinations: true,
      minimumIntervalMs: 1000,
      pollIntervalMs: 1000,
      tickIntervalMs: 1000,
      requestsPerMinute: 120,
      responseMs: 1600,
    });
    expect(result.skippedForBudget).toBe(0);
    expect(result.laneGapP95Ms).toBe(198_000);
  });
  it.each([5, 10, 20])(
    'replays the measured 5867 ms browser median for %i filters',
    async (count) => {
      const result = await measure(count, {
        minimumIntervalMs: 1000,
        pollIntervalMs: 1000,
        tickIntervalMs: 1000,
        requestsPerMinute: 120,
        responseMs: 5867,
      });
      expect(result.skippedForBudget).toBe(0);
      expect(result.laneGapP95Ms).toBe(count * 5867 + 1000);
    },
  );
  it('replays the measured browser median for 120 request lanes', async () => {
    const result = await measure(20, {
      combinations: true,
      minimumIntervalMs: 1000,
      pollIntervalMs: 1000,
      tickIntervalMs: 1000,
      requestsPerMinute: 120,
      responseMs: 5867,
    });
    expect(result.skippedForBudget).toBe(0);
    expect(result.laneGapP95Ms).toBe(710_040);
  });
  it.each([1000, 10_000])(
    'retains the full provider pause from the rejected response at %i ms spacing',
    async (minimumIntervalMs) => {
      let clock = 0;
      const starts: number[] = [];
      const budget = new RequestBudget(30, () => clock);
      const wait = async (ms: number) => {
        clock += ms;
      };
      const fetch = pacedVintedFetch(
        countingFetch(
          async () => {
            starts.push(clock);
            await wait(200);
            return starts.length === 1
              ? new Response('', { status: 429, headers: { 'retry-after': '120' } })
              : new Response(page('probe', 96, 96), { headers: { 'content-type': 'text/html' } });
          },
          () => budget.record(),
        ),
        { minimumIntervalMs, requestTimeoutMs: 20_000, now: () => clock, sleep: wait },
      );
      const collector = new VintedCollector(
        { baseUrl: 'https://catalog.invalid', userAgent: 'local-measurement' },
        fetch,
        wait,
      );
      const scheduler = new QueryScheduler({
        now: () => new Date(EPOCH + clock),
        budget,
        log,
        collector,
        queries: {
          dueQueries: async () => Array.from({ length: 5 }, (_, i) => query(i)),
          markSeeded: async () => undefined,
        },
        listings: {
          saveNew: async () => [],
          completeRun: async () => ({ accepted: true, created: 0, seeded: false, hits: 0 }),
        },
      });
      expect((await scheduler.runOnce(new Date(EPOCH + clock))).failed).toBe(1);
      clock = 119_999;
      expect((await scheduler.runOnce(new Date(EPOCH + clock))).polled).toBe(0);
      expect(starts).toHaveLength(1);
      clock = 120_200;
      expect((await scheduler.runOnce(new Date(EPOCH + clock))).polled).toBe(1);
      expect(starts).toEqual([0, 120_200]);
      measurements.push({
        providerPause: {
          minimumIntervalMs,
          retryAfterSeconds: 120,
          startsMs: starts,
          rejectionReceivedAtMs: 200,
          waitFromRejectionMs: starts[1]! - 200,
          timeBasis: 'provider pause starts when the rejected response arrives',
        },
      });
    },
  );
  it.each(['paused', 'edited', 'deleted'])(
    'measures a queued %s filter and a newly activated filter',
    async (change) => {
      let clock = 0;
      let started = false;
      let staleSubmittedAt = 0;
      let newFilterStartedAt: number | null = null;
      const live = Array.from({ length: 20 }, (_, i) => query(i));
      const activated = query(20);
      const budget = new RequestBudget(30, () => clock);
      const wait = async (ms: number) => {
        clock += ms;
      };
      const fetch = pacedVintedFetch(
        countingFetch(
          async () => {
            if (!started) {
              started = true;
              if (change === 'paused') live[19]!.isActive = false;
              if (change === 'edited') live[19]!.filterRevision = 2;
              if (change === 'deleted') live.splice(19, 1);
              live.push(activated);
            }
            await wait(200);
            return new Response(page('queued', 96, 96), {
              headers: { 'content-type': 'text/html' },
            });
          },
          () => budget.record(),
        ),
        { minimumIntervalMs: 10_000, requestTimeoutMs: 20_000, now: () => clock, sleep: wait },
      );
      const collector = new VintedCollector(
        { baseUrl: 'https://catalog.invalid', userAgent: 'local-measurement' },
        fetch,
        wait,
      );
      const scheduler = new QueryScheduler({
        now: () => new Date(EPOCH + clock),
        budget,
        log,
        queries: {
          dueQueries: async (now) =>
            structuredClone(
              live
                .filter((q) => q.isActive && isDue(q, now))
                .sort((a, b) => (a.lastPolledAt ?? '').localeCompare(b.lastPolledAt ?? '')),
            ),
          markSeeded: async () => undefined,
        },
        collector: {
          collect: async (snapshot) => {
            if (snapshot.id === activated.id) newFilterStartedAt = clock;
            return collector.collect(snapshot);
          },
        },
        listings: {
          saveNew: async () => {
            throw new Error('Unguarded write');
          },
          completeRun: async (_listings, snapshot) => {
            const current = live.find((q) => q.id === snapshot.id);
            // Nur ein Modell der Serverantwort. Den SQL-Vertrag separat in pgTAP prüfen.
            const accepted =
              current !== undefined &&
              current.isActive &&
              current.filterRevision === snapshot.filterRevision;
            if (!accepted) staleSubmittedAt = clock;
            else current.lastPolledAt = new Date(EPOCH + clock).toISOString();
            return { accepted, created: accepted ? 1 : 0, seeded: false, hits: 0 };
          },
        },
      });
      const first = await scheduler.runOnce(new Date(EPOCH));
      expect(first).toMatchObject({ polled: 20, newListings: 19, failed: 0 });
      expect(staleSubmittedAt).toBe(190_200);
      expect(newFilterStartedAt).toBeNull();
      await wait(5000);
      await scheduler.runOnce(new Date(EPOCH + clock));
      expect(newFilterStartedAt).toBeGreaterThanOrEqual(195_200);
      measurements.push({
        queuedMutation: {
          change,
          staleSubmittedAtMs: staleSubmittedAt,
          newFilterDispatchAtMs: newFilterStartedAt,
          guard: 'simulated database rejection; not SQL verification',
        },
      });
    },
  );

  it('compares identical outgoing requests using a cycle-local response cache', async () => {
    const results: {
      shared: boolean;
      requests: number;
      completedMs: number;
      assignments: number;
    }[] = [];
    for (const shared of [false, true]) {
      let clock = 0;
      let requests = 0;
      let assignments = 0;
      const queries = Array.from({ length: 20 }, (_, i) => ({
        ...query(i),
        catalogId: 1000 + (i % 4),
        titleKeywords: ['puffer', `term${i}`],
        keywordMode: 'all' as const,
      }));
      const budget = new RequestBudget(30, () => clock);
      const wait = async (ms: number) => {
        clock += ms;
      };
      const paced = pacedVintedFetch(
        countingFetch(
          async (input) => {
            expect(new URL(String(input)).origin).toBe('https://catalog.invalid');
            requests++;
            await wait(200);
            const state = JSON.parse(page('shared', 96, 96)) as {
              items: { items: { productItem: { title: string } }[] };
            };
            state.items.items.forEach((item, i) => {
              item.productItem.title = `Puffer term${i % 20}`;
            });
            return new Response(JSON.stringify(state), {
              headers: { 'content-type': 'text/html' },
            });
          },
          () => budget.record(),
        ),
        { minimumIntervalMs: 10_000, requestTimeoutMs: 20_000, now: () => clock, sleep: wait },
      );
      const cache = new Map<string, Promise<Response>>();
      const collector = new VintedCollector(
        { baseUrl: 'https://catalog.invalid', userAgent: 'local-measurement' },
        async (input, init) => {
          if (!shared) return paced(input, init);
          const key = String(input);
          let response = cache.get(key);
          if (!response) {
            response = paced(input, init);
            cache.set(key, response);
          }
          return (await response).clone();
        },
        wait,
      );
      const scheduler = new QueryScheduler({
        now: () => new Date(EPOCH + clock),
        budget,
        log,
        queries: { dueQueries: async () => queries, markSeeded: async () => undefined },
        // Historischer Vergleich der damaligen vollständigen Runde; die neue begrenzte
        // Rohplanung wird unabhängig in shared-search-scheduler.spec.ts geprüft.
        collector: { collect: (snapshot) => collector.collect(snapshot) },
        listings: {
          saveNew: async () => [],
          completeRun: async (listings, snapshot) => {
            expect(listings.length).toBeGreaterThan(0);
            expect(
              listings.every((item) =>
                item.title.split(' ').includes(`term${snapshot.id.split('-').at(-1)}`),
              ),
            ).toBe(true);
            assignments++;
            return { accepted: true, created: 0, seeded: false, hits: 0 };
          },
        },
      });
      const report = await scheduler.runOnce(new Date(EPOCH));
      expect(report.polled).toBe(20);
      results.push({ shared, requests, completedMs: clock, assignments });
    }
    expect(results).toEqual([
      { shared: false, requests: 20, completedMs: 190_200, assignments: 20 },
      { shared: true, requests: 4, completedMs: 30_200, assignments: 20 },
    ]);
    measurements.push({ identicalRequestComparison: results });
  });

  it('counts narrow matches displaced from a synthetic broad first page', async () => {
    const collector = new VintedCollector(
      { baseUrl: 'https://catalog.invalid', userAgent: 'local-measurement' },
      async (input) => {
        const narrow = new URL(String(input)).searchParams.get('catalog_ids') === '1206';
        // Bekannter Gesamtbestand: 96 ältere enge Treffer, danach 96 fremde neue Treffer.
        return new Response(
          page(
            narrow ? 'narrow' : 'other',
            narrow ? 96 : 192,
            96,
            narrow ? 'Puffer Jacke' : 'Schuhe',
          ),
          { headers: { 'content-type': 'text/html' } },
        );
      },
    );
    const broad = await collector.collect({ ...query(0), catalogId: null });
    const narrow = await collector.collect({ ...query(0), catalogId: 1206 });
    const narrowIds = new Set(narrow.map((item) => item.externalId));
    const covered = broad.filter((item) => narrowIds.has(item.externalId)).length;
    expect(broad).toHaveLength(96);
    expect(narrow).toHaveLength(96);
    expect(covered).toBe(0);
    measurements.push({
      broadDisplacement: {
        sourceItems: 192,
        broadReturned: 96,
        narrowExpected: 96,
        narrowCovered: covered,
        narrowDisplaced: 96,
      },
    });
  });
});

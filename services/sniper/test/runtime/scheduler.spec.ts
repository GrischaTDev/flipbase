import { describe, expect, it, vi } from 'vitest';
import { QueryScheduler } from '../../src/runtime/scheduler.js';
import { RequestBudget } from '../../src/runtime/budget.js';
import { ForbiddenError, RateLimitedError } from '../../src/vinted/errors.js';
import type { MarketplaceListing } from '../../src/domain/listing.js';
import type { SniperQuery } from '../../src/domain/query.js';
import { isDue } from '../../src/store/query.store.js';

const NOW = new Date('2026-08-30T10:00:00.000Z');

function makeQuery(overrides: Partial<SniperQuery> = {}): SniperQuery {
  return {
    id: 'q1',
    queryKey: 'vinted|search=nike|catalog=-|brand=-|price_from=-|price_to=-',
    marketplace: 'vinted',
    searchText: 'nike',
    catalogId: null,
    brandId: null,
    priceTo: null,
    priceFrom: null,
    pollIntervalMs: 60000,
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
    ...overrides,
  };
}

function makeListing(externalId: string): MarketplaceListing {
  return {
    marketplace: 'vinted',
    externalId,
    title: 'Nike Air Max',
    url: `https://www.vinted.de/items/${externalId}`,
    description: null,
    imageUrls: [],
    itemPrice: { amount: 27.5, currency: 'EUR' },
    totalPrice: { amount: 30, currency: 'EUR' },
    brand: 'Nike',
    size: '43',
    condition: 'Gut',
    countryCode: null,
    seller: { name: null, avatarUrl: null, rating: null, reviewCount: null },
    isHidden: false,
    itemUpdatedAt: null,
    photoUploadedAt: null,
  };
}

/**
 * Fuer Faelle mit mehreren faelligen Abfragen, bei denen `build()` (eine
 * einzelne Abfrage) nicht ausreicht - insbesondere fuer den Nachweis, dass
 * eine fehlschlagende Abfrage die naechste nicht mit sich reisst.
 */
function buildMany(
  queries: SniperQuery[],
  overrides: {
    queries?: Partial<
      Record<
        | 'dueQueries'
        | 'recordSuccess'
        | 'recordFailure'
        | 'markPolled'
        | 'markSeeded'
        | 'deactivate',
        ReturnType<typeof vi.fn>
      >
    >;
    collector?: { collect: ReturnType<typeof vi.fn> };
    listings?: {
      saveNew: ReturnType<typeof vi.fn>;
      evaluateHits?: ReturnType<typeof vi.fn>;
    };
    originState?: unknown;
    budget?: RequestBudget;
    log?: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  } = {},
) {
  const queryStore = {
    dueQueries: vi.fn().mockResolvedValue(queries),
    markPolled: vi.fn().mockResolvedValue(undefined),
    markSeeded: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...overrides.queries,
  };
  const collector = overrides.collector ?? {
    collect: vi.fn().mockResolvedValue([makeListing('a')]),
  };
  const listings = {
    saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
    evaluateHits: vi.fn().mockResolvedValue(0),
    ...overrides.listings,
  };
  const log = overrides.log ?? { info: vi.fn(), error: vi.fn() };
  const budget = overrides.budget ?? new RequestBudget(10, () => NOW.getTime());

  const scheduler = new QueryScheduler({
    queries: queryStore,
    collector,
    listings,
    budget,
    originState: overrides.originState as never,
    log,
  } as never);

  return { scheduler, queries: queryStore, collector, listings, log };
}

function build(query: SniperQuery, overrides: Record<string, unknown> = {}) {
  const queries = {
    dueQueries: vi.fn().mockResolvedValue([query]),
    markPolled: vi.fn().mockResolvedValue(undefined),
    markSeeded: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    ...(overrides.queries as Record<string, unknown> | undefined),
  };
  const collector = (overrides.collector as { collect: ReturnType<typeof vi.fn> } | undefined) ?? {
    collect: vi.fn().mockResolvedValue([makeListing('a'), makeListing('b')]),
  };
  const listings = {
    saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
    evaluateHits: vi.fn().mockResolvedValue(0),
    ...(overrides.listings as Record<string, unknown> | undefined),
  };
  const log = (overrides.log as
    { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } | undefined) ?? {
    info: vi.fn(),
    error: vi.fn(),
  };
  const budget =
    (overrides.budget as RequestBudget | undefined) ?? new RequestBudget(10, () => NOW.getTime());

  const scheduler = new QueryScheduler({
    queries,
    collector,
    listings,
    budget,
    originState: overrides.originState as never,
    log,
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
    // wird das einzige Kontingent hier schon vor dem Lauf per record() belegt
    // - die Buchhaltung, die im echten Betrieb `countingFetch` uebernimmt.
    const budget = new RequestBudget(1, () => NOW.getTime());
    budget.record();
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

  it('records a forbidden error without deactivating the query', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new ForbiddenError()) };
    const { scheduler, queries } = build(makeQuery(), { collector });

    const report = await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'forbidden');
    expect(queries.deactivate).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
  });

  it('does not deactivate a query after repeated failures (run_state and backoff handle retries)', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new Error('network down')) };
    const { scheduler, queries } = build(makeQuery({ consecutiveFailures: 2 }), { collector });

    await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'failed');
    expect(queries.deactivate).not.toHaveBeenCalled();
  });

  it('does not mark anything as seen when the response was rejected', async () => {
    const collector = { collect: vi.fn().mockRejectedValue(new Error('schema violation')) };
    const { scheduler, listings } = build(makeQuery(), { collector });

    await scheduler.runOnce(NOW);

    expect(listings.saveNew).not.toHaveBeenCalled();
  });

  it('does not deactivate a query on a generic failure below the threshold', async () => {
    // Ohne diesen Test wuerde eine Implementierung, die bei jedem generischen
    // Fehlschlag deaktiviert (statt erst ab MAX_CONSECUTIVE_FAILURES), die
    // ganze Suite trotzdem bestehen - siehe Finding 2 der Review.
    const collector = { collect: vi.fn().mockRejectedValue(new Error('network down')) };
    const { scheduler, queries } = build(makeQuery({ consecutiveFailures: 0 }), { collector });

    await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'failed');
    expect(queries.deactivate).not.toHaveBeenCalled();
  });

  describe('cycle containment', () => {
    it('keeps the cycle going when listings.saveNew rejects for one query', async () => {
      const failing = makeQuery({ id: 'q-fail' });
      const healthy = makeQuery({ id: 'q-ok' });
      const listings = {
        saveNew: vi
          .fn()
          .mockRejectedValueOnce(new Error('write failed'))
          .mockResolvedValueOnce([makeListing('a')]),
      };
      const { scheduler, queries, collector } = buildMany([failing, healthy], { listings });

      const report = await scheduler.runOnce(NOW);

      expect(collector.collect).toHaveBeenCalledTimes(2);
      expect(listings.saveNew).toHaveBeenCalledTimes(2);
      expect(queries.markPolled).toHaveBeenCalledWith('q-ok', 'ok');
      expect(report.failed).toBe(1);
      expect(report.polled).toBe(1);
    });

    it('keeps the cycle going when queries.markPolled rejects for one query', async () => {
      const failing = makeQuery({ id: 'q-fail' });
      const healthy = makeQuery({ id: 'q-ok' });
      const markPolled = vi
        .fn()
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValue(undefined);
      const { scheduler, queries, collector } = buildMany([failing, healthy], {
        queries: { markPolled },
      });

      const report = await scheduler.runOnce(NOW);

      expect(collector.collect).toHaveBeenCalledTimes(2);
      expect(queries.markPolled).toHaveBeenCalledTimes(2);
      expect(queries.markPolled).toHaveBeenNthCalledWith(1, 'q-fail', 'ok');
      expect(queries.markPolled).toHaveBeenNthCalledWith(2, 'q-ok', 'ok');
      expect(report.failed).toBe(1);
    });

    it('finishes the cycle even when the store rejects on every call', async () => {
      // Die erste Abfrage scheitert schon in collect() (loest handleFailure()
      // aus, die selbst report.failed hochzaehlt), die zweite waere gesund -
      // aber markPolled() lehnt jeden Aufruf ab. Das Rueckfallnetz darf weder
      // die schon gezaehlte erste Abfrage doppelt zaehlen, noch am kaputten
      // Store fuer die zweite Abfrage scheitern.
      const failing = makeQuery({ id: 'q-fail' });
      const healthy = makeQuery({ id: 'q-ok' });
      const markPolled = vi.fn().mockRejectedValue(new Error('store is down'));
      const markSeeded = vi.fn().mockRejectedValue(new Error('store is down'));
      const deactivate = vi.fn().mockRejectedValue(new Error('store is down'));
      const collector = {
        collect: vi
          .fn()
          .mockRejectedValueOnce(new Error('network down'))
          .mockResolvedValueOnce([makeListing('a')]),
      };
      const { scheduler } = buildMany([failing, healthy], {
        collector,
        queries: { markPolled, markSeeded, deactivate },
      });

      const report = await scheduler.runOnce(NOW);

      expect(collector.collect).toHaveBeenCalledTimes(2);
      expect(report.failed).toBe(2);
    });

    it('reports a failure when dueQueries itself rejects', async () => {
      // dueQueries() sitzt vor der Schleife, also ausserhalb jedes try/catch
      // dort drinnen - ein Fehlschlag hier darf trotzdem nicht aus runOnce()
      // herausschlagen, sondern muss geloggt und als fehlgeschlagener Zyklus gemeldet
      // werden.
      const queryStore = {
        dueQueries: vi.fn().mockRejectedValue(new Error('store unreachable')),
        markPolled: vi.fn().mockResolvedValue(undefined),
        markSeeded: vi.fn().mockResolvedValue(undefined),
        deactivate: vi.fn().mockResolvedValue(undefined),
      };
      const collector = { collect: vi.fn() };
      const listings = { saveNew: vi.fn() };
      const log = { info: vi.fn(), error: vi.fn() };
      const budget = new RequestBudget(10, () => NOW.getTime());
      const scheduler = new QueryScheduler({
        queries: queryStore,
        collector,
        listings,
        budget,
        log,
      } as never);

      const report = await scheduler.runOnce(NOW);

      expect(report).toEqual({
        polled: 0,
        skippedForBudget: 0,
        newListings: 0,
        seeded: 0,
        failed: 1,
        newHits: 0,
      });
      expect(collector.collect).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith('due_queries_failed', {
        reason: 'store unreachable',
      });
    });
  });

  it('bewertet nach dem Speichern und zaehlt die Treffer', async () => {
    const listings = {
      saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
      evaluateHits: vi.fn().mockResolvedValue(2),
    };
    const { scheduler } = build(makeQuery(), { listings });

    const report = await scheduler.runOnce(NOW);

    expect(listings.evaluateHits).toHaveBeenCalledWith('q1', true);
    expect(report.newHits).toBe(2);
  });

  it('meldet im Einlese-Lauf nichts, hakt den Bestand aber ab', async () => {
    // Die erste Runde einer Abfrage findet einen ganzen Bestand vor - teils
    // wochenalt, teils laengst verkauft. Wuerde sie melden, kaeme mit dem
    // Anlegen eines Filters sofort ein Schwall Falschmeldungen. Der Aufruf
    // erfolgt trotzdem, damit der Bestand als geprueft vermerkt wird und auch
    // in der naechsten Runde stumm bleibt.
    const listings = {
      saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
      evaluateHits: vi.fn().mockResolvedValue(0),
    };
    const { scheduler } = build(makeQuery({ isSeeded: false }), { listings });

    const report = await scheduler.runOnce(NOW);

    expect(listings.evaluateHits).toHaveBeenCalledWith('q1', false);
    expect(report.newHits).toBe(0);
  });

  it('laesst eine gescheiterte Bewertung den Durchgang nicht abbrechen und erhoeht failed nicht', async () => {
    // Ein Fund ist gespeichert, auch wenn die Bewertung scheitert. Wuerde der
    // Fehler durchschlagen, bliebe die Abfrage als nicht gepollt stehen und der
    // naechste Durchgang holte dieselben Artikel erneut. Ein DB-Bewertungsfehler
    // zaehlt nicht als Vinted-Sammelfehler (failed bleibt 0).
    const listings = {
      saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
      evaluateHits: vi.fn().mockRejectedValue(new Error('evaluation failed')),
    };
    const { scheduler, queries, log } = build(makeQuery(), { listings });

    const report = await scheduler.runOnce(NOW);

    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'ok');
    expect(report.newHits).toBe(0);
    expect(log.error).toHaveBeenCalledWith('evaluate_hits_failed', {
      queryId: 'q1',
      reason: 'evaluation failed',
    });
    expect(report.failed).toBe(0);
  });

  it('gilt nicht als eingelesen, wenn die Bewertung scheitert', async () => {
    // Sonst genuegt ein einziger Netzfehler: Die Abfrage waere eingelesen, der
    // vorgefundene Bestand truege aber keinen Vermerk - und der naechste
    // Durchgang meldete ihn vollstaendig. Genau der Schwall, den der
    // Einlese-Lauf verhindern soll.
    const listings = {
      saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
      evaluateHits: vi.fn().mockRejectedValue(new Error('evaluation failed')),
    };
    const { scheduler, queries } = build(makeQuery({ isSeeded: false }), { listings });

    const report = await scheduler.runOnce(NOW);

    expect(queries.markSeeded).not.toHaveBeenCalled();
    expect(report.seeded).toBe(0);
    expect(queries.markPolled).toHaveBeenCalledWith('q1', 'ok');
  });

  describe('Arbeitspaket 1: Operational Run State & Origin Protection (Regressionstests)', () => {
    it('Regression 1: HTTP 403 puts query and origin into an expiring cooldown, leaves is_active untouched', async () => {
      const originState = {
        getState: vi.fn().mockResolvedValue({
          origin: 'vinted',
          state: 'ready',
          blockedUntil: null,
          reason: null,
          probeInFlight: false,
          updatedAt: NOW.toISOString(),
        }),
        setCooldown: vi.fn().mockResolvedValue(undefined),
        setBlocked: vi.fn().mockResolvedValue(undefined),
        tryAcquireProbe: vi.fn().mockResolvedValue(true),
        releaseProbe: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      };
      const recordFailure = vi.fn().mockResolvedValue(undefined);
      const queryStore = {
        dueQueries: vi.fn().mockResolvedValue([makeQuery({ id: 'q1', isActive: true })]),
        recordFailure,
        markSeeded: vi.fn().mockResolvedValue(undefined),
        deactivate: vi.fn().mockResolvedValue(undefined),
      };
      const collector = { collect: vi.fn().mockRejectedValue(new ForbiddenError()) };
      const { scheduler } = build(makeQuery(), {
        queries: queryStore,
        collector,
        originState,
      });

      await scheduler.runOnce(NOW);

      expect(queryStore.deactivate).not.toHaveBeenCalled();
      expect(originState.setBlocked).not.toHaveBeenCalled();
      expect(originState.setCooldown).toHaveBeenCalledWith(
        'vinted',
        new Date(NOW.getTime() + 300_000),
        'forbidden',
      );
      expect(recordFailure).toHaveBeenCalledWith(
        'q1',
        expect.objectContaining({
          runState: 'cooldown',
          errorKind: 'forbidden',
        }),
        NOW,
      );
    });

    it('Regression 1b: a legacy permanent origin block is probed again and cleared on success', async () => {
      // Produktionszustand seit 16.09.2026: state = blocked ohne Ablaufzeit.
      // Ohne Selbstheilung bliebe der Bot auch nach dem Deployment stumm.
      const originState = {
        getState: vi.fn().mockResolvedValue({
          origin: 'vinted',
          state: 'blocked',
          blockedUntil: null,
          reason: 'forbidden',
          probeInFlight: false,
          updatedAt: '2026-08-29T00:48:35.866Z',
        }),
        tryAcquireProbe: vi.fn().mockResolvedValue(true),
        releaseProbe: vi.fn().mockResolvedValue(undefined),
        setCooldown: vi.fn().mockResolvedValue(undefined),
        setBlocked: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      };
      const q1 = makeQuery({ id: 'q1' });
      const q2 = makeQuery({ id: 'q2' });
      const collector = { collect: vi.fn().mockResolvedValue([makeListing('probe-item')]) };
      const recordSuccess = vi.fn().mockResolvedValue(undefined);
      const { scheduler } = buildMany([q1, q2], {
        collector,
        queries: {
          dueQueries: vi.fn().mockResolvedValue([q1, q2]),
          recordSuccess,
        },
        originState,
      } as never);

      const report = await scheduler.runOnce(NOW);

      expect(originState.tryAcquireProbe).toHaveBeenCalledWith('vinted');
      expect(collector.collect).toHaveBeenCalledTimes(1);
      expect(originState.releaseProbe).toHaveBeenCalledWith('vinted', true);
      expect(report.polled).toBe(1);
    });

    it('Regression 2: HTTP 429 sets origin cooldown and halts subsequent queries in the same cycle', async () => {
      const originState = {
        getState: vi.fn().mockResolvedValue({
          origin: 'vinted',
          state: 'ready',
          blockedUntil: null,
          reason: null,
          probeInFlight: false,
          updatedAt: NOW.toISOString(),
        }),
        setCooldown: vi.fn().mockResolvedValue(undefined),
        setBlocked: vi.fn().mockResolvedValue(undefined),
        tryAcquireProbe: vi.fn().mockResolvedValue(true),
        releaseProbe: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      };
      const q1 = makeQuery({ id: 'q1' });
      const q2 = makeQuery({ id: 'q2' });
      const collector = {
        collect: vi
          .fn()
          .mockRejectedValueOnce(new RateLimitedError('Rate limited', { retryAfterSeconds: 60 })),
      };
      const recordFailure = vi.fn().mockResolvedValue(undefined);
      const { scheduler } = buildMany([q1, q2], {
        collector,
        queries: {
          dueQueries: vi.fn().mockResolvedValue([q1, q2]),
          recordFailure,
        },
        originState,
      } as never);

      const report = await scheduler.runOnce(NOW);

      expect(originState.setCooldown).toHaveBeenCalledWith(
        'vinted',
        new Date(NOW.getTime() + 60_000),
        'rate_limited',
      );
      // q2 should not have been polled because q1 triggered an origin cooldown
      expect(collector.collect).toHaveBeenCalledTimes(1);
      expect(report.failed).toBe(1);
      expect(report.polled).toBe(0);
    });

    it('Regression 3: queries with next_attempt_at in the future are not due', () => {
      const future = new Date(NOW.getTime() + 300_000).toISOString();
      const q = makeQuery({
        id: 'q1',
        runState: 'cooldown',
        nextAttemptAt: future,
        isActive: true,
      });
      expect(isDue(q, NOW)).toBe(false);

      const afterCooldown = new Date(NOW.getTime() + 300_001);
      expect(isDue(q, afterCooldown)).toBe(true);
    });

    it('Regression 4: when origin cooldown expires, exactly one probe is executed and resets origin to ready on success', async () => {
      const originState = {
        getState: vi.fn().mockResolvedValue({
          origin: 'vinted',
          state: 'cooldown',
          blockedUntil: new Date(NOW.getTime() - 1000).toISOString(), // expired cooldown
          reason: 'rate_limited',
          probeInFlight: false,
          updatedAt: NOW.toISOString(),
        }),
        tryAcquireProbe: vi.fn().mockResolvedValue(true),
        releaseProbe: vi.fn().mockResolvedValue(undefined),
        setCooldown: vi.fn().mockResolvedValue(undefined),
        setBlocked: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      };
      const q1 = makeQuery({ id: 'q1' });
      const q2 = makeQuery({ id: 'q2' });
      const collector = { collect: vi.fn().mockResolvedValue([makeListing('probe-item')]) };
      const recordSuccess = vi.fn().mockResolvedValue(undefined);
      const { scheduler } = buildMany([q1, q2], {
        collector,
        queries: {
          dueQueries: vi.fn().mockResolvedValue([q1, q2]),
          recordSuccess,
        },
        originState,
      } as never);

      const report = await scheduler.runOnce(NOW);

      expect(originState.tryAcquireProbe).toHaveBeenCalledWith('vinted');
      // Only the single probe query was executed, despite multiple due queries
      expect(collector.collect).toHaveBeenCalledTimes(1);
      expect(originState.releaseProbe).toHaveBeenCalledWith('vinted', true);
      expect(recordSuccess).toHaveBeenCalledWith('q1', NOW);
      expect(report.polled).toBe(1);
    });

    it('Regression 5: successful collection calls recordSuccess which clears consecutive failures and resets run_state', async () => {
      const recordSuccess = vi.fn().mockResolvedValue(undefined);
      const q = makeQuery({ id: 'q1', runState: 'cooldown', consecutiveFailures: 2 });
      const { scheduler } = build(q, {
        queries: {
          dueQueries: vi.fn().mockResolvedValue([q]),
          recordSuccess,
        },
      });

      const report = await scheduler.runOnce(NOW);

      expect(recordSuccess).toHaveBeenCalledWith('q1', NOW);
      expect(report.polled).toBe(1);
    });

    it('Regression 6: manual deactivation (is_active = false) is never reactivated or altered by scheduler', async () => {
      const queryStore = {
        dueQueries: vi.fn().mockResolvedValue([]),
        recordSuccess: vi.fn().mockResolvedValue(undefined),
        recordFailure: vi.fn().mockResolvedValue(undefined),
        markSeeded: vi.fn().mockResolvedValue(undefined),
        deactivate: vi.fn().mockResolvedValue(undefined),
      };
      const { scheduler, collector } = build(makeQuery({ isActive: false }), {
        queries: queryStore,
      });

      await scheduler.runOnce(NOW);

      expect(collector.collect).not.toHaveBeenCalled();
      expect(queryStore.deactivate).not.toHaveBeenCalled();
      expect(queryStore.recordSuccess).not.toHaveBeenCalled();
      expect(queryStore.recordFailure).not.toHaveBeenCalled();
    });
  });

  describe('Arbeitspaket 3.2: Deal-Erkennung aus gemeinsamem Datenbestand entkoppeln (Regressionstests)', () => {
    it('Regression 1: evaluation database failure does not mark query failed or alter origin state', async () => {
      const originState = {
        getState: vi.fn().mockResolvedValue({
          origin: 'vinted',
          state: 'ready',
          blockedUntil: null,
          reason: null,
          probeInFlight: false,
          updatedAt: NOW.toISOString(),
        }),
        setCooldown: vi.fn(),
        setBlocked: vi.fn(),
        tryAcquireProbe: vi.fn().mockResolvedValue(true),
        releaseProbe: vi.fn(),
        reset: vi.fn(),
      };
      const recordSuccess = vi.fn().mockResolvedValue(undefined);
      const recordFailure = vi.fn().mockResolvedValue(undefined);
      const queryStore = {
        dueQueries: vi.fn().mockResolvedValue([makeQuery({ id: 'q-eval-fail' })]),
        recordSuccess,
        recordFailure,
        markPolled: vi.fn().mockResolvedValue(undefined),
        markSeeded: vi.fn().mockResolvedValue(undefined),
        deactivate: vi.fn().mockResolvedValue(undefined),
      };
      const listings = {
        saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
        evaluateHits: vi
          .fn()
          .mockRejectedValue(new Error('relation sniper_watchlists does not exist')),
      };
      const log = { info: vi.fn(), error: vi.fn() };
      const budget = new RequestBudget(10, () => NOW.getTime());
      const scheduler = new QueryScheduler({
        queries: queryStore,
        collector: { collect: vi.fn().mockResolvedValue([makeListing('a')]) },
        listings,
        budget,
        originState: originState as never,
        log,
      });

      const report = await scheduler.runOnce(NOW);

      // Vinted-Erfassung war erfolgreich: query wurde erfolgreich verbucht
      expect(recordSuccess).toHaveBeenCalledWith('q-eval-fail', NOW);
      expect(recordFailure).not.toHaveBeenCalled();
      expect(originState.setCooldown).not.toHaveBeenCalled();
      expect(originState.setBlocked).not.toHaveBeenCalled();
      expect(report.polled).toBe(1);
      expect(report.failed).toBe(0);
      expect(report.newHits).toBe(0);
      expect(log.error).toHaveBeenCalledWith('evaluate_hits_failed', {
        queryId: 'q-eval-fail',
        reason: 'relation sniper_watchlists does not exist',
      });
    });

    it('Regression 2: scheduler runs in pure ingest mode when evaluateHits is omitted', async () => {
      const recordSuccess = vi.fn().mockResolvedValue(undefined);
      const queryStore = {
        dueQueries: vi.fn().mockResolvedValue([makeQuery({ id: 'q-pure' })]),
        recordSuccess,
        markPolled: vi.fn().mockResolvedValue(undefined),
        markSeeded: vi.fn().mockResolvedValue(undefined),
      };
      const listings = {
        saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
      };
      const scheduler = new QueryScheduler({
        queries: queryStore,
        collector: { collect: vi.fn().mockResolvedValue([makeListing('a')]) },
        listings,
        budget: new RequestBudget(10, () => NOW.getTime()),
        log: { info: vi.fn(), error: vi.fn() },
      });

      const report = await scheduler.runOnce(NOW);

      expect(report.polled).toBe(1);
      expect(report.failed).toBe(0);
      expect(report.newListings).toBe(1);
      expect(recordSuccess).toHaveBeenCalledWith('q-pure', NOW);
    });
  });
});

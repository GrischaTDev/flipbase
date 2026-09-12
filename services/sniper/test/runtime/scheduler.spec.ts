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
    queries?: Partial<Record<'markPolled' | 'markSeeded' | 'deactivate', ReturnType<typeof vi.fn>>>;
    collector?: { collect: ReturnType<typeof vi.fn> };
    listings?: {
      saveNew: ReturnType<typeof vi.fn>;
      evaluateHits?: ReturnType<typeof vi.fn>;
    };
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
  const log = { info: vi.fn(), error: vi.fn() };
  const budget = new RequestBudget(10, () => NOW.getTime());

  const scheduler = new QueryScheduler({
    queries: queryStore,
    collector,
    listings,
    budget,
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
  };
  const collector = { collect: vi.fn().mockResolvedValue([makeListing('a'), makeListing('b')]) };
  const listings = {
    saveNew: vi.fn().mockResolvedValue([makeListing('a')]),
    evaluateHits: vi.fn().mockResolvedValue(0),
    ...(overrides.listings as Record<string, unknown> | undefined),
  };
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

  it('laesst eine gescheiterte Bewertung den Durchgang nicht abbrechen', async () => {
    // Ein Fund ist gespeichert, auch wenn die Bewertung scheitert. Wuerde der
    // Fehler durchschlagen, bliebe die Abfrage als nicht gepollt stehen und der
    // naechste Durchgang holte dieselben Artikel erneut.
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
    expect(report.failed).toBe(1);
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
});
